#ifndef DOME_SERVER
#define DOME_SERVER


void domeWebServer(){

    server.on("/api/dome-getconfig",               HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        response->print("{\"dome\":{ \"pinstart\":");
        response->print(Config.dome.pinStart);
        response->print(",\"pinclosestart\":");
        response->print(Config.dome.pinCloseStart);
        response->print(",\"pinhalt\":");
        response->print(Config.dome.pinHalt);
        response->print(",\"pinopen\":");
        response->print(Config.dome.pinOpen);
        response->print(",\"pinclose\":");
        response->print(Config.dome.pinClose);
        response->print(",\"pinrain\":");
        response->print(Config.dome.pinRainSensor);
        response->print(",\"tout\":");
        response->print(Config.dome.movingTimeOut);
        response->print(",\"enautoclose\":");
        Config.dome.enAutoClose ? response->print("true") : response->print("false");
        response->print(",\"autoclose\":");
        response->print(Config.dome.autoCloseTimeOut);
        response->print("}}");

        request->send(response);
    });

    AsyncCallbackJsonWebHandler *domecfg = new AsyncCallbackJsonWebHandler("/api/dome-saveconfig", [](AsyncWebServerRequest * request, JsonVariant & json) {
        JsonDocument doc;
        doc = json.as<JsonObject>();
        Config.dome.pinStart = PIN_OPEN_START;
        Config.dome.pinCloseStart = PIN_CLOSE_START;
        Config.dome.pinHalt = PIN_HALT_START;
        Config.dome.pinOpen = PIN_OPEN;
        Config.dome.pinClose = PIN_CLOSE;
        Config.dome.pinRainSensor = PIN_RAIN_SENSOR;
        
        Config.dome.movingTimeOut = doc["tout"];
        Config.dome.enAutoClose = doc["enautoclose"];
        Config.dome.autoCloseTimeOut = doc["autoclose"];
        Config.save.dome.execute = true;
        request->send(200, "application/json", "{\"accept\": \"ok\"}");
    });

    server.on("/api/dome-cmd",               HTTP_PUT, [](AsyncWebServerRequest *request) {
        if (request->hasParam("cmd")){
            int cmd;
            cmd = request->getParam("cmd")->value().toInt();
            switch (cmd) {
                case 1:
                    if(Dome.ShutterState != ShOpen){
                    Dome.ShutterCommand = CmdOpen;
                    request->send(200, "application/json", "{\"error\":0}");
                    } else { request->send(200, "application/json", "{\"error\":1}"); }
                    break;

                case 2:
                    if(Dome.ShutterState != ShClose){
                        Dome.ShutterCommand = CmdClose;
                        request->send(200, "application/json", "{\"error\":0}");
                    } else { request->send(200, "application/json", "{\"error\":2}"); }
                    break;

                case 3:
                    Dome.ShutterCommand = CmdHalt;
                    Dome.Cycle = 100;
                    request->send(200, "application/json", "{\"error\":0}");
                    break;
                default:
                    request->send(200, "application/json", "{\"error\":3}");
                    break;
            }
        } else {
            request->send(200, "application/json", "{\"error\":3}");
        }
    });


    server.on("/api/dome",               HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncResponseStream *response = request->beginResponseStream("application/json");
        Dome.lastCommunicationMillis  = millis();
        response->printf("{\"dome\":{ \"actualState\":");
        response->print(Dome.ShutterState);
        response->print(",\"lastCommand\":");
        response->print(Dome.LastDomeCommand);
        response->print("}");
        response->print("}");
        request->send(response);
    });


    server.addHandler(domecfg);

    server.serveStatic("/domeconfig.txt", SPIFFS, "/domeconfig.txt");
}

#endif
