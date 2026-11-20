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
internal static class RoomShortcut {
    internal const string Title="느티나무 노래방 리모컨";
    const string Host="WorldKaraoke.P2Background.exe";
    const string Endpoint="https://world-karaoke-connect.almondjoy11.chatgpt.site/api/p2wifi";
    const string Page="https://cyberkjh36.github.io/neutinamu-song-search/p2wifi/index.html";
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
    static readonly HttpClient Http=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false}){Timeout=TimeSpan.FromSeconds(10)};
    internal static string GuestPage(string label,PrintedRoom profile) => Page+"?display=pc&label="+label+"#ticket="+profile.ticket;
    static Dictionary<string,PrintedRoom> Rooms(){
        using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("rooms.json"))
        using(var r=new StreamReader(s))return Json.Deserialize<Dictionary<string,PrintedRoom>>(r.ReadToEnd());
    }
    static string Sha(string file){using(var h=SHA256.Create())using(var data=File.OpenRead(file))return BitConverter.ToString(h.ComputeHash(data)).Replace("-","").ToLowerInvariant();}
    static void InstallShortcut(){
        var dir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","NeutinamuRoomRemote","1.3.0");
        Directory.CreateDirectory(dir);
        string self=Application.ExecutablePath,exe=Path.Combine(dir,"RoomRemote.exe");
        if(!string.Equals(self,exe,StringComparison.OrdinalIgnoreCase)&&(!File.Exists(exe)||Sha(self)!=Sha(exe))){
            string temp=Path.Combine(dir,Guid.NewGuid().ToString("N")+".tmp");
            try{File.Copy(self,temp);if(File.Exists(exe))File.Replace(temp,exe,null);else File.Move(temp,exe);}finally{if(File.Exists(temp))File.Delete(temp);}
        }
        dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell",true));
        string desktop=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory,Environment.SpecialFolderOption.Create);
        if(string.IsNullOrWhiteSpace(desktop))throw new IOException("Windows 바탕화면 폴더를 찾지 못했습니다.");
        Directory.CreateDirectory(desktop);
        dynamic link=shell.CreateShortcut(Path.Combine(desktop,Title+".lnk"));
        link.TargetPath=exe;link.Arguments="--open";link.WorkingDirectory=dir;link.IconLocation=exe+",0";link.Description="이 방의 P2 리모컨과 손님용 QR 열기";link.Save();
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
        if(Sha(path)!="3114c426df37573578be92176ff038a2e600f19cc43fa8c9db12a71b95284b2e")throw new IOException("P2 자동연결 버전을 확인해 주세요.");
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
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        ServicePointManager.SecurityProtocol=SecurityProtocolType.SystemDefault;
        Http.DefaultRequestHeaders.UserAgent.ParseAdd("NeutinamuRoomRemote/1.3.0");
        try{if(!args.SequenceEqual(new[]{"--open"}))InstallShortcut();}
        catch(Exception e){
            Environment.ExitCode=1;
            if(args.SequenceEqual(new[]{"--install-only"}))Console.Error.WriteLine(e.ToString());
            else MessageBox.Show("바탕화면 바로가기를 만들 수 없습니다.\r\n"+e.Message,Title);
            return;
        }
        if(args.SequenceEqual(new[]{"--install-only"}))return;
        using(var f=new Form{Text=Title,ClientSize=new Size(430,165),StartPosition=FormStartPosition.CenterScreen,Font=new Font("맑은 고딕",10),Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath)}){
            var status=new Label{AutoSize=true,MaximumSize=new Size(380,0),Text="이 방의 반주기 연결을 확인하고 있습니다."};
            var retry=new Button{Text="다시 연결",AutoSize=true,Visible=false};var settings=new Button{Text="TV연결 설정",AutoSize=true,Visible=false};
            var list=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,Padding=new Padding(18),AutoScroll=true};
            list.Controls.Add(status);list.Controls.Add(retry);list.Controls.Add(settings);f.Controls.Add(list);string host=null;
            Func<Task> open=async()=>{
                retry.Visible=settings.Visible=false;
                try{
                    var rooms=Rooms();host=HostPath();OpenHost(host,"--background");
                    for(int i=0;i<45 && !f.IsDisposed;i++){
                        string serial=SavedSerial(host);var pair=rooms.FirstOrDefault(v=>v.Value.serial==serial);
                        if(serial!=null && pair.Key==null)throw new IOException("이 PC의 반주기가 등록된 7개 방과 일치하지 않습니다. TV연결 설정에서 이 방의 P2를 확인해 주세요.");
                        status.Text=pair.Key==null?"TV연결 설정에서 이 방의 반주기를 먼저 지정해 주세요.":pair.Key+"번방 P2 자동연결을 기다리고 있습니다…";
                        settings.Visible=true;
                        var active=pair.Key==null?null:Online(host,serial);
                        if(active!=null){
                            status.Text=pair.Key+"번방 리모컨과 QR을 여는 중…";
                            await Bind(pair.Key,pair.Value,active.room);
                            if(f.IsDisposed)return;
                            Process.Start(new ProcessStartInfo(GuestPage(pair.Key,pair.Value)){UseShellExecute=true});
                            f.Close();return;
                        }
                        await Task.Delay(1500);
                    }
                    if(!f.IsDisposed)throw new IOException("이 방의 P2 연결이 아직 준비되지 않았습니다. 방 PC의 인터넷과 TV연결 설정을 확인해 주세요.");
                }catch(Exception e){if(!f.IsDisposed){status.Text=e is TaskCanceledException||e is HttpRequestException?"인터넷 연결을 확인하고 다시 눌러 주세요.":e.GetBaseException().Message;retry.Visible=true;settings.Visible=host!=null;}}
            };
            settings.Click+=(s,e)=>{try{OpenHost(host,"--settings");}catch(Exception err){status.Text=err.Message;}};
            f.Shown+=async(s,e)=>await open();retry.Click+=async(s,e)=>await open();Application.Run(f);
        }
    }
}
