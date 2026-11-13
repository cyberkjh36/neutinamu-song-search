using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
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
        string savedLabel, connectingLabel;
        bool autoResume, launcherEnded;

        void BindLauncher(Process owner, EventWaitHandle request)
        {
            launcher = owner;
            settingsRequest = request;
            using (var settings = Registry.CurrentUser.OpenSubKey(RoomSettings))
                savedLabel = settings?.GetValue("ConfirmedP2") as string;
            autoResume = VideoRemote.DeviceSerial(savedLabel) != null;
            Text = "월드유튜브 · TV연결 설정";
            connect.Text = "이 방 반주기 연결";
            launcherTimer = new System.Windows.Forms.Timer { Interval = 700 };
            launcherTimer.Tick += (_, __) => TickLauncher();
            Shown += (_, __) => {
                if (autoResume) Hide();
                StartDiscovery();
                launcherTimer.Start();
            };
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
            // Only reuse a paired device with the previously verified serial.
            var peer = list.Items.Cast<Peer>()
                .Where(p => SameRoom(savedLabel, p.Label))
                .OrderByDescending(p => p.PairedInterface)
                .FirstOrDefault(p => p.PairedInterface || p.Info.Pairing.IsPaired);
            if (peer == null) return;
            StopDiscovery();
            CancelSurvey();
            StartWorker(peer.Info.Id, peer.Label, peer.PairedInterface, false);
        }

        internal static bool SameRoom(string recorded, string seen)
        {
            var serial = VideoRemote.DeviceSerial(recorded);
            return serial != null && serial == VideoRemote.DeviceSerial(seen);
        }

        void RememberConnectedRoom()
        {
            if (launcher == null || VideoRemote.DeviceSerial(connectingLabel) == null) return;
            try
            {
                using (var settings = Registry.CurrentUser.CreateSubKey(RoomSettings))
                    settings.SetValue("ConfirmedP2", connectingLabel);
                savedLabel = connectingLabel;
                autoResume = true;
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException || ex is System.Security.SecurityException)
            {
                result.Text = "이번 연결은 사용할 수 있습니다. 반주기 설정을 저장하지 못했습니다.";
            }
        }
    }
}
