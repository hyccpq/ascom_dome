# JLC/LCSC Part Source Check

Checked against JLCPCB part-detail pages and JLCEDA library readback. Stock and Basic/Extended class can change, so re-check in JLCEDA before ordering.

| Function | LCSC | MPN / Keyword | JLCPCB page |
| --- | --- | --- | --- |
| ESP32-S3 module | C2913201 | ESP32-S3-WROOM-1-N8R8 | JLCEDA library search |
| 3.3 V LDO | C6186 | AMS1117-3.3 | https://jlcpcb.com/partdetail/AMS1117-33-C6186 |
| RS485 transceiver | C8963 | SP3485EN-L/TR | https://jlcpcb.com/partdetail/Sipex_SP3485EN-L-TR/C8963 |
| Relay | C35449 | SRD-05VDC-SL-C | https://jlcpcb.com/partdetail/SRDSongleRelay-SRD05VDCSLC/C35449 |
| N-MOSFET | C20917 | AO3400A | https://jlcpcb.com/partdetail/ChangjiangMicroelectronics-AO3400A/C20917 |
| Flyback diode | C81598 | 1N4148W | https://jlcpcb.com/partdetail/DiodesIncorporated-1N4148W7F/C81598 |
| 100R resistor | C22775 | 0603 100R | https://jlcpcb.com/partdetail/UNI_ROYAL-UniroyalElec0603WAF1000T5E/C22775 |
| 10k resistor | C25804 | 0603 10k | https://jlcpcb.com/partdetail/UNI_ROYAL-UniroyalElec0603WAF1002T5E/C25804 |
| 120R resistor | C22787 | 0603 120R | https://jlcpcb.com/partdetail/UNI_ROYAL-UniroyalElec0603WAF1200T5E/C22787 |
| 5.1k resistor | C23186 | 0603 5.1k | https://jlcpcb.com/partdetail/UNI_ROYAL-UniroyalElec0603WAF5101T5E/C23186 |
| 5.08 mm terminal | C8465 | WJ500V-5.08-2P | JLCEDA library search |
| 3.81 mm terminal | C9900005589 | KF128-3.81-2P | JLCEDA library search |
| USB-C receptacle | C165948 | HRO TYPE-C-31-M-12 | https://jlcpcb.com/partdetail/HRO-TYPEC31M12/C165948 |

## Notes

- KiCad remains a preview/import baseline and still contains local `Codex:*` footprints. The current JLCEDA production candidate is `ascom_dome` / `PCB3`.
- Earlier live readback with `scripts/jlceda_verify_lcsc_parts.mjs` confirmed all 30 `PCB3` components had `supplier: LCSC` plus the expected `supplierId`; `U2`, `R8`, and `J5` are intentionally `addIntoBom: false`.
- `jlceda-mcp-bridge` was connected earlier with JLCEDA Pro `3.2.135`, but the current 2026-05-31 bridge status is disconnected and must be recovered before order export; see `docs/esp32-s3-dome-board-jlceda-import-and-bind.md`.
- Before ordering, re-check live stock/class in JLCEDA/JLCPCB and verify USB-C shell pads, relay pinout, terminal direction, and ESP32 antenna keepout one last time.
