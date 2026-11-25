using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32;

internal static class RoomLaunch
{
    internal const string ManagerStartVariable = "NEUTINAMU_WORLD_MANAGER_START";
    internal const string Launcher = "WorldKaraokeYouTubeLauncher";
    internal static readonly string[] Rooms = {"5","6","7","8"};
    internal static string RoomOf(string machine)
    {
        foreach (string n in Rooms)
            if (String.Equals(machine,"NULTI-0"+n,StringComparison.OrdinalIgnoreCase)) return n;
        return null;
    }
    internal static bool ValidRoot(string root)
    {
        return !String.IsNullOrWhiteSpace(root) && Path.IsPathRooted(root) &&
            File.Exists(Path.Combine(root,"START.exe")) &&
            File.Exists(Path.Combine(root,"app",Launcher+".exe"));
    }
    internal static string FindRoot()
    {
        using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\WorldKaraokeLauncher"))
        {
            string configured = key==null ? null : key.GetValue("InstallLocation") as string;
            if (ValidRoot(configured)) return configured;
        }
        string usual=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","WorldKaraokeLauncher");
        return ValidRoot(usual) ? usual : null;
    }
    internal static int Pid(string root)
    {
        if (!ValidRoot(root)) return 0;
        // Both apphosts load the same managed launcher. START.exe is itself the
        // desktop process; it does not spawn WorldKaraokeYouTubeLauncher.exe.
        string[] targets = {
            Path.GetFullPath(Path.Combine(root, "START.exe")),
            Path.GetFullPath(Path.Combine(root, "app", Launcher + ".exe"))
        };
        using (var self = Process.GetCurrentProcess())
        foreach (string target in targets)
        foreach (var app in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(target)))
            using (app) {
                try {
                    if (app.SessionId == self.SessionId && String.Equals(app.MainModule.FileName, target, StringComparison.OrdinalIgnoreCase))
                        return app.Id;
                } catch (InvalidOperationException) {} catch (System.ComponentModel.Win32Exception) {}
            }
        return 0;
    }
    internal static bool IsRunning(string root) {return Pid(root)>0;}
    internal static string Start(string root, Func<string,bool> running, Action<string> open, Action<int> delay)
    {
        if(!ValidRoot(root))return "missing";
        if(running(root))return "running";
        open(root);
        for(int i=0;i<40;i++){if(running(root))return "started";delay(250);}
        return "failed";
    }
    internal static void Open(string root)
    {
        var start = new ProcessStartInfo(Path.Combine(root, "START.exe")) { WorkingDirectory=root, UseShellExecute=false };
        start.EnvironmentVariables[ManagerStartVariable] = "1";
        using (var process = Process.Start(start)) {}
    }
    internal static bool ValidId(string value)
    {
        return value!=null && Regex.IsMatch(value,@"\A[0-9a-f]{32}\z");
    }
}
