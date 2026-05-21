#ifndef DOME_SERIAL_CONTROL
#define DOME_SERIAL_CONTROL

#define DOME_SERIAL_PROTOCOL "KDB1"
#define DOME_SERIAL_BUFFER_SIZE 96
#define DOME_FIRMWARE_VERSION "1.0"

char domeSerialBuffer[DOME_SERIAL_BUFFER_SIZE];
unsigned int domeSerialBufferIndex = 0;
bool domeSerialDiscardLine = false;

const char *domeStateName() {
    switch (Dome.ShutterState) {
        case ShOpen:
            return "OPEN";
        case ShClose:
            return "CLOSED";
        case ShOpening:
            return "OPENING";
        case ShClosing:
            return "CLOSING";
        case ShError:
        default:
            return "ERROR";
    }
}

const char *domeCommandName() {
    switch (Dome.ShutterCommand) {
        case CmdOpen:
            return "OPEN";
        case CmdClose:
            return "CLOSE";
        case CmdHalt:
            return "HALT";
        case Idle:
        default:
            return "IDLE";
    }
}

const char *domeInputName() {
    switch (Dome.ShutterInputState) {
        case ShOnlyClose:
            return "CLOSE";
        case ShOnlyOpen:
            return "OPEN";
        case ShInAll:
            return "BOTH";
        case ShInNoOne:
        default:
            return "NONE";
    }
}

bool domeIsMoving() {
    return Dome.ShutterState == ShOpening ||
           Dome.ShutterState == ShClosing ||
           Dome.ShutterCommand != Idle;
}

void domeSerialOk(const char *message) {
    Serial.print(F("OK "));
    Serial.println(message);
}

void domeSerialErr(unsigned int code, const char *message) {
    Serial.print(F("ERR "));
    Serial.print(code);
    Serial.print(F(" "));
    Serial.println(message);
}

void domeSerialState() {
    domeInputState();
    Serial.print(F("OK STATE="));
    Serial.print(domeStateName());
    Serial.print(F(" CMD="));
    Serial.print(domeCommandName());
    Serial.print(F(" INPUT="));
    Serial.print(domeInputName());
    Serial.print(F(" MOVING="));
    Serial.print(domeIsMoving() ? 1 : 0);
    Serial.print(F(" ERROR="));
    Serial.println(Dome.ShutterState == ShError ? 1 : 0);
}

void domeSerialConfig() {
    Serial.print(F("OK OPEN_RELAY="));
    Serial.print(PIN_OPEN_START);
    Serial.print(F(" CLOSE_RELAY="));
    Serial.print(PIN_CLOSE_START);
    Serial.print(F(" HALT_RELAY="));
    Serial.print(PIN_HALT_START);
    Serial.print(F(" OPEN_INPUT="));
    Serial.print(PIN_OPEN);
    Serial.print(F(" CLOSE_INPUT="));
    Serial.print(PIN_CLOSE);
    Serial.print(F(" TIMEOUT="));
    Serial.println(300);
}

void domeSerialOpen() {
    if (Dome.ShutterCommand != Idle || Dome.ShutterState == ShOpening || Dome.ShutterState == ShClosing || Dome.ShutterState == ShOpen) {
        domeSerialErr(1035, "ALREADY_OPEN_OR_MOVING");
        return;
    }
    Dome.lastCommunicationMillis = millis();
    Dome.ShutterCommand = CmdOpen;
    domeSerialOk("CMD=OPEN");
}

void domeSerialClose() {
    if (Dome.ShutterCommand != Idle || Dome.ShutterState == ShOpening || Dome.ShutterState == ShClosing || Dome.ShutterState == ShClose) {
        domeSerialErr(1035, "ALREADY_CLOSED_OR_MOVING");
        return;
    }
    Dome.lastCommunicationMillis = millis();
    Dome.ShutterCommand = CmdClose;
    domeSerialOk("CMD=CLOSE");
}

void domeSerialHalt() {
    Dome.lastCommunicationMillis = millis();
    Dome.ShutterCommand = CmdHalt;
    Dome.Cycle = 100;
    domeSerialOk("CMD=HALT");
}

void domeSerialProcessLine(char *line) {
    String request = String(line);
    request.trim();
    if (request.length() == 0) {
        return;
    }

    request.toUpperCase();
    if (!request.startsWith(F(DOME_SERIAL_PROTOCOL))) {
        domeSerialErr(1003, "BAD_PROTOCOL_PREFIX");
        return;
    }

    String command = request.substring(strlen(DOME_SERIAL_PROTOCOL));
    command.trim();
    if (command == F("PING")) {
        domeSerialOk("PONG KDB1");
    } else if (command == F("INFO")) {
        domeSerialOk("NAME=KalecDome PROTO=KDB1 FW=" DOME_FIRMWARE_VERSION " DEVICE=DOME");
    } else if (command == F("STATE")) {
        domeSerialState();
    } else if (command == F("OPEN")) {
        domeSerialOpen();
    } else if (command == F("CLOSE")) {
        domeSerialClose();
    } else if (command == F("HALT")) {
        domeSerialHalt();
    } else if (command == F("CONFIG?")) {
        domeSerialConfig();
    } else {
        domeSerialErr(1000, "UNKNOWN_COMMAND");
    }
}

void domeSerialSetup() {
    domeSerialBufferIndex = 0;
    domeSerialDiscardLine = false;
}

void domeSerialLoop() {
    while (Serial.available() > 0) {
        char c = Serial.read();
        if (c == '\r') {
            continue;
        }
        if (c == '\n') {
            if (domeSerialDiscardLine) {
                domeSerialDiscardLine = false;
                domeSerialBufferIndex = 0;
                continue;
            }
            domeSerialBuffer[domeSerialBufferIndex] = '\0';
            domeSerialProcessLine(domeSerialBuffer);
            domeSerialBufferIndex = 0;
            continue;
        }
        if (domeSerialDiscardLine) {
            continue;
        }
        if (domeSerialBufferIndex >= DOME_SERIAL_BUFFER_SIZE - 1) {
            domeSerialBufferIndex = 0;
            domeSerialDiscardLine = true;
            domeSerialErr(1002, "LINE_TOO_LONG");
            continue;
        }
        domeSerialBuffer[domeSerialBufferIndex++] = c;
    }
}

#endif
