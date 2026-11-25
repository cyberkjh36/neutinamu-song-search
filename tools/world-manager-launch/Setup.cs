using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Setup {
    static void WriteFile(string path,byte[] value) {
        string temp=path+"."+Guid.NewGuid().ToString("N");
        try{File.WriteAllBytes(temp,value);if(File.Exists(path))File.Replace(temp,path,null);else File.Move(temp,path);}
        finally{if(File.Exists(temp))File.Delete(temp);}
    }
    // Older receivers use the existence of this named mutex as their singleton.
    // Wait until they close it before starting the newly installed receiver.
    internal static bool StopPreviousWatcher() {
        var elapsed=Stopwatch.StartNew();
        while(elapsed.ElapsedMilliseconds<60000) {
            Mutex existing;
            if(!Mutex.TryOpenExisting(Watcher.InstanceName,out existing))return true;
            existing.Dispose();
            EventWaitHandle stop;
            if(EventWaitHandle.TryOpenExisting(Watcher.StopName,out stop)){
                using(stop)stop.Set();
            }
            Thread.Sleep(150);
        }
        return false;
    }
    internal static bool WaitForRegistration(EventWaitHandle ready,Process watcher,int milliseconds) {
        var elapsed=Stopwatch.StartNew();
        while(elapsed.ElapsedMilliseconds<milliseconds && !watcher.HasExited){
            if(ready.WaitOne(150))return !watcher.HasExited;
        }
        return false;
    }
    static string LastError() {
        try {return File.ReadAllText(Watcher.StatusPath).Trim();}
        catch(IOException){return "현재 방 PC에서 연결 서버의 응답을 기다리고 있습니다.";}
        catch(UnauthorizedAccessException){return "상태 파일을 읽을 수 없습니다."; }
    }
    internal static void LoadUpdateTools() {
        AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs e) {
            if (new AssemblyName(e.Name).Name != "Mono.Cecil") return null;
            using (var stream = typeof(Setup).Assembly.GetManifestResourceStream("manager.cecil"))
            using (var buffer = new MemoryStream()) {
                stream.CopyTo(buffer);
                return Assembly.Load(buffer.ToArray());
            }
        };
    }
    [STAThread]
    static int Main() {
        LoadUpdateTools();
        Application.EnableVisualStyles();const string title="월드가라오케 매니저 · 방 PC 자동실행";
        string room=RoomLaunch.RoomOf(Environment.MachineName);
        if(room==null){MessageBox.Show("등록된 5~8번방 PC에서 설치해 주세요. 현재 PC 이름: "+Environment.MachineName,title);return 2;}
        string root=RoomLaunch.FindRoot();
        if(!RoomLaunch.ValidRoot(root)){MessageBox.Show("이 Windows 계정에 기존 WORLD KARAOKE 런처를 먼저 설치해 주세요.",title);return 2;}
        byte[] payload=InstallPasswordDialog.Ask(title,"이 방 PC의 자동실행을 등록하려면 설치 암호를 입력하세요.");if(payload==null)return 1;
        try {
            using(var input=new BinaryReader(new MemoryStream(payload),Encoding.UTF8)){
                if(input.ReadInt32()!=1)throw new InvalidDataException();
                string token=null;
                foreach(var n in RoomLaunch.Rooms) {
                    string k=Encoding.ASCII.GetString(input.ReadBytes(64));
                    if(k.Length!=64||!k.All(Uri.IsHexDigit))throw new InvalidDataException();
                    if(n==room)token=k;
                }
                int length=input.ReadInt32();if(length<=0||length>1048576||input.BaseStream.Length-input.BaseStream.Position!=length)throw new InvalidDataException();
                byte[] exe=input.ReadBytes(length);
                string folder=Watcher.Folder;Directory.CreateDirectory(folder);
                string name;
                using(var hash=SHA256.Create())name="WorldKaraoke.ManagerLaunch."+BitConverter.ToString(hash.ComputeHash(exe)).Replace("-","").Substring(0,12)+".exe";
                for (;;) {
                    try { DirectLaunchUpgrade.Install(root); break; }
                    catch (IOException e) {
                        if (MessageBox.Show(e.Message+"\r\n월드가라오케를 사용 중이면 닫은 후 다시 시도해 주세요.",title,MessageBoxButtons.RetryCancel)!=DialogResult.Retry)return 1;
                    }
                }
                string path=Path.Combine(folder,name);
                if(!File.Exists(path)||!File.ReadAllBytes(path).SequenceEqual(exe))WriteFile(path,exe);
                byte[] clear=Encoding.UTF8.GetBytes(room+"|"+token);
                try{WriteFile(Path.Combine(folder,"room.dat"),ProtectedData.Protect(clear,Watcher.Entropy,DataProtectionScope.CurrentUser));}
                finally{Array.Clear(clear,0,clear.Length);}
                using(var run=Registry.CurrentUser.CreateSubKey(Watcher.RunKey))run.SetValue(Watcher.Product,"\""+path+"\"");
                using(var reg=Registry.CurrentUser.CreateSubKey(Watcher.UninstallKey)){
                    reg.SetValue("DisplayName","월드가라오케 매니저 방 PC 자동실행");reg.SetValue("DisplayVersion","1.1.0");
                    reg.SetValue("UninstallString","\""+path+"\" --remove");
                }
                if(!StopPreviousWatcher()){
                    MessageBox.Show("업데이트를 설치했습니다. 자동실행 도우미를 교체하려면 Windows에서 로그아웃한 뒤 다시 로그인해 주세요.",title);
                    return 0;
                }
                File.Delete(Watcher.StatusPath);
                using(var ready=new EventWaitHandle(false,EventResetMode.ManualReset,Watcher.ReadyName)){
                    ready.Reset();
                    using(var watcher=Process.Start(new ProcessStartInfo(path){WorkingDirectory=folder,UseShellExecute=false})){
                        while(!WaitForRegistration(ready,watcher,12000)){
                            if(watcher.HasExited){
                                MessageBox.Show("도우미가 시작되지 않았습니다. "+LastError()+" (종료 코드 "+watcher.ExitCode+")",title);
                                return 1;
                            }
                            var retry=MessageBox.Show(room+"번방 도우미가 설치되었지만 서버 연결이 아직 확인되지 않았습니다.\r\n"+LastError()+"\r\n\r\n다시 시도하면 연결을 다시 확인합니다. 닫아도 도우미는 계속 연결을 시도합니다.",title,MessageBoxButtons.RetryCancel);
                            if(retry!=DialogResult.Retry)return 1;
                        }
                    }
                }
            }
            MessageBox.Show(room+"번방 도우미가 서버에 연결되었습니다. 런처가 닫혀 있어도 기존 유튜브 로그인 모드로 시작합니다. 휴대폰 매니저에서 "+room+"번방을 눌러 주세요.",title);return 0;
        } catch(Exception e){MessageBox.Show("설치하지 못했습니다. "+e.Message,title);return 1;}
        finally{Array.Clear(payload,0,payload.Length);}
    }
}
