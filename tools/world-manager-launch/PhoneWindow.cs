using System;
using System.Diagnostics;
using System.Threading;
using System.Windows.Automation;

internal static class PhoneWindow {
    static AutomationElement Named(AutomationElement parent, string text) {
        return parent.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,text));
    }
    static bool Click(AutomationElement element) {
        object pattern;
        if(element==null||!element.Current.IsEnabled||!element.TryGetCurrentPattern(InvokePattern.Pattern,out pattern))return false;
        ((InvokePattern)pattern).Invoke();return true;
    }
    internal static bool Enable(int pid, bool alreadyStarting = false) {
        if(pid<=0)return false;
        bool mode=false,country=false,opened=false;
        var timer=Stopwatch.StartNew();
        while(timer.ElapsedMilliseconds<18000) {
            try {
                var windows=AutomationElement.RootElement.FindAll(TreeScope.Children,new PropertyCondition(AutomationElement.ProcessIdProperty,pid));
                foreach(AutomationElement window in windows) {
                    string title=window.Current.Name??"";
                    if(title.Contains("Android / iPhone") || Named(window,"새 연결번호")!=null)return true;
                }
                if (!alreadyStarting) foreach(AutomationElement window in windows) {
                    if(!mode && Named(window,"YouTube 사용 방식 / Choose how to use YouTube")!=null) {
                        mode=Click(Named(window,"로그인 사용 / Sign in")??Named(window,"로그인 사용\r\nSign in")??Named(window,"로그인 사용\nSign in")??Named(window,"로그인 사용 Sign in"));
                        continue;
                    }
                    var phone=Named(window,"휴대폰 마이크 연결 / Phone microphone");
                    if(phone==null)continue;
                    if(Named(window,"국기를 눌러 언어를 선택하세요")!=null || Named(window,"먼저 국기를 선택하세요")!=null){
                        if(!country)country=Click(Named(window,"한국 · 한국어"));
                        continue;
                    }
                    if(!opened)opened=Click(phone);
                }
            } catch(ElementNotAvailableException) {} catch(ElementNotEnabledException) {} catch(InvalidOperationException) {}
            Thread.Sleep(300);
        }
        return false;
    }
}
