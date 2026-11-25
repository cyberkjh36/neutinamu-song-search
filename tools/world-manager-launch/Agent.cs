using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[DataContract]
internal sealed class Message {
    [DataMember] public string op;
    [DataMember] public string label;
    [DataMember] public string pc;
    [DataMember] public string key;
    [DataMember(EmitDefaultValue=false)] public string request;
    [DataMember(EmitDefaultValue=false)] public string status;
}
[DataContract]
internal sealed class Reply {
    [DataMember] public bool ok;
    [DataMember] public bool online;
    [DataMember] public string request;
}
internal static class Watcher {
    internal const string InstanceName=@"Local\WorldKaraoke.ManagerLaunch.Watcher";
    internal const string ReadyName=@"Local\WorldKaraoke.ManagerLaunch.Ready";
    internal const string StopName=@"Local\WorldKaraoke.ManagerLaunch.Stop";
    internal const string Product="WorldKaraokeManagerLaunch";
    internal const string RunKey=@"Software\Microsoft\Windows\CurrentVersion\Run";
    internal const string UninstallKey=@"Software\Microsoft\Windows\CurrentVersion\Uninstall\WorldKaraokeManagerLaunch";
    internal static string Folder {get {return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs",Product);}}
    internal static readonly byte[] Entropy=Encoding.UTF8.GetBytes("WorldKaraoke.ManagerLaunch.v1");
    internal static Reply Exchange(Message data) {
        return ExchangeHttp(data,(HttpWebRequest)WebRequest.Create("https://world-karaoke-connect.almondjoy11.chatgpt.site/api/relay"));
    }
    internal static Reply ExchangeHttp(Message data,HttpWebRequest req) {
        req.Method="POST";req.ContentType="application/json; charset=utf-8";req.Accept="application/json";
        req.UserAgent="WorldKaraoke-Manager-PC/1.1.0";
        req.Timeout=6500;req.ReadWriteTimeout=6500;req.AllowAutoRedirect=false;
        req.ServicePoint.Expect100Continue=false;
        using(var encoded=new MemoryStream()){
            new DataContractJsonSerializer(typeof(Message)).WriteObject(encoded,data);
            req.ContentLength=encoded.Length;
            encoded.Position=0;
            using(var body=req.GetRequestStream())encoded.CopyTo(body);
        }
        using(var res=req.GetResponse())
        using(var stream=res.GetResponseStream()){
            var result=(Reply)new DataContractJsonSerializer(typeof(Reply)).ReadObject(stream);
            if(result==null || !result.ok)throw new InvalidDataException();
            return result;
        }
    }
    internal static string StatusPath {get {return Path.Combine(Folder,"connection-status.txt");}}
    internal static string Explain(Exception error) {
        var web=error as WebException;
        if(web!=null){
            using(var res=web.Response as HttpWebResponse){
                if(res!=null)return "서버가 요청을 거절했습니다 (HTTP "+(int)res.StatusCode+").";
            }
            return "서버에 연결하지 못했습니다 ("+web.Status+").";
        }
        if(error is CryptographicException || error is InvalidDataException)return "방 등록 정보를 확인하지 못했습니다. 설치파일을 다시 실행해 주세요.";
        if(error is SerializationException)return "연결 서버의 응답 형식을 확인하지 못했습니다.";
        if(error is IOException)return "도우미가 방 설정 파일을 읽거나 통신을 마치지 못했습니다.";
        return "도우미 오류 ("+error.GetType().Name+").";
    }
    static string previousStatus;
    static void Record(string message) {
        if(message==previousStatus)return;
        try {File.WriteAllText(StatusPath,DateTime.Now.ToString("HH:mm:ss")+"  "+message,Encoding.UTF8);previousStatus=message;}
        catch(IOException) {} catch(UnauthorizedAccessException) {}
    }
    internal static void Listen(string room,string token,EventWaitHandle stop,EventWaitHandle ready) {
        string last=null,lastStatus=null;
        int failures=0;
        for(;;) {
            int wait=3500;
            try {
                var m=new Message{key=token,label=room,pc="NULTI-0"+room,op="managerPoll"};
                var poll=Exchange(m);
                ready.Set();
                Record(room+"번방 서버 연결됨");
                string id=poll.request;
                if(RoomLaunch.ValidId(id)) {
                    if(id!=last) {
                        try {
                            string root=RoomLaunch.FindRoot();
                            lastStatus=RoomLaunch.ConnectRoom(root,poll.online);
                        }
                        catch {lastStatus="failed";}
                        last=id;
                    }
                    m.request=id;m.status=lastStatus;m.op="managerAck";Exchange(m);
                }
                failures=0;
            } catch(Exception e) {
                ready.Reset();Record(Explain(e));
                failures=Math.Min(failures+1,4);wait=Math.Min(15000,1500*(1<<failures));
            }
            if(stop.WaitOne(wait))return;
        }
    }
    [MTAThread]
    static int Main(string[] args) {
        if(args.SequenceEqual(new[]{"--remove"})) {
            if(MessageBox.Show("이 PC에서 매니저 자동실행 도우미를 해제할까요?","월드가라오케",MessageBoxButtons.YesNo)!=DialogResult.Yes)return 0;
            using(var key=Registry.CurrentUser.CreateSubKey(RunKey))key.DeleteValue(Product,false);
            Registry.CurrentUser.DeleteSubKeyTree(UninstallKey,false);
            File.Delete(Path.Combine(Folder,"room.dat"));
            try{using(var e=EventWaitHandle.OpenExisting(StopName))e.Set();}catch(WaitHandleCannotBeOpenedException){}
            return 0;
        }
        if(args.Length!=0)return 1;
        string room=RoomLaunch.RoomOf(Environment.MachineName);if(room==null)return 2;
        ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
        bool first;
        using(var mutex=new Mutex(false,InstanceName,out first))
        using(var stop=new EventWaitHandle(false,EventResetMode.AutoReset,StopName))
        using(var ready=new EventWaitHandle(false,EventResetMode.ManualReset,ReadyName)){
            if(!first)return 0;
            try {
                var clear=ProtectedData.Unprotect(File.ReadAllBytes(Path.Combine(Folder,"room.dat")),Entropy,DataProtectionScope.CurrentUser);
                string[] config=Encoding.UTF8.GetString(clear).Split('|'); Array.Clear(clear,0,clear.Length);
                if(config.Length!=2||config[0]!=room||!System.Text.RegularExpressions.Regex.IsMatch(config[1],@"\A[0-9a-f]{64}\z"))throw new InvalidDataException();
                Listen(room,config[1],stop,ready);
            } catch(Exception e){Record(Explain(e));return 1;}
        }
        return 0;
    }
}
