#!/usr/bin/env node
import { spawn } from 'node:child_process';

const STATUS_URL = 'http://127.0.0.1:9151/v1/status';
const RPC_URL = 'http://127.0.0.1:9151/v1/rpc';
const P2_UUID = '227f009d50838569';
const PCB3_UUID = '5664b0722a0b08df';

const nodeSteps = [
  ['local static candidate check', 'scripts/verify_local_board_candidate.mjs'],
  ['apply outer-IO layout/routing to PCB3', 'scripts/jlceda_layout_outer_io_route.mjs'],
  ['PCB3 component/readback check', 'scripts/jlceda_verify_pcb3.mjs'],
  ['PCB3 open-net check', 'scripts/jlceda_find_open_nets_layered.mjs'],
  ['PCB3 clearance scan', 'scripts/jlceda_check_clearance.mjs'],
  ['PCB3 antenna keepout check', 'scripts/jlceda_verify_antenna_keepout.mjs'],
  ['PCB3 mounting clearance check', 'scripts/jlceda_verify_mounting_clearance.mjs'],
  ['PCB3 LCSC supplier binding check', 'scripts/jlceda_verify_lcsc_parts.mjs'],
  ['P2 schematic vs PCB3 net alignment check', 'scripts/jlceda_verify_schematic_pcb_net_alignment.mjs'],
];

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs ?? 10000),
  });
  return response.json();
}

async function assertBridgeConnected() {
  let status;
  try {
    status = await fetchJson(STATUS_URL, { timeoutMs: 5000 });
  } catch (error) {
    throw new Error(
      `JLCEDA bridge HTTP server is not reachable at ${STATUS_URL}. `
      + 'Start the bridge first: node /Users/kalec/.codex/mcp/jlc-eda-mcp/packages/mcp-server/dist/cli.js --port 9050 --http --http-port 9151 --no-mcp',
    );
  }
  if (!status.ok || !status.bridge?.connected) {
    throw new Error(`JLCEDA bridge is not connected: ${JSON.stringify(status)}`);
  }
  console.log(`[ok] bridge connected on port ${status.bridge.listenPort}`);
}

function runNodeStep(label, script) {
  return new Promise((resolve, reject) => {
    console.log(`\n== ${label} ==`);
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${code}`));
    });
  });
}

async function rpcTool(name, args, timeoutMs = 120000) {
  const json = await fetchJson(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      method: 'tools.call',
      params: { name, arguments: args },
    }),
    timeoutMs: timeoutMs + 5000,
  });
  if (!json.ok || !json.result?.ok) throw new Error(JSON.stringify(json).slice(0, 1600));
  return json.result.data?.result ?? json.result.data ?? json.result;
}

async function eda(path, args = [], timeoutMs = 120000, jsonSafe = {}) {
  return rpcTool('jlc.eda.invoke', {
    path,
    args,
    timeoutMs,
    jsonSafe: {
      maxDepth: 6,
      maxArrayLength: 1200,
      maxObjectKeys: 180,
      maxStringLength: 2000,
      ...jsonSafe,
    },
  }, timeoutMs);
}

function collectDrcItemHints(value, path = []) {
  if (value == null || value === false) return [];

  const key = String(path.at(-1) ?? '');
  const pathText = path.join('.');
  const hints = [];

  if (typeof value === 'number') {
    if (value > 0 && /(count|error|warning|violation|item|netlist|open|short|clearance)/i.test(key)) {
      hints.push(`${pathText}=${value}`);
    }
    return hints;
  }

  if (typeof value === 'string') {
    if (/(Netlist Error|致命错误|警告|未连接|短路|冲突|clearance|violation)/i.test(value)) {
      hints.push(`${pathText}: ${value.slice(0, 160)}`);
    }
    return hints;
  }

  if (Array.isArray(value)) {
    if (
      value.length > 0
      && /(error|warning|violation|item|items|list|result|results|netlist|drc)/i.test(key)
    ) {
      hints.push(`${pathText} has ${value.length} item(s)`);
    }
    return [
      ...hints,
      ...value.flatMap((item, index) => collectDrcItemHints(item, [...path, String(index)])),
    ];
  }

  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([childKey, childValue]) => (
      collectDrcItemHints(childValue, [...path, childKey])
    ));
  }

  return [];
}

async function runImportAndDrcGate() {
  console.log('\n== JLCEDA import + UI DRC gate ==');
  await eda('dmt_EditorControl.openDocument', [PCB3_UUID], 30000);
  const importResult = await eda('pcb_Document.importChanges', [P2_UUID], 120000, { maxDepth: 4 });
  console.log(JSON.stringify({ importChangesFromP2: importResult }, null, 2));

  const drcResult = await eda('pcb_Drc.check', [true, false, true], 180000, {
    maxDepth: 8,
    maxArrayLength: 2000,
    maxObjectKeys: 240,
    maxStringLength: 3000,
  });
  console.log(JSON.stringify({ pcbDrcCheck: drcResult }, null, 2));

  const drcItemHints = collectDrcItemHints(drcResult);
  if (drcItemHints.length > 0) {
    throw new Error(`JLCEDA PCB DRC returned item-like content: ${drcItemHints.slice(0, 8).join('; ')}`);
  }
}

async function main() {
  await assertBridgeConnected();
  for (const [label, script] of nodeSteps) await runNodeStep(label, script);
  await runImportAndDrcGate();
  console.log('\nProduction gate passed for live JLCEDA PCB3. Export Gerber/drill/BOM/CPL from PCB3.');
}

main().catch((error) => {
  console.error(`\n[failed] ${error.message}`);
  process.exit(1);
});
