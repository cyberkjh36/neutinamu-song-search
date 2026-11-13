using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

static class Fixture
{
    [STAThread]
    static void Main() => Application.Run(new KaraokeForm());
}

sealed class KaraokeForm : Form
{
    readonly TableLayoutPanel header = new TableLayoutPanel { ColumnCount = 3 };
    public KaraokeForm()
    {
        var root = new TableLayoutPanel();
        Controls.Add(root);
        root.Controls.Add(header, 0, 0);
        Shown += async (_, _) => await Verify();
    }

    async Task Verify()
    {
        try
        {
            var started = Stopwatch.StartNew();
            Button button = null;
            Process child = null;
            while (started.Elapsed < TimeSpan.FromSeconds(20))
            {
                await Task.Delay(150);
                button = header.Controls.OfType<Button>().SingleOrDefault(b => b.Name == "WorldKaraokeTvSettings");
                child = Process.GetProcessesByName("P2_Room_Link_Test").FirstOrDefault(p => p.MainWindowHandle != IntPtr.Zero);
                if (button != null && child != null) break;
            }
            if (child == null || child.MainWindowTitle != "월드유튜브 · TV연결 설정" || button == null) throw new Exception("startup or TV button missing");
            File.WriteAllText("tv-child.pid", child.Id.ToString());
            child.CloseMainWindow();
            await Task.Delay(1200);
            child.Refresh();
            if (child.HasExited || child.MainWindowHandle != IntPtr.Zero) throw new Exception("settings did not hide");
            button.PerformClick();
            await Task.Delay(1600);
            child.Refresh();
            if (child.HasExited || child.MainWindowHandle == IntPtr.Zero ||
                Process.GetProcessesByName("P2_Room_Link_Test").Length != 1) throw new Exception("settings did not reopen in same instance");
            File.WriteAllText("tv-fixture.ok", "ok");
        }
        catch (Exception ex) { File.WriteAllText("tv-fixture.error", ex.ToString()); }
        Close();
    }
}
