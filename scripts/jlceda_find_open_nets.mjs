const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const snap = (v) => Math.round(v / 0.5) * 0.5;
const key = (x, y) => `${snap(x)},${snap(y)}`;

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
      maxArrayLength: 1200,
      maxObjectKeys: 120,
      maxStringLength: 1200,
      ...jsonSafe,
    },
    timeoutMs,
  }, timeoutMs);
}

class DSU {
  constructor() {
    this.parent = new Map();
  }

  find(x) {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x);
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

async function main() {
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  const components = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  const pads = [];
  for (const component of components) {
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [component.primitiveId], 30000, { maxArrayLength: 160 });
    for (const pin of pins) {
      if (!pin.net) continue;
      pads.push({
        ref: component.designator,
        pad: pin.padNumber,
        net: pin.net,
        x: +pin.x.toFixed(3),
        y: +pin.y.toFixed(3),
      });
    }
    await sleep(120);
  }

  const lines = await eda('pcb_PrimitiveLine.getAll', [], 45000, { maxArrayLength: 1200, maxObjectKeys: 80 });
  const byNet = new Map();
  for (const pad of pads) {
    if (!byNet.has(pad.net)) byNet.set(pad.net, { pads: [], lines: [] });
    byNet.get(pad.net).pads.push(pad);
  }
  for (const line of lines) {
    if (!line.net) continue;
    if (!byNet.has(line.net)) byNet.set(line.net, { pads: [], lines: [] });
    byNet.get(line.net).lines.push(line);
  }

  const report = [];
  for (const [net, item] of [...byNet.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (item.pads.length <= 1) continue;
    const dsu = new DSU();
    const lineEndpoints = new Set();
    for (const line of item.lines) {
      const a = key(line.startX, line.startY);
      const b = key(line.endX, line.endY);
      dsu.union(a, b);
      lineEndpoints.add(a);
      lineEndpoints.add(b);
    }
    for (const pad of item.pads) {
      dsu.find(key(pad.x, pad.y));
    }
    const groups = new Map();
    for (const pad of item.pads) {
      const root = dsu.find(key(pad.x, pad.y));
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(`${pad.ref}.${pad.pad}`);
    }
    const componentsWithPads = [...groups.values()].filter((members) => members.length);
    if (componentsWithPads.length > 1) {
      report.push({
        net,
        padCount: item.pads.length,
        lineCount: item.lines.length,
        groups: componentsWithPads.sort((a, b) => b.length - a.length),
      });
    }
  }

  console.log(JSON.stringify({ openNetCount: report.length, openNets: report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
