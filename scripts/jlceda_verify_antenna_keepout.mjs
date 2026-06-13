const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';

const KEEP_OUT = {
  left: 157.48,
  top: 836.61,
  right: 2047.24,
  bottom: 1500.00,
};

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
      // Bridge reconnects after heavy calls.
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
      maxArrayLength: 1500,
      maxObjectKeys: 100,
      maxStringLength: 1000,
      ...jsonSafe,
    },
    timeoutMs,
  }, timeoutMs);
}

function pointInside(x, y, margin = 0) {
  return x > KEEP_OUT.left + margin
    && x < KEEP_OUT.right - margin
    && y > KEEP_OUT.top + margin
    && y < KEEP_OUT.bottom - margin;
}

function segmentTouchesRect(line) {
  const minX = Math.min(line.startX, line.endX);
  const maxX = Math.max(line.startX, line.endX);
  const minY = Math.min(line.startY, line.endY);
  const maxY = Math.max(line.startY, line.endY);
  if (maxX <= KEEP_OUT.left || minX >= KEEP_OUT.right || maxY <= KEEP_OUT.top || minY >= KEEP_OUT.bottom) {
    return false;
  }
  if (pointInside(line.startX, line.startY) || pointInside(line.endX, line.endY)) return true;
  if (Math.abs(line.startX - line.endX) < 0.001) {
    return line.startX > KEEP_OUT.left && line.startX < KEEP_OUT.right;
  }
  if (Math.abs(line.startY - line.endY) < 0.001) {
    return line.startY > KEEP_OUT.top && line.startY < KEEP_OUT.bottom;
  }
  return true;
}

async function main() {
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  const components = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  const lines = await eda('pcb_PrimitiveLine.getAll', [], 45000, { maxArrayLength: 1500, maxObjectKeys: 80 });
  const vias = await eda('pcb_PrimitiveVia.getAll', [], 30000, { maxArrayLength: 600, maxObjectKeys: 80 });

  const componentHits = components
    .filter((component) => pointInside(component.x, component.y))
    .map((component) => component.designator)
    .sort();
  const copperLineHits = lines
    .filter((line) => (line.layer === 1 || line.layer === 2) && segmentTouchesRect(line))
    .map((line) => ({
      id: line.primitiveId,
      net: line.net,
      layer: line.layer,
      start: [line.startX, line.startY],
      end: [line.endX, line.endY],
    }));
  const viaHits = vias
    .filter((via) => pointInside(via.x, via.y))
    .map((via) => ({ id: via.primitiveId, net: via.net, x: via.x, y: via.y }));

  console.log(JSON.stringify({
    keepOut: KEEP_OUT,
    componentHitCount: componentHits.length,
    componentHits,
    copperLineHitCount: copperLineHits.length,
    copperLineHits,
    viaHitCount: viaHits.length,
    viaHits,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
