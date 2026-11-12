using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Windows.Devices.Enumeration;
using Windows.Devices.WiFiDirect;

namespace Neutinamu.RoomLink
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            if (args.SequenceEqual(new[] { "--self-test" }))
            {
                return RoomForm.SelfTest() ? 0 : 1;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new RoomForm());
            return 0;
        }
    }

    sealed class Peer
    {
        public readonly DeviceInformation Info;
        public Peer(DeviceInformation info) { Info = info; }
        public override string ToString() { return Info.Name; }
    }

    sealed class RoomForm : Form
    {
        readonly ListBox list = new ListBox { Dock = DockStyle.Fill };
        readonly Button search = new Button { Text = "반주기 찾기", AutoSize = true };
        readonly Button connect = new Button { Text = "선택한 반주기 연결 시험", AutoSize = true, Enabled = false };
        readonly TextBox result = new TextBox { ReadOnly = true, Multiline = true, Dock = DockStyle.Fill, ScrollBars = ScrollBars.Vertical };
        readonly System.Windows.Forms.Timer discoveryTimer = new System.Windows.Forms.Timer { Interval = 18000 };
        readonly Dictionary<string, DeviceInformation> discovered = new Dictionary<string, DeviceInformation>();
        DeviceWatcher watcher;
        readonly CancellationTokenSource closing = new CancellationTokenSource();
        readonly bool smoke;
        bool testing;
        bool selfTestPassed;

        internal static bool Match(string name)
        {
            if (String.IsNullOrWhiteSpace(name)) return false;
            return name.StartsWith("DIRECT-TJ-", StringComparison.OrdinalIgnoreCase) ||
                   name.StartsWith("TJ_P2_", StringComparison.OrdinalIgnoreCase);
        }

        internal static bool SelfTest()
        {
            if (!Match("DIRECT-TJ-2 A1P 0000000001") || !Match("TJ_P2_TEST") ||
                Match("HomeWiFi") || Match("near-DIRECT-TJ-X") || Match(null)) return false;
            using (var form = new RoomForm(true))
            {
                Application.Run(form);
                return form.selfTestPassed;
            }
        }

        internal RoomForm(bool smoke = false)
        {
            this.smoke = smoke;
            Text = "느티나무 P2 · 방 PC 연결 시험";
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(590, 440);
            Size = new Size(700, 490);
            Font = new Font("Malgun Gothic", 11);
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), RowCount = 4, ColumnCount = 1 };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            layout.Controls.Add(new Label { Text = "먼저 반주기를 찾고, 이 방에서 쓰는 P2 이름을 확인한 뒤 연결 시험을 누르세요.", AutoSize = true, MaximumSize = new Size(620, 0) }, 0, 0);
            layout.Controls.Add(list, 0, 1);
            var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, Margin = new Padding(0, 8, 0, 8) };
            buttons.Controls.AddRange(new Control[] { search, connect });
            layout.Controls.Add(buttons, 0, 2);
            layout.Controls.Add(result, 0, 3);
            Controls.Add(layout);
            result.Text = "동글과 드라이버를 준비한 방 PC에서 실행하세요. 인터넷은 유선 LAN을 계속 사용합니다. 이 도구는 Windows의 무선 연결을 시험하며 TV 메뉴나 예약곡을 조작하지 않습니다.";
            search.Click += (s,e) => StartDiscovery();
            list.SelectedIndexChanged += (s,e) => connect.Enabled = !testing && list.SelectedItem is Peer;
            connect.Click += async (s,e) => await TestLink();
            discoveryTimer.Tick += (s,e) => FinishDiscovery();
            FormClosing += (s,e) => { closing.Cancel(); StopDiscovery(); };
            if (smoke) Shown += (s,e) => {
                selfTestPassed = search.Enabled && !connect.Enabled && list.Items.Count == 0 && result.ReadOnly;
                StartDiscovery(); // normal Windows API, never initiates a connection
                if (watcher != null) FinishDiscovery();
                selfTestPassed &= result.Text.StartsWith("WFD_", StringComparison.Ordinal) && !testing;
                Close();
            };
        }

        void Dispatch(DeviceWatcher source, Action work)
        {
            if (IsDisposed || Disposing || !IsHandleCreated) return;
            try {
                BeginInvoke((Action)(() => { if (!IsDisposed && watcher == source) work(); }));
            } catch (InvalidOperationException) { /* window closed */ }
        }

        void StartDiscovery()
        {
            if (testing) return;
            StopDiscovery(); discovered.Clear(); list.Items.Clear(); connect.Enabled = false;
            result.Text = "Wi-Fi Direct에서 TJ 장치를 찾는 중입니다. 약 18초 걸릴 수 있습니다.";
            try {
                string selector = WiFiDirectDevice.GetDeviceSelector(WiFiDirectDeviceSelectorType.AssociationEndpoint);
                var current = DeviceInformation.CreateWatcher(selector, new string[0]);
                watcher = current;
                current.Added += (source, info) => Dispatch(source, () => {
                    discovered[info.Id] = info; UpdateList();
                });
                current.Updated += (source, change) => Dispatch(source, () => {
                    DeviceInformation info;
                    if (discovered.TryGetValue(change.Id, out info)) { info.Update(change); UpdateList(); }
                });
                current.Removed += (source, change) => Dispatch(source, () => {
                    discovered.Remove(change.Id); UpdateList();
                });
                current.Stopped += (source, args) => Dispatch(source, () => {
                    if (source.Status == DeviceWatcherStatus.Aborted) {
                        StopDiscovery(); result.Text = "WFD_DISCOVERY=UNAVAILABLE\r\nWindows가 검색을 중단했습니다. 동글·드라이버와 Windows 위치 액세스 설정을 확인하세요.";
                    }
                });
                current.EnumerationCompleted += (source,args) => { /* keep listening for late announcements */ };
                current.Start(); discoveryTimer.Start();
            } catch (Exception ex) {
                StopDiscovery(); result.Text = Failure("WFD_DISCOVERY=UNAVAILABLE", ex);
            }
        }

        void UpdateList()
        {
            string selectedId = (list.SelectedItem as Peer)?.Info.Id;
            var matching = discovered.Values.Where(x => Match(x.Name)).OrderBy(x => x.Name).ToArray();
            list.BeginUpdate();
            try {
                list.Items.Clear();
                foreach (var info in matching) {
                    var peer = new Peer(info);
                    list.Items.Add(peer);
                    if (info.Id == selectedId) list.SelectedItem = peer;
                }
            } finally { list.EndUpdate(); }
        }

        void StopDiscovery()
        {
            discoveryTimer.Stop();
            var old = watcher; watcher = null;
            if (old == null) return;
            if (old.Status == DeviceWatcherStatus.Started || old.Status == DeviceWatcherStatus.EnumerationCompleted) {
                try { old.Stop(); } catch (Exception) { /* it may already be stopping */ }
            }
        }

        void FinishDiscovery()
        {
            StopDiscovery();
            result.Text = list.Items.Count > 0
                ? "WFD_PEER=FOUND\r\n이 방 반주기의 표시 이름을 직접 확인한 뒤 선택해 주세요."
                : "WFD_PEER=NOT_SEEN\r\n이번 검색에서는 TJ 장치를 찾지 못했습니다. P2의 휴대폰 연결 화면과 동글 드라이버를 확인한 뒤 다시 찾으세요.";
        }

        async Task TestLink()
        {
            var peer = list.SelectedItem as Peer;
            if (testing || peer == null) return;
            StopDiscovery();
            if (MessageBox.Show(this, "이 방 반주기의 이름과 일치합니까?\r\n\r\n" + peer.Info.Name +
                "\r\n\r\nWindows에서 페어링 승인을 요청할 수 있습니다.", "시험할 반주기 확인",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            testing = true; search.Enabled = connect.Enabled = list.Enabled = false;
            using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(closing.Token)) {
                timeout.CancelAfter(TimeSpan.FromSeconds(75));
                try {
                    if (!peer.Info.Pairing.IsPaired) {
                        result.Text = "Windows 페어링 진행 중입니다. Windows 또는 반주기에 승인 창이 뜨면 장치 이름을 확인하세요.";
                        var pair = await peer.Info.Pairing.PairAsync().AsTask(timeout.Token);
                        if (pair.Status != DevicePairingResultStatus.Paired && pair.Status != DevicePairingResultStatus.AlreadyPaired) {
                            result.Text = "WFD_PAIR=" + pair.Status + "\r\n페어링이 완료되지 않았습니다. 장치와 Windows에 표시된 안내를 확인하세요.";
                            return;
                        }
                    }
                    result.Text = "페어링된 반주기와 무선 연결을 확인하는 중입니다.";
                    using (var device = await WiFiDirectDevice.FromIdAsync(peer.Info.Id).AsTask(timeout.Token)) {
                        if (device == null || device.ConnectionStatus != WiFiDirectConnectionStatus.Connected) {
                            result.Text = "WFD_LINK=NOT_CONNECTED\r\n페어링 후 실제 무선 연결을 확인하지 못했습니다."; return;
                        }
                        bool hasEndpoint = device.GetConnectionEndpointPairs().Any(p => p.RemoteHostName != null && p.LocalHostName != null);
                        result.Text = "WFD_LINK=CONNECTED\r\nENDPOINT_PAIR=" + (hasEndpoint ? "PRESENT" : "MISSING") +
                            "\r\nWindows 무선 연결 결과입니다. P2 리모컨 등록과 HDMI 입력 전환은 별도 단계입니다.";
                    }
                } catch (OperationCanceledException) {
                    if (!closing.IsCancellationRequested) result.Text = "WFD_LINK=TIMEOUT_OR_CANCELLED\r\n시간이 지났거나 승인이 취소됐습니다.";
                } catch (Exception ex) {
                    if (!closing.IsCancellationRequested) result.Text = Failure("WFD_LINK=UNAVAILABLE", ex);
                } finally {
                    testing = false;
                    if (!closing.IsCancellationRequested) { search.Enabled = list.Enabled = true; connect.Enabled = list.SelectedItem is Peer; }
                }
            }
        }

        static string Failure(string label, Exception ex)
        {
            return label + "\r\nWindows 오류 0x" + ex.HResult.ToString("X8") +
                "\r\n무선랜 드라이버, Wi-Fi/위치 액세스 및 반주기의 연결 대기 상태를 확인해 주세요.";
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) { discoveryTimer.Dispose(); closing.Dispose(); }
            base.Dispose(disposing);
        }
    }
}
