const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpcTool(name, args, timeoutMs = 45000, retries = 5) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: 'tools.call', params: { name, arguments: args } }),
        signal: AbortSignal.timeout(timeoutMs + 5000),
      });
      const json = await res.json();
      if (!json.ok || !json.result?.ok) throw new Error(JSON.stringify(json).slice(0, 1200));
      return json.result.data?.result ?? json.result.data ?? json.result;
    } catch (error) {
      lastError = error;
      await waitForBridge();
      await sleep(1200 * attempt);
    }
  }
  throw lastError;
}

async function waitForBridge() {
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const res = await fetch('http://127.0.0.1:9151/v1/status', {
        signal: AbortSignal.timeout(2500),
      });
      const json = await res.json();
      if (json.ok && json.bridge?.connected) return;
    } catch {
      // The JLCEDA bridge often reconnects automatically after heavy calls.
    }
    await sleep(1000);
  }
}

async function eda(path, args = [], timeoutMs = 45000, jsonSafe = {}) {
  return rpcTool('jlc.eda.invoke', {
    path,
    args,
    jsonSafe: {
      maxDepth: 5,
      maxArrayLength: 900,
      maxObjectKeys: 120,
      maxStringLength: 1200,
      ...jsonSafe,
    },
    timeoutMs,
  }, timeoutMs);
}

function wireSegments(line) {
  const segments = [];
  if (!Array.isArray(line)) return segments;

  const pushSegments = (coords) => {
    for (let index = 0; index + 3 < coords.length; index += 4) {
      segments.push([
        { x: coords[index], y: coords[index + 1] },
        { x: coords[index + 2], y: coords[index + 3] },
      ]);
    }
  };

  if (Array.isArray(line[0])) {
    for (const segmentLine of line) pushSegments(segmentLine);
  } else {
    pushSegments(line);
  }

  return segments;
}

function pointOnSegment(point, a, b, tolerance = 0.01) {
  const cross = Math.abs((point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x));
  if (cross > tolerance) return false;
  return point.x >= Math.min(a.x, b.x) - tolerance
    && point.x <= Math.max(a.x, b.x) + tolerance
    && point.y >= Math.min(a.y, b.y) - tolerance
    && point.y <= Math.max(a.y, b.y) + tolerance;
}

function wireTouchesPoint(wire, point) {
  return wireSegments(wire.line).some(([a, b]) => pointOnSegment(point, a, b));
}

function netName(net) {
  return String(net || '').trim();
}

async function readSchematicPinsByNet() {
  await eda('dmt_EditorControl.openDocument', ['227f009d50838569'], 30000);
  const components = await rpcTool('jlc.schematic.list_components', { limit: 100 }, 45000);
  const parts = components.items.filter((item) => item.componentType === 'part' && item.designator);
  const wires = await rpcTool('jlc.schematic.list_wires', {}, 45000);
  const pinsByNet = new Map();

  for (const component of parts) {
    const pins = await rpcTool('jlc.schematic.get_component_pins', {
      primitiveId: component.primitiveId,
    }, 45000);

    for (const pin of pins.pins) {
      const nets = [
        ...new Set(
          wires.items
            .filter((wire) => netName(wire.net) && wireTouchesPoint(wire, { x: pin.x, y: pin.y }))
            .map((wire) => netName(wire.net)),
        ),
      ];
      if (!nets.length) continue;
      pinsByNet.set(`${component.designator}.${pin.pinNumber}`, nets.length === 1 ? nets[0] : nets.join('|'));
    }
    await sleep(30);
  }

  return {
    componentCount: parts.length,
    pinsByNet,
  };
}

async function readPcbPadsByNet() {
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  const components = await eda('pcb_PrimitiveComponent.getAll', [], 45000, { maxArrayLength: 100 });
  const padsByNet = new Map();

  for (const component of components) {
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [component.primitiveId], 45000, {
      maxArrayLength: 220,
    });
    for (const pin of pins) {
      const net = netName(pin.net);
      if (net) padsByNet.set(`${component.designator}.${pin.padNumber}`, net);
    }
    await sleep(30);
  }

  return {
    componentCount: components.length,
    padsByNet,
  };
}

async function main() {
  const schematic = await readSchematicPinsByNet();
  const pcb = await readPcbPadsByNet();
  const mismatch = [];
  const schematicOnly = [];
  const pcbOnly = [];

  for (const [key, schematicNet] of schematic.pinsByNet) {
    const pcbNet = pcb.padsByNet.get(key);
    if (!pcbNet) schematicOnly.push({ key, schematicNet });
    else if (pcbNet !== schematicNet) mismatch.push({ key, schematicNet, pcbNet });
  }

  for (const [key, pcbNet] of pcb.padsByNet) {
    if (!schematic.pinsByNet.has(key)) pcbOnly.push({ key, pcbNet });
  }

  console.log(JSON.stringify({
    schematic: {
      document: 'P2.Schematic3',
      componentCount: schematic.componentCount,
      pinsWithNet: schematic.pinsByNet.size,
    },
    pcb: {
      document: 'PCB3',
      componentCount: pcb.componentCount,
      padsWithNet: pcb.padsByNet.size,
    },
    mismatchCount: mismatch.length,
    schematicOnlyCount: schematicOnly.length,
    pcbOnlyCount: pcbOnly.length,
    mismatch,
    schematicOnly,
    pcbOnly,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
