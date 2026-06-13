import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const path = (...parts) => join(root, ...parts);

const PCB3_UUID = '5664b0722a0b08df';
const P2_UUID = '227f009d50838569';
const P1_UUID = '018b50bd6ee3ee7a';

const ANTENNA_KEEP_OUT_MIL = {
  left: 157.48,
  right: 2047.24,
  top: 836.61,
  bottom: 1500.00,
};

const ANTENNA_KEEP_OUT_MM = {
  left: 4.00,
  right: 52.00,
  top: 21.25,
  bottom: 42.25,
};

const milToMm = (value) => value * 0.0254;
const close = (actual, expected, tolerance) => Math.abs(actual - expected) <= tolerance;

function countChar(text, char) {
  return [...text].filter((item) => item === char).length;
}

function parsePlacement(scriptText) {
  const placementStart = scriptText.indexOf('const placement = {');
  if (placementStart < 0) throw new Error('missing placement table');
  const placementEnd = scriptText.indexOf('\n  };', placementStart);
  if (placementEnd < 0) throw new Error('missing placement table end');
  const table = scriptText.slice(placementStart, placementEnd);
  const placement = {};
  const re = /^\s*([A-Z]+[0-9]+): \[([0-9.]+), ([0-9.]+), ([0-9.]+)\],/gm;
  for (const match of table.matchAll(re)) {
    placement[match[1]] = {
      x: Number(match[2]),
      y: Number(match[3]),
      rotation: Number(match[4]),
    };
  }
  return placement;
}

function parseKiCadPcb(pcbText) {
  const footprints = new Map();
  const lines = pcbText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trimStart().startsWith('(footprint ')) continue;

    let depth = 0;
    const block = [];
    for (; index < lines.length; index++) {
      const item = lines[index];
      block.push(item);
      depth += countChar(item, '(') - countChar(item, ')');
      if (depth === 0) break;
    }

    const text = block.join('\n');
    const ref = text.match(/\(property "Reference" "([^"]+)"/)?.[1];
    const at = block[0].match(/\(at ([\d.-]+) ([\d.-]+)(?: ([\d.-]+))?\)/);
    if (!ref || !at) continue;

    const pads = new Map();
    for (const pad of text.matchAll(/\(pad "([^"]+)"[\s\S]*?\(net \d+ "([^"]+)"\)/g)) {
      pads.set(pad[1], pad[2]);
    }
    footprints.set(ref, {
      x: Number(at[1]),
      y: Number(at[2]),
      rotation: Number(at[3] || 0),
      pads,
      text,
    });
  }

  const segments = [...pcbText.matchAll(/\(segment \(start ([\d.-]+) ([\d.-]+)\) \(end ([\d.-]+) ([\d.-]+)\).*?\(layer "([^"]+)"\).*?\(net \d+\)/g)]
    .map((match) => ({
      x1: Number(match[1]),
      y1: Number(match[2]),
      x2: Number(match[3]),
      y2: Number(match[4]),
      layer: match[5],
    }));
  const vias = [...pcbText.matchAll(/\(via \(at ([\d.-]+) ([\d.-]+)\).*?\(net \d+\)/g)]
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));

  return { footprints, segments, vias };
}

function pointInside(rect, point, margin = 0) {
  return point.x > rect.left + margin
    && point.x < rect.right - margin
    && point.y > rect.top + margin
    && point.y < rect.bottom - margin;
}

function segmentTouchesRect(segment, rect) {
  const minX = Math.min(segment.x1, segment.x2);
  const maxX = Math.max(segment.x1, segment.x2);
  const minY = Math.min(segment.y1, segment.y2);
  const maxY = Math.max(segment.y1, segment.y2);
  if (maxX <= rect.left || minX >= rect.right || maxY <= rect.top || minY >= rect.bottom) return false;
  if (pointInside(rect, { x: segment.x1, y: segment.y1 }) || pointInside(rect, { x: segment.x2, y: segment.y2 })) return true;
  if (close(segment.x1, segment.x2, 0.001)) return segment.x1 > rect.left && segment.x1 < rect.right;
  if (close(segment.y1, segment.y2, 0.001)) return segment.y1 > rect.top && segment.y1 < rect.bottom;
  return true;
}

function addPadCheck(errors, footprints, ref, pad, expected) {
  const found = footprints.get(ref)?.pads.get(pad);
  if (found !== expected) {
    errors.push({
      check: 'kicad-net',
      ref,
      pad,
      expected,
      found: found ?? null,
    });
  }
}

const layoutScript = readFileSync(path('scripts', 'jlceda_layout_outer_io_route.mjs'), 'utf8');
const netAlignScript = readFileSync(path('scripts', 'jlceda_verify_schematic_pcb_net_alignment.mjs'), 'utf8');
const pcbText = readFileSync(path('hardware', 'kicad', 'esp32_s3_dome_controller.kicad_pcb'), 'utf8');

const placement = parsePlacement(layoutScript);
const kicad = parseKiCadPcb(pcbText);
const errors = [];
const warnings = [];
const relayMargins = [];

if (!netAlignScript.includes(P2_UUID) || !netAlignScript.includes(PCB3_UUID)) {
  errors.push({
    check: 'source-link',
    message: 'P2.Schematic3 and PCB3 UUIDs must be used by the schematic/PCB alignment verifier.',
  });
}

const activeScriptUsesP1 = layoutScript.includes(P1_UUID) || netAlignScript.includes(P1_UUID);
if (activeScriptUsesP1) {
  errors.push({
    check: 'deprecated-p1',
    message: 'Active JLCEDA scripts must not use deprecated P1.Schematic3 as a source.',
  });
}

for (const ref of ['R1', 'R2']) {
  const row = ref === 'R1' ? 'K1' : 'K2';
  const resistor = placement[ref];
  const relay = placement[row];
  if (!resistor || !relay) {
    errors.push({ check: 'placement', message: `missing ${ref} or ${row} placement` });
    continue;
  }

  const relayBodyHalfXMil = 374;
  const resistorHalfXMil = 45;
  const relayClearanceMil = relay.x - relayBodyHalfXMil - resistor.x - resistorHalfXMil;
  const antennaClearanceMil = resistor.x - resistorHalfXMil - ANTENNA_KEEP_OUT_MIL.right;
  relayMargins.push({
    ref,
    relayRef: row,
    relayBodyClearanceMil: Number(relayClearanceMil.toFixed(1)),
    antennaKeepoutClearanceMil: Number(antennaClearanceMil.toFixed(1)),
  });

  if (relayClearanceMil < 30) {
    errors.push({
      check: 'r1-r2-relay-body',
      ref,
      message: `${ref} is too close to the estimated ${row} relay body.`,
      relayClearanceMil: Number(relayClearanceMil.toFixed(1)),
    });
  }
  if (ref === 'R1' && antennaClearanceMil < 25) {
    errors.push({
      check: 'r1-antenna-keepout',
      ref,
      message: 'R1 must stay outside the ESP32 antenna keepout while moving away from K1.',
      antennaClearanceMil: Number(antennaClearanceMil.toFixed(1)),
    });
  }
}

for (const ref of ['J2', 'J3', 'J4']) {
  if ((placement[ref]?.x ?? 0) < 3400) errors.push({ check: 'edge-connector', ref, message: `${ref} is not on the right edge.` });
}
for (const ref of ['J6', 'J7', 'J8', 'J5']) {
  if ((placement[ref]?.y ?? Infinity) > 300) errors.push({ check: 'edge-connector', ref, message: `${ref} is not on the top edge.` });
}
for (const ref of ['J1', 'J9']) {
  if ((placement[ref]?.y ?? 0) < 3150) errors.push({ check: 'edge-connector', ref, message: `${ref} is not on the bottom edge.` });
}

const expectedPositions = {
  MH1: [6.00, 6.00],
  MH2: [85.44, 6.00],
  MH3: [6.00, 81.63],
  MH4: [85.44, 81.63],
};
for (const [ref, [x, y]] of Object.entries(expectedPositions)) {
  const footprint = kicad.footprints.get(ref);
  if (!footprint || !close(footprint.x, x, 0.02) || !close(footprint.y, y, 0.02)) {
    errors.push({ check: 'm3-hole', ref, expected: [x, y], found: footprint ? [footprint.x, footprint.y] : null });
  }
}

for (const [ref, footprint] of kicad.footprints) {
  if (pointInside(ANTENNA_KEEP_OUT_MM, footprint)) {
    warnings.push({
      check: 'kicad-antenna-stale',
      ref,
      message: `${ref} is inside the KiCad backup antenna rectangle; treat KiCad as stale preview/import baseline, not the order source.`,
      positionMm: [footprint.x, footprint.y],
    });
  }
}

const kicadCopperInAntenna = [
  ...kicad.segments.filter((segment) => segmentTouchesRect(segment, ANTENNA_KEEP_OUT_MM)).map((segment) => ({
    type: 'segment',
    layer: segment.layer,
    startMm: [segment.x1, segment.y1],
    endMm: [segment.x2, segment.y2],
  })),
  ...kicad.vias.filter((via) => pointInside(ANTENNA_KEEP_OUT_MM, via)).map((via) => ({
    type: 'via',
    atMm: [via.x, via.y],
  })),
];
if (kicadCopperInAntenna.length) {
  warnings.push({
    check: 'kicad-antenna-copper-stale',
    message: 'KiCad backup still has copper/vias crossing the antenna rectangle; official JLCEDA PCB3 must be used and rechecked live.',
    hitCount: kicadCopperInAntenna.length,
    sample: kicadCopperInAntenna.slice(0, 8),
  });
}

addPadCheck(errors, kicad.footprints, 'K1', 'COIL+', '5V');
addPadCheck(errors, kicad.footprints, 'K1', 'COIL-', 'OPEN_COIL_LOW');
addPadCheck(errors, kicad.footprints, 'K1', 'COM', 'OPEN_COM');
addPadCheck(errors, kicad.footprints, 'K1', 'NO', 'OPEN_NO');
addPadCheck(errors, kicad.footprints, 'K2', 'COIL+', '5V');
addPadCheck(errors, kicad.footprints, 'K2', 'COIL-', 'CLOSE_COIL_LOW');
addPadCheck(errors, kicad.footprints, 'K2', 'COM', 'CLOSE_COM');
addPadCheck(errors, kicad.footprints, 'K2', 'NO', 'CLOSE_NO');
addPadCheck(errors, kicad.footprints, 'K3', 'COIL+', '5V');
addPadCheck(errors, kicad.footprints, 'K3', 'COIL-', 'STOP_COIL_LOW');
addPadCheck(errors, kicad.footprints, 'K3', 'COM', 'STOP_COM');
addPadCheck(errors, kicad.footprints, 'K3', 'NO', 'STOP_NO');
addPadCheck(errors, kicad.footprints, 'Q1', '1', 'OPEN_GATE');
addPadCheck(errors, kicad.footprints, 'Q1', '2', 'GND');
addPadCheck(errors, kicad.footprints, 'Q1', '3', 'OPEN_COIL_LOW');
addPadCheck(errors, kicad.footprints, 'Q2', '1', 'CLOSE_GATE');
addPadCheck(errors, kicad.footprints, 'Q2', '2', 'GND');
addPadCheck(errors, kicad.footprints, 'Q2', '3', 'CLOSE_COIL_LOW');
addPadCheck(errors, kicad.footprints, 'Q3', '1', 'STOP_GATE');
addPadCheck(errors, kicad.footprints, 'Q3', '2', 'GND');
addPadCheck(errors, kicad.footprints, 'Q3', '3', 'STOP_COIL_LOW');
addPadCheck(errors, kicad.footprints, 'R1', '1', 'OPEN_GPIO4');
addPadCheck(errors, kicad.footprints, 'R1', '2', 'OPEN_GATE');
addPadCheck(errors, kicad.footprints, 'R2', '1', 'CLOSE_GPIO5');
addPadCheck(errors, kicad.footprints, 'R2', '2', 'CLOSE_GATE');
addPadCheck(errors, kicad.footprints, 'R3', '1', 'STOP_GPIO6');
addPadCheck(errors, kicad.footprints, 'R3', '2', 'STOP_GATE');
addPadCheck(errors, kicad.footprints, 'D1', '1', '5V');
addPadCheck(errors, kicad.footprints, 'D1', '2', 'OPEN_COIL_LOW');
addPadCheck(errors, kicad.footprints, 'D2', '1', '5V');
addPadCheck(errors, kicad.footprints, 'D2', '2', 'CLOSE_COIL_LOW');
addPadCheck(errors, kicad.footprints, 'D3', '1', '5V');
addPadCheck(errors, kicad.footprints, 'D3', '2', 'STOP_COIL_LOW');
addPadCheck(errors, kicad.footprints, 'J1', '1', 'GND');
addPadCheck(errors, kicad.footprints, 'J1', '2', '5V');
addPadCheck(errors, kicad.footprints, 'J6', '1', 'OPEN_LIMIT_GPIO7');
addPadCheck(errors, kicad.footprints, 'J6', '2', 'GND');
addPadCheck(errors, kicad.footprints, 'J7', '1', 'CLOSE_LIMIT_GPIO8');
addPadCheck(errors, kicad.footprints, 'J7', '2', 'GND');
addPadCheck(errors, kicad.footprints, 'J8', '1', 'RAIN_GPIO9');
addPadCheck(errors, kicad.footprints, 'J8', '2', 'GND');
addPadCheck(errors, kicad.footprints, 'R4', '1', 'OPEN_LIMIT_GPIO7');
addPadCheck(errors, kicad.footprints, 'R4', '2', '3V3');
addPadCheck(errors, kicad.footprints, 'R5', '1', 'CLOSE_LIMIT_GPIO8');
addPadCheck(errors, kicad.footprints, 'R5', '2', '3V3');
addPadCheck(errors, kicad.footprints, 'R6', '1', 'RAIN_GPIO9');
addPadCheck(errors, kicad.footprints, 'R6', '2', '3V3');
addPadCheck(errors, kicad.footprints, 'J9', 'VBUS', '5V');
addPadCheck(errors, kicad.footprints, 'J9', 'D-', 'USB_D-');
addPadCheck(errors, kicad.footprints, 'J9', 'D+', 'USB_D+');
addPadCheck(errors, kicad.footprints, 'J9', 'CC1', 'USB_CC1');
addPadCheck(errors, kicad.footprints, 'J9', 'CC2', 'USB_CC2');
addPadCheck(errors, kicad.footprints, 'R9', '1', 'USB_CC1');
addPadCheck(errors, kicad.footprints, 'R9', '2', 'GND');
addPadCheck(errors, kicad.footprints, 'R10', '1', 'USB_CC2');
addPadCheck(errors, kicad.footprints, 'R10', '2', 'GND');

console.log(JSON.stringify({
  ok: errors.length === 0,
  source: {
    schematic: 'P2.Schematic3',
    schematicUuid: P2_UUID,
    pcb: 'PCB3',
    pcbUuid: PCB3_UUID,
    deprecatedSchematic: 'P1.Schematic3',
    deprecatedSchematicUuid: P1_UUID,
  },
  jlcedaPlacement: {
    r1: placement.R1,
    r2: placement.R2,
    k1: placement.K1,
    k2: placement.K2,
    terminals: {
      top: ['J6', 'J7', 'J8', 'J5'].map((ref) => [ref, placement[ref]]),
      right: ['J2', 'J3', 'J4'].map((ref) => [ref, placement[ref]]),
      bottom: ['J1', 'J9'].map((ref) => [ref, placement[ref]]),
    },
    antennaKeepOutMm: Object.fromEntries(Object.entries(ANTENNA_KEEP_OUT_MIL).map(([key, value]) => [key, Number(milToMm(value).toFixed(2))])),
    relayMargins,
  },
  kicad: {
    footprintCount: kicad.footprints.size,
    m3Holes: Object.fromEntries(Object.keys(expectedPositions).map((ref) => [ref, kicad.footprints.get(ref) ? [kicad.footprints.get(ref).x, kicad.footprints.get(ref).y] : null])),
  },
  errors,
  warnings,
}, null, 2));

if (errors.length) process.exit(1);
