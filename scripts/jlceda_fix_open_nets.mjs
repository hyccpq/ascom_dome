const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';

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
      maxArrayLength: 300,
      maxObjectKeys: 120,
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
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [comp.primitiveId], 30000, { maxArrayLength: 160 });
    for (const pin of pins) {
      pads[key(comp.designator, pin.padNumber)] = {
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
  return [found.x, found.y];
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

async function main() {
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  const pads = await readPads();

  // K2 has two equivalent low-side coil pins in this relay footprint; tie both to the same driver node.
  await createLine('CLOSE_COIL_LOW', 1, p(pads, 'K2', '4'), p(pads, 'K2', '5'), 24);

  // Join the lower connector/input ground cluster back to the main regulator/ESP32 ground bus.
  await createLine('GND', 2, [1801, 3000], [2100, 3000], 24);
  await createLine('GND', 2, [1801, 3150], [2100, 3000], 24);

  await eda('pcb_Document.save', [], 45000);
  console.log(JSON.stringify({ fixed: ['CLOSE_COIL_LOW', 'GND'] }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
