const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';

const LAYER = {
  TOP: 1,
  BOTTOM: 2,
  TOP_SILK: 3,
  BOARD_OUTLINE: 11,
  DOCUMENT: 13,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pt = (x, y) => ({ x, y });
const CHAMFER_MIN = 8;
const ORTHOGONAL_BUS_NETS = new Set(['3V3', '5V', 'GND', 'RS485_A', 'RS485_B']);

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function axisSegment(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return null;
  if (Math.abs(dx) < 0.001) return { axis: 'y', ux: 0, uy: Math.sign(dy), len };
  if (Math.abs(dy) < 0.001) return { axis: 'x', ux: Math.sign(dx), uy: 0, len };
  return null;
}

function chamferSize(width) {
  return Math.max(12, Math.min(45, width * 2.2));
}

function isConnectionAnchor(point) {
  return Boolean(point?.ref || point?.pad || point?.via);
}

function routePoints45(points, width) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const back = axisSegment(corner, prev);
    const forward = axisSegment(corner, next);

    if (!isConnectionAnchor(corner) && back && forward && back.axis !== forward.axis) {
      const cut = Math.min(chamferSize(width), back.len * 0.35, forward.len * 0.35);
      if (cut >= CHAMFER_MIN) {
        out.push(pt(corner.x + back.ux * cut, corner.y + back.uy * cut));
        out.push(pt(corner.x + forward.ux * cut, corner.y + forward.uy * cut));
        continue;
      }
    }

    out.push(corner);
  }
  out.push(points[points.length - 1]);
  return out.filter((point, index, list) => index === 0 || distance(point, list[index - 1]) > 0.001);
}

async function waitForBridge() {
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const res = await fetch('http://127.0.0.1:9151/v1/status', {
        signal: AbortSignal.timeout(2500),
      });
      const json = await res.json();
      if (json.ok && json.bridge?.connected) return;
    } catch {
      // The bridge usually reconnects after a heavy EDA call.
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
      if (!json.ok || !json.result?.ok) throw new Error(JSON.stringify(json).slice(0, 900));
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
      maxDepth: 5,
      maxArrayLength: 800,
      maxObjectKeys: 120,
      maxStringLength: 1200,
      ...jsonSafe,
    },
    timeoutMs,
  }, timeoutMs);
}

function padKey(ref, pad) {
  return `${ref}.${pad}`;
}

async function deleteIds(api, ids) {
  if (Array.isArray(ids) && ids.length) {
    const chunkSize = 1;
    for (let i = 0; i < ids.length; i += chunkSize) {
      await eda(`${api}.delete`, [ids.slice(i, i + chunkSize)], 45000);
      await sleep(120);
    }
  }
}

async function deleteRoutePrimitives() {
  for (let pass = 1; pass <= 20; pass++) {
    const ids = await eda('pcb_PrimitiveLine.getAllPrimitiveId', [], 45000, { maxArrayLength: 3000 }).catch(() => []);
    await deleteIds('pcb_PrimitiveLine', ids);
    console.log(`deleted ${ids.length} primitive lines on pass ${pass}`);
    if (!ids.length) break;
    await sleep(900);
  }
  const vias = await eda('pcb_PrimitiveVia.getAllPrimitiveId', [], 30000, { maxArrayLength: 800 }).catch(() => []);
  await deleteIds('pcb_PrimitiveVia', vias);
  console.log(`deleted ${vias.length} vias`);

  const strings = await eda('pcb_PrimitiveString.getAllPrimitiveId', [], 30000, { maxArrayLength: 400 }).catch(() => []);
  await deleteIds('pcb_PrimitiveString', strings);
  console.log(`deleted ${strings.length} standalone strings`);
}

async function moveComponents() {
  const placement = {
    U1: [1102.4, 1929.1, 0],
    U2: [2283.5, 420.0, 0],
    U3: [787.4, 2800.0, 0],

    K1: [2598.4, 866.1, 0],
    K2: [2598.4, 1456.7, 0],
    K3: [2598.4, 2047.2, 0],
    Q1: [2126.0, 1063.0, 0],
    Q2: [2126.0, 1653.5, 0],
    Q3: [1889.8, 2204.7, 0],
    D1: [2050.0, 760.0, 0],
    D2: [2050.0, 1540.0, 0],
    D3: [2050.0, 2120.0, 0],
    R1: [2130.0, 970.0, 180],
    R2: [2130.0, 1585.0, 180],
    R3: [1653.5, 2126.0, 0],

    J1: [720.0, 3320.0, 0],
    J2: [3500.0, 866.1, 90],
    J3: [3500.0, 1456.7, 90],
    J4: [3500.0, 2047.2, 90],
    J5: [2874.0, 145.0, 0],
    J6: [650.0, 145.0, 0],
    J7: [1130.0, 145.0, 0],
    J8: [1610.0, 145.0, 0],
    J9: [1417.3, 3280.0, 180],

    R4: [650.0, 650.0, 0],
    R5: [1130.0, 650.0, 0],
    R6: [1610.0, 650.0, 0],
    R8: [2874.0, 420.0, 0],
    R9: [1771.7, 3149.6, 0],
    R10: [1771.7, 3307.1, 0],
  };

  const comps = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  for (const [ref, [x, y, rotation]] of Object.entries(placement)) {
    const comp = comps.find((item) => item.designator === ref);
    if (!comp) throw new Error(`missing component ${ref}`);
    await eda('pcb_PrimitiveComponent.modify', [
      comp.primitiveId,
      { x, y, rotation },
    ], 30000);
    await sleep(80);
  }
}

async function readPads() {
  const comps = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  const pads = {};
  for (const comp of comps) {
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [comp.primitiveId], 30000, { maxArrayLength: 180 });
    for (const pin of pins) {
      pads[padKey(comp.designator, pin.padNumber)] = {
        ref: comp.designator,
        pad: pin.padNumber,
        primitiveId: pin.primitiveId,
        x: +pin.x.toFixed(3),
        y: +pin.y.toFixed(3),
        net: pin.net || '',
        layer: pin.layer,
        hole: pin.hole,
        metallization: pin.metallization,
      };
    }
    await sleep(120);
  }
  return pads;
}

function p(pads, ref, pad) {
  const found = pads[padKey(ref, pad)];
  if (!found) throw new Error(`missing pad ${ref}.${pad}`);
  return found;
}

function maybeP(pads, ref, pad) {
  return pads[padKey(ref, pad)] || null;
}

async function setPadNet(pad, net) {
  if (!pad) return;
  if (pad.net === net) return;
  await eda('pcb_PrimitivePad.modify', [pad.primitiveId, { net }], 30000);
  pad.net = net;
}

async function assignUsbPowerNets(pads) {
  for (const pad of ['A4B9', 'B4A9']) await setPadNet(maybeP(pads, 'J9', pad), '5V');
  for (const pad of ['A1B12', 'B1A12', '1', '2', '3', '4']) await setPadNet(maybeP(pads, 'J9', pad), 'GND');
}

async function assignKnownPadNets() {
  const byRefPad = {
    U1: {
      1: 'GND',
      2: '3V3',
      3: '3V3',
      13: 'USB_D-',
      14: 'USB_D+',
      19: '',
      20: '',
      40: 'GND',
      41: 'GND',
    },
    K1: { 1: '5V', 2: 'OPEN_COM', 3: 'OPEN_NO', 4: 'OPEN_COIL_LOW', 5: '5V' },
    K2: { 1: '5V', 2: 'CLOSE_COM', 3: 'CLOSE_NO', 4: 'CLOSE_COIL_LOW', 5: '5V' },
    K3: { 1: '5V', 2: 'STOP_COM', 3: 'STOP_NO', 4: 'STOP_COIL_LOW', 5: '5V' },
    J2: { 1: 'OPEN_COM', 2: 'OPEN_NO' },
    J3: { 1: 'CLOSE_COM', 2: 'CLOSE_NO' },
    J4: { 1: 'STOP_COM', 2: 'STOP_NO' },
    J9: {
      A4B9: '5V',
      B4A9: '5V',
      A1B12: 'GND',
      B1A12: 'GND',
      1: 'GND',
      2: 'GND',
      3: 'GND',
      4: 'GND',
    },
  };

  const comps = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  for (const comp of comps) {
    const padNets = byRefPad[comp.designator];
    if (!padNets) continue;
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [comp.primitiveId], 30000, { maxArrayLength: 180 });
    for (const pin of pins) {
      if (!(pin.padNumber in padNets)) continue;
      const net = padNets[pin.padNumber];
      if ((pin.net || '') !== net) {
        await eda('pcb_PrimitivePad.modify', [pin.primitiveId, { net }], 30000);
      }
    }
    await sleep(120);
  }
}

async function createLine(net, layer, a, b, width) {
  if (!a || !b) return;
  if (Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001) return;
  await eda('pcb_PrimitiveLine.create', [
    net,
    layer,
    +a.x.toFixed(3),
    +a.y.toFixed(3),
    +b.x.toFixed(3),
    +b.y.toFixed(3),
    width,
    false,
  ], 30000);
}

async function drawBoardOutline() {
  const outline = [
    [pt(0, 0), pt(3600, 0)],
    [pt(3600, 0), pt(3600, 3450)],
    [pt(3600, 3450), pt(0, 3450)],
    [pt(0, 3450), pt(0, 0)],
  ];
  for (const [a, b] of outline) {
    await createLine('', LAYER.BOARD_OUTLINE, a, b, 8);
  }
}

async function route(net, layer, points, width) {
  const routed = ORTHOGONAL_BUS_NETS.has(net) ? points : routePoints45(points, width);
  for (let i = 0; i < routed.length - 1; i++) {
    await createLine(net, layer, routed[i], routed[i + 1], width);
  }
}

async function createVia(net, x, y, width) {
  const hole = width >= 18 ? 16 : 12;
  const diameter = width >= 18 ? 34 : 26;
  await eda('pcb_PrimitiveVia.create', [
    net,
    +x.toFixed(3),
    +y.toFixed(3),
    hole,
    diameter,
    undefined,
    null,
    null,
    false,
  ], 30000);
  return { ...pt(x, y), via: true };
}

async function stitchTopPadToBottom(pad, dx, dy, width) {
  const via = await createVia(pad.net, pad.x + dx, pad.y + dy, width);
  await createLine(pad.net, LAYER.TOP, pad, via, width);
  return via;
}

async function createString(layer, x, y, text, size = 36, rotation = 0, alignMode = 5) {
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

async function annotateBoard() {
  await createString(LAYER.TOP_SILK, 1810, 160, 'ESP32-S3 DOME CTRL V1', 54);
  await createString(LAYER.TOP_SILK, 1810, 220, 'USB-C + 5V IN / RELAY DRY CONTACTS', 34);
  await createString(LAYER.TOP_SILK, 720, 3140, 'GND  +5V IN', 32);
  await createString(LAYER.TOP_SILK, 1417, 3075, 'USB-C OUT', 32);
  await createString(LAYER.TOP_SILK, 3560, 865, 'OPEN', 34, 90);
  await createString(LAYER.TOP_SILK, 3560, 1457, 'CLOSE', 34, 90);
  await createString(LAYER.TOP_SILK, 3560, 2047, 'STOP', 34, 90);
  await createString(LAYER.TOP_SILK, 650, 430, 'OPEN LIM', 28);
  await createString(LAYER.TOP_SILK, 1130, 430, 'CLOSE LIM', 28);
  await createString(LAYER.TOP_SILK, 1610, 430, 'RAIN', 28);
  await createString(LAYER.TOP_SILK, 2874, 430, 'RS485 DNP', 28);

  const keepout = [
    pt(157.48, 836.61),
    pt(2047.24, 836.61),
    pt(2047.24, 1500.00),
    pt(157.48, 1500.00),
  ];
  for (let i = 0; i < keepout.length; i++) {
    await createLine('', LAYER.DOCUMENT, keepout[i], keepout[(i + 1) % keepout.length], 6);
  }
  await createString(LAYER.DOCUMENT, 1100, 1250, 'ESP32 ANT KEEP OUT: NO COPPER / VIA / PARTS', 30);
}

async function routeBoard(pads) {
  const sig = 8;
  const usb = 6;
  const pwr = 16;
  const relay = 20;
  const gnd = 16;
  const usbPwr = 12;

  async function topVia(pad, x, y, width) {
    const via = await createVia(pad.net, x, y, width);
    await createLine(pad.net, LAYER.TOP, pad, via, width);
    return via;
  }

  async function bottomToTopPad(pad, x, y, width) {
    const via = await createVia(pad.net, x, y, width);
    await createLine(pad.net, LAYER.TOP, via, pad, width);
    return via;
  }

  async function topFanout(pad, points, width) {
    const viaPoint = points[points.length - 1];
    const via = await createVia(pad.net, viaPoint.x, viaPoint.y, width);
    await route(pad.net, LAYER.TOP, [pad, ...points], width);
    return via;
  }

  console.log('routing relay contacts');
  await route('OPEN_COM', LAYER.TOP, [p(pads, 'K1', '2'), pt(3200, 630), pt(3200, p(pads, 'J2', '1').y), p(pads, 'J2', '1')], relay);
  await route('OPEN_NO', LAYER.TOP, [p(pads, 'K1', '3'), pt(3310, 1102), pt(3310, p(pads, 'J2', '2').y), p(pads, 'J2', '2')], relay);
  await route('CLOSE_COM', LAYER.TOP, [p(pads, 'K2', '2'), pt(3200, 1220), pt(3200, p(pads, 'J3', '1').y), p(pads, 'J3', '1')], relay);
  await route('CLOSE_NO', LAYER.TOP, [p(pads, 'K2', '3'), pt(3310, 1693), pt(3310, p(pads, 'J3', '2').y), p(pads, 'J3', '2')], relay);
  await route('STOP_COM', LAYER.TOP, [p(pads, 'K3', '2'), pt(3200, 1811), pt(3200, p(pads, 'J4', '1').y), p(pads, 'J4', '1')], relay);
  await route('STOP_NO', LAYER.TOP, [p(pads, 'K3', '3'), pt(3310, 2283), pt(3310, p(pads, 'J4', '2').y), p(pads, 'J4', '2')], relay);

  console.log('routing relay coils');
  await route('OPEN_COIL_LOW', LAYER.TOP, [p(pads, 'K1', '4'), pt(2260, p(pads, 'K1', '4').y), pt(2260, p(pads, 'Q1', '3').y), p(pads, 'Q1', '3')], pwr);
  await route('OPEN_COIL_LOW', LAYER.TOP, [p(pads, 'Q1', '3'), pt(p(pads, 'Q1', '3').x, p(pads, 'D1', '2').y), p(pads, 'D1', '2')], pwr);
  await route('CLOSE_COIL_LOW', LAYER.TOP, [p(pads, 'K2', '4'), pt(2260, p(pads, 'K2', '4').y), pt(2260, p(pads, 'Q2', '3').y), p(pads, 'Q2', '3')], pwr);
  await route('CLOSE_COIL_LOW', LAYER.TOP, [p(pads, 'Q2', '3'), pt(p(pads, 'Q2', '3').x, p(pads, 'D2', '2').y), p(pads, 'D2', '2')], pwr);
  await route('STOP_COIL_LOW', LAYER.TOP, [p(pads, 'K3', '4'), pt(2200, p(pads, 'K3', '4').y), pt(2200, p(pads, 'Q3', '3').y), p(pads, 'Q3', '3')], pwr);
  await route('STOP_COIL_LOW', LAYER.TOP, [p(pads, 'Q3', '3'), pt(p(pads, 'Q3', '3').x, 2195), pt(p(pads, 'D3', '2').x, 2195), p(pads, 'D3', '2')], pwr);

  console.log('routing relay gate signals');
  await route('OPEN_GATE', LAYER.TOP, [p(pads, 'R1', '2'), pt(2160, p(pads, 'R1', '2').y), pt(2160, p(pads, 'Q1', '1').y), p(pads, 'Q1', '1')], sig);
  await route('CLOSE_GATE', LAYER.TOP, [p(pads, 'R2', '2'), pt(2160, p(pads, 'R2', '2').y), pt(2160, p(pads, 'Q2', '1').y), p(pads, 'Q2', '1')], sig);
  await route('STOP_GATE', LAYER.TOP, [p(pads, 'R3', '2'), pt(1720, p(pads, 'R3', '2').y), pt(1720, p(pads, 'Q3', '1').y), p(pads, 'Q3', '1')], sig);

  const openGpioVia = await topVia(p(pads, 'U1', '4'), 690, p(pads, 'U1', '4').y, sig);
  const closeGpioVia = await topVia(p(pads, 'U1', '5'), 650, p(pads, 'U1', '5').y, sig);
  const r1Via = await createVia('OPEN_GPIO4', 2130, p(pads, 'R1', '1').y, sig);
  const r2Via = await createVia('CLOSE_GPIO5', 2130, p(pads, 'R2', '1').y, sig);
  const stopVia = await topVia(p(pads, 'U1', '6'), 760, p(pads, 'U1', '6').y, sig);
  const r3Via = await bottomToTopPad(p(pads, 'R3', '1'), 1500, 2200, sig);
  await route('OPEN_GPIO4', LAYER.TOP, [r1Via, p(pads, 'R1', '1')], sig);
  await route('CLOSE_GPIO5', LAYER.TOP, [r2Via, p(pads, 'R2', '1')], sig);
  await route('OPEN_GPIO4', LAYER.BOTTOM, [openGpioVia, pt(690, 2550), pt(2130, 2550), pt(2130, p(pads, 'R1', '1').y), r1Via], sig);
  await route('CLOSE_GPIO5', LAYER.BOTTOM, [closeGpioVia, pt(650, 2600), pt(2130, 2600), pt(2130, p(pads, 'R2', '1').y), r2Via], sig);
  await route('STOP_GPIO6', LAYER.BOTTOM, [stopVia, pt(760, 2400), pt(1500, 2400), r3Via], sig);

  console.log('routing input terminals and pullups');
  await route('OPEN_LIMIT_GPIO7', LAYER.TOP, [p(pads, 'U1', '7'), pt(80, p(pads, 'U1', '7').y), pt(80, 650), p(pads, 'R4', '1'), pt(p(pads, 'J6', '1').x, 650), p(pads, 'J6', '1')], sig);
  await route('CLOSE_LIMIT_GPIO8', LAYER.TOP, [p(pads, 'U1', '12'), pt(120, p(pads, 'U1', '12').y), pt(120, 760), pt(p(pads, 'R5', '1').x, 760), p(pads, 'R5', '1'), pt(p(pads, 'J7', '1').x, 650), p(pads, 'J7', '1')], sig);
  const rainVia = await topVia(p(pads, 'U1', '17'), p(pads, 'U1', '17').x, 1535, sig);
  const rainR6Via = await bottomToTopPad(p(pads, 'R6', '1'), p(pads, 'R6', '1').x, 800, sig);
  await route('RAIN_GPIO9', LAYER.BOTTOM, [rainVia, pt(140, 1535), pt(140, 800), rainR6Via], sig);
  await route('RAIN_GPIO9', LAYER.TOP, [p(pads, 'R6', '1'), pt(p(pads, 'J8', '1').x, 650), p(pads, 'J8', '1')], sig);

  console.log('routing 3V3');
  await route('3V3', LAYER.TOP, [p(pads, 'U3', '4'), p(pads, 'U3', '2')], pwr);
  await route('3V3', LAYER.TOP, [p(pads, 'U3', '4'), pt(520, p(pads, 'U3', '4').y), pt(520, p(pads, 'U1', '2').y), p(pads, 'U1', '2'), pt(520, p(pads, 'U1', '2').y), pt(520, p(pads, 'U1', '3').y), p(pads, 'U1', '3')], pwr);
  const v3Bus = await topVia(p(pads, 'U3', '4'), 100, p(pads, 'U3', '4').y, pwr);
  const v3R4 = await bottomToTopPad(p(pads, 'R4', '2'), p(pads, 'R4', '2').x, 700, pwr);
  const v3R5 = await bottomToTopPad(p(pads, 'R5', '2'), p(pads, 'R5', '2').x, 700, pwr);
  const v3R6 = await bottomToTopPad(p(pads, 'R6', '2'), p(pads, 'R6', '2').x, 700, pwr);
  const v3U2 = await createVia('3V3', 1900, 700, pwr);
  await route('3V3', LAYER.TOP, [v3U2, pt(1900, p(pads, 'U2', '8').y), p(pads, 'U2', '8')], pwr);
  await route('3V3', LAYER.BOTTOM, [v3Bus, pt(100, 700), v3R4, v3R5, v3R6, v3U2], pwr);

  console.log('routing 5V');
  await route('5V', LAYER.TOP, [p(pads, 'J1', '2'), pt(p(pads, 'J1', '2').x, p(pads, 'U3', '3').y), p(pads, 'U3', '3')], pwr);
  await route('5V', LAYER.TOP, [p(pads, 'U3', '3'), pt(1180, p(pads, 'U3', '3').y), pt(1180, 2800), pt(2500, 2800), pt(2500, 630)], pwr);
  for (const ref of ['K1', 'K2', 'K3']) {
    for (const padNo of ['1', '5']) {
      const pad = p(pads, ref, padNo);
      await route('5V', LAYER.TOP, [pt(2500, pad.y), pad], pwr);
    }
  }
  await route('5V', LAYER.TOP, [p(pads, 'D1', '1'), pt(p(pads, 'D1', '1').x, 640), pt(p(pads, 'K1', '1').x, 640), p(pads, 'K1', '1')], pwr);
  await route('5V', LAYER.TOP, [p(pads, 'D2', '1'), pt(p(pads, 'D2', '1').x, 1505), pt(p(pads, 'K2', '5').x, 1505), p(pads, 'K2', '5')], pwr);
  await route('5V', LAYER.TOP, [p(pads, 'D3', '1'), pt(p(pads, 'D3', '1').x, 2060), pt(p(pads, 'K3', '1').x, 2060), p(pads, 'K3', '1')], pwr);
  await route('5V', LAYER.TOP, [p(pads, 'J9', 'B4A9'), pt(p(pads, 'J9', 'B4A9').x, 3020), pt(1180, 3020), pt(1180, 2800)], usbPwr);
  const usbVbusVia = await createVia('5V', 1600, 3040, usbPwr);
  await route('5V', LAYER.TOP, [p(pads, 'J9', 'A4B9'), pt(p(pads, 'J9', 'A4B9').x, 3040), usbVbusVia], usbPwr);
  await route('5V', LAYER.TOP, [usbVbusVia, pt(2500, 3040)], usbPwr);
  await route('5V', LAYER.TOP, [pt(2500, 3060), pt(2500, 2800)], usbPwr);

  console.log('routing GND');
  const gndNodes = {
    u1a: await topVia(p(pads, 'U1', '1'), 840, p(pads, 'U1', '1').y, gnd),
    u1b: await topVia(p(pads, 'U1', '40'), 1580, p(pads, 'U1', '40').y, gnd),
    u2: await topVia(p(pads, 'U2', '5'), 2450, p(pads, 'U2', '5').y, gnd),
    q1: await topVia(p(pads, 'Q1', '2'), 2050, p(pads, 'Q1', '2').y, gnd),
    q2: await topVia(p(pads, 'Q2', '2'), 2050, p(pads, 'Q2', '2').y, gnd),
    q3: await topVia(p(pads, 'Q3', '2'), 1800, p(pads, 'Q3', '2').y, gnd),
    u3: await bottomToTopPad(p(pads, 'U3', '1'), p(pads, 'U3', '1').x - 140, p(pads, 'U3', '1').y, gnd),
  };
  await route('GND', LAYER.TOP, [pt(988.2, 1920.2), pt(1098.5, 1920.2), pt(1098.5, 1975.4), pt(1098.5, 2030.5), pt(1043.3, 2030.5), pt(988.2, 2030.5), pt(988.2, 1975.4), pt(988.2, 1920.2)], 12);
  await route('GND', LAYER.TOP, [pt(1043.3, 1920.2), pt(1043.3, 2030.5), pt(988.2, 1975.4), pt(1098.5, 1975.4)], 12);
  await route('GND', LAYER.TOP, [pt(1043.3, 2030.5), pt(1043.3, p(pads, 'U1', '1').y), p(pads, 'U1', '1'), pt(1043.3, p(pads, 'U1', '1').y), p(pads, 'U1', '40')], gnd);
  await route('GND', LAYER.BOTTOM, [p(pads, 'J1', '1'), pt(p(pads, 'J1', '1').x, 3400), pt(1800, 3400), pt(1800, gndNodes.u3.y), gndNodes.u3], gnd);
  await route('GND', LAYER.TOP, [gndNodes.u3, pt(1000, 2740), pt(1700, 2740), pt(1580, 2740), gndNodes.u1b, gndNodes.u1a], gnd);
  await route('GND', LAYER.BOTTOM, [gndNodes.u1b, pt(1800, p(pads, 'U1', '40').y), gndNodes.q3, pt(2050, p(pads, 'Q3', '2').y), pt(2050, p(pads, 'Q2', '2').y), gndNodes.q2, pt(2050, p(pads, 'Q1', '2').y), gndNodes.q1], gnd);
  await route('GND', LAYER.BOTTOM, [
    p(pads, 'J1', '1'),
    pt(p(pads, 'J1', '1').x, 3400),
    pt(50, 3400),
    pt(50, 600),
    pt(p(pads, 'J6', '2').x, 600),
    p(pads, 'J6', '2'),
  ], gnd);
  await route('GND', LAYER.BOTTOM, [p(pads, 'J6', '2'), pt(p(pads, 'J6', '2').x, 560), pt(p(pads, 'J8', '2').x, 560)], gnd);
  await route('GND', LAYER.BOTTOM, [gndNodes.u2, pt(2600, gndNodes.u2.y), pt(2600, 1000), pt(3100, 1000), pt(3100, 80), pt(p(pads, 'J6', '2').x, 80), p(pads, 'J6', '2')], gnd);
  for (const ref of ['J6', 'J7', 'J8']) {
    await route('GND', LAYER.BOTTOM, [pt(p(pads, ref, '2').x, 560), p(pads, ref, '2')], gnd);
  }
  await route('GND', LAYER.BOTTOM, [p(pads, 'J1', '1'), pt(p(pads, 'J1', '1').x, 3408), pt(p(pads, 'J9', '2').x, 3408), p(pads, 'J9', '2'), p(pads, 'J9', '1')], gnd);
  await route('GND', LAYER.BOTTOM, [pt(p(pads, 'J9', '2').x, 3408), pt(p(pads, 'J9', '3').x, 3408), p(pads, 'J9', '3'), p(pads, 'J9', '4')], gnd);
  await route('GND', LAYER.TOP, [p(pads, 'R9', '2'), pt(1880, p(pads, 'R9', '2').y), pt(1880, p(pads, 'J9', '3').y), p(pads, 'J9', '3')], 12);
  await route('GND', LAYER.TOP, [p(pads, 'R10', '2'), pt(1880, p(pads, 'R10', '2').y), pt(1880, p(pads, 'J9', '3').y)], 12);
  await route('GND', LAYER.TOP, [p(pads, 'J9', 'B1A12'), pt(1260, p(pads, 'J9', 'B1A12').y), p(pads, 'J9', '1')], gnd);
  await route('GND', LAYER.TOP, [p(pads, 'J9', 'A1B12'), pt(1570, p(pads, 'J9', 'A1B12').y), p(pads, 'J9', '4')], gnd);

  console.log('routing USB-C data and CC');
  const uDm = await topVia(p(pads, 'U1', '13'), 520, p(pads, 'U1', '13').y, usb);
  const uDp = await topVia(p(pads, 'U1', '14'), 560, p(pads, 'U1', '14').y, usb);
  const jDp = await createVia('USB_D+', 1350, 3090, usb);
  const jDm = await createVia('USB_D-', p(pads, 'J9', 'B7').x, 3060, usb);
  await route('USB_D+', LAYER.TOP, [p(pads, 'J9', 'B6'), pt(p(pads, 'J9', 'B6').x, 3120), pt(jDp.x, 3120), jDp], usb);
  await route('USB_D+', LAYER.TOP, [p(pads, 'J9', 'B6'), pt(p(pads, 'J9', 'B6').x, 3225), pt(p(pads, 'J9', 'A6').x, 3225), p(pads, 'J9', 'A6')], usb);
  await route('USB_D-', LAYER.TOP, [p(pads, 'J9', 'B7'), jDm], usb);
  await route('USB_D-', LAYER.TOP, [p(pads, 'J9', 'B7'), pt(p(pads, 'J9', 'B7').x, 3060), pt(p(pads, 'J9', 'A7').x, 3060), p(pads, 'J9', 'A7')], usb);
  await route('USB_D+', LAYER.BOTTOM, [uDp, pt(560, 3000), pt(jDp.x, 3000), jDp], usb);
  await route('USB_D-', LAYER.BOTTOM, [uDm, pt(520, 3140), pt(jDm.x, 3140), jDm], usb);
  const cc1FromVia = await createVia('USB_CC1', p(pads, 'J9', 'A5').x + 6, 3120, usb);
  const cc1ToVia = await createVia('USB_CC1', p(pads, 'R9', '1').x, 3100, usb);
  await route('USB_CC1', LAYER.TOP, [p(pads, 'J9', 'A5'), cc1FromVia], usb);
  await route('USB_CC1', LAYER.BOTTOM, [cc1FromVia, pt(cc1FromVia.x, 3100), cc1ToVia], usb);
  await route('USB_CC1', LAYER.TOP, [cc1ToVia, p(pads, 'R9', '1')], usb);
  await route('USB_CC2', LAYER.TOP, [p(pads, 'J9', 'B5'), pt(p(pads, 'J9', 'B5').x, 3270), pt(p(pads, 'R10', '1').x, 3270), p(pads, 'R10', '1')], usb);

  console.log('routing reserved RS485');
  const rs485BFromU2 = await topVia(p(pads, 'U2', '7'), p(pads, 'U2', '7').x, 600, sig);
  const rs485BToR8 = await bottomToTopPad(p(pads, 'R8', '2'), p(pads, 'R8', '2').x, 500, sig);
  await route('RS485_A', LAYER.TOP, [p(pads, 'U2', '6'), pt(p(pads, 'U2', '6').x, 390), pt(p(pads, 'R8', '1').x, 390), p(pads, 'R8', '1'), pt(p(pads, 'J5', '1').x, p(pads, 'R8', '1').y), p(pads, 'J5', '1')], sig);
  await route('RS485_B', LAYER.BOTTOM, [rs485BFromU2, pt(p(pads, 'U2', '7').x, 300), pt(p(pads, 'R8', '2').x, 300), rs485BToR8], sig);
  await route('RS485_B', LAYER.BOTTOM, [pt(p(pads, 'R8', '2').x, 300), pt(p(pads, 'J5', '2').x, 300), p(pads, 'J5', '2')], sig);
  await route('RS485_RE_DE', LAYER.TOP, [p(pads, 'U2', '2'), p(pads, 'U2', '3')], sig);
}

async function main() {
  console.log('opening PCB3');
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);

  console.log('moving USB and terminal blocks to outer edges');
  await moveComponents();

  console.log('assigning official footprint pad nets');
  await assignKnownPadNets();
  let pads = await readPads();
  await assignUsbPowerNets(pads);
  pads = await readPads();

  console.log('deleting previous copper routes and generated notes');
  await deleteRoutePrimitives();

  console.log('drawing clean board outline');
  await drawBoardOutline();

  console.log('routing outer-IO layout');
  await routeBoard(pads);

  console.log('adding silkscreen and antenna keepout note');
  await annotateBoard();

  console.log('saving PCB3');
  await eda('pcb_Document.save', [], 45000);
  const lines = await eda('pcb_PrimitiveLine.getAllPrimitiveId', [], 30000, { maxArrayLength: 1500 });
  const vias = await eda('pcb_PrimitiveVia.getAllPrimitiveId', [], 30000, { maxArrayLength: 800 });
  console.log(JSON.stringify({ lines: lines.length, vias: vias.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
