using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

// The launcher loads this entry point from its own .NET runtime configuration.
internal static class StartupHook
{
    internal static void Initialize()
    {
        Application.Idle += FindLauncher;
    }

    static void FindLauncher(object sender, EventArgs e)
    {
        foreach (Form form in Application.OpenForms)
        {
            if (form.GetType().Name != "KaraokeForm") continue;
            Application.Idle -= FindLauncher;
            form.BeginInvoke((Action)(() => Attach(form)));
            break;
        }
    }

    static void Attach(Form form)
    {
        if (form.IsDisposed) return;
        var session = new TvSession();
        form.FormClosed += (_, _) => session.Dispose();
        try
        {
            var root = form.Controls.OfType<TableLayoutPanel>().FirstOrDefault();
            if (root?.GetControlFromPosition(0, 0) is TableLayoutPanel header)
            {
                header.SuspendLayout();
                try
                {
                    int column = header.ColumnCount++;
                    header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 38));
                    var button = new Button {
                        Name = "WorldKaraokeTvSettings", Text = "TV", AccessibleName = "TV연결 설정",
                        Dock = DockStyle.Fill, FlatStyle = FlatStyle.Flat, Margin = new Padding(1),
                        BackColor = Color.FromArgb(23, 78, 110), ForeColor = Color.White
                    };
                    var hint = new ToolTip();
                    hint.SetToolTip(button, "TV연결 설정");
                    button.Disposed += (_, _) => hint.Dispose();
                    button.Click += (_, _) => session.Open(form, true);
                    header.Controls.Add(button, column, 0);
                }
                finally { header.ResumeLayout(); }
            }
        }
        catch (Exception ex) { Trace.WriteLine(ex.Message); }
        session.Open(form, false);
        try
        {
            // Reuse the room's existing phone host and its normal Shown event.
            // A live settings window belongs to the operator and stays as it is.
            const BindingFlags instance = BindingFlags.Instance | BindingFlags.NonPublic;
            var type = form.GetType();
            var field = type.GetField("phoneSearch", instance);
            if (field == null || field.GetValue(form) is Form { IsDisposed: false }) return;
            var openPhone = type.GetMethod("<.ctor>b__22_8", instance, null,
                new[] { typeof(object), typeof(EventArgs) }, null);
            if (openPhone == null) return;
            openPhone.Invoke(form, new object[] { form, EventArgs.Empty });
            if (field.GetValue(form) is Form phone && !phone.IsDisposed)
                phone.BeginInvoke((Action)(() => { if (!phone.IsDisposed) phone.Hide(); }));
        }
        catch (Exception ex) { Trace.WriteLine(ex.Message); }
    }

    sealed class TvSession : IDisposable
    {
        readonly int ownerId = Environment.ProcessId;
        EventWaitHandle openSettings;
        Process child;

        public void Open(Form owner, bool requested)
        {
            try
            {
                openSettings ??= new EventWaitHandle(false, EventResetMode.AutoReset,
                    @"Local\WorldKaraoke.TvSettings." + ownerId);
                if (child != null && !child.HasExited)
                {
                    if (requested) openSettings.Set();
                    return;
                }
                child?.Dispose();
                var folder = Path.GetDirectoryName(typeof(StartupHook).Assembly.Location);
                var exe = Path.Combine(folder, "P2_Room_Link_Test.exe");
                child = Process.Start(new ProcessStartInfo(exe, "--launcher " + ownerId) {
                    WorkingDirectory = folder, UseShellExecute = false
                });
                if (requested) openSettings.Set();
            }
            catch (Exception ex)
            {
                Trace.WriteLine(ex.Message);
                if (requested) MessageBox.Show(owner, "TV연결을 열 수 없습니다. TV연결 업데이트를 다시 설치해 주세요.", "TV연결");
            }
        }

        public void Dispose()
        {
            child?.Dispose();
            openSettings?.Dispose();
        }
    }
}
