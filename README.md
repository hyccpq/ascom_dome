# Ascom Alpaca ESP32 Dome Board

ESP32 firmware for controlling a roll-off-roof / sliding dome top through the ASCOM Alpaca protocol.

This trimmed version keeps only the Dome control path:

- Alpaca Dome discovery and API endpoints
- Web page for Dome state and Open / Close / Halt commands
- Web setup for Dome pins and timeout settings
- WiFi manager connection flow
- OTA firmware and filesystem updates

Switch and CoverCalibrator modules have been removed from the firmware, web UI, SPIFFS defaults, and Alpaca device discovery.

## Dome I/O

The current firmware uses fixed GPIO definitions in `src/Dome/dome.h`:

| Signal | GPIO |
| --- | --- |
| Open command relay | 25 |
| Close command relay | 26 |
| Halt command relay | 32 |
| Open limit input | 35 |
| Close limit input | 34 |

The web setup page still stores the original dome configuration file for compatibility, but the active control pins are the fixed GPIO constants above.

## Build

Install Visual Studio Code and the PlatformIO extension, then open this folder as a PlatformIO project.

From the command line:

```sh
pio run
```

To build the SPIFFS image:

```sh
pio run --target buildfs
```

## First Upload

Use PlatformIO:

1. Upload Filesystem Image
2. Upload firmware

On first boot, connect to the WiFi manager access point and configure the board for your observatory WiFi.

## Web Interface

After the board joins WiFi, open the ESP32 IP address in a browser.

- `/` shows Dome status and Open / Close / Halt controls.
- `/setup` shows Dome configuration.
- `/update` is provided by ElegantOTA for firmware and filesystem updates.

## ASCOM Alpaca

The board listens for Alpaca discovery on UDP `32227` and serves Alpaca device requests on port `4567`.

Only one configured device is advertised:

- Device type: `Dome`
- Device number: `0`

Useful endpoints include:

- `GET /management/apiversions`
- `GET /management/v1/description`
- `GET /management/v1/configureddevices`
- `GET /api/v1/dome/0/shutterstatus`
- `PUT /api/v1/dome/0/openshutter`
- `PUT /api/v1/dome/0/closeshutter`
- `PUT /api/v1/dome/0/abortslew`

## Verification

Current smoke check:

```sh
pio run
```
