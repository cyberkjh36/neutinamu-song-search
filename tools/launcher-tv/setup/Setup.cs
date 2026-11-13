using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Setup
{
    const string Caption = "월드유튜브 런처 · TV연결 업데이트";
    const string MainName = "WorldKaraokeYouTubeLauncher";
    const string MainHash = "cb576b719cce0f9fc477e43d2694c4571fc612acc5dbc50d50e6da9f6bcc5371";
    internal const string RuntimeHash = "6b9ee3cd3e3fb77d663625028b4825d76249b26cab7bbf508e53755b2d982b70";
    const string CloudHash = "495f9425a278fd5abe3cd8e6254cc934517a7f20d45c1e3a93b0981742325ca7";
    const string Hook = "WorldKaraoke.TvLink.dll";
    static readonly string[] Payload = { Hook, "P2_Room_Link_Test.exe", "P2_Room_Link_Test.exe.config" };
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    [STAThread]
    static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        try
        {
            string defaultRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "WorldKaraokeLauncher");
            string root = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\WorldKaraokeLauncher", "InstallLocation", null) as string;
            if (!Directory.Exists(root)) root = defaultRoot;
            if (!File.Exists(Path.Combine(root, "app", MainName + ".dll")))
            {
                using (var picker = new FolderBrowserDialog { Description = "기존 월드유튜브 런처가 설치된 폴더를 선택하세요. START.exe가 있는 폴더입니다." })
                {
                    if (picker.ShowDialog() != DialogResult.OK) return 1;
                    root = picker.SelectedPath;
                }
            }
            string app = Path.Combine(Path.GetFullPath(root), "app");
            if (!CheckFile(Path.Combine(app, MainName + ".dll"), MainHash) || !CheckFile(Path.Combine(app, "WorldKaraoke.CloudFavorites.dll"), CloudHash))
                throw new InvalidOperationException("이 업데이트는 월드유튜브 런처 1.3.57.83 설치본에 적용할 수 있습니다.");
            using (var instance = new Mutex(false, @"Local\WorldKaraoke.TvUpdate", out bool first))
            {
                if (!first) return 1;
                while (IsOpen(app))
                    if (MessageBox.Show("월드유튜브 런처와 기존 손님 TV연결 0.8 창을 종료한 뒤 ‘다시 시도’를 눌러 주세요.", Caption, MessageBoxButtons.RetryCancel) != DialogResult.Retry) return 1;
                Install(app);
            }
            MessageBox.Show("업데이트를 마쳤습니다. 평소 쓰던 WORLD KARAOKE 아이콘을 실행해 주세요.", Caption);
            return 0;
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, Caption, MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
    }

    static bool IsOpen(string app)
    {
        foreach (var proc in Process.GetProcessesByName(MainName))
            using (proc)
            {
                try { if (string.Equals(Path.GetDirectoryName(proc.MainModule.FileName), app, StringComparison.OrdinalIgnoreCase)) return true; }
                catch (Exception ex) when (ex is System.ComponentModel.Win32Exception || ex is InvalidOperationException) { }
            }
        using (var solo = new Mutex(false, @"Local\Neutinamu.P2.RoomLink.FieldTest", out bool first)) return !first;
    }

    static string Digest(byte[] data)
    {
        using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(data)).Replace("-", "").ToLowerInvariant();
    }
    static bool CheckFile(string path, string expected) => File.Exists(path) && Digest(File.ReadAllBytes(path)) == expected;

    internal static void Install(string app)
    {
        var config = Path.Combine(app, MainName + ".runtimeconfig.json");
        var backup = config + ".before-tv-link";
        var original = File.ReadAllBytes(File.Exists(backup) ? backup : config);
        if (Digest(original) != RuntimeHash) throw new InvalidOperationException("기존 런처의 실행 설정을 확인할 수 없습니다. 설치한 버전을 확인해 주세요.");
        var files = new Dictionary<string, byte[]>();
        foreach (var name in Payload)
        using (var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
        using (var buffer = new MemoryStream())
        {
            if (resource == null) throw new InvalidDataException(name);
            resource.CopyTo(buffer);
            files.Add(name, buffer.ToArray());
        }
        // Activate a whole package with one atomic configuration replacement.
        var edition = Digest(Encoding.ASCII.GetBytes(string.Join("|", Payload.Select(n => Digest(files[n]))))).Substring(0, 16);
        var folder = Path.Combine(app, "TvLink", "0.9-" + edition);
        var hook = Path.Combine(folder, Hook);
        var originalText = Encoding.UTF8.GetString(original);
        var data = Json.Deserialize<Dictionary<string, object>>(originalText);
        var runtime = (Dictionary<string, object>)data["runtimeOptions"];
        var props = (Dictionary<string, object>)runtime["configProperties"];
        props.Add("STARTUP_HOOKS", hook);
        var updated = Encoding.UTF8.GetBytes(Json.Serialize(data));
        var current = File.ReadAllBytes(config);
        if (!current.SequenceEqual(original) && !IsPriorInstall(app, originalText, current))
            throw new InvalidOperationException("다른 프로그램이 런처 설정을 변경했습니다. 현재 설정을 확인해 주세요.");
        Directory.CreateDirectory(folder);
        foreach (var file in files)
        {
            var path = Path.Combine(folder, file.Key);
            if (!CheckFile(path, Digest(file.Value))) WriteAtomically(path, file.Value);
        }
        if (!File.Exists(backup)) WriteAtomically(backup, original);
        if (!current.SequenceEqual(updated)) WriteAtomically(config, updated);
    }

    static bool IsPriorInstall(string app, string originalText, byte[] current)
    {
        var data = Json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(current));
        var runtime = (Dictionary<string, object>)data["runtimeOptions"];
        var props = (Dictionary<string, object>)runtime["configProperties"];
        if (!props.TryGetValue("STARTUP_HOOKS", out var value) || !(value is string hook)) return false;
        if (!string.Equals(Path.GetDirectoryName(Path.GetDirectoryName(Path.GetFullPath(hook))), Path.Combine(app, "TvLink"), StringComparison.OrdinalIgnoreCase) || Path.GetFileName(hook) != Hook) return false;
        props.Remove("STARTUP_HOOKS");
        return Json.Serialize(data) == Json.Serialize(Json.DeserializeObject(originalText));
    }

    static void WriteAtomically(string path, byte[] data)
    {
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllBytes(temp, data);
            if (File.Exists(path)) File.Replace(temp, path, null);
            else File.Move(temp, path);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
}
