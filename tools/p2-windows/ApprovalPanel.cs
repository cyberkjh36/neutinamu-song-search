using System;
using System.Drawing;
using System.Windows.Forms;
using Windows.Devices.Enumeration;

namespace Neutinamu.RoomLink
{
    sealed class ApprovalPanel : FlowLayoutPanel
    {
        readonly Label hint=new Label {AutoSize=true,MaximumSize=new Size(590,0)};
        readonly TextBox pin=new TextBox {Width=155,MaxLength=64,UseSystemPasswordChar=true};
        internal readonly Button Approve=new Button {Text="연결 승인",AutoSize=true};
        Action<string> reply;

        internal ApprovalPanel()
        {
            AutoSize=true;Dock=DockStyle.Fill;WrapContents=true;Visible=false;
            Padding=new Padding(6);BackColor=SystemColors.Info;
            Controls.Add(hint);SetFlowBreak(hint,true);
            Controls.Add(pin);Controls.Add(Approve);
            pin.TextChanged+=(s,e)=>Approve.Enabled=!pin.Visible || pin.Text.Trim().Length>0;
            Approve.Click+=(s,e)=>{
                if(reply==null || !Approve.Enabled)return;
                var callback=reply;string value=pin.Visible?pin.Text.Trim():"";
                Clear();callback(value);
            };
        }

        internal bool ShowRequest(string peer,DevicePairingKinds kind,string shownPin,Action<string> callback)
        {
            if(reply!=null)return false;
            string help;
            switch(kind){
                case DevicePairingKinds.ConfirmOnly: help="이 방의 반주기라면 아래 ‘연결 승인’을 누르세요.";break;
                case DevicePairingKinds.ProvidePin: help="반주기에 표시된 PIN을 입력한 뒤 ‘연결 승인’을 누르세요.";break;
                case DevicePairingKinds.DisplayPin: help="반주기가 PIN을 요청하면 "+shownPin+" 을 입력한 뒤 ‘연결 승인’을 누르세요.";break;
                case DevicePairingKinds.ConfirmPinMatch: help="반주기에 표시된 번호가 "+shownPin+" 과 같을 때만 ‘연결 승인’을 누르세요.";break;
                default:return false;
            }
            reply=callback;hint.Text=peer+"\r\n"+help;pin.Clear();pin.Visible=kind==DevicePairingKinds.ProvidePin;
            Approve.Enabled=kind!=DevicePairingKinds.ProvidePin;
            Visible=true;if(kind==DevicePairingKinds.ProvidePin)pin.Focus();else Approve.Focus();
            return true;
        }
        internal void Clear(){reply=null;Visible=false;hint.Text="";pin.Clear();Approve.Enabled=false;}
    }
}
