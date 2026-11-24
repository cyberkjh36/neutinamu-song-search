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
    internal const string Product="WorldKaraokeManagerLaunch";
    internal const string RunKey=@"Software\Microsoft\Windows\CurrentVersion\Run";
    internal const string UninstallKey=@"Software\Microsoft\Windows\CurrentVersion\Uninstall\WorldKaraokeManagerLaunch";
    internal static string Folder {get {return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs",Product);}}
    internal static readonly byte[] Entropy=Encoding.UTF8.GetBytes("WorldKaraoke.ManagerLaunch.v1");
    internal static Reply Exchange(Message data) {
        var req=(HttpWebRequest)WebRequest.Create("https://world-karaoke-connect.almondjoy11.chatgpt.site/api/relay");
        req.Method="POST";req.ContentType="application/json";req.Timeout=6500;req.ReadWriteTimeout=6500;req.AllowAutoRedirect=false;
        using(var body=req.GetRequestStream())new DataContractJsonSerializer(typeof(Message)).WriteObject(body,data);
        using(var res=req.GetResponse())
        using(var stream=res.GetResponseStream()){
            var result=(Reply)new DataContractJsonSerializer(typeof(Reply)).ReadObject(stream);
            if(result==null || !result.ok)throw new InvalidDataException();
            return result;
        }
    }
    internal static void Listen(string room,string token,EventWaitHandle stop) {
        string last=null,lastStatus=null;
        int failures=0;
        for(;;) {
            int wait=3500;
            try {
                var m=new Message{key=token,label=room,pc="NULTI-0"+room,op="managerPoll"};
                var poll=Exchange(m);string id=poll.request;
                if(RoomLaunch.ValidId(id)) {
                    if(id!=last) {
                        try {
                            string root=RoomLaunch.FindRoot();
                            lastStatus=RoomLaunch.Start(root,RoomLaunch.IsRunning,RoomLaunch.Open,Thread.Sleep);
                            if(lastStatus=="started" || (lastStatus=="running" && !poll.online)) {
                                if(!PhoneWindow.Enable(RoomLaunch.Pid(root)))lastStatus="failed";
                            }
                        }
                        catch {lastStatus="failed";}
                        last=id;
                    }
                    m.request=id;m.status=lastStatus;m.op="managerAck";Exchange(m);
                }
                failures=0;
            } catch { failures=Math.Min(failures+1,4);wait=Math.Min(30000,2000*(1<<failures)); }
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
            try{using(var e=EventWaitHandle.OpenExisting(@"Local\WorldKaraoke.ManagerLaunch.Stop"))e.Set();}catch(WaitHandleCannotBeOpenedException){}
            return 0;
        }
        if(args.Length!=0)return 1;
        string room=RoomLaunch.RoomOf(Environment.MachineName);if(room==null)return 2;
        ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
        bool first;
        using(var mutex=new Mutex(false,@"Local\WorldKaraoke.ManagerLaunch.Watcher",out first))
        using(var stop=new EventWaitHandle(false,EventResetMode.AutoReset,@"Local\WorldKaraoke.ManagerLaunch.Stop")){
            if(!first)return 0;
            try {
                var clear=ProtectedData.Unprotect(File.ReadAllBytes(Path.Combine(Folder,"room.dat")),Entropy,DataProtectionScope.CurrentUser);
                string[] config=Encoding.UTF8.GetString(clear).Split('|'); Array.Clear(clear,0,clear.Length);
                if(config.Length!=2||config[0]!=room||!System.Text.RegularExpressions.Regex.IsMatch(config[1],@"\A[0-9a-f]{64}\z"))return 2;
                Listen(room,config[1],stop);
            } catch {return 1;}
        }
        return 0;
    }
}
