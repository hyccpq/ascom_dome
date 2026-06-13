#ifndef BOARD_PINS_H
#define BOARD_PINS_H

// ESP32-S3 dome controller board pin map.
// Relay outputs drive isolated trigger inputs for open, close, and stop.
#define PIN_OPEN_START 4
#define PIN_CLOSE_START 5
#define PIN_HALT_START 6

// Limit switch inputs. Wire external pull-ups/pull-downs to match domeInputState().
#define PIN_OPEN 7
#define PIN_CLOSE 8

// Reserved rain sensor header. The input is initialized but not used for
// automatic closing until the hardware polarity is known.
#define PIN_RAIN_SENSOR 9

#endif
