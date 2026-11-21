using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using QRCoder;

internal static partial class RoomShortcut {
    internal static Bitmap MakeQr(string url){
        using(var generator=new QRCodeGenerator())
        using(var data=generator.CreateQrCode(url,QRCodeGenerator.ECCLevel.M))
        using(var qr=new QRCode(data))return qr.GetGraphic(8);
    }

    sealed class RoomQrWindow : Form {
        readonly Dictionary<string,PrintedRoom> profiles=Rooms();
        readonly Label title=new Label {Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,AutoSize=true};
        readonly PictureBox picture=new PictureBox {Dock=DockStyle.Fill,SizeMode=PictureBoxSizeMode.Zoom,BackColor=Color.White,AccessibleName="휴대폰 리모컨 QR"};
        readonly Label number=new Label {Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,AutoSize=true};
        readonly Label status=new Label {Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,AutoSize=true};
        readonly Button settings=new Button {Text="TV연결 설정",AutoSize=true,Enabled=false};
        readonly Timer refresh=new Timer {Interval=1500};
        string host,displayed,registered;
        bool registering;
        DateTime retryBinding;

        internal RoomQrWindow(){
            Text=Title;StartPosition=FormStartPosition.CenterScreen;
            AutoScaleMode=AutoScaleMode.Dpi;BackColor=Color.White;
            ClientSize=new Size(465,515);MinimumSize=new Size(350,380);
            Font=new Font("맑은 고딕",11);Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            title.Font=new Font(Font.FontFamily,17,FontStyle.Bold);
            number.Font=new Font(Font.FontFamily,14,FontStyle.Bold);
            var layout=new TableLayoutPanel {Dock=DockStyle.Fill,Padding=new Padding(16),ColumnCount=1,RowCount=5};
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
            for(int i=2;i<5;i++)layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            var bar=new FlowLayoutPanel {Dock=DockStyle.Fill,AutoSize=true,FlowDirection=FlowDirection.RightToLeft};
            var retry=new Button {Text="다시 연결",AutoSize=true};
            bar.Controls.Add(settings);bar.Controls.Add(retry);
            layout.Controls.Add(title,0,0);layout.Controls.Add(picture,0,1);layout.Controls.Add(number,0,2);
            layout.Controls.Add(status,0,3);layout.Controls.Add(bar,0,4);Controls.Add(layout);
            title.Text="이 방의 P2 연결을 확인하고 있습니다.";
            retry.Click+=(sender,e)=>{host=null;retryBinding=DateTime.MinValue;CheckRoom();};
            settings.Click+=(sender,e)=>{try{OpenHost(host,"--settings");}catch(Exception error){status.Text=error.GetBaseException().Message;}};
            refresh.Tick+=(sender,e)=>CheckRoom();
            Shown+=(sender,e)=>{CheckRoom();refresh.Start();};
        }

        void ClearQr(string message){
            if(displayed!=null){picture.Image?.Dispose();picture.Image=null;displayed=null;registered=null;retryBinding=DateTime.MinValue;}
            number.Text="";title.Text="방 리모컨 연결 대기";status.Text=message;
        }

        void CheckRoom(){
            try{
                if(host==null){var path=HostPath();OpenHost(path,"--background");host=path;settings.Enabled=true;}
                string serial=SavedSerial(host);
                var room=profiles.FirstOrDefault(pair=>pair.Value.serial==serial);
                if(room.Key==null){ClearQr("TV연결 설정에서 이 방에 지정된 반주기를 확인해 주세요.");return;}
                var active=Online(host,serial);
                if(active==null){ClearQr(room.Key+"번방 반주기가 연결되면 QR이 자동으로 표시됩니다.");return;}
                string url=DirectPage(room.Key,active.room);
                if(displayed!=url)ShowActiveQr(room.Key,active.room,url);
                if(!registering && registered!=url && DateTime.UtcNow>=retryBinding)
                    RegisterPrintRoom(room.Key,room.Value,active.room,url);
            }catch(Exception error){ClearQr(error.GetBaseException().Message);}
        }

        void ShowActiveQr(string label,string code,string url){
            var image=MakeQr(url);var previous=picture.Image;picture.Image=image;previous?.Dispose();
            displayed=url;registered=null;retryBinding=DateTime.MinValue;
            title.Text=label+"번방 휴대폰 리모컨";
            number.Text="연결번호 "+code;
            status.Text="휴대폰 카메라로 QR을 찍어 주세요.";
        }

        async void RegisterPrintRoom(string label,PrintedRoom profile,string code,string url){
            registering=true;
            try{
                await Bind(label,profile,code);
                if(!IsDisposed && displayed==url)registered=url;
            }catch(Exception){
                if(!IsDisposed && displayed==url){
                    retryBinding=DateTime.UtcNow.AddSeconds(30);
                    status.Text="휴대폰으로 화면의 QR을 찍어 주세요. 인쇄 QR 등록은 다시 시도합니다.";
                }
            }finally{
                registering=false;
                if(!IsDisposed && registered==url && displayed==url)status.Text="휴대폰 카메라로 QR을 찍어 주세요.";
            }
        }

        protected override void Dispose(bool disposing){
            if(disposing){refresh.Dispose();picture.Image?.Dispose();}
            base.Dispose(disposing);
        }
    }
}
