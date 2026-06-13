const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpcTool(name, args, timeoutMs = 25000, retries = 4) {
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
      await sleep(1500 * attempt);
    }
  }
  throw lastError;
}

async function eda(path, args = [], timeoutMs = 25000, jsonSafe = {}) {
  return rpcTool('jlc.eda.invoke', {
    path,
    args,
    jsonSafe: {
      maxDepth: 4,
      maxArrayLength: 120,
      maxObjectKeys: 40,
      maxStringLength: 600,
      ...jsonSafe,
    },
    timeoutMs,
  }, timeoutMs);
}

const expectedRefs = [
  'U1', 'U2', 'U3',
  'K1', 'K2', 'K3',
  'Q1', 'Q2', 'Q3',
  'D1', 'D2', 'D3',
  'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R8', 'R9', 'R10',
  'J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8', 'J9',
];

async function main() {
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  const components = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  const refs = components.map((component) => component.designator).sort((a, b) => a.localeCompare(b));
  const missingRefs = expectedRefs.filter((ref) => !refs.includes(ref));
  const extraRefs = refs.filter((ref) => !expectedRefs.includes(ref));
  const byRef = Object.fromEntries(components.map((component) => [component.designator, component]));
  const keepout = { xMin: 157.48, xMax: 2047.24, yMin: 836.614, yMax: 1500.0 };
  const supportRefsToKeepOut = ['Q1', 'Q2', 'R1', 'R2', 'R4', 'R5', 'R6'];
  const supportPartsInAntennaWarningArea = supportRefsToKeepOut.filter((ref) => {
    const component = byRef[ref];
    return component
      && component.x >= keepout.xMin
      && component.x <= keepout.xMax
      && component.y >= keepout.yMin
      && component.y <= keepout.yMax;
  });

  await sleep(1000);
  const lineIds = await eda('pcb_PrimitiveLine.getAllPrimitiveId', [], 25000, { maxArrayLength: 300 });
  await sleep(1000);
  const padIds = await eda('pcb_PrimitivePad.getAllPrimitiveId', [], 25000, { maxArrayLength: 80 });
  await sleep(1000);
  const stringIds = await eda('pcb_PrimitiveString.getAllPrimitiveId', [], 25000, { maxArrayLength: 80 });

  console.log(JSON.stringify({
    document: 'PCB3',
    componentCount: components.length,
    refs,
    missingRefs,
    extraRefs,
    lineCount: Array.isArray(lineIds) ? lineIds.length : null,
    mountingHolePadCount: Array.isArray(padIds) ? padIds.length : null,
    silkscreenStringCount: Array.isArray(stringIds) ? stringIds.length : null,
    supportPartsInAntennaWarningArea,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
