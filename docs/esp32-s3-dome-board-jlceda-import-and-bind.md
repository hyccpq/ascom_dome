# JLCEDA Import and Binding Notes

Use this note when moving the KiCad baseline into JLCEDA Pro for the final production version. The KiCad files are an offline preview/import baseline; the order source must be JLCEDA `PCB3` after live DRC passes.

## MCP Bridge Status

The local `jlceda-mcp-bridge` was tested again on 2026-05-30 and again on 2026-05-31:

- Bridge URL: `http://127.0.0.1:9151`
- JLCEDA extension app: `jlceda-mcp-bridge`
- Bridge version: `0.0.17`
- JLCEDA Pro version reported by the bridge: `3.2.135`
- 2026-05-30 bridge status: connected during earlier verification
- 2026-05-31 bridge status: HTTP bridge is listening, but `connected:false`; 9050-9059 discovery receives no extension `hello`; `jlc-assistant` UI access times out
- Current JLCEDA documents checked: linked schematic page `P2.Schematic3` / UUID `227f009d50838569`, and linked PCB `PCB3` / UUID `5664b0722a0b08df`

The bridge supports schematic placement/query/export helpers and generic `eda` API calls. The exposed MCP tool set did not provide a complete high-level PCB autorouting/import flow, so V1 was finished by direct PCB primitive placement/routing in `PCB3`:

1. Place the confirmed official JLC/LCSC devices in the linked schematic and PCB.
2. Rebuild `PCB3` with official EasyEDA footprints through `scripts/jlceda_populate_pcb.mjs` when starting from an empty board.
3. Use `scripts/jlceda_layout_outer_io_route.mjs` for the current placement/routing: USB-C on the bottom edge, field terminals on board edges, relay contacts on the right edge, revised `R1/R2` placement at `x=2130mil`, and no copper/vias/parts in the ESP32 antenna warning area.
4. After the bridge reconnects, run `scripts/jlceda_apply_and_verify_pcb3_production.mjs` to apply the current PCB3 script, rerun all readback checks, import from `P2.Schematic3`, and execute the JLCEDA PCB DRC gate in one sequence.
5. Re-check placement, especially USB-C, relay pins, terminal orientation, and the ESP32 antenna area.
6. Re-run JLCEDA DRC and export the official production Gerber/BOM/CPL from JLCEDA.

## Applied JLCEDA Pages

The first JLCEDA schematic page was cleaned and rebuilt through `jlceda-mcp-bridge` on 2026-05-29:

- Cleared old sketch content: 73 text primitives and 31 components.
- Created 30 components from JLC/LCSC library devices.
- Created 7 aligned section/title notes.
- Saved successfully through the JLCEDA schematic save API.
- Snapshot after placement reported 30 components and 7 text notes.

That page is a clean component-placement/BOM anchor for the design, but it is a floating schematic and not the production PCB source.

The current linked JLCEDA working set is:

- Project: `ascom_dome`, UUID `71d1661872f843fda19343ed40390dcb`
- Linked board: `Board3_1`, UUID `d4f25f5d90f995f8`
- Linked schematic: `schematic3`, UUID `720bbc0db4383d2e`
- Deprecated schematic page: `P1`, UUID `018b50bd6ee3ee7a`; this page has been cleared and now contains only the drawing sheet.
- Formal schematic source page: `P2`, UUID `227f009d50838569`
- Linked PCB: `PCB3`, UUID `5664b0722a0b08df`

The formal linked schematic page `227f009d50838569` is the production source. It was cleaned to the A4 drawing frame/title block, duplicate text notes were removed, and USB-C source parts were added. Verified designators now match `PCB3`: `U1 U2 U3`, `K1 K2 K3`, `J1 J2 J3 J4 J5 J6 J7 J8 J9`, `Q1 Q2 Q3`, `D1 D2 D3`, `R1 R2 R3 R4 R5 R6 R8 R9 R10`. `J9` carries `5V`, `GND`, `USB_D+`, `USB_D-`, `USB_CC1`, and `USB_CC2` labels; `R9/R10` are the 5.1k CC pulldowns.

PCB import status: `PCB3` is linked to `schematic3`. Earlier `pcb_Document.importChanges("720bbc0db4383d2e")` and default `pcb_Document.importChanges()` calls returned `false` through the bridge, so the linked PCB was completed by manual MCP rebuild instead of schematic import. After the P1/P2 cleanup, `pcb_Document.importChanges("227f009d50838569")` returned `true`, but the JLCEDA PCB DRC still retains one `Netlist Error / Import Changes` item; clear that UI netlist item before order export.

## Direct PCB Build Attempt

Because `pcb_Document.importChanges` did not accept the linked schematic, the current PCB was populated directly through JLCEDA PCB primitive APIs on 2026-05-29.

- Script: `scripts/jlceda_populate_pcb.mjs`
- Target: `PCB3`, UUID `5664b0722a0b08df`
- Method: placed real JLC/LCSC device components with `pcb_PrimitiveComponent.create`, then transferred board outline, M3 holes, KiCad routed segments, vias, and component pad net names into JLCEDA PCB coordinates.
- Coordinate conversion: JLCEDA PCB API uses mil-scale data coordinates; KiCad mm coordinates were converted by `mil = mm * 1000 / 25.4`.
- Readback evidence after cleanup:
  - Components: 30
  - Lines: 199
  - Vias: 26
  - Designators: `U1 U2 U3`, `K1 K2 K3`, `J1 J2 J3 J4 J5 J6 J7 J8 J9`, `Q1 Q2 Q3`, `D1 D2 D3`, `R1 R2 R3 R4 R5 R6 R8 R9 R10`
- Earlier UI evidence: JLCEDA Pro was open on `ascom_dome | PCB3 | 嘉立创EDA(专业版) - V3.2.135`, and the board geometry/components/routes were visible in the PCB canvas. On 2026-05-31 the app is not reachable through the bridge/UI automation, so this must be rechecked live before ordering.

The first direct transfer was not DRC clean. A strict JLCEDA PCB DRC run reported:

- Clearance Error: 229
- Connection Error: 57
- Netlist Error: 1

Primary inferred cause: the KiCad baseline used simplified placeholder footprints, especially for the ESP32-S3 module. The direct conversion used real JLCEDA footprints, so some placeholder-route endpoints no longer lined up with the official pads.

## Final Outer-IO PCB Routing

`PCB3` was then re-routed against the actual JLCEDA footprint pad coordinates and the requested outer-edge connector placement. On 2026-05-31 the local routing script was tightened further so `R1/R2` move from `x=2180mil` to `x=2130mil`; this script change still needs to be applied to the live `PCB3` document after the bridge reconnects.

- Script: `scripts/jlceda_layout_outer_io_route.mjs`
- Target: `PCB3`, UUID `5664b0722a0b08df`
- Method: delete old PCB lines/vias/strings, move USB-C and terminal blocks to the board edges, keep `J1/J6/J7/J8` clear of the four M3 mounting-hole keepout areas, read each official footprint pad coordinate with `pcb_PrimitiveComponent.getAllPinsByPrimitiveId`, recreate two-layer routed line primitives on the intended nets, and save the board.
- Previous readback evidence from `scripts/jlceda_verify_pcb3.mjs`:
  - Components: 30
  - Missing expected refs: none
  - Extra refs: none
  - Line primitives: 298
  - Vias: 29
  - Silkscreen/document strings: 12
  - Support parts inside the broad ESP32 antenna warning rectangle: none for `Q1 Q2 R1 R2 R4 R5 R6`
  - Expected designators: `U1 U2 U3`, `K1 K2 K3`, `J1 J2 J3 J4 J5 J6 J7 J8 J9`, `Q1 Q2 Q3`, `D1 D2 D3`, `R1 R2 R3 R4 R5 R6 R8 R9 R10`
- Connectivity evidence from `scripts/jlceda_find_open_nets_layered.mjs`: `openNetCount: 0`.
- Local clearance evidence from `scripts/jlceda_check_clearance.mjs`: line/pad, line/line, line/via, and via/via hit counts are all `0`.
- Mounting clearance evidence from `scripts/jlceda_verify_mounting_clearance.mjs`: component, copper line, and via hit counts around `MH1`..`MH4` are all `0`.
- LCSC binding evidence from `scripts/jlceda_verify_lcsc_parts.mjs`: all 30 components use the expected `supplier: LCSC` and `supplierId`; `J5`, `R8`, and `U2` are excluded from BOM by default.
- Direct JLCEDA PCB DRC evidence before the 2026-05-31 script-only R1/R2 margin adjustment: `pcb_Drc.check(true, false, true)` reported only one `Netlist Error / Import Changes` item and no clearance, slot, connection, or open-copper physical errors. Rerun DRC after applying the current script.
- P2 net alignment evidence: P2 was corrected for `K1/K2/K3` relay pinout, `J5` RS485 A/B, `U1` EN/USB D+/D-, `U3.2`, and `J9` shell GND; direct Ref.Pin readback confirmed `103` P2 pins with nets match the `103` PCB3 pads with nets, with mismatch/schematic-only/PCB-only counts all `0`.
- Remaining order-gate item: DRC still reports one generic `Netlist Error / Import Changes` item after default import, linked schematic import, and `pcb_Document.importChanges("227f009d50838569")` all returned `true`; clear this JLCEDA UI netlist item and re-run `检查DRC` before order export.
- Layout cleanup: `Q1/Q2/R1/R2/R4/R5/R6` are intended to be out of the broad ESP32 antenna warning area, `R1/R2` are pulled back to the MOSFET side and rotated 180 degrees so they do not sit under the relay body area, U1 `3V3` is explicitly routed, USB-C VBUS/GND pads are tied into the board 5V/GND nets, USB-C VBUS/CC escape is adjusted to clear the connector pads and mechanical slot, and non-bus signal routes use 45-degree chamfered corners.

Bridge note: direct `pcb_Drc.check` RPC is usable only when the JLCEDA client bridge is connected. The current 2026-05-31 local state is disconnected, so the remaining generic netlist item and the current R1/R2 script placement both remain order-export gates until live readback passes.

## Import Package

Create or use:

`hardware/kicad/out/esp32_s3_dome_controller_kicad_import.zip`

Expected contents:

- `esp32_s3_dome_controller.kicad_pcb`
- `esp32_s3_dome_controller.kicad_pro`
- `fp-lib-table`
- `Codex.pretty/*.kicad_mod`

In JLCEDA Pro, use the KiCad import entry and select the ZIP. After import, use the KiCad layout as geometry reference, not as final production footprints.

## Confirmed LCSC / EasyEDA Footprints

These were checked through `jlceda-mcp-bridge` library search.

The machine-readable manifest is:

`docs/esp32-s3-dome-board-jlceda-parts-manifest.csv`

| Ref | LCSC | MPN | EasyEDA footprint | Footprint UUID | Fit |
| --- | --- | --- | --- | --- | --- |
| U1 | C2913201 | ESP32-S3-WROOM-1-N8R8 | `WIRELM-SMD_ESP32-S3-WROOM-1` | `bacdc9b3530d4b9ca5f35adac008b474` | FIT |
| U3 | C6186 | AMS1117-3.3 | `SOT-223-3_L6.5-W3.4-P2.30-LS7.0-BR` | `20c29e37a9b84b4197418483096f9c05` | FIT |
| U2 | C8963 | SP3485EN-L/TR | `SOIC-8_L5.0-W4.0-P1.27-LS6.0-BL` | `f7d15c2fdb6442c7924d73bb1cadcb47` | DNP by default |
| K1 K2 K3 | C35449 | SRD-05VDC-SL-C | `RELAY-TH_SRD-XXVDC-XL-C` | `e091fe638fa34354809b87cd801cad53` | FIT |
| Q1 Q2 Q3 | C20917 | AO3400A | `SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR` | `bdad16194d454cb292a50525f39c3ffd` | FIT |
| D1 D2 D3 | C81598 | 1N4148W | `SOD-123F_L2.7-W1.6-LS3.8-RD` | `9037e46ec88e4daaac06215d79f5d775` | FIT |
| R1 R2 R3 | C22775 | 0603WAF1000T5E | `R0603` | `50b4943912284dab97752312e589e9e2` | FIT |
| R4 R5 R6 | C25804 | 0603WAF1002T5E | `R0603` | `50b4943912284dab97752312e589e9e2` | FIT |
| R8 | C22787 | 0603WAF1200T5E | `R0603` | `50b4943912284dab97752312e589e9e2` | DNP by default |
| R9 R10 | C23186 | 0603WAF5101T5E | `R0603` | `50b4943912284dab97752312e589e9e2` | FIT |
| J1 J2 J3 J4 | C8465 | WJ500V-5.08-2P | `CONN-TH_2P-P5.00_WJ500V-5.08-2P` | `8968bbc397b14e199797e74eee3df70d` | FIT |
| J5 | C9900005589 | KF128-3.81-2P | `CONN-TH_P3.81_KF128L-3.81-2P-1` | `487be35cd79947a0b5f4b62e4888dd6b` | DNP by default |
| J6 J7 J8 | C9900005589 | KF128-3.81-2P | `CONN-TH_P3.81_KF128L-3.81-2P-1` | `487be35cd79947a0b5f4b62e4888dd6b` | FIT |
| J9 | C165948 | TYPE-C-31-M-12 | `USB-C_SMD-TYPE-C-31-M-12_1` | `6be549a13f5d4c07a7d9efa614d32ed9` | FIT |

Notes:

- Searching exact `C35449` once returned unrelated header results; searching `SRD-05VDC-SL-C` returned the correct relay with supplier part `C35449`.
- Searching `C2913204` returns the N8R2 module. Searching `ESP32-S3-WROOM-1-N8R8` returns `C2913201`, so the V1 BOM uses `C2913201` for the N8R8 variant.
- The previous `C8463` candidate is a 5.0 mm terminal in the current JLCEDA library, not the desired 3.81 mm terminal. The V1 low-voltage terminals now use `C9900005589` / `KF128-3.81-2P`.
- Re-check stock, Basic/Extended class, and footprint availability in JLCEDA immediately before ordering.

## Final PCB Gates

- Board remains 2-layer and below `100 mm x 100 mm`.
- Four corner M3 NPTH mounting holes stay clear of copper and field wiring.
- USB-C and external `5V IN` are both present.
- ESP32-S3 antenna side faces the board edge.
- The final ESP32 antenna keepout has no copper pour, no tracks, no vias, no components, and no metal mounting hardware.
- Relay outputs are dry contacts only; they do not connect field-side output terminals to ESP32 GND or board 5V.
- RS485 parts remain DNP unless the first production build needs RS485.
- Direct JLCEDA PCB DRC must be rerun after the bridge reconnects and the current routing script is applied. Prefer `scripts/jlceda_apply_and_verify_pcb3_production.mjs` for this gate. Do not order while the bridge is disconnected or while any JLCEDA UI DRC item remains.
