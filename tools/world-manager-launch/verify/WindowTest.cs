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
            var login=new Button{Text="로그인 사용\r\nSign in",AutoSize=true};
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
        Console.WriteLine("Saved login mode, pairing, existing session, helper upgrade and room restrictions passed.");return 0;
    }
}
