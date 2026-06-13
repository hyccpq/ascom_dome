# ESP32-S3 Dome Board Fabrication Notes

## Board Target

- Board size: `91.44 mm x 87.63 mm`.
- Layer count: 2 layers.
- Thickness: `1.6 mm`.
- Copper: `1 oz` is enough for the relay coil and low-voltage signal version.
- Finish: HASL is acceptable for the low-cost first article; ENIG is not required.
- Mounting: four corner M3 NPTH holes, drill about `3.4 mm`.
- ESP32 antenna: keep the module antenna area empty on all copper layers; no traces, vias, copper pour, metal mounting hardware, or components under/in front of the antenna.

## Do Not Order Before These Checks

- Use the JLCEDA `PCB3` production candidate, not the KiCad preview, for the official order package.
- If the KiCad baseline is used for a fresh import, replace every `Codex:*` placeholder footprint with the real JLCEDA/LCSC footprint before ordering.
- When replacing `U1`, use the official ESP32-S3-WROOM-1 keepout and orient the antenna toward a board edge.
- Confirm the selected USB-C connector shell pads, locator holes, and board-edge direction.
- Confirm the selected relay pinout against `K1/K2/K3`; Songle SRD-style relays have common variants.
- Confirm terminal block pitch and screw direction before ordering the PCB.
- Re-run DRC after footprint replacement and keep strict errors at `0`.

## Low-Cost Assembly Choices

- Keep RS485 parts DNP in V1 unless the field wiring really needs it.
- Keep relay outputs as 2-pin `COM/NO` terminals unless `NC` is confirmed necessary.
- Use ESP32-S3 module instead of bare ESP32-S3 chip to avoid RF layout and extra passives.
- Use native ESP32-S3 USB through USB-C; do not add a USB-UART chip.
- Use one resistor package family. For JLC assembly, prefer the Basic 0603 parts listed in `docs/esp32-s3-dome-board-jlc-bom.csv`; switch to 0805 only if hand rework is more important than assembly cost.
- Keep external power as `5V IN` for V1; adding 12/24V buck input is a later cost/function tradeoff.

## Exported Files

- PCB preview: `docs/kicad-esp32-s3-dome-controller-preview.svg`
- DRC strict-error report: `hardware/kicad/out/drc-errors.rpt`
- Full DRC report: `hardware/kicad/out/drc.rpt`
- Gerber/drill preview ZIP: `hardware/kicad/out/esp32_s3_dome_controller_fab_preview.zip`
- Position CSV: `hardware/kicad/out/esp32_s3_dome_controller_pos.csv`
- JLC/LCSC BOM candidate: `docs/esp32-s3-dome-board-jlc-bom.csv`
- JLCPCB FIT BOM draft: `hardware/kicad/out/jlcpcb_assembly_bom_fit.csv`
- JLCPCB DNP list: `hardware/kicad/out/jlcpcb_assembly_bom_dnp.csv`
- JLCPCB CPL draft: `hardware/kicad/out/jlcpcb_cpl_fit.csv`
- JLCEDA finish checklist: `docs/esp32-s3-dome-board-jlceda-finish-checklist.md`

The KiCad Gerber/drill ZIP is a preview package for checking layers, holes, outline, and routing. The intended order source is JLCEDA `PCB3`, not the KiCad preview. Earlier live `PCB3` checks showed LCSC parts, edge-facing USB-C, outer-edge terminals, clean M3 mounting-hole clearances, and no physical PCB DRC clearance/connection errors; however, the current `R1/R2` margin adjustment has not been applied/read back because the JLCEDA bridge is disconnected. Before ordering, reconnect the bridge, rerun the current routing script, clear the remaining generic JLCEDA UI `Netlist Error / Import Changes` item, and re-run JLCEDA DRC/export from `PCB3`.
