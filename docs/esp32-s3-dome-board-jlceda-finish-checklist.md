# JLCEDA Finish Checklist

Use this checklist to review the current JLCEDA `PCB3` production candidate with JLC/LCSC parts. As of 2026-05-31, this checklist is not complete because the local JLCEDA bridge is disconnected.

## Import / Rebuild

1. Open or recreate the board in JLCEDA Pro.
2. Continue from project `ascom_dome` / board `Board3_1` / PCB `PCB3`.
3. Use `docs/esp32-s3-dome-board-standard-parts.md` and `docs/esp32-s3-dome-board-standard-parts.csv` as the standard FIT/DNP and substitution authority.
4. Use `docs/esp32-s3-dome-board-jlc-bom.csv` as the current grouped LCSC BOM candidate.
5. Use `docs/esp32-s3-dome-board-jlceda-parts-manifest.csv` for confirmed device, symbol, and footprint UUIDs found through `jlceda-mcp-bridge`.
6. Use `docs/esp32-s3-dome-board-jlceda-import-and-bind.md` for import notes and JLCEDA bridge evidence.
7. Keep the KiCad board geometry as the reference:
   - Board size: `91.44 mm x 87.63 mm`.
   - Four M3 NPTH holes: `3.41 mm` drill around the four corners.
   - Relay terminals on the right edge.
   - Input terminals on the top edge.
   - `5V IN` and USB-C near the bottom edge.

## Current MCP Working Set

- Continue from JLCEDA project `ascom_dome`.
- Preferred linked working set: `Board3_1`.
- Schematic source: `Schematic3`, page `P2`, UUID `227f009d50838569`.
- Deprecated schematic page: `P1`, UUID `018b50bd6ee3ee7a`, kept as drawing sheet only with no parts, wires, or extra text.
- PCB target: `PCB3`, UUID `5664b0722a0b08df`.
- The linked schematic has the real JLC/LCSC devices placed. Earlier linked-schematic import calls returned `false`; after the P2 cleanup, `pcb_Document.importChanges("227f009d50838569")` returned `true`, but JLCEDA still keeps one `Netlist Error / Import Changes` DRC item.
- `scripts/jlceda_populate_pcb.mjs` manually rebuilt `PCB3` from the KiCad geometry using real JLC/LCSC device components.
- `scripts/jlceda_layout_outer_io_route.mjs` is the current routing script: USB-C faces the bottom edge, screw terminals are near board edges, and `R1/R2` are now set to `x=2130mil` so they sit between the ESP32 antenna warning area and the relay body instead of under the relay body. Rerun this script on `PCB3` after the bridge reconnects.
- `scripts/jlceda_apply_and_verify_pcb3_production.mjs` is the live production gate runner. After the bridge reconnects, run it to apply the current PCB3 script, rerun all readback checks, import from P2, and execute JLCEDA PCB DRC before export.
- `P2.Schematic3` readback evidence: 30 formal part designators, no missing/extra expected PCB refs, USB-C `J9`, and CC pulldowns `R9/R10` present.
- Previous `scripts/jlceda_verify_pcb3.mjs` readback evidence: 30 components, no missing/extra expected designators, 298 line primitives, 12 strings, and no listed support parts inside the broad antenna warning area. This must be rerun after applying the current R1/R2 script adjustment.
- `scripts/jlceda_verify_mounting_clearance.mjs` readback evidence: the four M3 holes `MH1`..`MH4` have no component, copper line, or via hits inside the configured mounting clearance radii.
- `scripts/jlceda_find_open_nets_layered.mjs` readback evidence: `openNetCount: 0`.
- `scripts/jlceda_check_clearance.mjs` readback evidence: line/pad, line/line, line/via, and via/via hit counts are all `0`.
- `scripts/jlceda_verify_lcsc_parts.mjs` readback evidence: all 30 PCB components use `supplier: LCSC` with the expected `supplierId`; `U2`, `R8`, and `J5` are excluded from BOM by default.
- `docs/esp32-s3-dome-board-standard-parts.md` and `.csv` evidence: V1 standard parts are assigned, RS485 remains default DNP, and substitutions are constrained by footprint/pinout gates.
- Direct JLCEDA PCB DRC evidence before the current script-only `R1/R2` margin adjustment: `pcb_Drc.check(true, false, true)` reported only one `Netlist Error / Import Changes` item and no clearance, slot, connection, or open-copper physical errors. Rerun this after the bridge reconnects and the current routing script is applied.
- Schematic DRC evidence: `jlc.schematic.drc({ strict:false, userInterface:false })` returned `ok:true` after the P1/P2 cleanup.
- P2 net alignment evidence: P2 was corrected for `K1/K2/K3` relay pinout, `J5` RS485 A/B, `U1` EN/USB D+/D-, `U3.2`, and `J9` shell GND; direct Ref.Pin readback confirmed `103` P2 pins with nets match the `103` PCB3 pads with nets, with mismatch/schematic-only/PCB-only counts all `0`.
- Remaining order-gate item: JLCEDA PCB DRC still reports a generic `Netlist Error / Import Changes` after import retries even though direct Ref.Pin net comparison is clean; clear this UI netlist item and re-run `检查DRC` before generating order files.
- Current live-bridge gate: on 2026-05-31, `http://127.0.0.1:9151/v1/status` reports `connected:false`, 9050-9059 discovery receives no extension `hello`, the `jlc-assistant` app UI times out, and `open -a /Applications/jlc-assistant.app` fails with `-1712`. JLCEDA logs show `autoSaveInTime: 保存成功` at `2026-05-31 04:21:32`, followed by login-expired `401` at `04:22:19`; `TERM` and `KILL` did not release the stuck `UE` process. Do not export/order until this is recovered and all PCB3 scripts/DRC are rerun.

## Critical Layout Gates

- ESP32-S3-WROOM-1 antenna side faces a board edge.
- ESP32 antenna keepout has no copper, no tracks, no vias, no components, and no metal mounting hardware.
- Treat the KiCad `Dwgs.User` antenna rectangle as a hard placement warning. The official EasyEDA ESP32-S3-WROOM-1 footprint may shift the exact antenna end slightly, so re-center the no-copper/no-part zone on the real module antenna before final DRC.
- Input pullups and relay driver support parts `Q1/Q2/R1/R2/R4/R5/R6` are intended to stay out of the broad antenna warning area in `PCB3`; the current local script keeps `R1/R2` pulled toward the MOSFET side, but live `PCB3` readback is still required.
- The KiCad backup is stale for antenna-area verification: `node scripts/verify_local_board_candidate.mjs` reports KiCad backup parts/copper in the KiCad antenna rectangle. Use KiCad only as a mechanical/import baseline, not as an order source.
- USB-C connector shell/locator holes match `C165948`.
- Relay pinout matches `C35449` before routing coil and contact pads.
- Terminal screw direction faces outward for field wiring.
- Relay dry-contact outputs remain isolated from ESP32 GND and 5V.
- RS485 parts `U2`, `R8`, and `J5` remain DNP unless the first build needs RS485.

## Cost Gates

- Keep the board 2-layer.
- Use HASL unless there is a clear reason to pay for ENIG.
- Use Basic 0603 resistors where listed:
  - `C22775` 100R
  - `C25804` 10k
  - `C22787` 120R DNP
  - `C23186` 5.1k
- Do not add a USB-UART chip; ESP32-S3 native USB is already routed.
- Do not expand relay terminals to 3P unless `NC` is required in the field.
- Keep `U2`, `R8`, and `J5` DNP unless the first build intentionally includes RS485.

## Files for JLCPCB Assembly Upload

- JLCEDA production candidate: project `ascom_dome` / `Board3_1` / `PCB3`.
- Current final routing script: `scripts/jlceda_layout_outer_io_route.mjs`.
- Live production gate runner: `scripts/jlceda_apply_and_verify_pcb3_production.mjs`.
- Local static candidate verifier: `scripts/verify_local_board_candidate.mjs`.
- Standard parts assignment: `docs/esp32-s3-dome-board-standard-parts.md` and `docs/esp32-s3-dome-board-standard-parts.csv`.
- Confirmed JLCEDA parts manifest: `docs/esp32-s3-dome-board-jlceda-parts-manifest.csv`.
- KiCad preview Gerber/drill ZIP: `hardware/kicad/out/esp32_s3_dome_controller_fab_preview.zip`.
- KiCad import ZIP for JLCEDA: `hardware/kicad/out/esp32_s3_dome_controller_kicad_import.zip`.
- KiCad FIT/DNP/CPL drafts remain useful cross-checks, but the order package should be regenerated from JLCEDA `PCB3`.

These upload files are generated from the KiCad baseline. For ordering, regenerate the official JLCEDA Gerber/BOM/CPL from `PCB3` only after the live bridge reconnects, the current routing script is applied, and JLCEDA DRC reports zero remaining items.
