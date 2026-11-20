using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

internal static class DesktopLink {
    [ComImport,Guid("00021401-0000-0000-C000-000000000046")] sealed class NativeLink {}
    [ComImport,Guid("000214F9-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellLinkW {
        void GetPath([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder path,int capacity,IntPtr fileData,uint flags);
        void GetIDList(out IntPtr idList);
        void SetIDList(IntPtr idList);
        void GetDescription([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder text,int capacity);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
        void GetWorkingDirectory([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder path,int capacity);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string path);
        void GetArguments([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder args,int capacity);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
        void GetHotkey(out short key);
        void SetHotkey(short key);
        void GetShowCmd(out int cmd);
        void SetShowCmd(int cmd);
        void GetIconLocation([Out,MarshalAs(UnmanagedType.LPWStr)] StringBuilder path,int capacity,out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path,int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path,uint reserved);
        void Resolve(IntPtr owner,uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }
    internal static void Save(string path,string target) {
        object instance=new NativeLink();
        try {
            var link=(IShellLinkW)instance;
            link.SetPath(target);link.SetArguments("--open");link.SetIconLocation(target,0);
            link.SetWorkingDirectory(Path.GetDirectoryName(target));link.SetDescription("이 방의 P2 리모컨과 손님용 QR 열기");
            ((IPersistFile)instance).Save(path,true);
        } finally { Marshal.FinalReleaseComObject(instance); }
    }
}
