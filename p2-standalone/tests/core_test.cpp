#include "command_core.h"
#include <cassert>
#include <iostream>
#include <set>
struct Fake:p2::Device {
  std::set<int> learned;std::vector<int> sent;std::vector<p2::Receipt> journal;
  bool writeOK=true;int failAt=-1,clockStep=0;mutable int64_t clock=100000;
  bool ready(int k)const override{return learned.count(k);}
  bool save(const p2::Receipt& r)override{if(!writeOK)return false;journal.push_back(r);return true;}
  bool emit(int k)override{if(static_cast<int>(sent.size())==failAt)return false;assert(!journal.empty()&&journal.back().status=="unknown");sent.push_back(k);clock+=clockStep;return true;}
  int64_t now()const override{return clock;}
  Fake(){for(int i=0;i<16;i++)learned.insert(i);}
};
int main(){
  const std::string id(32,'a');p2::Job job{id,"reserve","11230",110000};
  {Fake f;auto r=p2::execute(job,f,{},true);assert(r.status=="sent");assert((f.sent==std::vector<int>{1,1,2,3,0,10}));assert(f.journal.front().status=="unknown");}
  {Fake f;f.learned.erase(10);assert(p2::execute(job,f,{},true).status=="failed");assert(f.sent.empty());}
  {Fake f;f.learned.erase(0);assert(p2::execute(job,f,{},true).status=="failed");assert(f.sent.empty());}
  {Fake f;f.writeOK=false;assert(p2::execute(job,f,{},true).status=="unknown");assert(f.sent.empty());}
  {Fake f;f.failAt=2;auto r=p2::execute(job,f,{},true);assert(r.status=="unknown"&&f.sent.size()==2);auto again=p2::execute(job,f,r,true);assert(again.status=="unknown"&&f.sent.size()==2);}
  {Fake f;auto r=p2::execute(job,f,{},true);p2::execute(job,f,r,true);assert(f.sent.size()==6);}
  {Fake f;assert(p2::execute(job,f,{},false).status=="failed");assert(f.sent.empty());}
  {Fake f;auto expired=job;expired.expires=f.now();assert(p2::execute(expired,f,{},true).status=="failed");assert(f.sent.empty());}
  {Fake f;auto future=job;future.expires=f.now()+30001;assert(p2::execute(future,f,{},true).status=="failed");assert(f.sent.empty());}
  {Fake f;f.clockStep=6000;assert(p2::execute(job,f,{},true).status=="unknown");assert(f.sent.size()==2);}
  for(auto number:{"","0","01","123456","1;2","1\n","-1","１２３","123 "}){Fake f;auto invalid=job;invalid.value=number;assert(p2::execute(invalid,f,{},true).status=="failed");assert(f.sent.empty());}
  {Fake f;auto invalid=job;invalid.id="wrong";assert(p2::execute(invalid,f,{},true).id.empty());assert(f.sent.empty()&&f.journal.empty());}
  for(auto key:{"start","cancel","pause","key_up","key_down"}){Fake f;p2::Job j{id,"key",key,110000};assert(p2::execute(j,f,{},true).status=="sent");assert(f.sent.size()==1);}
  for(auto key:{"digit_0","reserve","power","volume_up"})assert(p2::plan("key",key).empty());
  std::vector<uint16_t> raw(67,560);raw[0]=9000;raw[1]=4500;
  assert(p2::validRaw(raw)&&p2::sameSignal(raw,raw));auto shifted=raw;shifted[3]+=100;assert(p2::sameSignal(raw,shifted));shifted[3]=1800;assert(!p2::sameSignal(raw,shifted));
  assert(!p2::validRaw(std::vector<uint16_t>(11,560)));assert(!p2::validRaw(std::vector<uint16_t>(1024,560)));assert(!p2::validRaw(std::vector<uint16_t>(67,65535)));raw[4]=0;assert(!p2::validRaw(raw));
  std::cout<<"PASS: command order, repeated digits, preflight, expiry, journal, no replay, malformed input, raw capture bounds\n";
}
