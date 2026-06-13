const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';

const COMPONENT_CLEARANCE_RADIUS = 180;
const COPPER_CLEARANCE_RADIUS = 125;
const TOP = 1;
const BOTTOM = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      maxArrayLength: 2000,
      maxObjectKeys: 160,
      maxStringLength: 1200,
      ...jsonSafe,
    },
    timeoutMs,
  }, timeoutMs);
}

function bodySizeFrom3dTransform(component) {
  const transform = component.otherProperty?.['3D Model Transform'];
  if (!transform) return null;
  const values = transform.split(',').map((item) => Number(item.trim()));
  if (values.length < 2 || !Number.isFinite(values[0]) || !Number.isFinite(values[1])) return null;
  if (values[0] <= 0 || values[1] <= 0) return null;
  return { width: values[0], height: values[1] };
}

function rotateHalfExtents(width, height, rotation) {
  const angle = Math.abs(rotation || 0) > Math.PI * 2 ? (rotation * Math.PI) / 180 : (rotation || 0);
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  return {
    hx: (width * c + height * s) / 2,
    hy: (width * s + height * c) / 2,
  };
}

function rectDistance(point, rect) {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

function componentBodyRect(component, pins) {
  const body = bodySizeFrom3dTransform(component);
  if (body) {
    const { hx, hy } = rotateHalfExtents(body.width, body.height, component.rotation);
    return {
      left: component.x - hx,
      right: component.x + hx,
      top: component.y - hy,
      bottom: component.y + hy,
      source: '3d-model-transform',
    };
  }

  const xs = pins.map((pin) => pin.x);
  const ys = pins.map((pin) => pin.y);
  return {
    left: Math.min(...xs) - 60,
    right: Math.max(...xs) + 60,
    top: Math.min(...ys) - 60,
    bottom: Math.max(...ys) + 60,
    source: 'pad-bounds',
  };
}

function distancePointToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function mountingHolePads(pads) {
  return pads
    .filter((pad) => /^MH[1-4]$/.test(pad.padNumber || ''))
    .map((pad) => ({
      ref: pad.padNumber,
      x: pad.x,
      y: pad.y,
      hole: pad.hole,
      primitiveId: pad.primitiveId,
    }))
    .sort((a, b) => a.ref.localeCompare(b.ref));
}

async function main() {
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  const pads = await eda('pcb_PrimitivePad.getAll', [], 30000, { maxArrayLength: 400, maxObjectKeys: 140 });
  const holes = mountingHolePads(pads);
  const components = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  const lines = await eda('pcb_PrimitiveLine.getAll', [], 45000, { maxArrayLength: 2000, maxObjectKeys: 120 });
  const vias = await eda('pcb_PrimitiveVia.getAll', [], 30000, { maxArrayLength: 800, maxObjectKeys: 80 });

  const componentHits = [];
  for (const component of components) {
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [component.primitiveId], 30000, { maxArrayLength: 200 });
    const rect = componentBodyRect(component, pins);
    for (const hole of holes) {
      const distance = rectDistance(hole, rect);
      if (distance < COMPONENT_CLEARANCE_RADIUS) {
        componentHits.push({
          hole: hole.ref,
          component: component.designator,
          distance: +distance.toFixed(1),
          required: COMPONENT_CLEARANCE_RADIUS,
          bodySource: rect.source,
          body: {
            left: +rect.left.toFixed(1),
            right: +rect.right.toFixed(1),
            top: +rect.top.toFixed(1),
            bottom: +rect.bottom.toFixed(1),
          },
        });
      }
    }
    await sleep(40);
  }

  const lineHits = [];
  for (const line of lines) {
    if (line.layer !== TOP && line.layer !== BOTTOM) continue;
    for (const hole of holes) {
      const distance = distancePointToSegment(
        hole,
        { x: line.startX, y: line.startY },
        { x: line.endX, y: line.endY },
      ) - (line.width || 0) / 2;
      if (distance < COPPER_CLEARANCE_RADIUS) {
        lineHits.push({
          hole: hole.ref,
          line: line.primitiveId,
          net: line.net || '',
          layer: line.layer,
          distance: +distance.toFixed(1),
          required: COPPER_CLEARANCE_RADIUS,
        });
      }
    }
  }

  const viaHits = [];
  for (const via of vias) {
    for (const hole of holes) {
      const distance = Math.hypot(via.x - hole.x, via.y - hole.y) - (via.diameter || via.width || 0) / 2;
      if (distance < COPPER_CLEARANCE_RADIUS) {
        viaHits.push({
          hole: hole.ref,
          via: via.primitiveId,
          net: via.net || '',
          distance: +distance.toFixed(1),
          required: COPPER_CLEARANCE_RADIUS,
        });
      }
    }
  }

  console.log(JSON.stringify({
    document: 'PCB3',
    mountingHoles: holes,
    componentClearanceRadiusMil: COMPONENT_CLEARANCE_RADIUS,
    copperClearanceRadiusMil: COPPER_CLEARANCE_RADIUS,
    componentHitCount: componentHits.length,
    componentHits,
    lineHitCount: lineHits.length,
    lineHits,
    viaHitCount: viaHits.length,
    viaHits,
  }, null, 2));

  if (componentHits.length || lineHits.length || viaHits.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
