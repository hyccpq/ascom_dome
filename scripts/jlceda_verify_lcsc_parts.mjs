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
      await sleep(1200 * attempt);
    }
  }
  throw lastError;
}

async function eda(path, args = [], timeoutMs = 25000, jsonSafe = {}) {
  return rpcTool('jlc.eda.invoke', {
    path,
    args,
    jsonSafe: {
      maxDepth: 5,
      maxArrayLength: 120,
      maxObjectKeys: 80,
      maxStringLength: 700,
      ...jsonSafe,
    },
    timeoutMs,
  }, timeoutMs);
}

const expectedParts = {
  U1: { supplierId: 'C2913201', addIntoBom: true, footprint: 'WIRELM-SMD_ESP32-S3-WROOM-1' },
  U2: { supplierId: 'C8963', addIntoBom: false, footprint: 'SOIC-8_L5.0-W4.0-P1.27-LS6.0-BL' },
  U3: { supplierId: 'C6186', addIntoBom: true, footprint: 'SOT-223-3_L6.5-W3.4-P2.30-LS7.0-BR' },

  K1: { supplierId: 'C35449', addIntoBom: true, footprint: 'RELAY-TH_SRD-XXVDC-XL-C' },
  K2: { supplierId: 'C35449', addIntoBom: true, footprint: 'RELAY-TH_SRD-XXVDC-XL-C' },
  K3: { supplierId: 'C35449', addIntoBom: true, footprint: 'RELAY-TH_SRD-XXVDC-XL-C' },

  Q1: { supplierId: 'C20917', addIntoBom: true, footprint: 'SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR' },
  Q2: { supplierId: 'C20917', addIntoBom: true, footprint: 'SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR' },
  Q3: { supplierId: 'C20917', addIntoBom: true, footprint: 'SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR' },

  D1: { supplierId: 'C81598', addIntoBom: true, footprint: 'SOD-123F_L2.7-W1.6-LS3.8-RD' },
  D2: { supplierId: 'C81598', addIntoBom: true, footprint: 'SOD-123F_L2.7-W1.6-LS3.8-RD' },
  D3: { supplierId: 'C81598', addIntoBom: true, footprint: 'SOD-123F_L2.7-W1.6-LS3.8-RD' },

  R1: { supplierId: 'C22775', addIntoBom: true, footprint: 'R0603' },
  R2: { supplierId: 'C22775', addIntoBom: true, footprint: 'R0603' },
  R3: { supplierId: 'C22775', addIntoBom: true, footprint: 'R0603' },
  R4: { supplierId: 'C25804', addIntoBom: true, footprint: 'R0603' },
  R5: { supplierId: 'C25804', addIntoBom: true, footprint: 'R0603' },
  R6: { supplierId: 'C25804', addIntoBom: true, footprint: 'R0603' },
  R8: { supplierId: 'C22787', addIntoBom: false, footprint: 'R0603' },
  R9: { supplierId: 'C23186', addIntoBom: true, footprint: 'R0603' },
  R10: { supplierId: 'C23186', addIntoBom: true, footprint: 'R0603' },

  J1: { supplierId: 'C8465', addIntoBom: true, footprint: 'CONN-TH_2P-P5.00_WJ500V-5.08-2P' },
  J2: { supplierId: 'C8465', addIntoBom: true, footprint: 'CONN-TH_2P-P5.00_WJ500V-5.08-2P' },
  J3: { supplierId: 'C8465', addIntoBom: true, footprint: 'CONN-TH_2P-P5.00_WJ500V-5.08-2P' },
  J4: { supplierId: 'C8465', addIntoBom: true, footprint: 'CONN-TH_2P-P5.00_WJ500V-5.08-2P' },
  J5: { supplierId: 'C9900005589', addIntoBom: false, footprint: 'CONN-TH_P3.81_KF128L-3.81-2P-1' },
  J6: { supplierId: 'C9900005589', addIntoBom: true, footprint: 'CONN-TH_P3.81_KF128L-3.81-2P-1' },
  J7: { supplierId: 'C9900005589', addIntoBom: true, footprint: 'CONN-TH_P3.81_KF128L-3.81-2P-1' },
  J8: { supplierId: 'C9900005589', addIntoBom: true, footprint: 'CONN-TH_P3.81_KF128L-3.81-2P-1' },
  J9: { supplierId: 'C165948', addIntoBom: true, footprint: 'USB-C_SMD-TYPE-C-31-M-12_1' },
};

async function main() {
  await eda('dmt_EditorControl.openDocument', ['5664b0722a0b08df'], 30000);
  const components = await eda('pcb_PrimitiveComponent.getAll', [], 30000, { maxArrayLength: 100 });
  const byRef = Object.fromEntries(components.map((component) => [component.designator, component]));
  const missingRefs = Object.keys(expectedParts).filter((ref) => !byRef[ref]);
  const extraRefs = Object.keys(byRef).filter((ref) => !expectedParts[ref]);
  const mismatches = [];

  for (const [ref, expected] of Object.entries(expectedParts)) {
    const actual = byRef[ref];
    if (!actual) continue;
    const actualFootprint = actual.footprint?.name || '';
    for (const [field, expectedValue] of Object.entries(expected)) {
      const actualValue = field === 'footprint' ? actualFootprint : actual[field];
      if (actualValue !== expectedValue) {
        mismatches.push({ ref, field, expected: expectedValue, actual: actualValue });
      }
    }
    if (actual.supplier !== 'LCSC') {
      mismatches.push({ ref, field: 'supplier', expected: 'LCSC', actual: actual.supplier });
    }
  }

  console.log(JSON.stringify({
    document: 'PCB3',
    checkedComponentCount: components.length,
    missingRefs,
    extraRefs,
    mismatches,
    bomExcludedRefs: components
      .filter((component) => component.addIntoBom === false)
      .map((component) => component.designator)
      .sort((a, b) => a.localeCompare(b)),
  }, null, 2));

  if (missingRefs.length || extraRefs.length || mismatches.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
