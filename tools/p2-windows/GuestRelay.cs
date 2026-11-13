using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Neutinamu.RoomLink
{
    // Reuse this Windows user's own installed launcher's persistent room.
    // Never create another room or include its host credential in diagnostics.
    internal sealed class GuestRelay
    {
        const string Endpoint="https://world-karaoke-connect.almondjoy11.chatgpt.site/api/relay";
        static readonly HttpClient Client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromSeconds(5)};
        readonly string session=Guid.NewGuid().ToString("N");
        readonly Func<string,CancellationToken,Task<bool>> sendKey;
        readonly Action<string> display;
        readonly CancellationTokenSource stop=new CancellationTokenSource();
        readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=16384};
        readonly HashSet<string> handled=new HashSet<string>();
        string key,room;

        internal GuestRelay(Func<string,CancellationToken,Task<bool>> sendKey,Action<string> display)
        {this.sendKey=sendKey;this.display=display;}
        internal void Stop(){try{stop.Cancel();}catch(ObjectDisposedException){}}

        internal async Task Run()
        {
            var token=stop.Token;
            string urlRoom=null;
            try{
                while(!token.IsCancellationRequested){
                    try{
                        if(key==null){
                            var path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WorldKaraokeLauncher","phone-identity.key");
                            if(File.Exists(path)){
                                var text=File.ReadAllText(path,Encoding.ASCII);
                                if(Regex.IsMatch(text,@"\A[a-f0-9]{64}\z"))key=text;
                            }
                            if(key==null){display("월드유튜브 런처의 ‘휴대폰 연결’을 열어 주세요.");await Task.Delay(4000,token);continue;}
                        }
                        if(room==null){
                            var who=await Call("tvHostRoom",null,null,token);
                            if(!who.TryGetValue("room",out var id) || !Regex.IsMatch(id as string??"", @"\A[0-9]{8}\z"))throw new IOException();
                            room=(string)id;
                        }
                        var clock=Stopwatch.StartNew();
                        var response=await Call("tvHostPoll",null,null,token);
                        if(urlRoom!=room){urlRoom=room;display("손님용 TV연결 사용 가능 · 런처 연결번호 "+room);}
                        if(response.TryGetValue("tvInput",out var job) && job is Dictionary<string,object> values){
                            var request=values["request"] as string;
                            var action=values["input"] as string;
                            int remaining=Convert.ToInt32(values["remainingMs"]);
                            if(String.Equals(values["session"] as string,session) && ValidJob(request,action)
                                && remaining>clock.ElapsedMilliseconds+150 && handled.Add(request)){
                                if(handled.Count>10000)throw new InvalidOperationException("session limit");
                                bool sent=await sendKey(action,token);
                                // A missing worker write acknowledgement is uncertain, never retry the physical key.
                                if(sent)await Call("ackTvInput",request,action,token);
                            }
                        }
                        await Task.Delay(650,token);
                    }catch(OperationCanceledException) when(token.IsCancellationRequested){break;}
                     catch(InvalidOperationException){display("재연결이 필요합니다. ‘연결 종료’ 후 반주기를 다시 연결하세요.");break;}
                     catch(Exception){
                        room=null;urlRoom=null;display("런처의 ‘휴대폰 연결’이 열려 있는지 확인하세요. 자동으로 다시 확인합니다.");
                        await Task.Delay(4000,token);
                    }
                }
            }catch(OperationCanceledException){}
            finally{
                if(room!=null && key!=null)try{await Call("tvHostEnd",null,null,CancellationToken.None);}catch(Exception){}
                stop.Dispose();
            }
        }

        internal static bool ValidJob(string request,string input)=>
            Regex.IsMatch(request??"", @"\A[a-f0-9]{32}\z") && (input=="VIDEO"||input=="LEFT"||input=="RIGHT"||input=="SELECT");

        async Task<Dictionary<string,object>> Call(string op,string request,string action,CancellationToken token)
        {
            var data=new Dictionary<string,object>{{"op",op},{"key",key}};
            if(room!=null)data["room"]=room;
            if(op=="tvHostPoll"||op=="tvHostEnd")data["tvInputSession"]=session;
            if(op=="ackTvInput"){data["session"]=session;data["request"]=request;data["input"]=action;data["status"]="sent";}
            using(var body=new StringContent(json.Serialize(data),Encoding.UTF8,"application/json"))
            using(var res=await Client.PostAsync(Endpoint,body,token)){
                res.EnsureSuccessStatusCode();
                var obj=json.Deserialize<Dictionary<string,object>>(await res.Content.ReadAsStringAsync());
                if(obj==null || !obj.TryGetValue("ok",out var ok)||!true.Equals(ok))throw new IOException();
                return obj;
            }
        }
    }
}
