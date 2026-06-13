import fs from 'node:fs';

const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';
const PROJECT_ROOT = new URL('../', import.meta.url).pathname;
const KICAD_PCB = `${PROJECT_ROOT}hardware/kicad/esp32_s3_dome_controller.kicad_pcb`;
const LIB_UUID = '0819f05c4eef4c71ace90d822a990e87';
const MM_TO_MIL = 1000 / 25.4;

const LAYER = {
  TOP: 1,
  BOTTOM: 2,
  TOP_SILK: 3,
  BOARD_OUTLINE: 11,
  MULTI: 12,
  DOCUMENT: 13,
};

const DEVICES = {
  U1: ['f1c4b28a063f4c649ca8e2a2600c5103', true],
  U2: ['b117181a324c401c8efb877412bc34c2', false],
  U3: ['9f9c6cb41c7449fd8acf96aceed2661a', true],
  K1: ['60c5333b7b694ffe99b994b52e81111a', true],
  K2: ['60c5333b7b694ffe99b994b52e81111a', true],
  K3: ['60c5333b7b694ffe99b994b52e81111a', true],
  Q1: ['2b6cc05daeb34c16b9e00706a375fc9f', true],
  Q2: ['2b6cc05daeb34c16b9e00706a375fc9f', true],
  Q3: ['2b6cc05daeb34c16b9e00706a375fc9f', true],
  D1: ['76ae888fe00d40c59fce4253fc975718', true],
  D2: ['76ae888fe00d40c59fce4253fc975718', true],
  D3: ['76ae888fe00d40c59fce4253fc975718', true],
  R1: ['5303080f43d74b41ae76fc5142aa97e5', true],
  R2: ['5303080f43d74b41ae76fc5142aa97e5', true],
  R3: ['5303080f43d74b41ae76fc5142aa97e5', true],
  R4: ['b948db94476e4027ac8953235755ec96', true],
  R5: ['b948db94476e4027ac8953235755ec96', true],
  R6: ['b948db94476e4027ac8953235755ec96', true],
  R8: ['70ad7c7d259c46308522db94f14f808c', false],
  R9: ['b5d09b57bc354a60b86d6a6308651647', true],
  R10: ['b5d09b57bc354a60b86d6a6308651647', true],
  J1: ['ed83dade445541fd9e7b4ebd59966e33', true],
  J2: ['ed83dade445541fd9e7b4ebd59966e33', true],
  J3: ['ed83dade445541fd9e7b4ebd59966e33', true],
  J4: ['ed83dade445541fd9e7b4ebd59966e33', true],
  J5: ['f40eae3e0a65456ebfbf0dbe6e1215ea', false],
  J6: ['f40eae3e0a65456ebfbf0dbe6e1215ea', true],
  J7: ['f40eae3e0a65456ebfbf0dbe6e1215ea', true],
  J8: ['f40eae3e0a65456ebfbf0dbe6e1215ea', true],
  J9: ['74d31c19993b4b9581f3175a7da4b280', true],
};

const RELAY_NETS = {
  K1: { coilPlus: '5V', coilMinus: 'OPEN_COIL_LOW', com: 'OPEN_COM', no: 'OPEN_NO' },
  K2: { coilPlus: '5V', coilMinus: 'CLOSE_COIL_LOW', com: 'CLOSE_COM', no: 'CLOSE_NO' },
  K3: { coilPlus: '5V', coilMinus: 'STOP_COIL_LOW', com: 'STOP_COM', no: 'STOP_NO' },
};

const USB_NETS = {
  A1: 'GND', A12: 'GND', B1: 'GND', B12: 'GND', S1: 'GND', S2: 'GND', S3: 'GND', S4: 'GND',
  A4: '5V', A9: '5V', B4: '5V', B9: '5V', VBUS: '5V',
  A5: 'USB_CC1', B5: 'USB_CC2', CC1: 'USB_CC1', CC2: 'USB_CC2',
  A6: 'USB_D+', B6: 'USB_D+', 'D+': 'USB_D+',
  A7: 'USB_D-', B7: 'USB_D-', 'D-': 'USB_D-',
};

function mil(n) {
  return +(n * MM_TO_MIL).toFixed(3);
}

function parseBoard(text) {
  const nets = {};
  for (const match of text.matchAll(/\(net\s+(\d+)\s+"([^"]+)"\)/g)) {
    nets[match[1]] = match[2];
  }

  const footprints = {};
  const footprintRe = /\n  \(footprint "([^"]+)"([\s\S]*?)\n  \)/g;
  for (const match of text.matchAll(footprintRe)) {
    const body = match[2];
    const ref = body.match(/\(property "Reference" "([^"]+)"/)?.[1];
    const at = match[0].match(/\(at\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\)/);
    if (!ref || !at) continue;
    const pads = {};
    const padAbs = {};
    const [, x, y, rot] = at.map?.((v) => v) ?? [];
    for (const padMatch of body.matchAll(/\(pad "([^"]+)"[\s\S]*?\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?\)[\s\S]*?\(net\s+(\d+)\s+"([^"]+)"\)/g)) {
      const [, pad, px, py, , , netName] = padMatch;
      pads[pad] = netName;
      padAbs[pad] = rotateAndTranslate(+x, +y, +rot, +px, +py);
    }
    footprints[ref] = { x: +x, y: +y, rotation: +rot, pads, padAbs };
  }

  const segments = [];
  for (const m of text.matchAll(/\(segment \(start ([^)]+)\) \(end ([^)]+)\) \(width ([\d.]+)\) \(layer "([^"]+)"\) \(net (\d+)\)/g)) {
    const [sx, sy] = m[1].split(/\s+/).map(Number);
    const [ex, ey] = m[2].split(/\s+/).map(Number);
    segments.push({ sx, sy, ex, ey, width: +m[3], layer: m[4], net: nets[m[5]] });
  }

  const vias = [];
  for (const m of text.matchAll(/\(via \(at ([^)]+)\) \(size ([\d.]+)\) \(drill ([\d.]+)\) [\s\S]*?\(net (\d+)\)/g)) {
    const [x, y] = m[1].split(/\s+/).map(Number);
    vias.push({ x, y, size: +m[2], drill: +m[3], net: nets[m[4]] });
  }
  return { footprints, segments, vias };
}

function rotateAndTranslate(cx, cy, deg, px, py) {
  const r = (deg * Math.PI) / 180;
  return {
    x: cx + px * Math.cos(r) - py * Math.sin(r),
    y: cy + px * Math.sin(r) + py * Math.cos(r),
  };
}

async function rpcTool(name, args, timeoutMs = 30000, retries = 4) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: 'tools.call', params: { name, arguments: args } }),
        signal: AbortSignal.timeout(timeoutMs + 2000),
      });
      const json = await res.json();
      if (!json.ok || !json.result?.ok) throw new Error(JSON.stringify(json).slice(0, 800));
      return json.result.data;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
  throw lastError;
}

async function eda(path, args = [], timeoutMs = 30000, jsonSafe = {}) {
  return rpcTool('jlc.eda.invoke', {
    path,
    args,
    jsonSafe: {
      maxDepth: 6,
      maxArrayLength: 200,
      maxObjectKeys: 120,
      maxStringLength: 1600,
      ...jsonSafe,
    },
    timeoutMs,
  }, timeoutMs).then((data) => data.result);
}

async function deleteAll(api) {
  const ids = await eda(`${api}.getAllPrimitiveId`).catch(() => []);
  if (Array.isArray(ids) && ids.length) {
    await eda(`${api}.delete`, [ids], 30000);
    console.log(`deleted ${ids.length} from ${api}`);
  }
}

function logicalNet(ref, padNumber, pin, kicad) {
  if (ref in RELAY_NETS) {
    const dx = pin.x - kicad.xMil;
    const dy = pin.y - kicad.yMil;
    if (dx < 0 && dy < 0) return RELAY_NETS[ref].coilPlus;
    if (dx < 0 && dy >= 0) return RELAY_NETS[ref].coilMinus;
    if (dx >= 0 && dy < 0) return RELAY_NETS[ref].com;
    if (dx >= 0 && dy >= 0) return RELAY_NETS[ref].no;
  }
  if (ref === 'J9') return USB_NETS[padNumber] ?? '';
  return kicad.pads[padNumber] ?? '';
}

function targetPadPoint(ref, net, padNumber, kicad) {
  if (ref === 'J9') {
    const candidates = Object.entries(kicad.pads).filter(([, n]) => n === net);
    if (!candidates.length) return null;
    const [candidatePad] = candidates[0];
    return kicad.padAbs[candidatePad];
  }
  if (ref in RELAY_NETS) {
    const pad = Object.entries(kicad.pads).find(([, n]) => n === net)?.[0];
    return pad ? kicad.padAbs[pad] : null;
  }
  return kicad.padAbs[padNumber] ?? null;
}

async function main() {
  const board = parseBoard(fs.readFileSync(KICAD_PCB, 'utf8'));

  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);

  for (const api of [
    'pcb_PrimitiveComponent',
    'pcb_PrimitiveLine',
    'pcb_PrimitiveVia',
    'pcb_PrimitivePad',
    'pcb_PrimitivePolyline',
    'pcb_PrimitivePour',
    'pcb_PrimitiveRegion',
  ]) {
    await deleteAll(api);
  }

  const outline = [
    [0, 0, mil(91.44), 0],
    [mil(91.44), 0, mil(91.44), mil(87.63)],
    [mil(91.44), mil(87.63), 0, mil(87.63)],
    [0, mil(87.63), 0, 0],
  ];
  for (const [sx, sy, ex, ey] of outline) {
    await eda('pcb_PrimitiveLine.create', ['', LAYER.BOARD_OUTLINE, sx, sy, ex, ey, 8, false], 30000);
  }

  for (const ref of ['MH1', 'MH2', 'MH3', 'MH4']) {
    const fp = board.footprints[ref];
    await eda('pcb_PrimitivePad.create', [
      LAYER.MULTI,
      ref,
      mil(fp.x),
      mil(fp.y),
      0,
      ['ELLIPSE', mil(6.2), mil(6.2)],
      '',
      ['ROUND', mil(3.41), mil(3.41)],
      0,
      0,
      0,
      false,
      0,
      undefined,
      null,
      null,
      false,
    ], 30000);
  }

  const created = {};
  for (const [ref, [deviceUuid, addIntoBom]] of Object.entries(DEVICES)) {
    const fp = board.footprints[ref];
    if (!fp) throw new Error(`missing KiCad footprint for ${ref}`);
    const component = await eda('pcb_PrimitiveComponent.create', [
      { libraryUuid: LIB_UUID, uuid: deviceUuid },
      LAYER.TOP,
      mil(fp.x),
      mil(fp.y),
      fp.rotation,
      false,
    ], 45000);
    const primitiveId = component.primitiveId;
    await eda('pcb_PrimitiveComponent.modify', [
      primitiveId,
      { designator: ref, addIntoBom, name: ref },
    ], 30000);
    created[ref] = primitiveId;
    console.log(`component ${ref} ${primitiveId}`);
  }

  let nettedPads = 0;
  for (const [ref, primitiveId] of Object.entries(created)) {
    const fp = board.footprints[ref];
    const kicad = { ...fp, xMil: mil(fp.x), yMil: mil(fp.y) };
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [primitiveId], 30000);
    for (const pin of pins) {
      const net = logicalNet(ref, pin.padNumber, pin, kicad);
      if (!net) continue;
      await eda('pcb_PrimitivePad.modify', [pin.primitiveId, { net }], 30000);
      nettedPads++;
      const target = targetPadPoint(ref, net, pin.padNumber, kicad);
      if (target) {
        await eda('pcb_PrimitiveLine.create', [
          net,
          LAYER.TOP,
          +pin.x.toFixed(3),
          +pin.y.toFixed(3),
          mil(target.x),
          mil(target.y),
          net === 'GND' || net === '5V' ? 18 : 10,
          false,
        ], 30000);
      }
    }
  }
  console.log(`assigned ${nettedPads} component pad nets`);

  for (const s of board.segments) {
    await eda('pcb_PrimitiveLine.create', [
      s.net ?? '',
      s.layer === 'B.Cu' ? LAYER.BOTTOM : LAYER.TOP,
      mil(s.sx),
      mil(s.sy),
      mil(s.ex),
      mil(s.ey),
      mil(s.width),
      false,
    ], 30000);
  }
  console.log(`created ${board.segments.length} routed segments`);

  for (const v of board.vias) {
    await eda('pcb_PrimitiveVia.create', [
      v.net ?? '',
      mil(v.x),
      mil(v.y),
      mil(v.drill),
      mil(v.size),
      undefined,
      null,
      null,
      false,
    ], 30000);
  }
  console.log(`created ${board.vias.length} vias`);

  await eda('pcb_Document.save', [], 45000);
  const components = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 80 });
  const lines = await eda('pcb_PrimitiveLine.getAllPrimitiveId', [], 30000);
  const viasAfter = await eda('pcb_PrimitiveVia.getAllPrimitiveId', [], 30000);
  console.log(JSON.stringify({ components: components.length, lines: lines.length, vias: viasAfter.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
