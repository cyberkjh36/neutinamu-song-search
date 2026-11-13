using System;
using System.Drawing;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Windows.Devices.Enumeration;

namespace Neutinamu.RoomLink
{
    // WinRT may raise PairingRequested on a worker thread. Consent and PIN
    // entry stay on the UI thread; timeout must release even a pending deferral.
    sealed class PairApproval : Form
    {
        readonly TextBox entry = new TextBox { Width=260, MaxLength=64, UseSystemPasswordChar=true };
        readonly Button approve = new Button { Text="연결 승인", AutoSize=true };
        readonly Button reject = new Button { Text="취소", AutoSize=true };
        readonly TaskCompletionSource<string> answer = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        bool needsPin;

        internal PairApproval(string peer, DevicePairingKinds kind, string pin)
        {
            Text="느티나무 P2 · 연결 승인"; StartPosition=FormStartPosition.CenterParent;
            Font=new Font("Malgun Gothic",11); MinimumSize=new Size(460,235);
            FormBorderStyle=FormBorderStyle.FixedDialog; MinimizeBox=MaximizeBox=false;
            var body=new FlowLayoutPanel { Dock=DockStyle.Fill, FlowDirection=FlowDirection.TopDown, WrapContents=false, AutoScroll=true, Padding=new Padding(12) };
            string hint;
            switch(kind){
                case DevicePairingKinds.ConfirmOnly:
                    hint="이 방 반주기와 연결하려면 ‘연결 승인’을 누르세요.";break;
                case DevicePairingKinds.ProvidePin:
                    needsPin=true;hint="반주기에 표시된 PIN을 여기에 입력한 뒤 ‘연결 승인’을 누르세요.";break;
                case DevicePairingKinds.DisplayPin:
                    hint="반주기에서 PIN 입력을 요청하면 다음 번호를 입력한 뒤 ‘연결 승인’을 누르세요.\r\nPIN  "+pin;break;
                case DevicePairingKinds.ConfirmPinMatch:
                    hint="반주기와 아래 번호가 같을 때만 ‘연결 승인’을 누르세요.\r\nPIN  "+pin;break;
                default: throw new ArgumentException(nameof(kind));
            }
            body.Controls.Add(new Label {Text=peer, AutoSize=true});
            body.Controls.Add(new Label {Text=hint, MaximumSize=new Size(405,0), AutoSize=true});
            if(needsPin){body.Controls.Add(entry);approve.Enabled=false;entry.TextChanged+=(s,e)=>approve.Enabled=entry.Text.Trim().Length>0;}
            var buttons=new FlowLayoutPanel { AutoSize=true };buttons.Controls.AddRange(new Control[]{approve,reject});body.Controls.Add(buttons);
            Controls.Add(body);CancelButton=reject;
            approve.Click+=(s,e)=>{answer.TrySetResult(needsPin?entry.Text.Trim():String.Empty);Close();};
            reject.Click+=(s,e)=>Close(); FormClosed+=(s,e)=>answer.TrySetResult(null);
        }

        internal static async Task<string> AskAsync(RoomForm owner,string peer,DevicePairingKinds kind,string pin,CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            using(var box=new PairApproval(peer,kind,pin))
            using(token.Register(()=>box.answer.TrySetCanceled())){
                box.Show(owner);box.Activate();
                try{return await box.answer.Task;}
                finally{if(!box.IsDisposed)box.Close();}
            }
        }

        internal static bool CheckControls()
        {
            using(var prompt=new PairApproval("시험 P2",DevicePairingKinds.ProvidePin,"")){
                if(prompt.approve.Enabled)return false;
                prompt.entry.Text="12345670";
                return prompt.approve.Enabled && !prompt.answer.Task.IsCompleted;
            }
        }
    }

    static class PairWait
    {
        // Some drivers leave an operation pending after Cancel. Release the
        // test screen on its own deadline and observe/dispose any late result.
        internal static async Task<T> Until<T>(Task<T> operation, CancellationToken stop,Action<T> discard=null)
        {
            var cancel=new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            using(stop.Register(()=>cancel.TrySetResult(true))){
                await Task.WhenAny(operation,cancel.Task);
                if(stop.IsCancellationRequested){
                    _=IgnoreLate(operation,discard);
                    throw new OperationCanceledException(stop);
                }
                return await operation;
            }
        }
        static async Task IgnoreLate<T>(Task<T> operation,Action<T> discard)
        {
            try{var result=await operation.ConfigureAwait(false);discard?.Invoke(result);}catch(Exception){ }
        }
    }
}
