using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace WorldKaraokeLauncher {
    enum YouTubeUseMode { Guest, SignIn }
    class YouTubeUseModeForm : Form {
        public YouTubeUseMode SelectedMode { get { return YouTubeUseMode.Guest; } }
        public YouTubeUseModeForm() { Program.Mark("chooser"); }
        protected override void OnShown(EventArgs e) { base.OnShown(e); DialogResult = DialogResult.OK; }
    }
    class LanguageProfile { public string Hl; }
    static class LanguageCatalog {
        public static LanguageProfile[] All = {new LanguageProfile {Hl="th"},new LanguageProfile {Hl="ko"}};
    }
    class KaraokeForm : Form {
        LanguageProfile selectedCountry;
        Form phoneSearch;
        public KaraokeForm(YouTubeUseMode mode) {
            Program.Mark("mode=" + mode);
            Controls.Add(MakeButton("휴대폰 마이크 연결 / Phone microphone", OpenPhone));
            if(Environment.GetEnvironmentVariable("WORLD_TEST_SESSION")!="1")
                Shown += delegate { BeginInvoke(new Action(Close)); };
        }
        Button MakeButton(string name, EventHandler action) {
            var button = new Button {AccessibleName=name}; button.Click+=action; return button;
        }
        Task SelectCountryAsync(LanguageProfile country) {
            selectedCountry=country; Program.Mark("language=" + country.Hl);
            return Task.FromResult(country.Hl=="ko");
        }
        void OpenPhone(object sender,EventArgs e) {
            if (phoneSearch!=null && phoneSearch.Visible) { Program.Mark("unexpected-toggle"); return; }
            if (selectedCountry!=null) { phoneSearch=new Form{Text="휴대폰 음성검색 · Android / iPhone"}; phoneSearch.Show(this); Program.Mark("phone-ready"); }
        }
    }
    class Program {
        internal static void Mark(string text) { File.AppendAllText(Environment.GetEnvironmentVariable("WORLD_TEST_RESULT"),text+"\n"); }
        [STAThread] static void Main() { if(Environment.GetEnvironmentVariable("WORLD_TEST_HOLD")=="1") { System.Threading.Thread.Sleep(30000); return; } RunWindows(); }
        static void RunWindows() {
            Application.EnableVisualStyles();
            YouTubeUseMode mode;
            using (var picker=new YouTubeUseModeForm()) {
                if (picker.ShowDialog()!=DialogResult.OK) return;
                mode=picker.SelectedMode;
            }
            using(var form=new KaraokeForm(mode)) { Application.Run(form); }
        }
    }
}
