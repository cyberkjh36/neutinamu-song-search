using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

static class Fixture
{
    [STAThread]
    static void Main() => Application.Run(new KaraokeForm());
}

sealed class KaraokeForm : Form
{
    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool PostMessage(IntPtr window, uint message, IntPtr command, IntPtr arg);

    static async Task WaitForVisibility(Process child, IntPtr window, bool visible)
    {
        var watch = Stopwatch.StartNew();
        while (!child.HasExited && watch.Elapsed < TimeSpan.FromSeconds(10))
        {
            if (IsWindowVisible(window) == visible) return;
            await Task.Delay(150);
        }
        throw new Exception("Settings visibility did not change. Requested " + visible + ", exited " + child.HasExited);
    }

    [DllImport("user32.dll")]
    static extern IntPtr FindWindow(string className, string title);
    const string SettingsTitle = "월드유튜브 · TV연결 설정";

    readonly TableLayoutPanel header = new TableLayoutPanel { ColumnCount = 3 };
    internal sealed class InternetSearchForm : Form { }
    Form phoneSearch;
    bool hostStarted;
    // The Windows check renames this test-only method in the fixture metadata
    // to the actual .83 click handler's compiler-generated name.
    void OpenGuestPanel(object sender, EventArgs args)
    {
        phoneSearch = new InternetSearchForm();
        phoneSearch.Shown += (_, _) => hostStarted = true;
        phoneSearch.Show();
    }

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
            bool expectHidden = Environment.GetEnvironmentVariable("WK_CHECK_REMEMBERED") == "1";
            while (started.Elapsed < TimeSpan.FromSeconds(20))
            {
                await Task.Delay(150);
                button = header.Controls.OfType<Button>().SingleOrDefault(b => b.Name == "WorldKaraokeTvSettings");
                var windowHandle = FindWindow(null, SettingsTitle);
                if (windowHandle != IntPtr.Zero && (!expectHidden || !IsWindowVisible(windowHandle)))
                    child = Process.GetProcessesByName("P2_Room_Link_Test").FirstOrDefault(p => !p.HasExited);
                if (button != null && child != null) break;
            }
            if (child == null || button == null) throw new Exception("startup or TV button missing");
            if (!hostStarted || phoneSearch == null || phoneSearch.IsDisposed || phoneSearch.Visible)
                throw new Exception("The phone host was not started and hidden");
            File.WriteAllText("tv-child.pid", child.Id.ToString());
            var window = FindWindow(null, SettingsTitle);
            if (expectHidden)
            {
                var check = Stopwatch.StartNew();
                while (check.Elapsed < TimeSpan.FromSeconds(3))
                {
                    if (IsWindowVisible(window) || child.HasExited) throw new Exception("Saved room opened settings at startup");
                    await Task.Delay(50);
                }
                button.PerformClick();
                await WaitForVisibility(child, window, true);
            }
            else await WaitForVisibility(child, window, true);
            if (!PostMessage(window, 0x0112, (IntPtr)0xf060, IntPtr.Zero)) throw new Exception("Cannot click close");
            await WaitForVisibility(child, window, false);
            if (child.HasExited) throw new Exception("Closing settings ended the companion");
            button.PerformClick();
            await WaitForVisibility(child, window, true);
            if (child.HasExited || Process.GetProcessesByName("P2_Room_Link_Test").Length != 1) throw new Exception("settings did not reopen in same instance");
            File.WriteAllText("tv-fixture.ok", "ok");
        }
        catch (Exception ex) { File.WriteAllText("tv-fixture.error", ex.ToString()); }
        Close();
    }
}
