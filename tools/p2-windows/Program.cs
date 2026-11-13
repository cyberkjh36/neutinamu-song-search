using System;
using System.Collections.Generic;
using System.Drawing;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
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
            bool first;
            using(var instance=new Mutex(false,@"Local\Neutinamu.P2.RoomLink.FieldTest",out first)){
                if(!first){
                    MessageBox.Show("이미 열린 방 PC 연결 시험 창을 사용해 주세요.","느티나무 P2");
                    return 0;
                }
                Application.Run(new RoomForm());
            }
            return 0;
        }
    }

    sealed class Peer
    {
        public readonly DeviceInformation Info;
        public readonly string Label;
        public readonly bool PairedInterface;
        public Peer(DeviceInformation info, string label, bool paired) { Info=info; Label=label; PairedInterface=paired; }
        public override string ToString() { return Label; }
    }

    sealed class RoomForm : Form
    {
        readonly ListBox list = new ListBox { Dock = DockStyle.Fill };
        readonly Button search = new Button { Text = "반주기 찾기", AutoSize = true };
        readonly Button connect = new Button { Text = "선택한 반주기 연결 시험", AutoSize = true, Enabled = false };
        readonly TextBox result = new TextBox { ReadOnly = true, Multiline = true, Dock = DockStyle.Fill, ScrollBars = ScrollBars.Vertical };
        readonly System.Windows.Forms.Timer discoveryTimer = new System.Windows.Forms.Timer { Interval = 30000 };
        readonly Dictionary<DeviceWatcher, Dictionary<string, DeviceInformation>> sources =
            new Dictionary<DeviceWatcher, Dictionary<string, DeviceInformation>>();
        readonly HashSet<DeviceWatcher> pairedSources = new HashSet<DeviceWatcher>();
        readonly List<string> watcherErrors = new List<string>();
        readonly Button settings = new Button { Text = "Windows Wi-Fi 열기", AutoSize = true };
        readonly Button copy = new Button { Text = "결과 복사", AutoSize = true };
        CancellationTokenSource surveyCancel;
        WifiSurvey survey;
        int searchRound, supportedSources;
        bool scanning;
        readonly CancellationTokenSource closing = new CancellationTokenSource();

        bool testing;
        CancellationTokenSource activeAttempt;
        readonly Button stopTest=new Button { Text="시험 중지", AutoSize=true, Visible=false };
        readonly System.Windows.Forms.Timer progress=new System.Windows.Forms.Timer { Interval=500 };
        readonly Stopwatch elapsed=new Stopwatch();
        const int TestSeconds=75;
        string phase;
        bool approvalSeen, approvalOutstanding, userStopped;
        PairRecovery recovery;
        Task<DevicePairingResult> outstandingWindowsPair;
        SynchronizationContext ui;

        bool selfTestPassed;

        internal static bool Match(string name)
        {
            if (String.IsNullOrWhiteSpace(name)) return false;
            string normalized=name.Normalize(NormalizationForm.FormKC).Trim();
            return Regex.IsMatch(normalized, @"^(?:DIRECT[\s_-]+(?:[a-z0-9]{2}[\s_-]+)?TJ(?:[\s_-]|$)|TJ[\s_-]*P2(?:[\s_-]|$))",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        }

        static string MatchingName(DeviceInformation info)
        {
            if (Match(info.Name)) return info.Name;
            foreach (var key in new[] {"System.ItemNameDisplay", "System.Devices.FriendlyName"}) {
                if (info.Properties.TryGetValue(key,out object value) && value is string name && Match(name)) return name;
            }
            return null;
        }

        internal static bool SelfTest()
        {
            if (!Match("DIRECT-TJ-2 A1P 0000000001") || !Match("TJ_P2_TEST") ||
                !Match("DIRECT-ab-TJ_P2_test") || !Match(" TJ-P2-room ") || !Match("TJ P2") ||
                Match("DIRECT-ab-printer") || !WifiSurvey.LayoutMatchesWindows() || Match("HomeWiFi") || Match("near-DIRECT-TJ-X") || Match(null)) return false;
            var sample = new WifiSurvey { InterfacesRead=true };
            if (!sample.NextStep().Contains("USB") || !sample.Report().Contains("TJ_WIFI=UNKNOWN")) return false;
            sample.Adapters.Add("TEST"); sample.NetworksRead=true;
            if (!sample.Report().Contains("TJ_WIFI=NOT_SEEN")) return false;
            sample.Networks["DIRECT-TJ-TEST"]=false;
            if (!sample.Report().Contains("TJ_WIFI=VISIBLE") || !sample.NextStep().Contains("휴대폰 연결")) return false;
            sample.Networks["DIRECT-TJ-TEST"]=true;
            if (!sample.Report().Contains("TJ_WIFI=CONNECTED")) return false;
            sample.Networks.Clear(); sample.Errors.Add(5);
            if (!sample.NextStep().Contains("위치")) return false;
            using (var form = new RoomForm(true))
            {
                Application.Run(form);
                return form.selfTestPassed;
            }
        }

        internal RoomForm(bool smoke = false)
        {

            Text = "느티나무 P2 · 방 PC 연결 시험 0.4";
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(590, 480);
            Size = new Size(720, 575);
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
            buttons.Controls.AddRange(new Control[] { search, connect, stopTest, settings, copy });
            layout.Controls.Add(buttons, 0, 2);
            layout.Controls.Add(result, 0, 3);
            Controls.Add(layout);
            result.Text = "동글과 드라이버를 준비한 방 PC에서 실행하세요. 인터넷은 유선 LAN을 계속 사용합니다. 이 도구는 Windows의 무선 연결을 시험하며 TV 메뉴나 예약곡을 조작하지 않습니다.";
            search.Click += (s,e) => StartDiscovery();
            stopTest.Click += (s,e) => {userStopped=true;activeAttempt?.Cancel();};
            progress.Tick+=(s,e)=>RenderProgress();
            settings.Click += (s,e) => {
                try { Process.Start(new ProcessStartInfo("ms-settings:network-wifi") { UseShellExecute=true }); }
                catch (System.ComponentModel.Win32Exception) {
                    MessageBox.Show(this,"Windows 설정 → 네트워크 및 인터넷 → Wi-Fi를 열어 주세요.");
                }
            };
            copy.Click += (s,e) => {
                try { Clipboard.SetText(result.Text); }
                catch (System.Runtime.InteropServices.ExternalException) { result.SelectAll(); result.Focus(); }
            };
            list.SelectedIndexChanged += (s,e) => connect.Enabled = !testing && list.SelectedItem is Peer;
            connect.Click += async (s,e) => await TestLink();
            discoveryTimer.Tick += (s,e) => FinishDiscovery();
            FormClosing += (s,e) => { closing.Cancel(); CancelSurvey(); StopDiscovery(); };
            if (smoke) Shown += async (s,e) => {
                selfTestPassed = search.Enabled && !connect.Enabled && list.Items.Count == 0 && result.ReadOnly;
                StartDiscovery(false);
                await Task.Delay(150);
                FinishDiscovery();
                selfTestPassed &= result.Text.Contains("WFD_PEER=") && !testing;
                var wlan = await Task.Run(()=>WifiSurvey.ReadAsync(false, closing.Token));
                selfTestPassed &= wlan.Report().Contains("TJ_WIFI=") && !String.IsNullOrEmpty(wlan.NextStep());
                selfTestPassed &= PairApproval.CheckControls() && await TestTimeoutBehavior() && await PairRecovery.Check();
                Close();
            };
        }

        void Dispatch(DeviceWatcher source, Action work)
        {
            if (IsDisposed || Disposing || !IsHandleCreated) return;
            try {
                BeginInvoke((Action)(() => { if (!IsDisposed && sources.ContainsKey(source)) work(); }));
            } catch (InvalidOperationException) { /* window closed */ }
        }

        void StartDiscovery(bool refresh=true)
        {
            if (testing) return;
            CancelSurvey(); StopDiscovery(); list.Items.Clear(); connect.Enabled = false;
            watcherErrors.Clear(); peersSeen=0; supportedSources=0; survey=null; scanning=true;
            int round=++searchRound;
            surveyCancel=CancellationTokenSource.CreateLinkedTokenSource(closing.Token);
            StartWatcher(false);
            StartWatcher(true);
            discoveryTimer.Start();
            RenderSearch();
            _ = ReadWifi(round, refresh, surveyCancel.Token);
        }

        void StartWatcher(bool paired)
        {
            DeviceWatcher current=null;
            try {
                string selector = paired ? WiFiDirectDevice.GetDeviceSelector()
                    : WiFiDirectDevice.GetDeviceSelector(WiFiDirectDeviceSelectorType.AssociationEndpoint);
                current=DeviceInformation.CreateWatcher(selector,new[] {"System.ItemNameDisplay","System.Devices.FriendlyName"});
                sources[current]=new Dictionary<string,DeviceInformation>();
                if(paired) pairedSources.Add(current);
                current.Added += (src,info)=>Dispatch(src,()=>{
                    sources[src][info.Id]=info; UpdateList();
                });
                current.Updated += (src,change)=>Dispatch(src,()=>{
                    if(sources[src].TryGetValue(change.Id,out var info)) {info.Update(change); UpdateList();}
                });
                current.Removed += (src,change)=>Dispatch(src,()=>{sources[src].Remove(change.Id);UpdateList();});
                current.EnumerationCompleted += (src,args)=>{};
                current.Stopped += (src,args)=>Dispatch(src,()=>{
                    if(src.Status==DeviceWatcherStatus.Aborted){
                        supportedSources--;
                        watcherErrors.Add((paired?"저장된 장치":"주변 장치")+" 검색 중단");
                        sources.Remove(src);pairedSources.Remove(src);UpdateList();
                    }
                });
                current.Start(); supportedSources++;
            } catch(Exception ex) {
                if(current!=null){sources.Remove(current);pairedSources.Remove(current);}
                watcherErrors.Add((paired?"저장된 장치":"주변 장치")+" 검색 오류 0x"+ex.HResult.ToString("X8"));
            }
        }

        void CancelSurvey()
        {
            var old=surveyCancel;surveyCancel=null;
            if(old!=null){old.Cancel();old.Dispose();}
        }

        async Task ReadWifi(int round, bool refresh, CancellationToken token)
        {
            try {
                var next=await Task.Run(()=>WifiSurvey.ReadAsync(refresh,token),token);
                if(round!=searchRound || token.IsCancellationRequested || IsDisposed)return;
                survey=next;
            } catch(OperationCanceledException){return;}
              catch(Exception ex){
                if(round!=searchRound || token.IsCancellationRequested || IsDisposed)return;
                watcherErrors.Add("Windows Wi-Fi 확인 오류 0x"+ex.HResult.ToString("X8"));
                survey=new WifiSurvey();
              }
            RenderSearch();
        }

        IEnumerable<Peer> RecognizedPeers()
        {
            var used=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach(var src in sources.OrderBy(x=>pairedSources.Contains(x.Key))){
                bool paired=pairedSources.Contains(src.Key);
                foreach(var info in src.Value.Values){
                    var name=MatchingName(info);
                    if(name!=null && used.Add(info.Id)) yield return new Peer(info,name,paired);
                }
            }
        }

        int peersSeen;
        void UpdateList()
        {
            string selected=(list.SelectedItem as Peer)?.Info.Id;
            peersSeen=sources.Values.SelectMany(x=>x.Keys).Distinct().Count();
            list.BeginUpdate();
            try{
                list.Items.Clear();
                foreach(var peer in RecognizedPeers().OrderBy(x=>x.Label)){
                    list.Items.Add(peer);
                    if(selected==peer.Info.Id)list.SelectedItem=peer;
                }
            }finally{list.EndUpdate();}
            RenderSearch();
        }

        void StopDiscovery()
        {
            discoveryTimer.Stop();scanning=false;
            var old=sources.Keys.ToArray();sources.Clear();pairedSources.Clear();
            foreach(var item in old)try{
                if(item.Status==DeviceWatcherStatus.Started || item.Status==DeviceWatcherStatus.EnumerationCompleted)item.Stop();
            }catch(Exception){/* asynchronous stop races with device removal */}
        }

        void RenderSearch()
        {
            if(testing || IsDisposed)return;
            var lines=new List<string>();
            if(scanning)lines.Add("반주기 찾는 중 (최대 30초) …");
            string direct=list.Items.Count>0?"FOUND":scanning?"SEARCHING":supportedSources==0?"UNAVAILABLE":"NOT_SEEN";
            lines.Add("WFD_PEER="+direct+"  ·  Windows 장치 "+peersSeen+"개 / TJ 후보 "+list.Items.Count+"개");
            lines.Add(survey==null?"일반 Wi-Fi 목록 확인 중 …":survey.Report());
            lines.AddRange(watcherErrors);
            if(list.Items.Count>0)lines.Add("위 목록에서 이 방의 P2 이름을 확인하고 연결 시험을 누르세요.");
            else if(!scanning && survey!=null)lines.Add(survey.NextStep());
            result.Text=String.Join(Environment.NewLine,lines);
        }

        void FinishDiscovery()
        {
            StopDiscovery();RenderSearch();
        }

        static async Task<bool> TestTimeoutBehavior()
        {
            var driver=new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
            var discarded=new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
            using(var cts=new CancellationTokenSource()){
                var wait=PairWait.Until(driver.Task,cts.Token,v=>discarded.TrySetResult(v));
                cts.Cancel();
                if(await Task.WhenAny(wait,Task.Delay(2000))!=wait)return false;
                try{await wait;return false;}catch(OperationCanceledException){}
                driver.SetResult(3);
                if(await Task.WhenAny(discarded.Task,Task.Delay(2000))!=discarded.Task)return false;
                return await discarded.Task==3 && await PairWait.Until(Task.FromResult(9),CancellationToken.None)==9;
            }
        }

        void RenderProgress()
        {
            if(!testing || activeAttempt==null || IsDisposed)return;
            string message=phase=="PAIR"
                ? approvalSeen ? "승인 요청을 받았습니다. 시험 창의 안내와 해당 방 TV를 확인해 주세요."
                               : "승인 요청을 기다리는 중입니다. 요청이 도착하면 시험 프로그램에 표시됩니다."
                : "페어링한 반주기와 무선 연결을 확인하는 중입니다.";
            if(phase=="PAIR" && recovery?.Waiting==true)
                message="Windows의 기존 연결 작업을 확인하고 있습니다. 새 승인 요청은 아직 보내지 않습니다.";
            else if(phase=="PAIR" && recovery?.Requests==2 && !approvalSeen)
                message="기존 연결을 확인한 뒤 한 번 더 요청했습니다. 승인 요청을 기다리는 중입니다.";
            int remaining=Math.Max(0,TestSeconds-(int)elapsed.Elapsed.TotalSeconds);
            result.Text=message+Environment.NewLine+"남은 시간 "+remaining+"초  ·  시험 중지 가능";
        }

        static async Task<PairState> InspectPeer(DeviceInformation selected,CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            try{
                var query=DeviceInformation.CreateFromIdAsync(selected.Id,new string[0],selected.Kind).AsTask(token);
                var info=await PairWait.Until(query,token);
                if(info==null || !String.Equals(info.Id,selected.Id,StringComparison.OrdinalIgnoreCase))return PairState.Unknown;
                return info.Pairing.IsPaired ? PairState.Paired : info.Pairing.CanPair ? PairState.Available : PairState.NotReady;
            }catch(OperationCanceledException){throw;}
             catch(Exception){return PairState.Unknown;}
        }

        async Task<DevicePairingResultStatus> RequestPair(Peer peer,CancellationToken token)
        {
            var custom=peer.Info.Pairing.Custom;
            var config=new WiFiDirectConnectionParameters();
            // Prefer push-button confirmation. Leave PIN methods available if
            // negotiated by the devices. Any PIN comes from the pairing UI.
            var kinds=DevicePairingKinds.None;
            foreach(var method in new[]{WiFiDirectConfigurationMethod.PushButton,
                WiFiDirectConfigurationMethod.DisplayPin,WiFiDirectConfigurationMethod.ProvidePin}){
                config.PreferenceOrderedConfigurationMethods.Add(method);
                kinds|=WiFiDirectConnectionParameters.GetDevicePairingKinds(method);
            }
            Windows.Foundation.TypedEventHandler<DeviceInformationCustomPairing,DevicePairingRequestedEventArgs> handler=(sender,args)=>{
                var defer=args.GetDeferral();
                try {
                    ui.Post(async ignored=>{
                        bool opened=false;
                        try {
                            if(token.IsCancellationRequested || IsDisposed || !testing || approvalOutstanding ||
                               !String.Equals(args.DeviceInformation.Id,peer.Info.Id,StringComparison.OrdinalIgnoreCase))return;
                            opened=true;approvalOutstanding=true;approvalSeen=true;RenderProgress();
                            string response=await PairApproval.AskAsync(this,peer.Label,args.PairingKind,args.Pin,token);
                            if(token.IsCancellationRequested || IsDisposed)return;
                            if(response==null){userStopped=true;activeAttempt?.Cancel();return;}
                            if(args.PairingKind==DevicePairingKinds.ProvidePin)args.Accept(response);
                            else args.Accept();
                        } catch(OperationCanceledException){}
                          catch(Exception ex){if(!token.IsCancellationRequested && !IsDisposed){promptError=ex.HResult;activeAttempt?.Cancel();}}
                        finally {
                            if(opened && !IsDisposed && activeAttempt!=null && token==activeAttempt.Token)approvalOutstanding=false;
                            try{defer.Complete();}catch(Exception){}
                        }
                    },null);
                } catch(Exception){try{defer.Complete();}catch(Exception){}}
            };
            custom.PairingRequested+=handler;
            try {
                token.ThrowIfCancellationRequested();
                var operation=custom.PairAsync(kinds,DevicePairingProtectionLevel.Default,config);
                var task=operation.AsTask();
                outstandingWindowsPair=task;
                using(token.Register(()=>{try{operation.Cancel();}catch(Exception){}})){
                    var result=await PairWait.Until(task,token);
                    return result.Status;
                }
            } finally { custom.PairingRequested-=handler; }
        }

        int? promptError;
        async Task TestLink()
        {
            var peer=list.SelectedItem as Peer;
            if(testing || peer==null)return;
            if(outstandingWindowsPair!=null && !outstandingWindowsPair.IsCompleted){
                result.Text="WFD_PAIR=PREVIOUS_REQUEST_PENDING\r\n이 창에서 보낸 이전 요청을 Windows가 마무리하고 있습니다. 잠시 뒤 다시 눌러 주세요.";
                return;
            }
            if(MessageBox.Show(this,"이 방 반주기의 이름과 일치합니까?\r\n\r\n"+peer.Label,
                "시험할 반주기 확인",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)!=DialogResult.Yes)return;
            StopDiscovery();CancelSurvey();ui=SynchronizationContext.Current;
            testing=true;search.Enabled=connect.Enabled=list.Enabled=settings.Enabled=false;stopTest.Visible=true;
            approvalSeen=approvalOutstanding=userStopped=false;promptError=null;recovery=new PairRecovery();phase="PAIR";elapsed.Restart();
            using(var timeout=CancellationTokenSource.CreateLinkedTokenSource(closing.Token)){
                activeAttempt=timeout;timeout.CancelAfter(TimeSpan.FromSeconds(TestSeconds));
                progress.Start();RenderProgress();
                try {
                    if(!peer.PairedInterface){
                        var status=await recovery.Run(
                            t=>InspectPeer(peer.Info,t),
                            t=>RequestPair(peer,t),
                            t=>Task.Delay(1500,t),timeout.Token);
                        if(status!=DevicePairingResultStatus.Paired && status!=DevicePairingResultStatus.AlreadyPaired){
                            string help=status==DevicePairingResultStatus.OperationAlreadyInProgress
                                ? "Windows가 여전히 이 장치의 연결 또는 해제 작업을 처리 중입니다. 열린 시험 창과 장치 추가 창을 닫고 1분 뒤 한 번만 다시 시험해 주세요."
                                : "결과 복사를 눌러 보내주세요.";
                            result.Text="WFD_PAIR="+status+"\r\nPAIR_REQUEST="+(approvalSeen?"RECEIVED":"NOT_RECEIVED")+
                                "\r\nPAIR_ATTEMPTS="+recovery.Requests+"  BUSY_CHECKS="+recovery.BusyChecks+"\r\n"+help;return;
                        }
                    }
                    phase="LINK";RenderProgress();
                    var linkTask=WiFiDirectDevice.FromIdAsync(peer.Info.Id).AsTask(timeout.Token);
                    using(var device=await PairWait.Until(linkTask,timeout.Token,d=>d?.Dispose())){
                        if(device==null || device.ConnectionStatus!=WiFiDirectConnectionStatus.Connected){
                            result.Text="WFD_LINK=NOT_CONNECTED\r\n페어링 후 실제 무선 연결을 확인하지 못했습니다.";return;
                        }
                        bool endpoints=device.GetConnectionEndpointPairs().Any(p=>p.RemoteHostName!=null && p.LocalHostName!=null);
                        result.Text="WFD_LINK=CONNECTED\r\nENDPOINT_PAIR="+(endpoints?"PRESENT":"MISSING")+
                            "\r\nWindows 무선 연결 결과입니다. HDMI 전환은 별도 시험입니다.";
                    }
                } catch(OperationCanceledException) {
                    if(!closing.IsCancellationRequested)result.Text="WFD_"+phase+"="+
                        (promptError.HasValue?"PROMPT_ERROR 0x"+promptError.Value.ToString("X8"):userStopped?"CANCELLED":"TIMEOUT")+
                        "\r\nPAIR_REQUEST="+(approvalSeen?"RECEIVED":"NOT_RECEIVED")+"\r\n결과 복사를 눌러 보내주세요.";
                } catch(Exception ex) {
                    if(!closing.IsCancellationRequested)result.Text="WFD_"+phase+"=ERROR 0x"+ex.HResult.ToString("X8")+
                        "\r\nPAIR_REQUEST="+(approvalSeen?"RECEIVED":"NOT_RECEIVED")+"\r\n결과 복사를 눌러 보내주세요.";
                } finally {
                    activeAttempt=null;testing=false;elapsed.Stop();
                    if(!closing.IsCancellationRequested){
                        progress.Stop();stopTest.Visible=false;search.Enabled=list.Enabled=settings.Enabled=true;connect.Enabled=list.SelectedItem is Peer;
                    }
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
            if (disposing) { discoveryTimer.Dispose(); progress.Dispose(); closing.Dispose(); }
            base.Dispose(disposing);
        }
    }
}
