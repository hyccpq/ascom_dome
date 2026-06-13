# ESP32-S3 Dome Board Delivery Index

This is the current PCB delivery snapshot for the ESP32-S3 dome controller V1. As of 2026-05-31, treat it as a production candidate only: the live JLCEDA bridge is not connected, so final JLCEDA UI DRC/export is still pending.

## Current V1 Scope

- Controller: ESP32-S3 module.
- Outputs: three relay dry-contact triggers for `OPEN`, `CLOSE`, and `STOP`.
- Inputs: open limit, close limit, and rain sensor terminals.
- Expansion: RS485 A/B reserved, DNP by default.
- Debug/power: USB-C native ESP32-S3 USB plus external `5V IN` terminal.
- Mounting: four corner M3 NPTH holes.
- Cost target: 2-layer board below `100 mm x 100 mm`, low-cost HASL-compatible first article.
- RF layout: ESP32-S3-WROOM antenna keepout must be left empty: no copper, no traces, no vias, and no components.

The current KiCad V1 board uses external `5V IN` to reduce first-article BOM cost. A future 12/24V input plus buck converter can be added after field power requirements are confirmed.

## Authoritative Artifacts

| Purpose | File |
| --- | --- |
| KiCad offline preview/import baseline | `hardware/kicad/esp32_s3_dome_controller.kicad_pcb` |
| Project file | `hardware/kicad/esp32_s3_dome_controller.kicad_pro` |
| Preview image | `docs/kicad-esp32-s3-dome-controller-preview.svg` |
| JLCEDA outer-IO preview image | `hardware/jlceda/out/pcb3_outer_io_current_simplified.svg.png` |
| Hardware design notes | `docs/esp32-s3-dome-board-hardware.md` |
| Routing/finalization checklist | `docs/pcb2-routing-punchlist.md` |
| Costed V1 BOM draft | `docs/esp32-s3-dome-board-bom.csv` |
| Standard parts assignment | `docs/esp32-s3-dome-board-standard-parts.md` |
| Standard parts machine table | `docs/esp32-s3-dome-board-standard-parts.csv` |
| JLC/LCSC BOM candidate | `docs/esp32-s3-dome-board-jlc-bom.csv` |
| JLC/LCSC source check | `docs/esp32-s3-dome-board-jlc-source-check.md` |
| JLCEDA finish checklist | `docs/esp32-s3-dome-board-jlceda-finish-checklist.md` |
| JLCEDA import and binding notes | `docs/esp32-s3-dome-board-jlceda-import-and-bind.md` |
| Real footprint replacement map | `docs/esp32-s3-dome-board-footprint-map.csv` |
| JLCEDA parts manifest | `docs/esp32-s3-dome-board-jlceda-parts-manifest.csv` |
| Fabrication notes | `docs/esp32-s3-dome-board-fab-notes.md` |
| Strict DRC report | `hardware/kicad/out/drc-errors.rpt` |
| Full DRC report | `hardware/kicad/out/drc.rpt` |
| Gerber/drill preview ZIP | `hardware/kicad/out/esp32_s3_dome_controller_fab_preview.zip` |
| KiCad import ZIP for JLCEDA | `hardware/kicad/out/esp32_s3_dome_controller_kicad_import.zip` |
| Position file | `hardware/kicad/out/esp32_s3_dome_controller_pos.csv` |
| JLCPCB FIT BOM draft | `hardware/kicad/out/jlcpcb_assembly_bom_fit.csv` |
| JLCPCB DNP BOM draft | `hardware/kicad/out/jlcpcb_assembly_bom_dnp.csv` |
| JLCPCB CPL draft | `hardware/kicad/out/jlcpcb_cpl_fit.csv` |
| JLCEDA direct PCB build script | `scripts/jlceda_populate_pcb.mjs` |
| JLCEDA official-pad routing script | `scripts/jlceda_route_official_pads.mjs` |
| JLCEDA final outer-IO routing script | `scripts/jlceda_layout_outer_io_route.mjs` |
| Local static candidate verifier | `scripts/verify_local_board_candidate.mjs` |
| JLCEDA PCB verification script | `scripts/jlceda_verify_pcb3.mjs` |
| JLCEDA LCSC binding verification script | `scripts/jlceda_verify_lcsc_parts.mjs` |
| JLCEDA mounting-hole clearance verification script | `scripts/jlceda_verify_mounting_clearance.mjs` |
| JLCEDA live production gate runner | `scripts/jlceda_apply_and_verify_pcb3_production.mjs` |

## Completion Evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Four corner M3 mounting holes | `MH1`..`MH4`, NPTH pads with `3.41 mm` drill in the PCB file | Done |
| Board kept low-cost size | Edge cuts are `91.44 mm x 87.63 mm` | Done |
| 2-layer layout | PCB uses `F.Cu` and `B.Cu` signal layers | Done |
| Three relay outputs | `K1/K2/K3` routed to `J2/J3/J4` dry-contact terminals | Done |
| Rain sensor reserved | `J8 RAIN` terminal routed to `RAIN_GPIO9` | Done |
| 5V input present | `J1 5V IN` terminal and `GND +5V IN` silkscreen | Done |
| USB present | `J9 USB-C DEVICE`, CC pulldowns `R9/R10`, D+/D- routed to ESP32-S3 USB pads | Done |
| Routed without strict KiCad DRC errors | Fresh `hardware/kicad/out/drc-errors-fresh.rpt` reports `0` violations and `0` unconnected pads | Done for KiCad backup |
| Cost optimization documented | JLC BOM marks RS485 and terminator DNP, keeps 2-pin relay terminals, uses native USB, module ESP32-S3, Basic 0603 resistors, and 2-layer board | Done |
| ESP32 antenna keepout called out | `PCB3` includes a document-layer antenna warning rectangle. Current local verifier also warns that the KiCad backup has stale parts/copper in the KiCad antenna rectangle, so KiCad is not an order source. | Needs live PCB3 recheck |
| JLCEDA bridge checked | 2026-05-31 status: `http://127.0.0.1:9151/v1/status` returns `connected:false`; 9050-9059 WS discovery received no extension hello; `jlc-assistant` UI times out and `open -a /Applications/jlc-assistant.app` fails with `-1712`. Log evidence shows `autoSaveInTime: 保存成功` at `2026-05-31 04:21:32`, followed by login-expired `401` at `04:22:19`. `TERM` and `KILL` did not release the stuck `UE` process. | Blocked for live JLCEDA verification |
| JLCEDA floating schematic page cleaned | JLCEDA page `4f59e624d870fc29` was rebuilt via `jlceda-mcp-bridge` with 30 JLC/LCSC components and 7 aligned section notes; snapshot confirmed the component count | Done as schematic/BOM anchor |
| JLCEDA linked schematic source cleaned | Linked board `Board3_1` uses `Schematic3`; page `P1` / UUID `018b50bd6ee3ee7a` is deprecated and has been cleared to the drawing sheet only | Done |
| JLCEDA linked schematic populated | Formal source page is `P2.Schematic3` / UUID `227f009d50838569`; readback confirmed the 30 PCB designators `K1/K2/K3`, `J1`..`J9`, `U1/U2/U3`, `Q1`..`Q3`, `D1`..`D3`, `R1`..`R6`, and `R8/R9/R10`, with no extra part designators | Done as linked schematic |
| JLCEDA linked PCB created | `PCB3` UUID `5664b0722a0b08df` is linked under `Board3_1` | Created, not imported |
| JLCEDA PCB import from schematic | Earlier `pcb_Document.importChanges("720bbc0db4383d2e")` and default `pcb_Document.importChanges()` returned `false`; after P2 cleanup, `pcb_Document.importChanges("227f009d50838569")` returned `true`, but JLCEDA still reports one `Netlist Error / Import Changes` item | Physical PCB is verified; UI netlist sync remains an order gate |
| JLCEDA direct PCB build | `scripts/jlceda_populate_pcb.mjs` populated `PCB3` with 30 real JLC/LCSC components, board outline, four M3 holes, 199 line primitives, and 26 vias; JLCEDA UI shows the board on `PCB3` | Superseded by official-pad routing |
| JLCEDA final outer-IO routing script | `scripts/jlceda_layout_outer_io_route.mjs` keeps USB-C on the bottom edge, field terminals on board edges, and now places `R1/R2` at `x=2130mil` to give more margin from the relay body while staying outside the antenna warning area. | Script updated; rerun on PCB3 when bridge reconnects |
| JLCEDA live production gate runner | `scripts/jlceda_apply_and_verify_pcb3_production.mjs` runs the local static check, applies the current PCB3 layout/routing script, runs all PCB3 readback checks, then runs P2 import plus JLCEDA PCB DRC. With the current disconnected bridge it fails before any live write. | Ready; blocked on bridge |
| JLCEDA PCB readback | Previous readback from `scripts/jlceda_verify_pcb3.mjs` reported 30 components, no missing/extra expected designators, 298 line primitives, 12 strings, and no listed support parts inside the antenna warning area. | Must rerun after applying current script |
| JLCEDA mounting clearance | `scripts/jlceda_verify_mounting_clearance.mjs` reported `componentHitCount: 0`, `lineHitCount: 0`, and `viaHitCount: 0` around `MH1`..`MH4` | Done |
| JLCEDA connectivity | `scripts/jlceda_find_open_nets_layered.mjs` reported `openNetCount: 0` | Done |
| JLCEDA local clearance scan | `scripts/jlceda_check_clearance.mjs` reported `lineHitCount: 0`, `lineLineHitCount: 0`, `lineViaHitCount: 0`, and `viaHitCount: 0` | Done |
| JLCEDA LCSC bindings | `scripts/jlceda_verify_lcsc_parts.mjs` reported all 30 components match expected LCSC supplier IDs; `J5/R8/U2` are excluded from BOM by default | Done |
| JLCEDA P2 relay/PCB net alignment | P2 was corrected for `K1/K2/K3` relay pinout, `J5` RS485 A/B, `U1` EN/USB D+/D-, `U3.2`, and `J9` shell GND; direct Ref.Pin readback confirmed `103` P2 pins with nets match the `103` PCB3 pads with nets, with mismatch/schematic-only/PCB-only counts all `0` | Done |
| Standard parts assigned | `docs/esp32-s3-dome-board-standard-parts.md` and `.csv` fix the V1 FIT/DNP policy, LCSC numbers, package choices, substitution gates, and order gates | Done |
| JLCEDA PCB DRC via bridge | `pcb_Drc.check(true, false, true)` still reports one generic `Netlist Error / Import Changes` item after import retries, while direct P2-vs-PCB Ref.Pin comparison and `sys_Tool.netlistComparison` show no concrete net differences | Physical PCB and source nets match; clear stale UI netlist item before order export |
| Local static candidate check | `node scripts/verify_local_board_candidate.mjs` confirms P2/PCB3 UUIDs, no active P1 use, edge connector placement, M3 hole coordinates, revised R1/R2 script placement, R1/R2 relay-body margins, and key KiCad relay/MOSFET/flyback/USB/5V/limit/rain pad nets. It warns that the KiCad backup antenna area is stale. | Passes with KiCad-stale warnings |

## Production Gate

The board is not cleared for ordering until the live JLCEDA checks below pass. `PCB3` remains the intended production candidate, but the current R1/R2 script adjustment has not been applied or re-read from the live JLCEDA canvas in this session.

- Re-check live stock/class for the LCSC numbers in `docs/esp32-s3-dome-board-standard-parts.md` and `docs/esp32-s3-dome-board-jlc-bom.csv` before ordering.
- For the MCP-created JLCEDA working set, continue from `Board3_1` / `Schematic3` page `P2` / `PCB3`; keep `P1` cleared and do not use it as a source page.
- Place `U1` with the ESP32-S3-WROOM-1 antenna facing a board edge and keep the marked antenna keepout empty: no copper pour, no tracks, no vias, no components, and no metal mounting hardware.
- Confirm the selected USB-C receptacle footprint against the part ordered.
- Confirm relay footprint pinout against the exact relay ordered.
- Re-run JLCEDA UI DRC after synchronizing/importing the schematic netlist, and keep `全部 (0)` before ordering.
- Re-run `scripts/jlceda_apply_and_verify_pcb3_production.mjs`; it wraps the current layout script, all PCB3 readback checks, P2 import, and JLCEDA PCB DRC gate in the required order.
- Export Gerber, drill, position, and BOM directly from JLCEDA `PCB3` for the real order package.
