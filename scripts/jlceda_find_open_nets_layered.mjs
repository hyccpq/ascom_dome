const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';

const TOP = 1;
const BOTTOM = 2;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const snap = (v) => Math.round(v / 0.5) * 0.5;
const nodeKey = (x, y, layer) => `${snap(x)},${snap(y)},L${layer}`;
const EPS = 0.75;

async function waitForBridge() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await fetch('http://127.0.0.1:9151/v1/status', {
        signal: AbortSignal.timeout(2500),
      });
      const json = await res.json();
      if (json.ok && json.bridge?.connected) return;
    } catch {
      // The JLCEDA bridge reconnects itself after some heavier calls.
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

function padNodes(pin) {
  const layers = pin.layer === 12 ? [TOP, BOTTOM] : [pin.layer || TOP];
  return layers.map((layer) => nodeKey(pin.x, pin.y, layer));
}

function pointOnSegment(point, line) {
  const ax = line.startX;
  const ay = line.startY;
  const bx = line.endX;
  const by = line.endY;
  const cross = (point.x - ax) * (by - ay) - (point.y - ay) * (bx - ax);
  if (Math.abs(cross) > EPS * Math.max(1, Math.hypot(bx - ax, by - ay))) return false;
  return point.x >= Math.min(ax, bx) - EPS
    && point.x <= Math.max(ax, bx) + EPS
    && point.y >= Math.min(ay, by) - EPS
    && point.y <= Math.max(ay, by) + EPS;
}

function orient(a, b, c) {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(v) < EPS) return 0;
  return v > 0 ? 1 : -1;
}

function segmentsTouch(aLine, bLine) {
  if (aLine.layer !== bLine.layer) return false;
  const a = { x: aLine.startX, y: aLine.startY };
  const b = { x: aLine.endX, y: aLine.endY };
  const c = { x: bLine.startX, y: bLine.startY };
  const d = { x: bLine.endX, y: bLine.endY };
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return pointOnSegment(c, aLine)
    || pointOnSegment(d, aLine)
    || pointOnSegment(a, bLine)
    || pointOnSegment(b, bLine);
}

async function main() {
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  const components = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  const pads = [];
  for (const component of components) {
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [component.primitiveId], 30000, { maxArrayLength: 180 });
    for (const pin of pins) {
      if (!pin.net) continue;
      pads.push({
        ref: component.designator,
        pad: pin.padNumber,
        net: pin.net,
        x: +pin.x.toFixed(3),
        y: +pin.y.toFixed(3),
        nodes: padNodes(pin),
      });
    }
    await sleep(120);
  }

  const lines = await eda('pcb_PrimitiveLine.getAll', [], 45000, { maxArrayLength: 1400, maxObjectKeys: 80 });
  const vias = await eda('pcb_PrimitiveVia.getAll', [], 30000, { maxArrayLength: 400, maxObjectKeys: 80 });

  const byNet = new Map();
  for (const pad of pads) {
    if (!byNet.has(pad.net)) byNet.set(pad.net, { pads: [], lines: [], vias: [] });
    byNet.get(pad.net).pads.push(pad);
  }
  for (const line of lines) {
    if (!line.net || (line.layer !== TOP && line.layer !== BOTTOM)) continue;
    if (!byNet.has(line.net)) byNet.set(line.net, { pads: [], lines: [], vias: [] });
    byNet.get(line.net).lines.push(line);
  }
  for (const via of vias) {
    if (!via.net) continue;
    if (!byNet.has(via.net)) byNet.set(via.net, { pads: [], lines: [], vias: [] });
    byNet.get(via.net).vias.push(via);
  }

  const report = [];
  for (const [net, item] of [...byNet.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (item.pads.length <= 1) continue;
    const dsu = new DSU();
    for (const pad of item.pads) {
      const nodes = pad.nodes;
      nodes.forEach((node) => dsu.find(node));
      for (let i = 1; i < nodes.length; i++) dsu.union(nodes[0], nodes[i]);
    }
    for (const line of item.lines) {
      dsu.union(
        nodeKey(line.startX, line.startY, line.layer),
        nodeKey(line.endX, line.endY, line.layer),
      );
    }
    for (const via of item.vias) {
      dsu.union(nodeKey(via.x, via.y, TOP), nodeKey(via.x, via.y, BOTTOM));
    }
    for (const pad of item.pads) {
      for (const line of item.lines) {
        if (pad.nodes.includes(nodeKey(pad.x, pad.y, line.layer)) && pointOnSegment({ x: pad.x, y: pad.y }, line)) {
          dsu.union(nodeKey(pad.x, pad.y, line.layer), nodeKey(line.startX, line.startY, line.layer));
        }
      }
    }
    for (const via of item.vias) {
      for (const line of item.lines) {
        if (pointOnSegment({ x: via.x, y: via.y }, line)) {
          dsu.union(nodeKey(via.x, via.y, line.layer), nodeKey(line.startX, line.startY, line.layer));
        }
      }
    }
    for (let i = 0; i < item.lines.length; i++) {
      for (let j = i + 1; j < item.lines.length; j++) {
        if (segmentsTouch(item.lines[i], item.lines[j])) {
          dsu.union(
            nodeKey(item.lines[i].startX, item.lines[i].startY, item.lines[i].layer),
            nodeKey(item.lines[j].startX, item.lines[j].startY, item.lines[j].layer),
          );
        }
      }
    }

    const groups = new Map();
    for (const pad of item.pads) {
      const roots = [...new Set(pad.nodes.map((node) => dsu.find(node)))];
      const root = roots[0];
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(`${pad.ref}.${pad.pad}`);
    }
    const groupsWithPads = [...groups.values()].filter((members) => members.length);
    if (groupsWithPads.length > 1) {
      report.push({
        net,
        padCount: item.pads.length,
        lineCount: item.lines.length,
        viaCount: item.vias.length,
        groups: groupsWithPads.sort((a, b) => b.length - a.length),
      });
    }
  }

  console.log(JSON.stringify({ openNetCount: report.length, openNets: report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
