using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

internal static class WindowTest {
    [STAThread] static int Main(string[] args) {
        if(args.Length==2 && args[0]=="--window") {
            Application.EnableVisualStyles();
            var f=new Form{Text="WORLD KARAOKE",Width=460,Height=240};
            var list=new FlowLayoutPanel{Dock=DockStyle.Fill};f.Controls.Add(list);
            var subtitle=new Label{Text="YouTube 사용 방식 / Choose how to use YouTube",AutoSize=true};
            var guest=new Button{Text="게스트 사용\r\nGuest",AutoSize=true};
            list.Controls.Add(subtitle);list.Controls.Add(guest);
            guest.Click+=(s,e)=>{
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
        string marker=Path.GetTempFileName();File.Delete(marker);
        using(var child=Process.Start(Process.GetCurrentProcess().MainModule.FileName,"--window \""+marker+"\"")){
            try{
                bool linked=false;
                var thread=new Thread(()=>{linked=PhoneWindow.Enable(child.Id);});
                thread.SetApartmentState(ApartmentState.MTA);thread.Start();
                if(!thread.Join(22000)||!linked||!File.Exists(marker))return 2;
                if(RoomLaunch.RoomOf("NULTI-05")!="5" || RoomLaunch.RoomOf("NULTI-08")!="8" || RoomLaunch.RoomOf("NULTI-04")!=null)return 3;
                Console.WriteLine("Guest startup, language, phone pairing and room restrictions passed.");return 0;
            } finally {if(!child.HasExited)child.Kill();File.Delete(marker);}
        }
    }
}
