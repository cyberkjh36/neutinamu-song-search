using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Windows.Forms;

internal static class RoomQrSetup {
    internal static string Install(byte[] bytes){
        string folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","NeutinamuRoomRemote","1.3.1");
        Directory.CreateDirectory(folder);
        string target=Path.Combine(folder,"RoomRemote.exe");
        using(var sha=SHA256.Create()){
            if(File.Exists(target) && sha.ComputeHash(bytes).SequenceEqual(sha.ComputeHash(File.ReadAllBytes(target))))return target;
        }
        string temp=Path.Combine(folder,Guid.NewGuid().ToString("N")+".tmp");
        try{
            File.WriteAllBytes(temp,bytes);
            if(File.Exists(target))File.Replace(temp,target,null);
            else File.Move(temp,target);
        }finally{if(File.Exists(temp))File.Delete(temp);}
        return target;
    }

    [STAThread] static void Main(){
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        byte[] bytes=InstallPasswordDialog.Ask();
        if(bytes==null)return;
        try{
            string target=Install(bytes);
            using(var setup=Process.Start(new ProcessStartInfo(target,"--install-only"){UseShellExecute=false})){
                if(!setup.WaitForExit(30000)||setup.ExitCode!=0)throw new IOException("바탕화면에 바로가기를 만들지 못했습니다.");
            }
            using(Process.Start(new ProcessStartInfo(target,"--open"){UseShellExecute=false})){}
        }catch(Exception error){MessageBox.Show("방 QR 설치를 완료하지 못했습니다.\r\n"+error.GetBaseException().Message,"느티나무 노래방 리모컨");}
        finally{Array.Clear(bytes,0,bytes.Length);}
    }
}
