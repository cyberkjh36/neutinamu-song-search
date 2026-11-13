#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace p2 {
static const char* const keys[] = {"digit_0","digit_1","digit_2","digit_3","digit_4","digit_5","digit_6","digit_7","digit_8","digit_9","reserve","start","cancel","pause","key_up","key_down"};
inline int keyIndex(const std::string& key) {
  for (int i=0;i<16;i++) if (key==keys[i]) return i;
  return -1;
}
inline bool hexId(const std::string& value, size_t length) {
  if (value.size()!=length) return false;
  for (char c:value) if (!((c>='0'&&c<='9')||(c>='a'&&c<='f'))) return false;
  return true;
}
inline bool songNumber(const std::string& n) {
  if(n.empty()||n.size()>5||n[0]<'1'||n[0]>'9') return false;
  for(char c:n) if(c<'0'||c>'9') return false;
  return true;
}
inline std::vector<int> plan(const std::string& action,const std::string& value) {
  std::vector<int> out;
  if(action=="reserve"&&songNumber(value)) {
    for(char c:value) out.push_back(c-'0');
    out.push_back(10);
  } else if(action=="key") {
    int index=keyIndex(value);if(index>=11) out.push_back(index);
  }
  return out;
}
inline bool validRaw(const std::vector<uint16_t>& raw) {
  if(raw.size()<12||raw.size()>1023) return false;
  uint32_t total=0;
  for(uint16_t value:raw) {if(value<80) return false;total+=value;}
  return total>=5000&&total<=600000;
}
inline bool sameSignal(const std::vector<uint16_t>& a,const std::vector<uint16_t>& b) {
  if(!validRaw(a)||!validRaw(b)||a.size()!=b.size())return false;
  for(size_t i=0;i<a.size();i++) {
    unsigned lo=a[i]<b[i]?a[i]:b[i],hi=a[i]>b[i]?a[i]:b[i];
    if(hi-lo>lo/4+100)return false;
  }
  return true;
}
struct Job {std::string id,action,value;int64_t expires=0;};
struct Receipt {std::string id,status;};
struct Device {
  virtual ~Device()=default;
  virtual bool ready(int key) const=0;
  virtual bool save(const Receipt& receipt)=0;
  virtual bool emit(int key)=0;
  virtual int64_t now() const=0;
};
// Journal before the first pulse. A reboot with "unknown" requires physical review.
// The relay never re-delivers claimed work; the local receipt additionally prevents
// replay of the most recent job after a lost response/reboot.
inline Receipt execute(const Job& job,Device& d,const Receipt& previous,bool enabled) {
  if(!hexId(job.id,32))return {"","failed"};
  if(job.id==previous.id)return previous;
  auto steps=plan(job.action,job.value);
  bool allowed=enabled&&!steps.empty()&&job.expires>d.now()&&job.expires<=d.now()+30000;
  for(int k:steps)if(!d.ready(k))allowed=false;
  Receipt record{job.id,allowed?"unknown":"failed"};
  if(!d.save(record))return {job.id,"unknown"};
  if(!allowed)return record;
  for(int k:steps){
    if(job.expires<=d.now()||!d.emit(k))return record;
  }
  record.status="sent";
  if(!d.save(record))record.status="unknown";
  return record;
}
}
