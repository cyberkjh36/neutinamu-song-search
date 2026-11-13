using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Neutinamu.RoomLink
{
    sealed partial class RoomForm
    {
        const string RoomSettings = @"Software\WorldKaraokeLauncher\TvLink";
        Process launcher;
        EventWaitHandle settingsRequest;
        System.Windows.Forms.Timer launcherTimer;
        DateTime retryAt;
        string savedLabel, savedId, connectingId;
        string saveError;
        bool savedInterface, connectingInterface, autoResume, launcherEnded, initialSetup;

        static bool SettingsUnavailable(Exception ex) =>
            ex is IOException || ex is UnauthorizedAccessException || ex is SecurityException;

        internal void RunWithLauncher(Process owner, EventWaitHandle request)
        {
            launcher = owner;
            settingsRequest = request;
            try
            {
                using (var settings = Registry.CurrentUser.OpenSubKey(RoomSettings))
                {
                    // Older versions saved only the verified name.
                    savedLabel = settings?.GetValue("ConfirmedP2") as string;
                    var entry = settings?.GetValue("ConfirmedEndpoint") as string[];
                    if (entry?.Length == 3 && SameRoom(savedLabel, entry[0]) &&
                        !String.IsNullOrEmpty(entry[1]) && entry[1].Length <= 4096 &&
                        (entry[2] == "AEP" || entry[2] == "INTERFACE"))
                    {
                        savedId = entry[1];
                        savedInterface = entry[2] == "INTERFACE";
                    }
                }
            }
            catch (Exception ex) when (SettingsUnavailable(ex))
            {
                saveError = "저장한 방 설정을 열 수 없습니다.";
            }
            autoResume = VideoRemote.DeviceSerial(savedLabel) != null;
            initialSetup = !autoResume;
            Text = "월드유튜브 · TV연결 설정";
            connect.Text = "이 방 반주기 연결";

            // A message loop with an explicitly shown form avoids Application.Run(form)
            // briefly painting the setup window on each start, even before Shown.
            using (var context = new ApplicationContext())
            {
                FormClosed += (_, __) => context.ExitThread();
                var handle = Handle;
                launcherTimer = new System.Windows.Forms.Timer { Interval = 700 };
                launcherTimer.Tick += (_, __) => TickLauncher();
                BeginInvoke((Action)(() => {
                    if (launcher.HasExited) { launcherEnded = true; Close(); return; }
                    if (initialSetup) ShowSettings();
                    launcherTimer.Start();
                    if (autoResume && savedId != null) StartWorker(savedId, savedLabel, savedInterface, false, true);
                    else StartDiscovery();
                }));
                Application.Run(context);
            }
        }

        void ShowSettings()
        {
            Show();
            WindowState = FormWindowState.Normal;
            Activate();
        }

        void TickLauncher()
        {
            if (launcher.HasExited)
            {
                launcherEnded = true;
                Close();
                return;
            }
            if (settingsRequest.WaitOne(0)) ShowSettings();
            if (!autoResume || testing || DateTime.UtcNow < retryAt) return;
            if (!scanning) { StartDiscovery(false); return; }
            var peer = list.Items.Cast<Peer>()
                .Where(p => SameRoom(savedLabel, p.Label))
                .OrderByDescending(p => p.PairedInterface)
                .ThenByDescending(p => String.Equals(p.Info.Id, savedId, StringComparison.OrdinalIgnoreCase))
                .FirstOrDefault();
            if (peer == null) return;
            StopDiscovery();
            CancelSurvey();
            StartWorker(peer.Info.Id, savedLabel, peer.PairedInterface, false, true);
        }

        internal static bool SameRoom(string recorded, string seen)
        {
            var serial = VideoRemote.DeviceSerial(recorded);
            return serial != null && serial == VideoRemote.DeviceSerial(seen);
        }

        void RememberConnectedRoom()
        {
            if (VideoRemote.DeviceSerial(peerLabel) == null) return;
            bool changed = !SameRoom(savedLabel, peerLabel) || savedId != connectingId || savedInterface != connectingInterface;
            try
            {
                if (changed)
                {
                    using (var settings = Registry.CurrentUser.CreateSubKey(RoomSettings))
                    {
                        settings.SetValue("ConfirmedEndpoint", new[] { peerLabel, connectingId, connectingInterface ? "INTERFACE" : "AEP" });
                        settings.SetValue("ConfirmedP2", peerLabel);
                    }
                }
                savedLabel = peerLabel;
                savedId = connectingId;
                savedInterface = connectingInterface;
                saveError = null;
                autoResume = launcher != null;
                if (initialSetup) { initialSetup = false; Hide(); }
            }
            catch (Exception ex) when (SettingsUnavailable(ex))
            {
                saveError = "이번 연결은 사용할 수 있지만 방 설정을 저장하지 못했습니다.";
            }
        }
    }
}
