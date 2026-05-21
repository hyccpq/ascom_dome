# Dome Serial Control and ASCOM Driver Design

This document defines the next development slice for the ESP32 dome controller:

1. Add a local serial control protocol to the firmware.
2. Build a Windows ASCOM Dome driver for ASCOM Platform 6.6 and later.
3. Keep the current Alpaca and browser controls working through the same internal dome command/state model.

## Current Firmware Baseline

The firmware is now dome-only.

Relevant files:

- `src/main.cpp` starts WiFi, Alpaca discovery, Dome routes, browser routes, OTA, and `main_loop()`.
- `src/Dome/dome.h` owns dome GPIO setup, command pulses, input state detection, and the movement state machine.
- `src/Dome/domeVariable.h` defines `Dome`, `ShCmdEnum`, `ShStEnum`, and `ShInEnum`.
- `src/Dome/alpacaDevices.h` exposes Alpaca Dome API methods.
- `src/Dome/webserver.h` exposes browser-facing `/api/dome` and `/api/dome-cmd`.

The serial protocol should not duplicate dome movement logic. It should only translate serial commands into the existing `Dome.ShutterCommand` and report the existing `Dome.ShutterState`.

## Official ASCOM References

Use these official references during implementation:

- ASCOM Platform 6.6 SP2 developer help: `https://ascom-standards.org/Help/Developer/html/N_ASCOM_DriverAccess.htm`
- ASCOM Platform requirements: `https://ascom-standards.org/Help/Developer/html/6cd2ca86-9e45-4a9e-8693-32d338c949a3.htm`
- ASCOM Dome DriverAccess class for Platform 6.6: `https://ascom-standards.org/Help/Developer/html/T_ASCOM_DriverAccess_Dome.htm`
- ASCOM Master Interfaces Dome API reference: `https://ascom-standards.org/library/html/T_ASCOM_DeviceInterface_IDomeV3.htm`
- ASCOM Alpaca API reference: `https://ascom-standards.org/api/`

Interpretation for this project:

- ASCOM Platform 6.6 targets .NET Framework 4.8.
- The 6.6 DriverAccess Dome class documents `IDomeV2` compatibility.
- Newer ASCOM interface documentation includes `IDomeV3`.
- For broad client compatibility, implement the first Windows driver as an ASCOM 6.6-compatible Dome driver, with a small internal adapter layer so an `IDomeV3` facade can be added later without rewriting serial transport.

## Serial Protocol Goals

The serial protocol is for a direct USB connection between Windows and the ESP32.

Goals:

- Human-readable for field debugging in a serial terminal.
- Line-oriented and non-blocking on the ESP32.
- Stable enough for an ASCOM driver.
- Idempotent status reads.
- Simple command acknowledgements.
- No JSON parsing required in the hot loop.

Transport defaults:

- Baud: `115200`
- Data bits: `8`
- Parity: `None`
- Stop bits: `1`
- Line ending: `\n`; accept optional preceding `\r`
- Encoding: ASCII
- Read timeout on driver side: 1000 ms
- Command timeout on driver side: 3000 ms

## Serial Protocol Version

Protocol name: `KDB1`

Every command is one line:

```text
KDB1 <COMMAND> [ARGS...]
```

Every response is one line:

```text
OK <FIELDS...>
ERR <CODE> <MESSAGE>
```

The driver must ignore blank lines. The firmware should trim whitespace and treat command names case-insensitively.

## Serial Commands

### `PING`

Request:

```text
KDB1 PING
```

Response:

```text
OK PONG KDB1
```

Driver use:

- Verify selected COM port.
- Reconnect health check.

### `INFO`

Request:

```text
KDB1 INFO
```

Response:

```text
OK NAME=KalecDome PROTO=KDB1 FW=1.0 DEVICE=DOME
```

Driver use:

- Confirm this is the expected device.
- Display firmware/protocol in setup dialog.

### `STATE`

Request:

```text
KDB1 STATE
```

Response:

```text
OK STATE=OPEN CMD=IDLE INPUT=OPEN MOVING=0 ERROR=0
```

Allowed `STATE` values:

- `OPEN`
- `CLOSED`
- `OPENING`
- `CLOSING`
- `ERROR`

Allowed `CMD` values:

- `IDLE`
- `OPEN`
- `CLOSE`
- `HALT`

Allowed `INPUT` values:

- `NONE`
- `CLOSE`
- `OPEN`
- `BOTH`

Driver mapping:

| Firmware state | ASCOM shutter status |
| --- | --- |
| `OPEN` | `shutterOpen` |
| `CLOSED` | `shutterClosed` |
| `OPENING` | `shutterOpening` |
| `CLOSING` | `shutterClosing` |
| `ERROR` | `shutterError` |

### `OPEN`

Request:

```text
KDB1 OPEN
```

Success response:

```text
OK CMD=OPEN
```

Error responses:

```text
ERR 1035 ALREADY_OPEN_OR_MOVING
ERR 1001 DEVICE_ERROR
```

Firmware behavior:

- If state is already `OPEN`, return `ERR 1035 ALREADY_OPEN_OR_MOVING`.
- If no movement is active, set `Dome.ShutterCommand = CmdOpen`.
- Do not block waiting for the movement to finish.

### `CLOSE`

Request:

```text
KDB1 CLOSE
```

Success response:

```text
OK CMD=CLOSE
```

Error responses:

```text
ERR 1035 ALREADY_CLOSED_OR_MOVING
ERR 1001 DEVICE_ERROR
```

Firmware behavior:

- If state is already `CLOSED`, return `ERR 1035 ALREADY_CLOSED_OR_MOVING`.
- If no movement is active, set `Dome.ShutterCommand = CmdClose`.
- Do not block waiting for the movement to finish.

### `HALT`

Request:

```text
KDB1 HALT
```

Response:

```text
OK CMD=HALT
```

Firmware behavior:

- Set `Dome.ShutterCommand = CmdHalt`.
- Set `Dome.Cycle = 100` to enter the existing halt cycle.

### `CONFIG?`

Request:

```text
KDB1 CONFIG?
```

Response:

```text
OK OPEN_RELAY=25 CLOSE_RELAY=26 HALT_RELAY=32 OPEN_INPUT=35 CLOSE_INPUT=34 TIMEOUT=300
```

Driver use:

- Show read-only hardware summary in the setup dialog.

## Firmware Implementation Plan

Add a new firmware module:

- `src/Dome/serialControl.h`

Current status: implemented.

Expose:

```cpp
void domeSerialSetup();
void domeSerialLoop();
```

Call sites:

- In `setup()`, call `domeSerialSetup()` after `initDomeConfig()`.
- In `main_loop()`, call `domeSerialLoop()` after `domehandlerloop()`.

Implementation notes:

- Reuse the existing `Serial.begin(115200)` from `setup()`.
- Maintain a small input buffer, for example 96 bytes.
- Read from `Serial.available()` without blocking.
- Process a command only after `\n`.
- Reject overlong lines with `ERR 1002 LINE_TOO_LONG`.
- Keep all response generation in one small helper.
- Avoid `delay()` in serial parsing; dome movement code already contains command pulse delays.

Suggested errors:

| Code | Meaning |
| --- | --- |
| `1000` | Unknown command |
| `1001` | Device error |
| `1002` | Line too long |
| `1003` | Bad protocol prefix |
| `1035` | Invalid operation for current state |

Implemented command examples:

```text
> KDB1 PING
< OK PONG KDB1

> KDB1 INFO
< OK NAME=KalecDome PROTO=KDB1 FW=1.0 DEVICE=DOME

> KDB1 STATE
< OK STATE=CLOSED CMD=IDLE INPUT=CLOSE MOVING=0 ERROR=0

> KDB1 OPEN
< OK CMD=OPEN

> KDB1 CLOSE
< OK CMD=CLOSE

> KDB1 HALT
< OK CMD=HALT

> KDB1 CONFIG?
< OK OPEN_RELAY=25 CLOSE_RELAY=26 HALT_RELAY=32 OPEN_INPUT=35 CLOSE_INPUT=34 TIMEOUT=300
```

## ASCOM Driver Architecture

Project type:

- Windows ASCOM Dome driver.
- C#.
- .NET Framework 4.8.
- Built with ASCOM Platform 6.6 developer components.
- COM-registered local driver using ASCOM driver templates where possible.

Driver identity:

- ProgID: `ASCOM.KalecDome.Dome`
- Display name: `Kalec Dome Serial`
- Device type: `Dome`

Internal layers:

| Layer | Responsibility |
| --- | --- |
| `DomeDriver` | ASCOM interface implementation and COM registration surface |
| `DomeController` | Maps ASCOM methods/properties to transport commands |
| `SerialTransport` | Owns `System.IO.Ports.SerialPort`, timeouts, reconnect, command lock |
| `ProtocolParser` | Parses `OK` / `ERR` response lines and typed fields |
| `ProfileSettings` | Stores COM port, baud, trace option, command timeout |
| `SetupDialog` | Lets user select/test COM port |

Threading:

- Serialize all COM port access with a single lock.
- Never allow concurrent serial commands.
- Keep ASCOM properties fast by using `STATE` polling with a short timeout.
- Throw ASCOM exceptions on serial timeout or protocol error.

## ASCOM Dome Method Mapping

| ASCOM member | Driver behavior |
| --- | --- |
| `Connected get` | Return internal connection state |
| `Connected set true` | Open COM port, send `PING`, send `INFO` |
| `Connected set false` | Close COM port |
| `Name` | `Kalec Dome Serial` |
| `Description` | `Serial ASCOM driver for Kalec ESP32 dome controller` |
| `DriverInfo` | Include driver version and protocol version |
| `DriverVersion` | Semantic version, start with `0.1.0` |
| `InterfaceVersion` | `2` for ASCOM Platform 6.6 compatibility |
| `ShutterStatus` | Send `STATE`, map firmware state to ASCOM enum |
| `OpenShutter()` | Send `OPEN` |
| `CloseShutter()` | Send `CLOSE` |
| `AbortSlew()` | Send `HALT` |
| `CanSetShutter` | `true` |
| `Slewing` | `true` for `OPENING` or `CLOSING` |
| `CanFindHome` | `false` |
| `CanPark` | `false` |
| `CanSetAltitude` | `false` |
| `CanSetAzimuth` | `false` |
| `CanSetPark` | `false` |
| `CanSlave` | `false` |
| `CanSyncAzimuth` | `false` |
| Unsupported movement/position methods | Throw ASCOM `MethodNotImplementedException` |
| Unsupported position properties | Throw ASCOM `PropertyNotImplementedException` |

For a later `IDomeV3` facade, keep connection operations inside `DomeController` so async connect/disconnect semantics can wrap the same serial connect/test sequence.

## Driver Setup Dialog

Fields:

- COM port dropdown.
- Baud rate, default `115200`; advanced setting.
- Test connection button.
- Trace logging checkbox.
- Timeout setting, default `3000 ms`.

Test flow:

1. Open selected port.
2. Send `KDB1 PING`.
3. Send `KDB1 INFO`.
4. Show device name, firmware version, and protocol.
5. Save settings only after successful test, unless the user explicitly overrides in the dialog.

## Validation and Test Plan

Firmware:

- `pio run`
- `pio run --target buildfs`
- Serial terminal manual tests:
  - `KDB1 PING`
  - `KDB1 INFO`
  - `KDB1 STATE`
  - `KDB1 OPEN`
  - `KDB1 CLOSE`
  - `KDB1 HALT`

Driver:

- Unit test protocol parser with representative `OK` and `ERR` lines.
- Unit test ASCOM state mapping.
- Manual setup dialog test against ESP32.
- ASCOM Diagnostics device selection.
- ASCOM Conform test for Dome behavior.
- N.I.N.A. connection smoke test.

Hardware safety checks:

- Verify OPEN command pulses only GPIO 25.
- Verify CLOSE command pulses only GPIO 26.
- Verify HALT pulls GPIO 32 high and clears open/close relays.
- Verify state reads map GPIO 35/34 to open/closed/error consistently.
- Verify repeated `OPEN` while moving does not re-trigger a relay pulse.

## Implementation Milestones

1. Firmware serial protocol skeleton:
   - Add `serialControl.h`.
   - Support `PING`, `INFO`, `STATE`.
   - Verify with serial monitor.

2. Firmware command execution:
   - Add `OPEN`, `CLOSE`, `HALT`, `CONFIG?`.
   - Verify relay behavior and no blocking parser issues.

3. Driver scaffold:
   - Create ASCOM Dome driver project.
   - Add profile settings and setup dialog.
   - Implement `SerialTransport`.

4. Driver command mapping:
   - Implement connection, status, open, close, halt.
   - Add parser and mapping tests.

5. Compatibility testing:
   - ASCOM Diagnostics.
   - ASCOM Conform.
   - N.I.N.A. or other ASCOM 6.6+ client.

## Open Design Decisions

- Whether to keep the driver serial-only or add optional Alpaca-over-WiFi fallback later.
- Whether firmware pin configuration should remain stored in `domeconfig.txt` or be fully replaced by fixed GPIO constants.
- Whether the ASCOM driver should expose a polling interval setting or always poll on demand.
- Whether the driver installer should be WiX/MSI or a simpler developer registration script for early testing.
