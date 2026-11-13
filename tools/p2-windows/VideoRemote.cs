using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Neutinamu.RoomLink
{
    // Guest protocol already used in p2-direct. Only TV menu keys are exposed.
    internal static class VideoRemote
    {
        static readonly Dictionary<string,int> Keys=new Dictionary<string,int>(StringComparer.Ordinal) {
            {"VIDEO",35},{"LEFT",47},{"RIGHT",48},{"SELECT",49}
        };

        internal static string DeviceSerial(string label)
        {
            var m=Regex.Match((label??"").Trim(),@"^TJ_P2_(?:P020)?([0-9]{7})_[0-9]+_B$",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant);
            if (m.Success) return "P020"+m.Groups[1].Value;
            var direct=Regex.Match((label??"").Trim(),@"^DIRECT-(?:[A-Z0-9]{2}-)?TJ-2A1(P020[0-9]{7})$",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant);
            return direct.Success?direct.Groups[1].Value.ToUpperInvariant():null;
        }

        static string CurrentAddress(IPAddress local)
        {
            foreach(var nic in NetworkInterface.GetAllNetworkInterfaces()){
                if(nic.OperationalStatus!=OperationalStatus.Up || !nic.GetIPProperties().UnicastAddresses.Any(a=>a.Address.Equals(local)))continue;
                var bytes=nic.GetPhysicalAddress().GetAddressBytes();
                if(bytes.Length!=6 || bytes.All(b=>b==0) || (bytes[0]&1)!=0 || bytes.SequenceEqual(new byte[]{2,0,0,0,0,0}))continue;
                return String.Join(":",bytes.Select(b=>b.ToString("X2")));
            }
            return null;
        }

        internal static async Task<string> Open(TcpClient socket,IPAddress local,string label,Func<bool> linked)
        {
            string serial=DeviceSerial(label);
            if(serial==null)return "GUEST=UNKNOWN_ROOM_NAME";
            string own=CurrentAddress(local);
            if(own==null)return "GUEST=LOCAL_ADAPTER_ID_UNAVAILABLE";
            return await Session(socket.GetStream(),serial,own,linked,
                s=>{Console.WriteLine(s);Console.Out.Flush();},()=>Task.Run(()=>Console.In.ReadLine()));
        }

        sealed class Frame { internal int Code,Type; internal byte[] Body; }
        static async Task<byte[]> ReadBytes(Stream stream,int count)
        {
            var data=new byte[count];int n=0;
            while(n<count){int read=await stream.ReadAsync(data,n,count-n);if(read==0)throw new EndOfStreamException();n+=read;}
            return data;
        }
        static async Task<Frame> Read(Stream stream)
        {
            var h=await ReadBytes(stream,16);int n=BitConverter.ToInt32(h,12);
            if(n<0 || n>1024*1024)throw new InvalidDataException();
            return new Frame{Code=BitConverter.ToInt32(h,0),Type=h[11],Body=await ReadBytes(stream,n)};
        }
        static async Task Write(Stream stream,int code,byte type,byte[] body,byte flag=0)
        {
            var f=new byte[16+body.Length];
            BitConverter.GetBytes(code).CopyTo(f,0);f[4]=1;f[9]=2;f[10]=flag;f[11]=type;
            BitConverter.GetBytes(body.Length).CopyTo(f,12);body.CopyTo(f,16);
            await stream.WriteAsync(f,0,f.Length);
        }
        static bool Matches(byte[] data,string serial)
        {
            if(data.Length<20 || !data.Take(3).All(v=>(v>=65&&v<=90)||(v>=48&&v<=57)))return false;
            var expected=Encoding.ASCII.GetBytes(serial);
            return data.Skip(3).Take(expected.Length).SequenceEqual(expected) &&
                data.Skip(3+expected.Length).Take(17-expected.Length).All(v=>v==0);
        }
        internal static async Task<string> Session(Stream stream,string serial,string currentAddress,Func<bool> linked,Action<string> announce,Func<Task<string>> nextKey)
        {
            var body=new byte[47];
            Encoding.ASCII.GetBytes("TJAA").CopyTo(body,0);
            Encoding.ASCII.GetBytes("0000000000").CopyTo(body,12);
            Encoding.ASCII.GetBytes(currentAddress).CopyTo(body,27);
            await Write(stream,3000,1,body);
            bool registered=false,ready=false;
            Task<string> key=null;
            var frame=Read(stream);
            while(linked()){
                if(key!=null)await Task.WhenAny(frame,key);
                if(frame.IsCompleted || key==null || !key.IsCompleted){
                    var f=await frame;
                    if(f.Code==1000 && f.Body.Length==0)await Write(stream,1000,9,BitConverter.GetBytes(100),1);
                    if(!registered && f.Code==3000){
                        if(f.Type!=1 || f.Body.Length!=1)return "GUEST=NOT_ACCEPTED";
                        registered=true;await Write(stream,3100,0,new byte[0]);
                    }else if(registered && !ready && f.Code==3100){
                        if(f.Type!=1 || !Matches(f.Body,serial))return "GUEST=ROOM_MISMATCH";
                        ready=true;announce("PHASE VIDEO_READY");key=nextKey();
                    }
                    frame=Read(stream);
                }
                if(key!=null && key.IsCompleted){
                    string line=await key;
                    if(line==null || line=="END")return "GUEST=READY\r\nTV_MENU=ENDED";
                    if(!line.StartsWith("KEY ",StringComparison.Ordinal) || !Keys.TryGetValue(line.Substring(4),out int value))return "TV_MENU=INVALID_KEY";
                    if(!linked())return "WFD_LINK=DISCONNECTED";
                    await Write(stream,4100,1,BitConverter.GetBytes(value));
                    announce("KEY_SENT "+line.Substring(4));key=nextKey();
                }
            }
            return "WFD_LINK=DISCONNECTED";
        }

        // Simulates the actual TCP session: no key before a verified room and
        // no further command after a refusal or a wrong room identity.
        internal static async Task<bool> SelfTest()
        {
            const string serial="P0201234567";
            if(DeviceSerial("TJ_P2_1234567_7_B")!=serial || DeviceSerial("TJ_P2_"+serial+"_7_B")!=serial ||
               DeviceSerial("other")!=null)return false;
            foreach(var scenario in new[]{"normal","denied","wrong"}){
                var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();
                try{using(var phone=new TcpClient()){
                    var accept=listener.AcceptTcpClientAsync();await phone.ConnectAsync(IPAddress.Loopback,((IPEndPoint)listener.LocalEndpoint).Port);
                    using(var p2=await accept){
                        var server=p2.GetStream();var input=new Queue<string>(new[]{"KEY VIDEO","KEY RIGHT","KEY LEFT","KEY SELECT","END"});
                        var events=new List<string>();
                        var session=Session(phone.GetStream(),serial,"02:11:22:33:44:55",()=>true,events.Add,()=>Task.FromResult(input.Dequeue()));
                        var reg=await Read(server);
                        if(reg.Code!=3000 || reg.Body.Length!=47 || Encoding.ASCII.GetString(reg.Body,27,17)!="02:11:22:33:44:55")return false;
                        await Write(server,3000,1,scenario=="denied"?new byte[4]:new byte[]{11});
                        if(scenario=="denied"){if(await session!="GUEST=NOT_ACCEPTED" || events.Count!=0)return false;continue;}
                        if((await Read(server)).Code!=3100)return false;
                        await Write(server,1000,1,new byte[0]);
                        if((await Read(server)).Code!=1000)return false;
                        var info=new byte[20];Encoding.ASCII.GetBytes("P2A"+(scenario=="normal"?serial:"P0209999999")).CopyTo(info,0);
                        await Write(server,3100,1,info);
                        if(scenario=="wrong"){if(await session!="GUEST=ROOM_MISMATCH" || events.Count!=0)return false;continue;}
                        foreach(int expected in new[]{35,48,47,49}){
                            var command=await Read(server);
                            if(command.Code!=4100 || command.Type!=1 || command.Body.Length!=4 || BitConverter.ToInt32(command.Body,0)!=expected)return false;
                        }
                        if(await session!="GUEST=READY\r\nTV_MENU=ENDED" || events.Count!=5)return false;
                    }
                }}finally{listener.Stop();}
            }
            return true;
        }
    }
}
