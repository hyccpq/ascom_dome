const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';
const TOP = 1;
const BOTTOM = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBridge() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await fetch('http://127.0.0.1:9151/v1/status', {
        signal: AbortSignal.timeout(2500),
      });
      const json = await res.json();
      if (json.ok && json.bridge?.connected) return;
    } catch {
      // Bridge reconnects after some heavy EDA calls.
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
      maxDepth: 5,
      maxArrayLength: 600,
      maxObjectKeys: 100,
      maxStringLength: 1000,
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
  for (const comp of comps) {
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [comp.primitiveId], 30000, { maxArrayLength: 180 });
    for (const pin of pins) {
      pads[key(comp.designator, pin.padNumber)] = {
        ref: comp.designator,
        pad: pin.padNumber,
        x: +pin.x.toFixed(3),
        y: +pin.y.toFixed(3),
        net: pin.net || '',
      };
    }
    await sleep(120);
  }
  return pads;
}

function p(pads, ref, pad) {
  const found = pads[key(ref, pad)];
  if (!found) throw new Error(`missing pad ${ref}.${pad}`);
  return found;
}

async function createLine(net, layer, a, b, width) {
  if (a.x === b.x && a.y === b.y) return;
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

async function createVia(net, x, y, width) {
  const hole = width >= 18 ? 16 : 12;
  const diameter = width >= 18 ? 32 : 24;
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
}

async function stitchPad(pad, dx, dy, width) {
  if (!pad.net) throw new Error(`pad ${pad.ref}.${pad.pad} has no net`);
  const via = { x: pad.x + dx, y: pad.y + dy };
  await createVia(pad.net, via.x, via.y, width);
  await createLine(pad.net, TOP, pad, via, width);
  await createLine(pad.net, BOTTOM, via, pad, width);
  return `${pad.ref}.${pad.pad}`;
}

async function main() {
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  const pads = await readPads();
  const sig = 10;
  const pwr = 20;
  const stitched = [];

  const signalPads = [
    ['U1', '4', -80, 0], ['R1', '1', -55, 0],
    ['U1', '5', -80, 0], ['R2', '1', -55, 0],
    ['U1', '6', -80, 0], ['R3', '1', -55, 0],
    ['U1', '7', -80, 0], ['R4', '1', -55, 0],
    ['U1', '12', -80, 0], ['R5', '1', -55, 0],
    ['U1', '17', 80, 0], ['R6', '1', -55, 0],
    ['U1', '19', 80, 0], ['J9', 'A7', 0, -55], ['J9', 'B7', 0, 55],
    ['U1', '20', 80, 0], ['J9', 'A6', 0, -55], ['J9', 'B6', 0, 55],
  ];
  for (const [ref, pad, dx, dy] of signalPads) {
    stitched.push(await stitchPad(p(pads, ref, pad), dx, dy, sig));
    await sleep(80);
  }

  const groundPads = [
    ['U1', '1', -80, 0],
    ['U1', '40', 80, 0],
    ['U2', '5', 0, 60],
    ['U3', '1', 0, -60],
    ['Q1', '2', 0, 60],
    ['Q2', '2', 0, 60],
    ['Q3', '2', 0, 60],
    ['R9', '2', 0, 55],
    ['R10', '2', 0, 55],
  ];
  for (const [ref, pad, dx, dy] of groundPads) {
    stitched.push(await stitchPad(p(pads, ref, pad), dx, dy, pwr));
    await sleep(80);
  }

  await eda('pcb_Document.save', [], 45000);
  console.log(JSON.stringify({ stitchedCount: stitched.length, stitched }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
