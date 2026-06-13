const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';
const LAYER = { TOP: 1, BOTTOM: 2, TOP_SILK: 3, DOCUMENT: 13, BOARD_OUTLINE: 11 };
const MM_TO_MIL = 1000 / 25.4;

const mm = (v) => +(v * MM_TO_MIL).toFixed(3);
const pt = (x, y) => [x, y];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBridge() {
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const res = await fetch('http://127.0.0.1:9151/v1/status', {
        signal: AbortSignal.timeout(2500),
      });
      const json = await res.json();
      if (json.ok && json.bridge?.connected) return;
    } catch {
      // The bridge often reconnects by itself after a heavy JLCEDA call.
    }
    await sleep(1000 * attempt);
  }
}

async function rpcTool(name, args, timeoutMs = 30000, retries = 4) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: 'tools.call', params: { name, arguments: args } }),
        signal: AbortSignal.timeout(timeoutMs + 3000),
      });
      const json = await res.json();
      if (!json.ok || !json.result?.ok) throw new Error(JSON.stringify(json).slice(0, 800));
      return json.result.data.result;
    } catch (error) {
      lastError = error;
      console.warn(`retry ${attempt}/${retries}: ${args.path ?? name}: ${error.message}`);
      await waitForBridge();
      await sleep(1200 * attempt);
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
      maxArrayLength: 300,
      maxObjectKeys: 120,
      maxStringLength: 1200,
      ...jsonSafe,
    },
    timeoutMs,
  }, timeoutMs);
}

function key(ref, pad) {
  return `${ref}.${pad}`;
}

async function readPads() {
  const comps = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  const pads = {};
  const byNet = {};
  for (const comp of comps) {
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [comp.primitiveId], 30000, { maxArrayLength: 120 });
    for (const pin of pins) {
      const item = { ref: comp.designator, pad: pin.padNumber, x: +pin.x.toFixed(3), y: +pin.y.toFixed(3), net: pin.net || '' };
      pads[key(item.ref, item.pad)] = item;
      if (item.net) (byNet[item.net] ??= []).push(item);
    }
  }
  return { pads, byNet };
}

async function deletePrimitiveIds(api) {
  const ids = await eda(`${api}.getAllPrimitiveId`, [], 30000, { maxArrayLength: 1000 }).catch(() => []);
  if (Array.isArray(ids) && ids.length) {
    await eda(`${api}.delete`, [ids], 45000);
    console.log(`deleted ${ids.length} ${api}`);
  }
}

async function createLine(net, layer, a, b, width) {
  if (a[0] === b[0] && a[1] === b[1]) return;
  await eda('pcb_PrimitiveLine.create', [
    net,
    layer,
    +a[0].toFixed(3),
    +a[1].toFixed(3),
    +b[0].toFixed(3),
    +b[1].toFixed(3),
    width,
    false,
  ], 30000);
}

async function createString(layer, x, y, text, size = 42, rotation = 0, alignMode = 5) {
  await eda('pcb_PrimitiveString.create', [
    layer,
    x,
    y,
    text,
    'Arial',
    size,
    Math.max(4, Math.round(size / 10)),
    alignMode,
    rotation,
    false,
    0,
    false,
    false,
  ], 30000);
}

async function route(net, layer, points, width = 10) {
  for (let i = 0; i < points.length - 1; i++) {
    await createLine(net, layer, points[i], points[i + 1], width);
  }
}

async function annotateBoard() {
  await deletePrimitiveIds('pcb_PrimitiveString');

  await createString(LAYER.TOP_SILK, mm(46), mm(5), 'ESP32-S3 DOME CTRL V1', 58);
  await createString(LAYER.TOP_SILK, mm(52), mm(10), '2L 5V IN USB-C RELAY DRY CONTACTS', 36);
  await createString(LAYER.TOP_SILK, mm(9), mm(70), 'GND  +5V IN', 36);
  await createString(LAYER.TOP_SILK, mm(36), mm(86), 'USB-C / 5V', 34);
  await createString(LAYER.TOP_SILK, mm(83), mm(18), 'OPEN', 36, 90);
  await createString(LAYER.TOP_SILK, mm(83), mm(33), 'CLOSE', 36, 90);
  await createString(LAYER.TOP_SILK, mm(83), mm(48), 'STOP', 36, 90);
  await createString(LAYER.TOP_SILK, mm(10), mm(8), 'OPEN LIM', 30);
  await createString(LAYER.TOP_SILK, mm(25), mm(8), 'CLOSE LIM', 30);
  await createString(LAYER.TOP_SILK, mm(40), mm(8), 'RAIN', 30);
  await createString(LAYER.TOP_SILK, mm(73), mm(8), 'RS485 DNP', 30);

  const keepout = [
    pt(mm(4), mm(21.25)),
    pt(mm(52), mm(21.25)),
    pt(mm(52), mm(42.25)),
    pt(mm(4), mm(42.25)),
  ];
  for (let i = 0; i < keepout.length; i++) {
    await createLine('', LAYER.DOCUMENT, keepout[i], keepout[(i + 1) % keepout.length], 6);
  }
  await createString(LAYER.DOCUMENT, mm(28), mm(31.75), 'ESP32 ANT KEEP OUT: NO COPPER / VIA / PARTS', 32);
}

function p(pads, ref, pad) {
  const found = pads[key(ref, pad)];
  if (!found) throw new Error(`missing pad ${ref}.${pad}`);
  return pt(found.x, found.y);
}

function maybeP(pads, ref, pad) {
  const found = pads[key(ref, pad)];
  return found ? pt(found.x, found.y) : null;
}

async function moveComponents() {
  const keepoutRelocationsMm = {
    // Keep the ESP32 antenna warning area clear of small support parts.
    Q1: [54, 27],
    Q2: [54, 42],
    R1: [60, 27],
    R2: [60, 42],
    R4: [14, 18],
    R5: [29, 18],
    R6: [44, 18],
  };
  const comps = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  for (const [ref, [xMm, yMm]] of Object.entries(keepoutRelocationsMm)) {
    const component = comps.find((item) => item.designator === ref);
    if (!component) throw new Error(`missing component ${ref}`);
    await eda('pcb_PrimitiveComponent.modify', [
      component.primitiveId,
      { x: mm(xMm), y: mm(yMm), rotation: 0 },
    ], 30000);
  }
}

async function main() {
  console.log('opening PCB3');
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  console.log('moving support parts out of ESP32 antenna warning area');
  await moveComponents();
  console.log('deleting previous routes');
  await deletePrimitiveIds('pcb_PrimitiveLine');
  await deletePrimitiveIds('pcb_PrimitiveVia');

  console.log('reading official JLCEDA pads');
  const { pads } = await readPads();

  console.log('drawing board outline');
  const outline = [
    [0, 0, mm(91.44), 0],
    [mm(91.44), 0, mm(91.44), mm(87.63)],
    [mm(91.44), mm(87.63), 0, mm(87.63)],
    [0, mm(87.63), 0, 0],
  ];
  for (const [sx, sy, ex, ey] of outline) {
    await createLine('', LAYER.BOARD_OUTLINE, pt(sx, sy), pt(ex, ey), 8);
  }

  const sig = 10;
  const pwr = 20;
  const relay = 24;
  const koRight = 2100;
  const koTop = 780;
  const koBottom = 1720;

  // Relay contact outputs stay short and isolated on the right edge.
  console.log('routing relay contacts');
  await route('OPEN_COM', LAYER.TOP, [p(pads, 'K1', '2'), pt(3120, 630), pt(3120, 966), p(pads, 'J2', '2')], relay);
  await route('OPEN_NO', LAYER.TOP, [p(pads, 'K1', '3'), pt(3230, 1102), pt(3230, 766), p(pads, 'J2', '1')], relay);
  await route('CLOSE_COM', LAYER.TOP, [p(pads, 'K2', '2'), pt(3120, 1220), pt(3120, 1557), p(pads, 'J3', '2')], relay);
  await route('CLOSE_NO', LAYER.TOP, [p(pads, 'K2', '3'), pt(3230, 1693), pt(3230, 1357), p(pads, 'J3', '1')], relay);
  await route('STOP_COM', LAYER.TOP, [p(pads, 'K3', '2'), pt(3120, 1811), pt(3120, 2147), p(pads, 'J4', '2')], relay);
  await route('STOP_NO', LAYER.TOP, [p(pads, 'K3', '3'), pt(3230, 2283), pt(3230, 1947), p(pads, 'J4', '1')], relay);

  // Relay coil loops.
  console.log('routing relay coils');
  await route('OPEN_COIL_LOW', LAYER.TOP, [p(pads, 'K1', '4'), pt(2200, 1102), p(pads, 'Q1', '3'), p(pads, 'D1', '2')], pwr);
  await route('CLOSE_COIL_LOW', LAYER.TOP, [p(pads, 'K2', '5'), p(pads, 'D2', '2'), pt(2100, 1457), p(pads, 'Q2', '3')], pwr);
  await route('STOP_COIL_LOW', LAYER.TOP, [p(pads, 'K3', '4'), pt(2200, 2284), p(pads, 'Q3', '3'), p(pads, 'D3', '2')], pwr);

  // Gate drive signals.
  console.log('routing relay gate signals');
  await route('OPEN_GATE', LAYER.TOP, [p(pads, 'R1', '2'), p(pads, 'Q1', '1')], sig);
  await route('CLOSE_GATE', LAYER.TOP, [p(pads, 'R2', '2'), p(pads, 'Q2', '1')], sig);
  await route('STOP_GATE', LAYER.TOP, [p(pads, 'R3', '2'), p(pads, 'Q3', '1')], sig);
  await route('OPEN_GPIO4', LAYER.BOTTOM, [p(pads, 'U1', '4'), pt(700, koBottom), pt(koRight, koBottom), p(pads, 'R1', '1')], sig);
  await route('CLOSE_GPIO5', LAYER.BOTTOM, [p(pads, 'U1', '5'), pt(780, koBottom), pt(koRight, koBottom), p(pads, 'R2', '1')], sig);
  await route('STOP_GPIO6', LAYER.BOTTOM, [p(pads, 'U1', '6'), pt(1320, 2030), pt(1320, 2126), p(pads, 'R3', '1')], sig);

  // Inputs with pullups and terminals.
  console.log('routing inputs and pullups');
  await route('OPEN_LIMIT_GPIO7', LAYER.BOTTOM, [p(pads, 'U1', '7'), pt(860, koBottom), pt(koRight, koBottom), pt(koRight, koTop), p(pads, 'R4', '1'), p(pads, 'J6', '1')], sig);
  await route('CLOSE_LIMIT_GPIO8', LAYER.BOTTOM, [p(pads, 'U1', '12'), pt(980, koBottom), pt(koRight, koBottom), pt(koRight, koTop), p(pads, 'R5', '1'), p(pads, 'J7', '1')], sig);
  await route('RAIN_GPIO9', LAYER.BOTTOM, [p(pads, 'U1', '17'), pt(1350, koBottom), pt(koRight, koBottom), pt(koRight, koTop), p(pads, 'R6', '1'), p(pads, 'J8', '1')], sig);
  const u1_3v3 = maybeP(pads, 'U1', '3V3');
  await route('3V3', LAYER.TOP, [
    p(pads, 'U3', '4'),
    p(pads, 'U3', '2'),
    pt(koRight, 3000),
    pt(koRight, koTop),
    p(pads, 'R4', '2'),
    p(pads, 'R5', '2'),
    p(pads, 'R6', '2'),
    pt(2208, koTop),
    p(pads, 'U2', '8'),
    ...(u1_3v3 ? [pt(koRight, koBottom), u1_3v3] : []),
  ], pwr);

  // Power and ground buses.
  console.log('routing power and ground');
  await route('5V', LAYER.TOP, [p(pads, 'J1', '2'), p(pads, 'U3', '3'), pt(2136, 3083), p(pads, 'D3', '1'), p(pads, 'K3', '1'), p(pads, 'K3', '5')], pwr);
  await route('5V', LAYER.TOP, [p(pads, 'D3', '1'), p(pads, 'D2', '1'), p(pads, 'K2', '1'), pt(2398, 866), p(pads, 'K1', '1'), p(pads, 'D1', '1'), p(pads, 'K1', '5')], pwr);
  await route('GND', LAYER.BOTTOM, [p(pads, 'J1', '1'), p(pads, 'U3', '1'), pt(koRight, 3000), pt(koRight, koBottom), p(pads, 'U1', '40'), p(pads, 'U1', '1'), pt(1929, 2279), p(pads, 'Q3', '2'), p(pads, 'Q2', '2'), p(pads, 'Q1', '2')], pwr);
  await route('GND', LAYER.BOTTOM, [p(pads, 'J6', '2'), p(pads, 'J7', '2'), p(pads, 'J8', '2'), pt(1801, 512), p(pads, 'U2', '5'), pt(1801, 3150), p(pads, 'R9', '2'), p(pads, 'R10', '2')], pwr);
  for (const usb5vPad of ['A4', 'A9', 'B4', 'B9', 'VBUS']) {
    const pad = maybeP(pads, 'J9', usb5vPad);
    if (pad) await route('5V', LAYER.TOP, [p(pads, 'J1', '2'), pt(1380, 3180), pad], pwr);
  }
  for (const usbGndPad of ['A1', 'A12', 'B1', 'B12', 'S1', 'S2', 'S3', 'S4']) {
    const pad = maybeP(pads, 'J9', usbGndPad);
    if (pad) await route('GND', LAYER.BOTTOM, [p(pads, 'J1', '1'), pt(1380, 3260), pad], pwr);
  }

  // USB native device wiring.
  console.log('routing USB-C');
  await route('USB_D+', LAYER.BOTTOM, [p(pads, 'U1', '20'), pt(1077, 2850), pt(1407, 2850), p(pads, 'J9', 'A6'), p(pads, 'J9', 'B6')], sig);
  await route('USB_D-', LAYER.BOTTOM, [p(pads, 'U1', '19'), pt(1027, 2790), pt(1388, 2790), p(pads, 'J9', 'B7'), p(pads, 'J9', 'A7')], sig);
  await route('USB_CC1', LAYER.TOP, [p(pads, 'J9', 'A5'), p(pads, 'R9', '1')], sig);
  await route('USB_CC2', LAYER.TOP, [p(pads, 'J9', 'B5'), p(pads, 'R10', '1')], sig);

  // RS485 is DNP by default but keep reserved wiring local.
  console.log('routing reserved RS485');
  await route('RS485_A', LAYER.TOP, [p(pads, 'U2', '6'), p(pads, 'R8', '1'), p(pads, 'J5', '1')], sig);
  await route('RS485_B', LAYER.TOP, [p(pads, 'U2', '7'), p(pads, 'R8', '2'), p(pads, 'J5', '2')], sig);
  await route('RS485_RE_DE', LAYER.TOP, [p(pads, 'U2', '2'), p(pads, 'U2', '3')], sig);

  console.log('adding silkscreen and antenna keepout notes');
  await annotateBoard();

  console.log('saving PCB3');
  await eda('pcb_Document.save', [], 45000);
  const lines = await eda('pcb_PrimitiveLine.getAllPrimitiveId', [], 30000, { maxArrayLength: 1000 });
  console.log(JSON.stringify({ lines: lines.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
