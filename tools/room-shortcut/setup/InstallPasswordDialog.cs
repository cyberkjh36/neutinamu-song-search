using System;
using System.Drawing;

using System.Threading.Tasks;
using System.Windows.Forms;

internal static class InstallPasswordDialog
{
    internal static byte[] Ask()
    {
        using (var form = new Form
        {
            Text = "느티나무 P2 리모컨 · 설치 암호", Font = new Font("맑은 고딕", 10),
            ClientSize = new Size(410,205), AutoScaleMode = AutoScaleMode.Dpi,
            FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterScreen,
            MaximizeBox = false, MinimizeBox = false
        })
        {
            var label = new Label {Text="이 방 PC에 QR 바로가기를 설치하려면 설치 암호를 입력하세요.", AutoSize=true, Location=new Point(22,19)};
            var input = new TextBox {AccessibleName="설치 암호", UseSystemPasswordChar=true, Location=new Point(22,54), Width=365};
            var status = new Label {Location=new Point(22,95), Size=new Size(365,39)};
            var confirm = new Button {Text="확인", Location=new Point(206,146),Size=new Size(85,35)};
            var cancel = new Button {Text="취소", DialogResult=DialogResult.Cancel, Location=new Point(302,146),Size=new Size(85,35)};
            form.Controls.AddRange(new Control[] { label,input,status,confirm,cancel });
            form.AcceptButton=confirm;
            form.CancelButton=cancel;
            form.Shown+=(s,e)=>input.Focus();
            byte[] approved=null;
            confirm.Click+=async (s,e)=>
            {
                if (!confirm.Enabled) return;
                string entered=input.Text;
                if (entered.Length==0) { status.Text="설치 암호를 입력해 주세요."; input.Focus(); return; }
                input.Clear(); confirm.Enabled=false; input.Enabled=false;
                status.Text="암호를 확인하고 있습니다…";
                try
                {
                    byte[] bytes=await Task.Run(()=>ProtectedPayload.Read(entered));
                    if (bytes==null) { if(!form.IsDisposed) status.Text="설치 암호가 맞지 않습니다. 다시 입력해 주세요."; return; }
                    try
                    {
                        if (form.IsDisposed || form.DialogResult==DialogResult.Cancel) return;
                        approved=bytes;
                        form.DialogResult=DialogResult.OK;
                    }
                    finally { if(approved==null) Array.Clear(bytes,0,bytes.Length); }
                }
                catch (Exception) { if(!form.IsDisposed) status.Text="설치 파일을 열 수 없습니다. 파일을 다시 받아 주세요."; }
                finally
                {
                    if(!form.IsDisposed && form.DialogResult==DialogResult.None)
                    { input.Enabled=true; confirm.Enabled=true; input.Focus(); }
                }
            };
            return form.ShowDialog()==DialogResult.OK ? approved : null;
        }
    }
}
