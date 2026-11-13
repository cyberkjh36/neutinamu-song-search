using System;
using System.Collections.Generic;
using System.Drawing;
using System.Diagnostics;
using System.IO;
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
            if(args.Length==2 && (args[0]=="--pair-worker" || args[0]=="--self-test-stalled-child")){
                if(!Int32.TryParse(args[1],out int parentId) || parentId<=0)return 2;
                return PairHelper.Run(args[0]=="--self-test-stalled-child",parentId);
            }
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
        readonly Button stopTest=new Button { Text="시험 중지", AutoSize=true, Visible=false };
        readonly System.Windows.Forms.Timer progress=new System.Windows.Forms.Timer { Interval=250 };
        readonly Stopwatch elapsed=new Stopwatch();
        readonly ApprovalPanel approval=new ApprovalPanel();
        Process worker;
        string phase, peerLabel;
        bool approvalSeen, approvedHere;
        int limitMs=75000;

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

            Text = "느티나무 P2 · 방 PC 연결 시험 0.6";
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(590, 480);
            Size = new Size(720, 575);
            Font = new Font("Malgun Gothic", 11);
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), RowCount = 5, ColumnCount = 1 };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            layout.Controls.Add(new Label { Text = "먼저 반주기를 찾고, 이 방에서 쓰는 P2 이름을 확인한 뒤 연결 시험을 누르세요.", AutoSize = true, MaximumSize = new Size(620, 0) }, 0, 0);
            layout.Controls.Add(list, 0, 1);
            var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, Margin = new Padding(0, 8, 0, 8) };
            buttons.Controls.AddRange(new Control[] { search, connect, stopTest, settings, copy });
            layout.Controls.Add(buttons, 0, 2);
            layout.Controls.Add(approval, 0, 3);
            layout.Controls.Add(result, 0, 4);
            Controls.Add(layout);
            result.Text = "동글과 드라이버를 준비한 방 PC에서 실행하세요. 인터넷은 유선 LAN을 계속 사용합니다. 이 도구는 Windows의 무선 연결을 시험하며 TV 메뉴나 예약곡을 조작하지 않습니다.";
            search.Click += (s,e) => StartDiscovery();
            stopTest.Click += (s,e) => FinishWorker(EndReport("CANCELLED"));
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
            connect.Click += (s,e) => TestLink();
            discoveryTimer.Tick += (s,e) => FinishDiscovery();
            FormClosing += (s,e) => { FinishWorker(null);closing.Cancel(); CancelSurvey(); StopDiscovery(); };
            if (smoke) Shown += async (s,e) => {
                selfTestPassed = search.Enabled && !connect.Enabled && list.Items.Count == 0 && result.ReadOnly;
                StartDiscovery(false);
                await Task.Delay(150);
                FinishDiscovery();
                selfTestPassed &= result.Text.Contains("WFD_PEER=") && !testing;
                var wlan = await Task.Run(()=>WifiSurvey.ReadAsync(false, closing.Token));
                selfTestPassed &= wlan.Report().Contains("TJ_WIFI=") && !String.IsNullOrEmpty(wlan.NextStep());
                selfTestPassed &= await PairRecovery.Check() && await RemotePort.SelfTest() && await TestFrozenWorker();
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

        string EndReport(string outcome)
        {
            if(phase=="REMOTE")return RemotePort.LinkPrefix+outcome+"\r\n결과 복사를 눌러 보내 주세요.";
            return "WFD_"+phase+"="+outcome+"\r\nPAIR_REQUEST="+(approvalSeen?"RECEIVED":"NOT_RECEIVED")+
                "\r\nAPPROVAL_CLICKED="+(approvedHere?"YES":"NO")+"\r\n결과 복사를 눌러 보내주세요.";
        }

        void RenderProgress()
        {
            if(!testing)return;
            int left=limitMs-(int)elapsed.ElapsedMilliseconds;
            if(left<=0){FinishWorker(EndReport("TIMEOUT"));return;}
            string message;
            if(phase=="REMOTE")message="P2 리모컨 서비스에 접속하는 중입니다. 입력 전환 명령은 보내지 않습니다.";
            else if(phase=="LINK")message="승인을 마쳤습니다. 반주기와의 무선 연결을 확인합니다.";
            else if(approval.Visible)message="승인 요청이 왔습니다. 이 창의 ‘연결 승인’을 눌러 주세요.";
            else if(approvedHere)message="승인을 눌렀습니다. Windows와 반주기의 응답을 기다립니다.";
            else if(phase=="BUSY")message="Windows가 기존 연결 작업을 처리하는 동안 기다립니다.";
            else message="선택한 반주기의 승인 요청을 기다립니다.";
            result.Text=message+Environment.NewLine+"남은 시간 "+((left+999)/1000)+"초  ·  시험 중지 가능";
        }

        void TestLink()
        {
            var peer=list.SelectedItem as Peer;
            if(testing || peer==null)return;
            if(MessageBox.Show(this,"이 방 반주기의 이름과 일치합니까?\r\n\r\n"+peer.Label,
                "시험할 반주기 확인",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)!=DialogResult.Yes)return;
            StopDiscovery();CancelSurvey();
            StartWorker(peer.Info.Id,peer.Label,peer.PairedInterface,false);
        }

        void StartWorker(string id,string label,bool paired,bool simulateHang)
        {
            if(testing)return;
            string mode=simulateHang?"--self-test-stalled-child":"--pair-worker";
            int parentId;
            using(var parent=Process.GetCurrentProcess())parentId=parent.Id;
            if(!simulateHang)limitMs=75000;
            var ps=new ProcessStartInfo(Application.ExecutablePath,mode+" "+parentId){
                UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,
                StandardOutputEncoding=Encoding.UTF8
            };
            var child=new Process{StartInfo=ps};
            testing=true;worker=child;peerLabel=label;phase="PAIR";approvalSeen=approvedHere=false;
            stopTest.Visible=true;search.Enabled=list.Enabled=settings.Enabled=connect.Enabled=false;
            elapsed.Restart();progress.Start();RenderProgress();
            try{
                child.Start();
                _=ReadWorker(child);
                Send(child,"START "+(paired?"INTERFACE":"AEP")+" "+PairHelper.Encode(id));
            }catch(Exception ex){FinishWorker("WFD_TEST=START_ERROR 0x"+ex.HResult.ToString("X8"));}
        }

        async void Send(Process child,string line)
        {
            if(child!=worker)return;
            try{await child.StandardInput.WriteLineAsync(line);}
            catch(Exception){if(child==worker)FinishWorker(EndReport("PIPE_CLOSED"));}
        }

        async Task ReadWorker(Process child)
        {
            try{
                while(child==worker){
                    var line=await child.StandardOutput.ReadLineAsync();
                    if(child!=worker)return;
                    if(line==null){FinishWorker(EndReport("WORKER_EXIT"));return;}
                    if(line.StartsWith("RESULT ",StringComparison.Ordinal)){
                        FinishWorker(PairHelper.Decode(line.Substring(7)));return;
                    }
                    if(line.StartsWith("PHASE ",StringComparison.Ordinal)){
                        var next=line.Substring(6);
                        if(next=="REMOTE" && phase!="REMOTE"){phase=next;limitMs=15000;elapsed.Restart();}
                        else if(next=="LINK" || next=="BUSY")phase=next;
                    }else if(line.StartsWith("PROMPT ",StringComparison.Ordinal)){
                        var fields=line.Split(' ');
                        if(fields.Length!=3 || !Enum.TryParse(fields[1],out DevicePairingKinds kind) ||
                            !approval.ShowRequest(peerLabel,kind,PairHelper.Decode(fields[2]),value=>{
                                if(child!=worker)return;
                                approvedHere=true;RenderProgress();
                                Send(child,"ALLOW "+PairHelper.Encode(value));
                            })){
                            FinishWorker(EndReport("UNSUPPORTED_PROMPT"));return;
                        }
                        approvalSeen=true;
                    }
                    RenderProgress();
                }
            }catch(Exception){if(child==worker)FinishWorker(EndReport("WORKER_ERROR"));}
        }

        void FinishWorker(string report)
        {
            if(!testing)return;
            var old=worker;worker=null;testing=false;
            progress.Stop();elapsed.Stop();approval.Clear();stopTest.Visible=false;
            settings.Enabled=search.Enabled=list.Enabled=true;connect.Enabled=list.SelectedItem is Peer;
            if(report!=null)result.Text=report;
            // Kill only the child created for this attempt. Do not wait for the
            // WinRT driver or a cancellation callback on the window thread.
            try{if(!old.HasExited)old.Kill();}
            catch(InvalidOperationException){}
            catch(System.ComponentModel.Win32Exception){}
            finally{old.Dispose();}
        }

        async Task<bool> TestFrozenWorker()
        {
            for(int pass=0;pass<2;pass++){
                limitMs=10000;
                StartWorker("mock","시험 P2",false,true);
                var until=Stopwatch.StartNew();
                while(testing && !approval.Visible && until.ElapsedMilliseconds<6000)await Task.Delay(30);
                if(!testing || !approval.Visible){FinishWorker(null);return false;}
                approval.Approve.PerformClick();
                if(!approvedHere || approval.Visible){FinishWorker(null);return false;}
                if(pass==0){
                    limitMs=(int)elapsed.ElapsedMilliseconds+500;
                }else stopTest.PerformClick();
                until.Restart();
                while(testing && until.ElapsedMilliseconds<2500)await Task.Delay(25);
                if(testing){FinishWorker(null);return false;}
                string expected=pass==0?"TIMEOUT":"CANCELLED";
                if(!search.Enabled || stopTest.Visible || !result.Text.Contains("WFD_PAIR="+expected) ||
                    !result.Text.Contains("APPROVAL_CLICKED=YES"))return false;
            }
            limitMs=75000;return true;
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) { discoveryTimer.Dispose(); progress.Dispose(); closing.Dispose(); }
            base.Dispose(disposing);
        }
    }
}
