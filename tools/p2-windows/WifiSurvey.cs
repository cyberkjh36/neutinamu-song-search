using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Neutinamu.RoomLink
{
    // The WLAN list shows broadcast SSIDs. Its entries are not WinRT peer IDs.
    sealed class WifiSurvey
    {
        public readonly List<string> Adapters = new List<string>();
        public readonly Dictionary<string,bool> Networks = new Dictionary<string,bool>(StringComparer.Ordinal);
        public readonly SortedSet<uint> Errors = new SortedSet<uint>();
        public bool InterfacesRead;
        public bool NetworksRead;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct InterfaceInfo
        {
            public Guid Id;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string Description;
            public uint State;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct Available
        {
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string Profile;
            public uint Length;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)] public byte[] Ssid;
            public uint Type, BssidCount, Connectable, Reason, PhyCount;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)] public uint[] Phys;
            public uint MorePhy, Signal, Security, Auth, Cipher, Flags, Reserved;
        }

        [DllImport("wlanapi.dll")] static extern uint WlanOpenHandle(uint version, IntPtr reserved, out uint negotiated, out IntPtr handle);
        [DllImport("wlanapi.dll")] static extern uint WlanCloseHandle(IntPtr handle, IntPtr reserved);
        [DllImport("wlanapi.dll")] static extern uint WlanEnumInterfaces(IntPtr h, IntPtr reserved, out IntPtr list);
        [DllImport("wlanapi.dll")] static extern uint WlanScan(IntPtr h, ref Guid id, IntPtr ssid, IntPtr ies, IntPtr reserved);
        [DllImport("wlanapi.dll")] static extern uint WlanGetAvailableNetworkList(IntPtr h,ref Guid id,uint flags,IntPtr reserved,out IntPtr list);
        [DllImport("wlanapi.dll")] static extern void WlanFreeMemory(IntPtr buffer);

        static List<T> CopyList<T>(IntPtr list) where T : struct
        {
            var items = new List<T>();
            try {
                int count = Marshal.ReadInt32(list);
                int stride = Marshal.SizeOf(typeof(T));
                for (int i = 0; i < count; i++) {
                    items.Add((T)Marshal.PtrToStructure(IntPtr.Add(list,checked(8+i*stride)), typeof(T)));
                }
            } finally { WlanFreeMemory(list); }
            return items;
        }

        public static async Task<WifiSurvey> ReadAsync(bool refresh, CancellationToken cancel)
        {
            var data = new WifiSurvey();
            IntPtr h = IntPtr.Zero;
            try {
                uint status = WlanOpenHandle(2,IntPtr.Zero,out _,out h);
                if (status != 0) { data.Errors.Add(status); return data; }
                status = WlanEnumInterfaces(h,IntPtr.Zero,out var list);
                if (status != 0) { data.Errors.Add(status); return data; }
                var adapters = CopyList<InterfaceInfo>(list);
                data.InterfacesRead = true;
                bool requested = false;
                foreach (var adapter in adapters) {
                    cancel.ThrowIfCancellationRequested();
                    data.Adapters.Add(adapter.Description);
                    if (!refresh) continue;
                    var id = adapter.Id;
                    status = WlanScan(h,ref id,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
                    if (status == 0) requested = true;
                    else data.Errors.Add(status);
                }
                if (requested) await Task.Delay(4500,cancel).ConfigureAwait(false);
                foreach (var adapter in adapters) {
                    cancel.ThrowIfCancellationRequested();
                    var id = adapter.Id;
                    status = WlanGetAvailableNetworkList(h,ref id,0,IntPtr.Zero,out list);
                    if (status != 0) { data.Errors.Add(status); continue; }
                    data.NetworksRead = true;
                    foreach (var net in CopyList<Available>(list)) {
                        if (net.Length == 0 || net.Length > 32) continue;
                        var name = Encoding.UTF8.GetString(net.Ssid,0,(int)net.Length);
                        if (!RoomForm.Match(name)) continue;
                        bool connected = (net.Flags & 1) != 0;
                        data.Networks[name] = connected || (data.Networks.TryGetValue(name,out var old) && old);
                    }
                }
            } catch (DllNotFoundException) { data.Errors.Add(126); }
            catch (EntryPointNotFoundException) { data.Errors.Add(127); }
            finally { if (h != IntPtr.Zero) WlanCloseHandle(h,IntPtr.Zero); }
            return data;
        }

        public string Report()
        {
            string state = Networks.Any(x=>x.Value) ? "CONNECTED" : Networks.Count>0 ? "VISIBLE" : NetworksRead ? "NOT_SEEN" : "UNKNOWN";
            var lines = new List<string> {
                "무선랜 장치: " + (Adapters.Count>0 ? String.Join(", ",Adapters) : InterfacesRead ? "없음" : "확인 불가"),
                "TJ_WIFI=" + state
            };
            foreach (var name in Networks.Keys.OrderBy(s=>s)) lines.Add("  " + name + (Networks[name] ? " (Windows 연결 중)" : ""));
            if (Errors.Count>0) lines.Add("WLAN_ERROR=" + String.Join(",",Errors));
            return String.Join(Environment.NewLine,lines);
        }

        public string NextStep()
        {
            if (Networks.Any(x=>x.Value)) return "Windows가 TJ 무선망에 연결돼 있습니다. 아래 결과를 보내주세요. P2 리모컨 연결은 별도 확인이 필요합니다.";
            if (Errors.Contains(5) && Networks.Count==0) return "Windows가 Wi-Fi 조회를 거부했습니다. 설정에서 위치 서비스를 확인한 뒤 다시 검색하세요.";
            if (InterfacesRead && Adapters.Count==0) return "Windows에 무선랜 장치가 없습니다. USB 동글 및 해당 모델의 Windows 드라이버를 확인하세요.";
            if (Networks.Count>0) return "TJ 무선 신호가 보입니다. 반주기에서 휴대폰 연결 화면을 열고 다시 찾거나, 이 화면을 보내주세요.";
            if (Errors.Contains(1062)) return "Windows의 WLAN AutoConfig 서비스가 실행 중인지 확인하세요.";
            if (!NetworksRead) return "Windows Wi-Fi 목록을 확인할 수 없습니다. 아래 오류 번호와 결과를 보내주세요.";
            return "Windows의 Wi-Fi를 켜고 반주기의 휴대폰 연결 화면을 연 뒤 다시 찾아보세요.";
        }

        public static bool LayoutMatchesWindows()
        {
            return Marshal.SizeOf(typeof(InterfaceInfo))==532 && Marshal.SizeOf(typeof(Available))==628 &&
                   Marshal.OffsetOf(typeof(Available),"Length").ToInt32()==512 &&
                   Marshal.OffsetOf(typeof(Available),"Flags").ToInt32()==620;
        }
    }
}
