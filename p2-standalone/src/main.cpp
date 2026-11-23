// Experimental ESP32 bridge. No TJ protocol or TIR-1090 codes are assumed.
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>
#include <time.h>
#include <sys/time.h>
#include "command_core.h"
#include "ca_bundle.generated.h"
#include "setup_page.h"

constexpr int RX_PIN=27,TX_PIN=26,SETUP_PIN=0;
const char* ENDPOINT="https://world-karaoke-connect.almondjoy11.chatgpt.site/api/p2";
Preferences prefs;
WebServer web(80);
IRrecv receiver(RX_PIN,1024,15,true);
IRsend sender(TX_PIN);
decode_results decoded;
std::vector<uint16_t> signals[16],firstSample;
bool tested[16]={},sequenceVerified=false,halted=false,storageOK=false;
bool setupMode=false,registered=false,pendingAck=false;
String hostKey,room,setupPassword,csrf,notice="준비 중",ssid,networkPassword;
p2::Receipt receipt;
int learning=-1,frequency=38,lastTest=-1;
bool sequenceTested=false;
uint32_t setupUntil=0,learnUntil=0,lastNetwork=0,buttonSince=0;

String randomHex(size_t count){
  String out;out.reserve(count*2);
  for(size_t i=0;i<count;i++){uint8_t b=esp_random();char hex[3];snprintf(hex,3,"%02x",b);out+=hex;}
  return out;
}
bool saveString(const char* key,const String& value){
  bool ok=prefs.putString(key,value)==value.length()&&prefs.getString(key)==value;
  if(!ok){storageOK=false;halted=true;notice="저장 오류: 전송을 중단했습니다.";}
  return ok;
}
bool saveBool(const char* key,bool value){
  bool ok=prefs.putBool(key,value)==1&&prefs.getBool(key,!value)==value;
  if(!ok){storageOK=false;halted=true;notice="저장 오류: 전송을 중단했습니다.";}
  return ok;
}
bool saveProfile(){
  DynamicJsonDocument doc(56000);
  doc["frequency"]=frequency;doc["verified"]=sequenceVerified;
  auto a=doc.createNestedArray("keys");
  for(int i=0;i<16;i++){
    auto o=a.createNestedObject();o["tested"]=tested[i];auto raw=o.createNestedArray("raw");
    for(auto n:signals[i])raw.add(n);
  }
  if(doc.overflowed()){storageOK=false;halted=true;return false;}
  String json;serializeJson(doc,json);return saveString("profile",json);
}
bool loadProfile(){
  String text=prefs.getString("profile");if(text.isEmpty())return true;
  DynamicJsonDocument doc(56000);if(deserializeJson(doc,text))return false;
  frequency=doc["frequency"]|0;
  if(frequency<30||frequency>60||doc["keys"].size()!=16)return false;
  sequenceVerified=doc["verified"]|false;
  for(int i=0;i<16;i++){
    auto o=doc["keys"][i];if(!o["raw"].is<JsonArray>())return false;
    for(JsonVariant v:o["raw"].as<JsonArray>()){
      if(!v.is<unsigned int>()||v.as<unsigned int>()>65535)return false;
      signals[i].push_back(v.as<uint16_t>());
    }
    tested[i]=o["tested"]|false;
    if(!signals[i].empty()&&!p2::validRaw(signals[i]))return false;
    if(tested[i]&&signals[i].empty())return false;
  }
  return true;
}
bool sendOne(int key){
  if(key<0||key>=16||!p2::validRaw(signals[key]))return false;
  receiver.disableIRIn();
  sender.sendRaw(signals[key].data(),signals[key].size(),frequency);
  delay(350);receiver.enableIRIn();return true;
}
bool allRequired(){for(int i=0;i<=10;i++)if(!tested[i]||!p2::validRaw(signals[i]))return false;return true;}
struct Hardware: p2::Device {
  bool ready(int key) const override{return key>=0&&key<16&&tested[key]&&p2::validRaw(signals[key]);}
  int64_t now() const override{timeval value;gettimeofday(&value,nullptr);return static_cast<int64_t>(value.tv_sec)*1000+value.tv_usec/1000;}
  bool emit(int key) override{return sendOne(key);}
  bool save(const p2::Receipt& r) override{
    StaticJsonDocument<256> doc;doc["id"]=r.id;doc["status"]=r.status;
    String text;serializeJson(doc,text);
    if(!saveString("receipt",text))return false;
    receipt=r;pendingAck=true;return true;
  }
} hardware;

// HTTP accepts only the fixed HTTPS service, verifies CA + hostname and never retries
// a physical action. Only heartbeat and idempotent acknowledgements may be retried.
bool relay(const char* op,JsonDocument& request,JsonDocument& response){
  if(WiFi.status()!=WL_CONNECTED||time(nullptr)<1767225600)return false;
  request["op"]=op;request["key"]=hostKey;request["room"]=room;
  String body;serializeJson(request,body);
  WiFiClientSecure tls;tls.setCACertBundle(kCaBundle);tls.setHandshakeTimeout(5);
  HTTPClient http;http.setConnectTimeout(5000);http.setTimeout(5000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if(!http.begin(tls,ENDPOINT))return false;
  http.addHeader("Content-Type","application/json");
  int code=http.POST(body);bool ok=false;
  if(code==200&&http.getSize()<=8192){
    String answer=http.getString();
    if(answer.length()<=8192&&!deserializeJson(response,answer))ok=response["ok"]==true;
  }
  http.end();return ok;
}
void networkTick(){
  if(!storageOK||WiFi.status()!=WL_CONNECTED||time(nullptr)<1767225600)return;
  StaticJsonDocument<2048> request,response;
  if(!registered){
    request["name"]="느티나무 P2 · 독립 장치";
    if(relay("create",request,response)){
      String code=response["room"]|"";
      bool valid=code.length()==8;for(char c:code)if(c<'0'||c>'9')valid=false;
      if(valid&&(room.isEmpty()||code==room)&&saveString("room",code)){
        room=code;registered=true;notice="중계 연결됨. 실제 P2 시험 후 사용할 수 있습니다.";
      }else{halted=true;notice="기존 연결번호와 달라 연결을 중단했습니다.";}
    }else notice="인터넷·시간·보안 연결 확인 중";
    return;
  }
  if(pendingAck&&!receipt.id.empty()){
    request["id"]=receipt.id;request["status"]=receipt.status;
    if(relay("ack",request,response))pendingAck=false;
    request.clear();response.clear();
  }
  auto caps=request.createNestedArray("capabilities");
  bool enabled=!setupMode&&!halted&&sequenceVerified&&allRequired();
  if(enabled)for(int i=0;i<16;i++)if(hardware.ready(i))caps.add(p2::keys[i]);
  if(!relay("poll",request,response)){notice="인터넷 연결 확인 중. 이전 신호는 다시 보내지 않습니다.";return;}
  if(response["job"].is<JsonObject>()){
    auto j=response["job"];auto c=j["command"];
    p2::Job job{j["id"]|"",c["action"]|"",c["action"]=="reserve"?(c["number"]|""):(c["key"]|""),j["expires"]|int64_t(0)};
    auto result=p2::execute(job,hardware,receipt,enabled);
    if(result.id.empty())return;
    receipt=result;pendingAck=true;
    if(result.status=="unknown"){
      halted=true;saveBool("halted",true);notice="결과 불명: P2 화면을 확인한 뒤 설정에서 재개하세요.";
    }else if(result.status=="sent")notice="파형 송출 완료. 실제 예약 여부는 P2 화면에서 확인하세요.";
  }
}

bool localSetup(){
  auto ip=web.client().remoteIP();
  return setupMode&&ip[0]==192&&ip[1]==168&&ip[2]==4&&ip[3]!=0&&ip[3]!=255&&web.hostHeader()=="192.168.4.1";
}
void jsonReply(JsonDocument& doc){String body;serializeJson(doc,body);web.sendHeader("Cache-Control","no-store");web.send(200,"application/json; charset=utf-8",body);}
void reply(bool ok,const String& message){StaticJsonDocument<1024> doc;doc["ok"]=ok;doc["message"]=message;jsonReply(doc);}
void closeSetup(){
  setupMode=false;learning=-1;firstSample.clear();WiFi.softAPdisconnect(true);WiFi.mode(WIFI_STA);notice="설정 창을 닫았습니다.";
}
void startSetup(){
  setupMode=true;setupUntil=millis()+600000;csrf=randomHex(16);
  WiFi.mode(WIFI_AP_STA);
  String ap="P2-Setup-"+String(static_cast<uint32_t>(ESP.getEfuseMac()),HEX).substring(0,6);
  WiFi.softAP(ap.c_str(),setupPassword.c_str(),1,false,1);
  Serial.println("\nP2 setup Wi-Fi: "+ap);Serial.println("Setup password: "+setupPassword);
  Serial.println("Setup URL: http://192.168.4.1 (10 minutes)");
  notice="설정 모드: 손님 리모컨은 잠시 중단됩니다.";
}
void statusPage(){
  if(!localSetup()){web.send(403);return;}
  StaticJsonDocument<3072> doc;doc["room"]=room;doc["online"]=registered&&WiFi.status()==WL_CONNECTED;
  doc["ready"]=sequenceVerified&&allRequired()&&!halted;doc["halted"]=halted;
  doc["notice"]=notice;doc["learning"]=learning;doc["frequency"]=frequency;doc["storageOK"]=storageOK;
  auto a=doc.createNestedArray("keys");
  for(int i=0;i<16;i++){auto o=a.createNestedObject();o["key"]=p2::keys[i];o["learned"]=!signals[i].empty();o["tested"]=tested[i];}
  jsonReply(doc);
}
void actionPage(){
  if(!localSetup()||web.header("X-P2-Setup")!=csrf){web.send(403);return;}
  if(!storageOK){reply(false,"저장 오류를 해결한 뒤 사용하세요.");return;}
  if(web.arg("plain").length()>1024){web.send(413);return;}
  StaticJsonDocument<2048> data;if(deserializeJson(data,web.arg("plain"))){reply(false,"잘못된 요청입니다.");return;}
  String action=data["action"]|"";int key=p2::keyIndex(data["key"]|"");
  setupUntil=millis()+600000;
  if(action=="wifi"){
    String s=data["ssid"]|"",p=data["password"]|"";
    if(s.length()<1||s.length()>32||p.length()<8||p.length()>63){reply(false,"2.4GHz 와이파이 이름과 암호(8~63자)를 확인하세요.");return;}
    if(!saveString("ssid",s)||!saveString("wifiPass",p)){reply(false,notice);return;}
    ssid=s;networkPassword=p;registered=false;
    WiFi.begin(ssid.c_str(),networkPassword.c_str());configTime(0,0,"time.cloudflare.com","pool.ntp.org");
    reply(true,"와이파이에 연결 중입니다.");return;
  }
  if(action=="frequency"){
    int value=data["value"]|0;
    if(value<30||value>60){reply(false,"주파수는 30~60kHz 범위로 입력하세요.");return;}
    frequency=value;sequenceVerified=false;sequenceTested=false;lastTest=-1;
    for(bool& t:tested)t=false;
    reply(saveProfile(),"주파수를 변경했습니다. 모든 버튼을 다시 시험해야 합니다.");return;
  }
  if(action=="learn"&&key>=0){
    learning=key;firstSample.clear();learnUntil=millis()+30000;receiver.resume();
    sequenceVerified=false;sequenceTested=false;lastTest=-1;tested[key]=false;
    if(!saveProfile()){reply(false,notice);return;}
    notice="리모컨의 해당 버튼을 짧게 두 번 누르세요. 누를 때마다 손을 떼세요.";reply(true,notice);return;
  }
  if(action=="test"&&key>=0){
    learning=-1;firstSample.clear();lastTest=-1;sequenceTested=false;
    bool ok=sendOne(key);if(ok)lastTest=key;
    reply(ok,ok?"P2에서 해당 버튼이 정확히 한 번 동작했는지 확인하고 ‘확인’을 누르세요.":"먼저 신호를 학습하세요.");return;
  }
  if(action=="confirm"&&key>=0&&lastTest==key){
    tested[key]=true;lastTest=-1;sequenceVerified=false;reply(saveProfile(),"이 버튼의 현장 확인을 기록했습니다.");return;
  }
  if(action=="test-number"){
    std::string number=data["number"]|"";
    if(!p2::songNumber(number)||!allRequired()){reply(false,"숫자 0~9와 예약 버튼을 모두 확인한 뒤 곡번호를 입력하세요.");return;}
    learning=-1;firstSample.clear();sequenceVerified=false;sequenceTested=false;
    if(!saveProfile()){reply(false,notice);return;}
    for(int k:p2::plan("reserve",number))if(!sendOne(k)){reply(false,"신호 송출에 실패했습니다.");return;}
    sequenceTested=true;reply(true,"P2에 해당 곡이 정확히 한 번 예약됐는지 확인하세요.");return;
  }
  if(action=="enable"&&sequenceTested&&allRequired()&&!halted){
    sequenceVerified=true;reply(saveProfile(),"예약 시험 확인을 기록했습니다. ‘설정 종료’를 누르면 손님이 사용할 수 있습니다.");return;
  }
  if(action=="resume"&&halted){
    // Operator has explicitly checked the physical number field and reservation list.
    if(!saveBool("halted",false)){reply(false,notice);return;}
    if(receipt.status=="unknown"&&!saveString("reviewed",String(receipt.id.c_str()))){reply(false,notice);return;}
    halted=false;reply(true,"이전 요청은 재전송하지 않습니다. 필요한 곡은 다시 선택하세요.");return;
  }
  if(action=="close"){reply(true,"설정을 종료합니다. 매장 와이파이로 돌아간 뒤 손님 화면을 여세요.");delay(50);closeSetup();return;}
  reply(false,"학습·시험·확인 순서를 확인하세요.");
}
void learnTick(){
  if(learning<0)return;
  if(static_cast<int32_t>(millis()-learnUntil)>=0){learning=-1;firstSample.clear();notice="학습 시간이 지났습니다. 다시 눌러 주세요.";return;}
  if(!receiver.decode(&decoded))return;
  std::vector<uint16_t> raw;
  bool ok=!decoded.overflow&&!decoded.repeat&&decoded.rawlen>12&&decoded.rawlen<=1024;
  if(ok)for(uint16_t i=1;i<decoded.rawlen;i++){
    uint32_t us=static_cast<uint32_t>(decoded.rawbuf[i])*kRawTick;
    if(us>65535){ok=false;break;}raw.push_back(us);
  }
  receiver.resume();
  if(!ok||!p2::validRaw(raw)){notice="짧은 반복 신호 또는 불완전한 신호입니다. 버튼을 짧게 누르고 손을 떼세요.";return;}
  if(firstSample.empty()){firstSample=raw;notice="첫 신호를 받았습니다. 같은 버튼을 한 번 더 짧게 누르세요.";return;}
  if(!p2::sameSignal(firstSample,raw)){firstSample.clear();notice="두 신호가 다릅니다. 같은 버튼을 두 번 다시 누르세요.";return;}
  signals[learning]=firstSample;tested[learning]=false;learning=-1;firstSample.clear();
  if(saveProfile())notice="신호를 저장했습니다. 시험 후 P2 화면을 확인하세요.";
}
void setup(){
  Serial.begin(115200);pinMode(SETUP_PIN,INPUT_PULLUP);WiFi.mode(WIFI_STA);
  storageOK=prefs.begin("neuti-p2",false);
  if(!storageOK){halted=true;notice="설정 저장소를 열지 못했습니다.";return;}
  hostKey=prefs.getString("host");setupPassword=prefs.getString("setupPass");room=prefs.getString("room");
  if(hostKey.isEmpty()){hostKey=randomHex(32);saveString("host",hostKey);}
  if(!p2::hexId(hostKey.c_str(),64)){storageOK=false;halted=true;return;}
  if(setupPassword.isEmpty()){setupPassword=randomHex(8);saveString("setupPass",setupPassword);}
  if(!loadProfile()){storageOK=false;halted=true;notice="신호 설정을 읽을 수 없습니다. 자동 초기화하지 않았습니다.";}
  halted=halted||prefs.getBool("halted",false);
  String record=prefs.getString("receipt");
  if(!record.isEmpty()){
    StaticJsonDocument<256> doc;
    if(deserializeJson(doc,record)){storageOK=false;halted=true;}
    else{
      receipt={doc["id"]|"",doc["status"]|""};
      if(!p2::hexId(receipt.id,32)||(receipt.status!="sent"&&receipt.status!="unknown"&&receipt.status!="failed")){storageOK=false;halted=true;}
      if(receipt.status=="unknown"&&prefs.getString("reviewed")!=receipt.id.c_str())halted=true;
      // create() resolves requests left by the previous boot. Keep the receipt
      // for duplicate suppression and uncertainty review, not as a boot-time ACK.
      pendingAck=false;
    }
  }
  sender.begin();receiver.setUnknownThreshold(12);receiver.enableIRIn();
  const char* headers[]={"X-P2-Setup"};web.collectHeaders(headers,1);
  web.on("/",HTTP_GET,[]{
    if(!localSetup()){web.send(403);return;}
    String page=FPSTR(SETUP_PAGE);page.replace("__CSRF__",csrf);
    web.sendHeader("Cache-Control","no-store");web.sendHeader("X-Frame-Options","DENY");web.send(200,"text/html; charset=utf-8",page);
  });
  web.on("/status",HTTP_GET,statusPage);web.on("/action",HTTP_POST,actionPage);web.onNotFound([]{web.send(404);});web.begin();
  ssid=prefs.getString("ssid");networkPassword=prefs.getString("wifiPass");
  WiFi.setAutoReconnect(true);
  if(!ssid.isEmpty()){WiFi.begin(ssid.c_str(),networkPassword.c_str());configTime(0,0,"time.cloudflare.com","pool.ntp.org");}
  else startSetup();
  Serial.println("Hold BOOT for 3 seconds to open setup; credentials appear here. No PC is required during normal operation.");
}
void loop(){
  if(digitalRead(SETUP_PIN)==LOW){
    if(!buttonSince)buttonSince=millis();
    if(static_cast<uint32_t>(millis()-buttonSince)>3000&&!setupMode)startSetup();
  }else buttonSince=0;
  if(setupMode){web.handleClient();learnTick();if(static_cast<int32_t>(millis()-setupUntil)>=0)closeSetup();}
  // Avoid blocking a learning capture with TLS handshakes.
  if(learning<0&&static_cast<uint32_t>(millis()-lastNetwork)>3000){lastNetwork=millis();networkTick();}
  delay(5);
}
