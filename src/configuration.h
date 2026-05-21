#ifndef CONFIGURATION
#define CONFIGURATION



void saveBoardConfig(){
    String datasetup;
    JsonDocument doc;

    doc["alpRemPort"] = Config.alpacaPort.remotePort;
    doc["alpPort"] = Config.alpacaPort.alpacaPort;

    serializeJson(doc, datasetup);
    File file = SPIFFS.open("/config.txt", FILE_WRITE);
    file.print(datasetup);
    file.close();
}


void saveConfig(){

    if(Config.save.board.execute){
        saveBoardConfig();
    }
    
    #ifdef DOME 
    if(Config.save.dome.execute){
        saveDomeConfig();
    }
    #endif

    Config.save.dome.execute = false;

    if(Config.save.dome.restartNeeded || Config.save.board.restartNeeded){
        Serial.println("restarting...");
        ESP.restart();
    }

}

#endif
