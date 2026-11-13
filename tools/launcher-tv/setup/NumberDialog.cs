using System;
using System.Drawing;
using System.Windows.Forms;

internal sealed class NumberDialog : Form
{
    readonly TextBox number = new TextBox { MaxLength = 6, Dock = DockStyle.Fill, TextAlign = HorizontalAlignment.Center };
    internal string Code => number.Text;

    internal NumberDialog()
    {
        Text = "블루투스 연결번호 저장";
        Font = new Font("Malgun Gothic", 10);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Font;
        MinimizeBox = MaximizeBox = false;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        var layout = new TableLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Padding = new Padding(15), ColumnCount = 1 };
        layout.Controls.Add(new Label {
            AutoSize = true,
            Text = "이 방 PC에서 계속 사용할 블루투스 연결번호입니다.\r\n기존 번호를 유지하려면 아래에 그 번호를 입력하세요."
        });
        number.Text = BluetoothCode.NewCode();
        number.Font = new Font(Font.FontFamily, 18, FontStyle.Bold);
        number.AccessibleName = "6자리 블루투스 연결번호";
        layout.Controls.Add(number);
        var buttons = new FlowLayoutPanel { AutoSize = true, Anchor = AnchorStyles.Right };
        var ok = new Button { Text = "번호 저장", AutoSize = true, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "취소", AutoSize = true, DialogResult = DialogResult.Cancel };
        number.TextChanged += (_, __) => ok.Enabled = BluetoothCode.Valid(number.Text);
        buttons.Controls.Add(ok);
        buttons.Controls.Add(cancel);
        layout.Controls.Add(buttons);
        Controls.Add(layout);
        AcceptButton = ok;
        CancelButton = cancel;
        Shown += (_, __) => { number.Focus(); number.SelectAll(); };
    }
}
