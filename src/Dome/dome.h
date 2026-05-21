#ifndef DOME_HAND
#define DOME_HAND

#define PIN_OPEN_START 25
#define PIN_CLOSE_START 26
#define PIN_HALT_START 32
#define PIN_OPEN 35
#define PIN_CLOSE 34

bool debug = false;
unsigned long oldCy;
unsigned long oldMillis;
unsigned long ShMoveTimeOut;
unsigned long ShMoveTimeOutAck;

void initDomeConfig() {
    JsonDocument doc;
    File file = SPIFFS.open("/domeconfig.txt", FILE_READ);
    if (!file) {
        Serial.println("Reading Dome config error");
        return;
    }
    DeserializationError error = deserializeJson(doc, file);
    if (error) {
        Serial.print(F("deserializeJson() failed: "));
        Serial.println(error.c_str());
        return;
    }
    Config.dome.pinStart = doc["pinstart"];
    Config.dome.pinHalt = doc["pinhalt"];
    Config.dome.pinOpen = doc["pinopen"];
    Config.dome.pinClose = doc["pinclose"];
    Config.dome.movingTimeOut = doc["tout"];
    Config.dome.enAutoClose = doc["enautoclose"];
    Config.dome.autoCloseTimeOut = doc["autoclose"];
    file.close();
    Config.read.dome.isValid = true;

    pinMode(PIN_OPEN_START, OUTPUT);
    pinMode(PIN_CLOSE_START, OUTPUT);
    pinMode(PIN_HALT_START, OUTPUT);
    pinMode(PIN_OPEN, INPUT);
    pinMode(PIN_CLOSE, INPUT);

//    pinMode(Config.dome.pinStart, OUTPUT);
//    pinMode(Config.dome.pinHalt, OUTPUT);
//    pinMode(Config.dome.pinOpen, INPUT);
//    pinMode(Config.dome.pinClose, INPUT);
}

void saveDomeConfig() {
    String datasetup;
    JsonDocument doc;
    doc["pinstart"] = Config.dome.pinStart;
    doc["pinhalt"] = Config.dome.pinHalt;
    doc["pinopen"] = Config.dome.pinOpen;
    doc["pinclose"] = Config.dome.pinClose;
    doc["tout"] = Config.dome.movingTimeOut;
    doc["enautoclose"] = Config.dome.enAutoClose;
    doc["autoclose"] = Config.dome.autoCloseTimeOut;
    serializeJson(doc, datasetup);
    File file = SPIFFS.open("/domeconfig.txt", FILE_WRITE);
    file.print(datasetup);
    file.close();
}

void domeOpen() {
    digitalWrite(PIN_OPEN_START, HIGH);
    delay(1000);
    digitalWrite(PIN_OPEN_START, LOW);

}

void domeClose() {
    digitalWrite(PIN_CLOSE_START, HIGH);
    delay(1000);
    digitalWrite(PIN_CLOSE_START, LOW);
}

void demoHalt() {
    digitalWrite(PIN_HALT_START, HIGH);
    digitalWrite(PIN_CLOSE_START, LOW);
    digitalWrite(PIN_OPEN_START, LOW);
}

void domeInputState() {

    // I used enum for input state for making the cycle code more clean
    // 打开状态
    if (digitalRead(PIN_CLOSE) == HIGH && digitalRead(PIN_OPEN) == LOW) {
        Dome.ShutterInputState = ShOnlyOpen;
    }
    // 关闭状态
    if (digitalRead(PIN_CLOSE) == LOW && digitalRead(PIN_OPEN) == HIGH) {
        Dome.ShutterInputState = ShOnlyClose;
    }
    // 限位都是高电平，运动中，或者停止状态
    if (digitalRead(PIN_CLOSE) == HIGH && digitalRead(PIN_OPEN) == HIGH) {
        Dome.ShutterInputState = ShInNoOne;
    }
    // 都是低就是有问题
    if (digitalRead(PIN_CLOSE) == LOW && digitalRead(PIN_OPEN) == LOW) {
        Dome.ShutterInputState = ShInAll;
    }
}

void LastDomeCommandExe() {
    if (Dome.ShutterCommand != Idle) {
        Dome.LastDomeCommand = Dome.ShutterCommand;
    }
}


void domeAutoClose() {

//    if (Dome.ShutterInputState == ShOnlyOpen && Config.dome.enAutoClose) {
//
//        if ((millis() - (Dome.lastCommunicationMillis)) > (Config.dome.autoCloseTimeOut * 1000 * 60)) {
//            Dome.ShutterCommand = CmdClose;
//        }
//
//    }
}

void domehandlerloop() {
    // 超时时间
    ShMoveTimeOut = 300 * 1000;
    domeInputState();
    LastDomeCommandExe();
    // TIMEOUT MOVIMENTAZIONE
    if (Dome.Cycle >= 11 && Dome.Cycle <= 12) {
        if ((millis() - ShMoveTimeOutAck) > ShMoveTimeOut) { //input error I wait 10 sec. before done command
            Dome.Cycle = 100;  //Timeout, HALT
        }
    }


    switch (Dome.Cycle) {
        case 0:
            Dome.MoveRetry = false;
            if (Dome.ShutterInputState == ShOnlyClose) {
                Dome.ShutterState = ShClose;
            } else if (Dome.ShutterInputState == ShOnlyOpen) {
                Dome.ShutterState = ShOpen;
            } else {
                Dome.ShutterState = ShError;
            }
            // 触发打开
            if (Dome.ShutterCommand == CmdOpen) {
                if (Dome.ShutterInputState != ShOnlyOpen) {
                    if (debug) { Serial.println(Dome.Cycle); }
                    Dome.ShutterState = ShOpening;
                    Dome.Cycle = 10;
                } else {

                    Dome.ShutterCommand = Idle;
                }
            }

            // 触发关闭
            if (Dome.ShutterCommand == CmdClose) {
                if (Dome.ShutterInputState != ShOnlyClose) {
                    if (debug) { Serial.println(Dome.Cycle); }
                    Dome.Cycle = 10;
                    Dome.ShutterState = ShClosing;
                } else {
                    Dome.ShutterCommand = Idle;
                    Dome.ShutterState = ShClose;
                }
            }
            // 触发停止
            if (Dome.ShutterCommand == CmdHalt) {
                Dome.Cycle = 100;
            }

            break;

            /* NO OPENING COMMAND IF ROOF IS OPEN SHULD ARRIVE, AND VICE VERSA FOR CLOSING COMMAND, BUT ARE ACCEPTED IF NO/EACH TWO INPUT IS IN (safety first) */
        case 10:
            //Open and close cycle are identical, I just hope to reach the right
            //Pulse to start to the motor, ack millis for time out and
            ShMoveTimeOutAck = millis();
            if (Dome.ShutterCommand == CmdOpen) {
                domeOpen();
            }

            if (Dome.ShutterCommand == CmdClose) {
                domeClose();
            }

            Dome.Cycle++;

            break;

        case 11:  //Take signal end to loose signal
            if ((millis() - ShMoveTimeOutAck) > 1000) { //Wait 1second anyway
                if (Dome.ShutterInputState == ShInAll || Dome.ShutterInputState == ShInNoOne) {
                    digitalWrite(PIN_CLOSE_START, LOW);
                    digitalWrite(PIN_OPEN_START, LOW);
                    ShMoveTimeOutAck = millis();
                    Dome.Cycle++;
                }
            }
            break;

        case 12:  //Sensor Reached
            // INIZIO CHECK APERTUA
            if (Dome.ShutterCommand == CmdOpen) {
                if (Dome.ShutterInputState == ShOnlyOpen) { //As aspected direction!

                    digitalWrite(PIN_OPEN_START, LOW);

                    Dome.ShutterState = ShOpen;
                    Dome.Cycle++;
                    break;
                }
                if (Dome.ShutterInputState == ShOnlyClose) { //OMG wrong direction!
                    if (Dome.MoveRetry == false) {
                        Dome.MoveRetry = true; // just one retry
                        Dome.Cycle = 20;
                    } else {
                        if (debug) { Serial.println("RESET, CmdOpen no ping pong all day, HALT"); }
                        Dome.Cycle = 100;  //no ping pong all day, HALT
                    }
                }

            }

            // FINE CHECK APERTUA


            //INIZIO CHECK CHIUSURA
            if (Dome.ShutterCommand == CmdClose) { //OMG wrong direction!
                if (Dome.ShutterInputState == ShOnlyOpen) {
                    if (!Dome.MoveRetry) {
                        Dome.MoveRetry = true; // just one retry
                        Dome.Cycle = 20;
                    } else {
                        if (debug) { Serial.println("RESET, CmdClose no ping pong all day, HALT"); }
                        Dome.Cycle = 100;  //no ping pong all day, HALT
                    }
                }
                if (Dome.ShutterInputState == ShOnlyClose) { //As aspected direction!

                    digitalWrite(PIN_CLOSE_START, LOW);
                    Dome.ShutterState = ShClose;
                    Dome.Cycle++;
                }
            }
            // FINE CHECK CHIUSURA

            break;

        case 13:
            Dome.MoveRetry = false;
            Dome.ShutterCommand = Idle;
            Dome.Cycle = 0;
            break;


//PING PONG - HALT ASPETTO E RIBADISCO LO START
        case 20:

            ShMoveTimeOutAck = millis();

            digitalWrite(PIN_OPEN_START, LOW);
            digitalWrite(PIN_CLOSE_START, LOW);


            Dome.Cycle++;
            break;

        case 21:
            if ((millis() - ShMoveTimeOutAck) > 1000) { //Wait a second
                digitalWrite(PIN_OPEN_START, LOW);
                digitalWrite(PIN_CLOSE_START, LOW);
                Dome.Cycle++;
                ShMoveTimeOutAck = millis();
            }
            break;

        case 22:
            if ((millis() - ShMoveTimeOutAck) > 5000) { //Wait 5 seconds and restart movement
                Dome.Cycle = 10;
            }
            break;


            /* HALT CYCLE */
        case 100: //halt command for 1sec
            ShMoveTimeOutAck = millis();
            Dome.ShutterState = ShError;
            demoHalt();
            Dome.Cycle++;
            break;

        case 101: //halt command for 1sec
            if ((millis() - ShMoveTimeOutAck) > 1000) { //Setting Output for 1sec
                digitalWrite(PIN_HALT_START, LOW);
                Dome.Cycle++;
            }
            break;

        case 102:
            if (debug) { Serial.println("RESET"); }
            Dome.ShutterCommand = Idle;
            Dome.Cycle = 0;
            Dome.MoveRetry = false;
            break;


        default:
            break;
    }

    domeAutoClose();
}


#include "webserver.h"
#include "alpacaDevices.h"
#include "alpacaManage.h"

void domeServer() {
    DomeAlpacaDevices();
    DomeAlpacaManage();
    domeWebServer();
}

#endif
