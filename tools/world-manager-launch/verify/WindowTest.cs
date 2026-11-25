using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

internal static class WindowTest {
    static bool CheckHelperUpgrade() {
        var setup=Assembly.LoadFile(Path.GetFullPath("downloads/WorldKaraoke_Manager_PC_Autostart_Setup.exe"));
        var stop=setup.GetType("Setup",true).GetMethod("StopPreviousWatcher",BindingFlags.Static|BindingFlags.NonPublic);
        using(var ready=new ManualResetEvent(false)) {
            bool received=false;
            var old=new Thread(()=>{
                using(var instance=new Mutex(false,@"Local\WorldKaraoke.ManagerLaunch.Watcher"))
                using(var signal=new EventWaitHandle(false,EventResetMode.AutoReset,@"Local\WorldKaraoke.ManagerLaunch.Stop")){
                    ready.Set();received=signal.WaitOne(5000);
                }
            });
            old.Start();
            if(!ready.WaitOne(5000))return false;
            return (bool)stop.Invoke(null,null) && old.Join(6000) && received && (bool)stop.Invoke(null,null);
        }
    }
    static void VerifyDirectStartup() {
        var setup=Assembly.LoadFile(Path.GetFullPath("downloads/WorldKaraoke_Manager_PC_Autostart_Setup.exe"));
        const BindingFlags flags=BindingFlags.NonPublic|BindingFlags.Static;
        setup.GetType("Setup").GetMethod("LoadUpdateTools",flags).Invoke(null,null);
        var apply=setup.GetType("DirectLaunchUpgrade").GetMethod("Apply",flags);
        string dir=Path.Combine(Path.GetTempPath(),Guid.NewGuid().ToString("N")); Directory.CreateDirectory(dir);
        try {
            string exe=Path.Combine(dir,"WorldKaraokeYouTubeLauncher.exe");
            var options=new System.CodeDom.Compiler.CompilerParameters(new[]{"System.dll","System.Windows.Forms.dll","System.Drawing.dll"},exe) {
                GenerateExecutable=true, CompilerOptions="/optimize+ /codepage:65001"
            };
            using (var compiler=new Microsoft.CSharp.CSharpCodeProvider()) {
                var result=compiler.CompileAssemblyFromFile(options,Path.GetFullPath("tools/world-manager-launch/verify/DirectFixture.cs"));
                if(result.Errors.HasErrors)throw new Exception(result.Errors[0].ToString());
            }
            var original=File.ReadAllBytes(exe);
            var updated=(byte[])apply.Invoke(null,new object[]{original});
            if(!object.ReferenceEquals(updated,apply.Invoke(null,new object[]{updated})))throw new Exception("Non-idempotent update");
            File.WriteAllBytes(exe,updated);
            var installed=Path.Combine(dir,"installation"); var app=Path.Combine(installed,"app"); Directory.CreateDirectory(app);
            string desktop=Path.Combine(installed,"START.exe"), inner=Path.Combine(app,"WorldKaraokeYouTubeLauncher.exe");
            File.Copy(exe,desktop);File.Copy(exe,inner);
            string library=Path.Combine(app,"WorldKaraokeYouTubeLauncher.dll");
            File.WriteAllBytes(library,original);
            var install=setup.GetType("DirectLaunchUpgrade").GetMethod("Install",flags);
            install.Invoke(null,new object[]{installed});install.Invoke(null,new object[]{installed});
            var backups=Directory.GetFiles(app,"*.bak");
            if(backups.Length!=1 || !System.Linq.Enumerable.SequenceEqual(original,File.ReadAllBytes(backups[0])) ||
                System.Linq.Enumerable.SequenceEqual(original,File.ReadAllBytes(library)))throw new Exception("Room update/backup failed");
            string decoy=Path.Combine(dir,"START.exe");File.Copy(exe,decoy);
            foreach(var path in new[]{decoy,desktop,inner}) {
                var host=new ProcessStartInfo(path){UseShellExecute=false};
                host.EnvironmentVariables["WORLD_TEST_HOLD"]="1";
                using(var child=Process.Start(host)) {
                    try {
                        bool found=false;
                        for(int i=0;i<12;i++) {
                            found=RoomLaunch.Pid(installed)==child.Id;
                            if(found||path==decoy)break;Thread.Sleep(100);
                        }
                        if(found!=(path!=decoy))throw new Exception("Incorrect room process identity: "+path);
                    } finally { if(!child.HasExited)child.Kill();child.WaitForExit(); }
                }
            }
            string coldLog=Path.Combine(dir,"room-cold.txt");
            Environment.SetEnvironmentVariable("WORLD_TEST_SESSION","1");
            Environment.SetEnvironmentVariable("WORLD_TEST_RESULT",coldLog);
            try {
                if(RoomLaunch.Start(installed,RoomLaunch.IsRunning,RoomLaunch.Open,Thread.Sleep)!="started")
                    throw new Exception("Could not cold-start the desktop apphost");
                int pid=RoomLaunch.Pid(installed);
                bool paired=false;
                var observer=new Thread(()=>{paired=PhoneWindow.Enable(pid,true);});
                observer.SetApartmentState(ApartmentState.MTA);observer.Start();
                if(!observer.Join(22000)||!paired)throw new Exception("Direct startup did not open phone pairing");
                if(RoomLaunch.Start(installed,RoomLaunch.IsRunning,RoomLaunch.Open,Thread.Sleep)!="running" || RoomLaunch.Pid(installed)!=pid)
                    throw new Exception("Existing room was relaunched");
                if(File.ReadAllText(coldLog)!="mode=SignIn\nlanguage=ko\nphone-ready\n") throw new Exception("Cold launch required a manual choice");
            } finally {
                Environment.SetEnvironmentVariable("WORLD_TEST_SESSION",null);
                Environment.SetEnvironmentVariable("WORLD_TEST_RESULT",null);
                int pid=RoomLaunch.Pid(installed);
                if(pid!=0)using(var child=Process.GetProcessById(pid)){child.Kill();child.WaitForExit();}
            }
            foreach(bool direct in new[]{true,false}) {
                string log=Path.Combine(dir,direct?"direct.txt":"manual.txt");
                var start=new ProcessStartInfo(exe){UseShellExecute=false,WorkingDirectory=dir};
                start.EnvironmentVariables.Remove(RoomLaunch.ManagerStartVariable);
                if(direct)start.EnvironmentVariables[RoomLaunch.ManagerStartVariable]="1";
                start.EnvironmentVariables["WORLD_TEST_RESULT"]=log;
                using(var child=Process.Start(start)) {
                    if(!child.WaitForExit(15000)){child.Kill();throw new Exception("Launcher did not finish");}
                    if(child.ExitCode!=0)throw new Exception("Launcher exit "+child.ExitCode);
                }
                string expected=direct?"mode=SignIn\nlanguage=ko\nphone-ready\n":"chooser\nmode=Guest\n";
                if(File.ReadAllText(log)!=expected)throw new Exception("Incorrect startup sequence: "+File.ReadAllText(log));
            }
        } finally {Directory.Delete(dir,true);}
    }
    [STAThread] static int Main(string[] args) {
        if(args.Length==2 && (args[0]=="--window" || args[0]=="--connected")) {
            Application.EnableVisualStyles();
            var f=new Form{Text="WORLD KARAOKE",Width=460,Height=240};
            var list=new FlowLayoutPanel{Dock=DockStyle.Fill};f.Controls.Add(list);
            if(args[0]=="--connected") {
                f.Text="휴대폰 음성검색 · Android / iPhone";
                var transport=new Button{Text="휴대폰 마이크 연결 / Phone microphone"};
                transport.Click+=(s,e)=>File.WriteAllText(args[1],"changed");
                list.Controls.Add(transport);
                Application.Run(f);return 0;
            }
            var subtitle=new Label{Text="YouTube 사용 방식 / Choose how to use YouTube",AutoSize=true};
            var guest=new Button{Text="게스트 사용\r\nGuest",AutoSize=true};
            var login=new Button{Text="로그인 사용\r\nSign in",AccessibleName="로그인 사용 / Sign in",AutoSize=true};
            list.Controls.Add(subtitle);list.Controls.Add(guest);list.Controls.Add(login);
            guest.Click+=(s,e)=>{File.WriteAllText(args[1],"guest");f.Close();};
            login.Click+=(s,e)=>{
                list.Controls.Clear();
                var guide=new Label{Text="국기를 눌러 언어를 선택하세요",AutoSize=true};
                var flag=new Button{AccessibleName="한국 · 한국어"};
                var phone=new Button{AccessibleName="휴대폰 마이크 연결 / Phone microphone"};
                list.Controls.Add(guide);list.Controls.Add(flag);list.Controls.Add(phone);
                bool selected=false;
                flag.Click+=(s2,e2)=>{guide.Text="한국어";selected=true;};
                phone.Click+=(s2,e2)=>{if(selected){f.Text="휴대폰 음성검색 · Android / iPhone";File.WriteAllText(args[1],"linked");}};
            };
            Application.Run(f);return 0;
        }
        foreach(string scenario in new[]{"--window","--connected"}) {
            string marker=Path.GetTempFileName();File.Delete(marker);
            using(var child=Process.Start(Process.GetCurrentProcess().MainModule.FileName,scenario+" \""+marker+"\"")){
                try{
                    bool linked=false;
                    var thread=new Thread(()=>{linked=PhoneWindow.Enable(child.Id);});
                    thread.SetApartmentState(ApartmentState.MTA);thread.Start();
                    if(!thread.Join(22000)||!linked)return 2;
                    if(scenario=="--window" && (!File.Exists(marker)||File.ReadAllText(marker)!="linked"))return 4;
                    if(scenario=="--connected" && File.Exists(marker))return 5;
                    if(RoomLaunch.RoomOf("NULTI-05")!="5" || RoomLaunch.RoomOf("NULTI-08")!="8" || RoomLaunch.RoomOf("NULTI-04")!=null)return 3;
                } finally {if(!child.HasExited)child.Kill();File.Delete(marker);}
            }
        }
        if(!CheckHelperUpgrade())return 6;
        VerifyDirectStartup();
        ReceiverTest.Run();
        Console.WriteLine("Receiver registration, HTTP polling, acknowledgements, errors, saved login mode, pairing, existing session, helper upgrade and room restrictions passed.");return 0;
    }
}

// Exercise the exact receiver transport shipped in the installer against a local relay.
internal static class ReceiverTest {
    const BindingFlags InternalStatic = BindingFlags.NonPublic | BindingFlags.Static;

    static void Check(bool condition, string description) {
        if (!condition) throw new InvalidOperationException(description);
    }

    public static void Run() {
        var setup = Assembly.LoadFile(Path.GetFullPath("downloads/WorldKaraoke_Manager_PC_Autostart_Setup.exe"));
        var wait = setup.GetType("Setup", true).GetMethod("WaitForRegistration", InternalStatic);
        using (var ready = new EventWaitHandle(false, EventResetMode.ManualReset))
        using (var self = Process.GetCurrentProcess()) {
            Check(!(bool)wait.Invoke(null, new object[]{ready, self, 100}), "Unregistered process was declared ready");
            ready.Set();
            Check((bool)wait.Invoke(null, new object[]{ready, self, 200}), "Registered process was not recognized");
        }
        Exchange(setup, "managerPoll", 200);
        Exchange(setup, "managerAck", 200);
        Exchange(setup, "managerPoll", 403);
    }

    static void Exchange(Assembly setup, string op, int status) {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        Exception serverError = null;
        string body = null;
        var headers = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
        var server = new Thread(delegate() {
            try {
                using (var client = listener.AcceptTcpClient()) {
                    client.ReceiveTimeout = 4000;
                    using (var stream = client.GetStream())
                    using (var reader = new StreamReader(stream, Encoding.ASCII)) {
                        Check(reader.ReadLine() == "POST /api/relay HTTP/1.1", "Incorrect method or path");
                        string line;
                        while (!String.IsNullOrEmpty(line = reader.ReadLine())) {
                            int separator = line.IndexOf(':');
                            headers[line.Substring(0, separator)] = line.Substring(separator + 1).Trim();
                        }
                        var chars = new char[int.Parse(headers["Content-Length"])];
                        Check(reader.ReadBlock(chars, 0, chars.Length) == chars.Length, "Incomplete request");
                        body = new string(chars);
                        string json = status == 200 ? "{\"ok\":true,\"request\":null}" : "{\"ok\":false}";
                        byte[] response = Encoding.ASCII.GetBytes("HTTP/1.1 " + status + (status == 200 ? " OK" : " Forbidden")
                            + "\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + json.Length + "\r\n\r\n" + json);
                        stream.Write(response, 0, response.Length);
                    }
                }
            } catch (Exception e) { serverError = e; }
        });
        server.IsBackground = true;
        server.Start();
        try {
            var message = setup.GetType("Message", true);
            var packet = Activator.CreateInstance(message);
            var expected = new Dictionary<string,string>{{"op",op},{"label","5"},{"pc","NULTI-05"},{"key",new string('a',64)}};
            if (op == "managerAck") { expected.Add("request",new string('b',32)); expected.Add("status","started"); }
            foreach (var field in expected) message.GetField(field.Key).SetValue(packet, field.Value);
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/relay");
            request.Proxy = null;
            var watcher = setup.GetType("Watcher", true);
            try {
                var reply = watcher.GetMethod("ExchangeHttp", InternalStatic).Invoke(null, new object[]{packet, request});
                Check(status == 200 && (bool)reply.GetType().GetField("ok").GetValue(reply), "Missing response");
            } catch (TargetInvocationException e) {
                if (status != 403 || !(e.InnerException is WebException)) throw;
                string explanation = (string)watcher.GetMethod("Explain", InternalStatic).Invoke(null, new object[]{e.InnerException});
                Check(explanation.Contains("403"), "Rejected registration must show the HTTP error");
            }
            Check(server.Join(5000), "Local test relay did not finish");
            if (serverError != null) throw serverError;
            Check(headers["User-Agent"].StartsWith("WorldKaraoke-Manager-PC/"), "Missing receiver identifier");
            Check(!headers.ContainsKey("Expect"), "Unexpected 100-continue");
            foreach (var field in expected)
                Check(body.Contains("\"" + field.Key + "\":\"" + field.Value + "\""), "Missing field " + field.Key);
        } finally { listener.Stop(); }
    }
}
