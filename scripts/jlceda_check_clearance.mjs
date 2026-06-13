const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';

const TOP = 1;
const BOTTOM = 2;
const BOTH = 12;

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
      // JLCEDA reconnects after some heavy calls.
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
      maxArrayLength: 2000,
      maxObjectKeys: 160,
      maxStringLength: 1200,
      ...jsonSafe,
    },
    timeoutMs,
  }, timeoutMs);
}

function padLayers(pin) {
  if (pin.layer === BOTH) return [TOP, BOTTOM];
  return [pin.layer || TOP];
}

function polygonBounds(points) {
  const nums = points.filter((item) => typeof item === 'number');
  const xs = [];
  const ys = [];
  for (let i = 0; i < nums.length - 1; i += 2) {
    xs.push(nums[i]);
    ys.push(nums[i + 1]);
  }
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
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

function padBounds(pin) {
  const pad = pin.pad || [];
  if (pad[0] === 'POLYGON' && Array.isArray(pad[1])) return polygonBounds(pad[1]);
  const width = Number(pad[1] || 0);
  const height = Number(pad[2] || pad[1] || 0);
  const { hx, hy } = rotateHalfExtents(width, height, pin.rotation);
  return {
    left: pin.x - hx,
    right: pin.x + hx,
    top: pin.y - hy,
    bottom: pin.y + hy,
  };
}

function expandRect(rect, amount) {
  return {
    left: rect.left - amount,
    right: rect.right + amount,
    top: rect.top - amount,
    bottom: rect.bottom + amount,
  };
}

function pointInsideRect(point, rect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function segmentsIntersect(a, b, c, d) {
  const orient = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const onSeg = (p, q, r) => Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x)
    && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  return o4 === 0 && onSeg(c, b, d);
}

function lineTouchesRect(line, rect) {
  const a = { x: line.startX, y: line.startY };
  const b = { x: line.endX, y: line.endY };
  if (pointInsideRect(a, rect) || pointInsideRect(b, rect)) return true;
  if (Math.max(a.x, b.x) < rect.left || Math.min(a.x, b.x) > rect.right
    || Math.max(a.y, b.y) < rect.top || Math.min(a.y, b.y) > rect.bottom) {
    return false;
  }
  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
  for (let i = 0; i < corners.length; i++) {
    if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % corners.length])) return true;
  }
  return false;
}

function lineLineHit(aLine, bLine, clearance = 8) {
  if (aLine.primitiveId === bLine.primitiveId) return false;
  if (aLine.layer !== bLine.layer) return false;
  if (aLine.layer !== TOP && aLine.layer !== BOTTOM) return false;
  if (aLine.net && bLine.net && aLine.net === bLine.net) return false;

  const a = { x: aLine.startX, y: aLine.startY };
  const b = { x: aLine.endX, y: aLine.endY };
  const c = { x: bLine.startX, y: bLine.startY };
  const d = { x: bLine.endX, y: bLine.endY };
  if (segmentsIntersect(a, b, c, d)) return true;

  // Fast rectangle fallback for orthogonal traces with finite width.
  const aRect = expandRect({
    left: Math.min(a.x, b.x),
    right: Math.max(a.x, b.x),
    top: Math.min(a.y, b.y),
    bottom: Math.max(a.y, b.y),
  }, (aLine.width || 0) / 2 + clearance);
  const bRect = expandRect({
    left: Math.min(c.x, d.x),
    right: Math.max(c.x, d.x),
    top: Math.min(c.y, d.y),
    bottom: Math.max(c.y, d.y),
  }, (bLine.width || 0) / 2);
  return !(aRect.right < bRect.left
    || aRect.left > bRect.right
    || aRect.bottom < bRect.top
    || aRect.top > bRect.bottom);
}

function linePadHit(line, pad, clearance = 8) {
  if (line.layer !== TOP && line.layer !== BOTTOM) return false;
  if (!pad.layers.includes(line.layer)) return false;
  if (line.net && pad.net && line.net === pad.net) return false;
  const inflated = expandRect(pad.bounds, (line.width || 0) / 2 + clearance);
  return lineTouchesRect(line, inflated);
}

function viaPadHit(via, pad, clearance = 8) {
  if (!via.net || (pad.net && via.net === pad.net)) return false;
  const inflated = expandRect(pad.bounds, (via.diameter || via.width || 26) / 2 + clearance);
  return pointInsideRect({ x: via.x, y: via.y }, inflated);
}

function lineViaHit(line, via, clearance = 8) {
  if (line.layer !== TOP && line.layer !== BOTTOM) return false;
  if (line.net && via.net && line.net === via.net) return false;
  const rect = expandRect({
    left: via.x,
    right: via.x,
    top: via.y,
    bottom: via.y,
  }, (line.width || 0) / 2 + (via.diameter || via.width || 26) / 2 + clearance);
  return lineTouchesRect(line, rect);
}

async function readPads() {
  const comps = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  const pads = [];
  for (const comp of comps) {
    const pins = await eda('pcb_PrimitiveComponent.getAllPinsByPrimitiveId', [comp.primitiveId], 30000, { maxArrayLength: 200 });
    for (const pin of pins) {
      pads.push({
        ref: comp.designator,
        pad: pin.padNumber,
        net: pin.net || '',
        x: pin.x,
        y: pin.y,
        layers: padLayers(pin),
        bounds: padBounds(pin),
      });
    }
    await sleep(60);
  }
  return pads;
}

async function main() {
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  const pads = await readPads();
  const lines = await eda('pcb_PrimitiveLine.getAll', [], 45000, { maxArrayLength: 2000, maxObjectKeys: 80 });
  const vias = await eda('pcb_PrimitiveVia.getAll', [], 30000, { maxArrayLength: 800, maxObjectKeys: 80 });

  const lineHits = [];
  for (const line of lines.filter((item) => item.layer === TOP || item.layer === BOTTOM)) {
    for (const pad of pads) {
      if (linePadHit(line, pad)) {
        lineHits.push({
          line: line.primitiveId,
          layer: line.layer,
          net: line.net || '',
          width: line.width,
          start: [line.startX, line.startY],
          end: [line.endX, line.endY],
          pad: `${pad.ref}.${pad.pad}`,
          padNet: pad.net,
        });
      }
    }
  }

  const lineLineHits = [];
  const copperLines = lines.filter((item) => item.layer === TOP || item.layer === BOTTOM);
  for (let i = 0; i < copperLines.length; i++) {
    for (let j = i + 1; j < copperLines.length; j++) {
      if (lineLineHit(copperLines[i], copperLines[j])) {
        lineLineHits.push({
          a: copperLines[i].primitiveId,
          b: copperLines[j].primitiveId,
          layer: copperLines[i].layer,
          aNet: copperLines[i].net || '',
          bNet: copperLines[j].net || '',
          aStart: [copperLines[i].startX, copperLines[i].startY],
          aEnd: [copperLines[i].endX, copperLines[i].endY],
          bStart: [copperLines[j].startX, copperLines[j].startY],
          bEnd: [copperLines[j].endX, copperLines[j].endY],
        });
      }
    }
  }

  const lineViaHits = [];
  for (const line of copperLines) {
    for (const via of vias) {
      if (lineViaHit(line, via)) {
        lineViaHits.push({
          line: line.primitiveId,
          lineNet: line.net || '',
          via: via.primitiveId,
          viaNet: via.net || '',
          layer: line.layer,
          lineStart: [line.startX, line.startY],
          lineEnd: [line.endX, line.endY],
          viaAt: [via.x, via.y],
        });
      }
    }
  }

  const viaHits = [];
  for (const via of vias) {
    for (const pad of pads) {
      if (viaPadHit(via, pad)) {
        viaHits.push({
        via: via.primitiveId,
        net: via.net,
        x: via.x,
        y: via.y,
          pad: `${pad.ref}.${pad.pad}`,
        padNet: pad.net,
      });
      }
    }
  }

  console.log(JSON.stringify({
    lineHitCount: lineHits.length,
    lineHits: lineHits.slice(0, 120),
    lineLineHitCount: lineLineHits.length,
    lineLineHits: lineLineHits.slice(0, 160),
    lineViaHitCount: lineViaHits.length,
    lineViaHits: lineViaHits.slice(0, 120),
    viaHitCount: viaHits.length,
    viaHits: viaHits.slice(0, 80),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
