# ESP32-S3 Dome Board Standard Parts Assignment

Date: 2026-05-30

This file is the purchasing/assembly-facing standard parts allocation for JLCEDA `PCB3`.
Use it together with:

- `docs/esp32-s3-dome-board-standard-parts.csv`
- `docs/esp32-s3-dome-board-jlc-bom.csv`
- `docs/esp32-s3-dome-board-jlc-source-check.md`
- `docs/esp32-s3-dome-board-jlceda-parts-manifest.csv`
- `scripts/jlceda_verify_lcsc_parts.mjs`

## Standardization Result

- JLCEDA component refs checked by script: `30`.
- Default fitted component refs: `27`.
- Default DNP component refs: `3` (`U2`, `R8`, `J5` for RS485 reserve).
- Mechanical-only refs: `MH1`..`MH4`, not included in assembly BOM.
- Resistor package policy: keep all resistors as 0603 to reduce assembly variety.
- Connector policy: 5.08mm terminals for external 5V and relay dry contacts; 3.81mm terminals for low-voltage inputs and RS485 reserve.

## Policy

- Prefer JLCPCB Basic SMT parts for resistors, MOSFETs, diodes, and regulators.
- Accept Extended parts when the package defines the board interface or module choice: ESP32-S3 module, relay, terminals, and USB-C.
- Keep RS485 unassembled by default for V1 to reduce assembly cost and avoid committing to a field bus before it is needed.
- Keep all external wiring on screw terminals or USB-C; do not replace field terminals with pin headers for the production candidate.
- Re-check live stock, price, and JLCPCB assembly availability immediately before ordering.
- Treat this document and `docs/esp32-s3-dome-board-standard-parts.csv` as the standard-parts authority; treat JLCEDA-exported BOM/CPL as the final order files after netlist sync.

## FIT Standard Parts

| Ref | Qty | Standard Part | LCSC | Class | Package / Footprint | Reason |
| --- | ---: | --- | --- | --- | --- | --- |
| U1 | 1 | ESP32-S3-WROOM-1-N8R8 | C2913201 | Extended | WIRELM-SMD_ESP32-S3-WROOM-1 | Main MCU/Wi-Fi module; integrated antenna; official footprint required. |
| U3 | 1 | AMS1117-3.3 | C6186 | Basic | SOT-223-3 | Low-cost 5V to 3V3 regulator for V1. |
| K1 K2 K3 | 3 | SRD-05VDC-SL-C | C35449 | Extended | RELAY-TH_SRD-XXVDC-XL-C | 5V relay dry-contact outputs for OPEN/CLOSE/STOP. |
| Q1 Q2 Q3 | 3 | AO3400A | C20917 | Basic | SOT-23 | Low-side relay coil drivers. |
| D1 D2 D3 | 3 | 1N4148W | C81598 | Basic | SOD-123F | Flyback diodes for relay coils. |
| R1 R2 R3 | 3 | 100R 0603 | C22775 | Basic | R0603 | MOSFET gate resistors. |
| R4 R5 R6 | 3 | 10k 0603 | C25804 | Basic | R0603 | Input pullups for limit/rain inputs. |
| R9 R10 | 2 | 5.1k 0603 | C23186 | Basic | R0603 | USB-C CC pulldowns. |
| J1 | 1 | WJ500V-5.08-2P | C8465 | Extended | 5.08mm 2P terminal | External GND/+5V input. |
| J2 J3 J4 | 3 | WJ500V-5.08-2P | C8465 | Extended | 5.08mm 2P terminal | Relay dry-contact output terminals. |
| J6 J7 J8 | 3 | KF128-3.81-2P | C9900005589 | Extended | 3.81mm 2P terminal | OPEN limit, CLOSE limit, and RAIN inputs. |
| J9 | 1 | TYPE-C-31-M-12 | C165948 | Extended | USB-C_SMD-TYPE-C-31-M-12_1 | Native ESP32-S3 USB download/debug port. |

## Default DNP / Reserved Parts

| Ref | Qty | Standard Part | LCSC | Class | Package / Footprint | Default |
| --- | ---: | --- | --- | --- | --- | --- |
| U2 | 1 | SP3485EN-L/TR | C8963 | Basic | SOIC-8 | DNP; populate only when RS485 is needed. |
| R8 | 1 | 120R 0603 | C22787 | Basic | R0603 | DNP; RS485 terminal resistor. |
| J5 | 1 | KF128-3.81-2P | C9900005589 | Extended | 3.81mm 2P terminal | DNP; RS485 A/B reserve terminal. |

## Mechanical / Non-BOM

| Ref | Qty | Standard | Notes |
| --- | ---: | --- | --- |
| MH1 MH2 MH3 MH4 | 4 | M3 NPTH, about 3.4mm drill | Board fabrication holes only; keep screw-head/component clearance around each hole. |

## Allowed Substitutions

Use substitutions only if the selected standard part is unavailable or the exact ordered part cannot be assembled by JLCPCB.

| Function | Preferred | Allowed Substitute Rule |
| --- | --- | --- |
| 0603 resistors | Listed C22775/C25804/C22787/C23186 | Same value, 0603, 1% or 5%, JLCPCB Basic preferred, same footprint `R0603`. |
| Relay driver MOSFET | AO3400A C20917 | Logic-level N-MOSFET, SOT-23, Vds >= 30V, low Rds(on) at 2.5V gate drive, same pinout. |
| Flyback diode | 1N4148W C81598 | SOD-123/SOD-123F switching diode with matching footprint and current margin for relay coil. |
| USB-C | TYPE-C-31-M-12 C165948 | Only substitute with verified footprint-compatible USB-C receptacle; check locator holes and shell pads before order. |
| Relay | SRD-05VDC-SL-C C35449 | 5V coil, matching SRD footprint/pinout, contact rating suitable for the external controller input; re-check coil current. |
| Terminal blocks | C8465 / C9900005589 | Same pitch and footprint family; do not mix 3.81mm and 5.08mm footprints without changing PCB. |

## Final Order Gate

Before generating the final JLCPCB order package:

- Run `node scripts/jlceda_verify_lcsc_parts.mjs`.
- Confirm `J5`, `R8`, and `U2` remain excluded from BOM unless RS485 is intentionally included.
- Re-check live JLCPCB stock/assembly status for all Extended parts.
- Synchronize/import the schematic netlist and clear the remaining `Netlist Error / Import Changes` item in JLCEDA UI DRC.
- Re-run physical checks:
  - `node scripts/jlceda_verify_mounting_clearance.mjs`
  - `node scripts/jlceda_check_clearance.mjs`
  - `node scripts/jlceda_find_open_nets_layered.mjs`
  - `node scripts/jlceda_verify_antenna_keepout.mjs`
