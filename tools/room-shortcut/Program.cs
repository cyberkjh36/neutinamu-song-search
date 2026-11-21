using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

public sealed class PrintedRoom { public string serial,signer,ticket; }
public sealed class ActiveLink { public string room,name; public bool online; public long updated; }
internal static partial class RoomShortcut {
    internal const string Title="느티나무 노래방 리모컨";
    const string Host="WorldKaraoke.P2Background.exe";
    const string Endpoint="https://world-karaoke-connect.almondjoy11.chatgpt.site/api/p2wifi";
    const string Page="https://cyberkjh36.github.io/neutinamu-song-search/p2wifi/index.html";
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
    static readonly HttpClient Http=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromSeconds(10)};
    internal static string DirectPage(string label,string code) {
        if(!Regex.IsMatch(label??"", @"\A[1235678]\z") || !Regex.IsMatch(code??"", @"\A[0-9]{8}\z"))throw new InvalidDataException("방 연결 정보를 확인해 주세요.");
        return Page+"#room="+code+"&label="+label;
    }
    static Dictionary<string,PrintedRoom> Rooms(){
        using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("rooms.json"))
        using(var r=new StreamReader(s))return Json.Deserialize<Dictionary<string,PrintedRoom>>(r.ReadToEnd());
    }
    static string Sha(string file){using(var h=SHA256.Create())using(var data=File.OpenRead(file))return BitConverter.ToString(h.ComputeHash(data)).Replace("-","").ToLowerInvariant();}
    static void InstallShortcut(){
        var dir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","NeutinamuRoomRemote","1.3.1");
        Directory.CreateDirectory(dir);
        string self=Application.ExecutablePath,exe=Path.Combine(dir,"RoomRemote.exe");
        if(!string.Equals(self,exe,StringComparison.OrdinalIgnoreCase)&&(!File.Exists(exe)||Sha(self)!=Sha(exe))){
            string temp=Path.Combine(dir,Guid.NewGuid().ToString("N")+".tmp");
            try{File.Copy(self,temp);if(File.Exists(exe))File.Replace(temp,exe,null);else File.Move(temp,exe);}finally{if(File.Exists(temp))File.Delete(temp);}
        }
        string desktop=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory,Environment.SpecialFolderOption.Create);
        if(string.IsNullOrWhiteSpace(desktop))throw new IOException("Windows 바탕화면 폴더를 찾지 못했습니다.");
        Directory.CreateDirectory(desktop);
        DesktopLink.Save(Path.Combine(desktop,Title+".lnk"),exe);
    }
    static string HostPath(){
        using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")){
            var entry=key?.GetValue("WorldKaraokeP2AutoConnect") as string;
            var match=Regex.Match(entry??"", "^\\s*\"([^\"\\r\\n]+)\"\\s+--background\\s*$",RegexOptions.IgnoreCase);
            if(!match.Success)throw new IOException("이 방 PC에서 월드 가라오케 P2 자동연결 프로그램을 찾지 못했습니다.");
            string path=Path.GetFullPath(match.Groups[1].Value),dir=Path.GetDirectoryName(path);
            if(!string.Equals(Path.GetFileName(path),Host,StringComparison.OrdinalIgnoreCase) || !File.Exists(path)||Sha(path)!="6db69343eee57f57ac476ddc81a87e99c52277416c43b05b8b713a1b953fabec"||!File.Exists(Path.Combine(dir,"Neutinamu.P2Wifi.dll")))
                throw new IOException("11월 19일 자동연결판에 방 PC용 업데이트 1.2.1을 먼저 적용해 주세요.");
            return path;
        }
    }
    static string SavedSerial(string host){
        var path=Path.Combine(Path.GetDirectoryName(host),"WorldKaraoke.P2Memory.dll");
        string hash=Sha(path);
        if(hash!="3114c426df37573578be92176ff038a2e600f19cc43fa8c9db12a71b95284b2e" &&
           hash!="cfa26919c0583f54c5055e4fb87dbe9e76403a2fbe9d846e00adb594f25d39a4")
            throw new IOException("이 버전의 P2 방 설정 파일을 확인할 수 없습니다. 방 PC의 자동연결 버전을 확인해 주세요.");
        var type=Assembly.LoadFrom(path).GetType("WorldKaraoke.P2Memory.RoomStore",true);
        var instance=type.GetMethod("Default").Invoke(null,null);
        var record=type.GetMethod("Read").Invoke(instance,null);
        return record?.GetType().GetProperty("Serial").GetValue(record) as string;
    }
    internal static bool IsFresh(ActiveLink x,string serial,long now){
        return x!=null && x.online && Regex.IsMatch(x.room??"",@"^\d{8}$") && x.name=="P2 "+serial && now-x.updated>=0 && now-x.updated<12000;
    }
    static ActiveLink Online(string host,string serial){
        var processes=Process.GetProcessesByName(Path.GetFileNameWithoutExtension(Host));
        using(var me=Process.GetCurrentProcess()){
            try{foreach(var p in processes){
                try{
                    if(p.HasExited||p.SessionId!=me.SessionId||!string.Equals(p.MainModule.FileName,host,StringComparison.OrdinalIgnoreCase))continue;
                    var path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"NeutinamuP2Wifi","connection-"+p.Id+".json");
                    var x=Json.Deserialize<ActiveLink>(File.ReadAllText(path));
                    if(IsFresh(x,serial,DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()))return x;
                }catch(IOException){}catch(ArgumentException){}catch(InvalidOperationException){}catch(System.ComponentModel.Win32Exception){}
            }}finally{foreach(var p in processes)p.Dispose();}
        }
        return null;
    }
    static async Task<Dictionary<string,object>> Request(object body){
        using(var data=new StringContent(Json.Serialize(body),Encoding.UTF8,"application/json"))
        using(var r=await Http.PostAsync(Endpoint,data)){
            var reply=Json.Deserialize<Dictionary<string,object>>(await r.Content.ReadAsStringAsync());
            if(!r.IsSuccessStatusCode||reply==null||!reply.TryGetValue("ok",out var ok)||!(ok is bool value && value))
                throw new IOException("이 방의 자동연결 등록을 확인하지 못했습니다. 반주기 연결 상태를 확인하고 다시 눌러 주세요.");
            return reply;
        }
    }
    static async Task Bind(string label,PrintedRoom room,string code){
        string key=Guid.NewGuid().ToString("N")+Guid.NewGuid().ToString("N");
        var begin=await Request(new {op="beginPrintBind",key,label,room=code});
        if(!begin.TryGetValue("challenge",out var value)||!(value is string challenge)||!Regex.IsMatch(challenge,"^[a-f0-9]{64}$"))throw new IOException("방 등록 응답을 확인해 주세요.");
        string proof=SignRoomChallenge(room.signer,challenge);
        await Request(new {op="bindPrintRoom",key,label,room=code,proof});
    }
    internal static string SignRoomChallenge(string xml,string challenge){
        using(var signer=new RSACryptoServiceProvider(new CspParameters(24){Flags=CspProviderFlags.CreateEphemeralKey})){
            signer.PersistKeyInCsp=false;signer.FromXmlString(xml);
            return Convert.ToBase64String(signer.SignData(Encoding.ASCII.GetBytes(challenge),"SHA256"));
        }
    }
    static void OpenHost(string path,string option){
        using(Process.Start(new ProcessStartInfo(path,option){WorkingDirectory=Path.GetDirectoryName(path),UseShellExecute=false})){}
    }
    [STAThread] static void Main(string[] args){
        AppDomain.CurrentDomain.AssemblyResolve+=EmbeddedQrLibrary;
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        ServicePointManager.SecurityProtocol=SecurityProtocolType.SystemDefault;
        Http.DefaultRequestHeaders.UserAgent.ParseAdd("NeutinamuRoomRemote/1.3.1");
        try{if(!args.SequenceEqual(new[]{"--open"}))InstallShortcut();}
        catch(Exception e){
            Environment.ExitCode=1;
            if(args.SequenceEqual(new[]{"--install-only"}))Console.Error.WriteLine(e.ToString());
            else MessageBox.Show("바탕화면 바로가기를 만들 수 없습니다.\r\n"+e.Message,Title);
            return;
        }
        if(args.SequenceEqual(new[]{"--install-only"}))return;
        using(var window=new RoomQrWindow())Application.Run(window);
    }
    static Assembly EmbeddedQrLibrary(object sender,ResolveEventArgs args){
        if(new AssemblyName(args.Name).Name!="QRCoder")return null;
        using(var src=typeof(RoomShortcut).Assembly.GetManifestResourceStream("QRCoder.dll"))
        using(var buffer=new MemoryStream()){src.CopyTo(buffer);return Assembly.Load(buffer.ToArray());}
    }
}
