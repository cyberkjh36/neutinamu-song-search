using System;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Windows.Devices.Enumeration;
using Windows.Devices.WiFiDirect;

namespace Neutinamu.RoomLink
{
    // Private child process. The parent exclusively owns the visible UI and
    // deadline. A synchronous WinRT driver call may hang even during cleanup.
    static class PairHelper
    {
        internal static string Encode(string text) => Convert.ToBase64String(Encoding.UTF8.GetBytes(text??""));
        internal static string Decode(string text) => Encoding.UTF8.GetString(Convert.FromBase64String(text));

        internal static int Run(bool simulateHang,int parentId)
        {
            int code=1;
            Process parent;
            try{parent=Process.GetProcessById(parentId);}
            catch(ArgumentException){return 2;}
            using(parent)
            using(var pump=new Control()){
                parent.Exited+=(s,e)=>Environment.Exit(2);
                parent.EnableRaisingEvents=true;
                if(parent.HasExited)return 2;
                var handle=pump.Handle;
                pump.BeginInvoke((Action)(async ()=>{
                    try {
                        string result=await Execute(simulateHang);
                        Console.WriteLine("RESULT "+Encode(result)); Console.Out.Flush(); code=0;
                    } catch(Exception ex){
                        Console.WriteLine("RESULT "+Encode("WFD_TEST=ERROR 0x"+ex.HResult.ToString("X8"))); Console.Out.Flush();
                    } finally{Application.ExitThread();}
                }));
                Application.Run();
            }
            return code;
        }

        static async Task<string> Execute(bool simulateHang)
        {
            var first=await Console.In.ReadLineAsync();
            var fields=(first??"").Split(' ');
            if(fields.Length!=3 || fields[0]!="START")throw new FormatException();
            if(simulateHang){
                Console.WriteLine("PROMPT ConfirmOnly ");Console.Out.Flush();
                if((await Console.In.ReadLineAsync())!="ALLOW ")return "WFD_TEST=DECLINED";
                Console.WriteLine("PHASE APPROVED");Console.Out.Flush();
                Thread.Sleep(Timeout.Infinite); // self-test worker only; no device calls
            }
            var kind=fields[1]=="AEP" ? DeviceInformationKind.AssociationEndpoint :
                     fields[1]=="INTERFACE" ? DeviceInformationKind.DeviceInterface : throw new FormatException();
            string id=Decode(fields[2]);
            if(id.Length==0 || id.Length>4096)throw new FormatException();
            Func<Task<DeviceInformation>> lookup=async()=>await DeviceInformation.CreateFromIdAsync(id,new string[0],kind);
            var selected=await lookup();
            if(selected==null || !String.Equals(selected.Id,id,StringComparison.OrdinalIgnoreCase))return "WFD_PEER=NO_LONGER_PRESENT";
            var recovery=new PairRecovery();
            bool requested=false, approved=false;
            int promptBusy=0;
            string phase="PAIR";
            try{
                if(kind==DeviceInformationKind.AssociationEndpoint){
                    var status=await recovery.Run(async token=>{
                        var info=await lookup();
                        if(info==null || !String.Equals(info.Id,id,StringComparison.OrdinalIgnoreCase))return PairState.Unknown;
                        return info.Pairing.IsPaired?PairState.Paired:info.Pairing.CanPair?PairState.Available:PairState.NotReady;
                    },async token=>{
                        var config=new WiFiDirectConnectionParameters();
                        var kinds=DevicePairingKinds.None;
                        foreach(var method in new[]{WiFiDirectConfigurationMethod.PushButton,WiFiDirectConfigurationMethod.DisplayPin,WiFiDirectConfigurationMethod.ProvidePin}){
                            config.PreferenceOrderedConfigurationMethods.Add(method);
                            kinds|=WiFiDirectConnectionParameters.GetDevicePairingKinds(method);
                        }
                        var custom=selected.Pairing.Custom;
                        Windows.Foundation.TypedEventHandler<DeviceInformationCustomPairing,DevicePairingRequestedEventArgs> handler=async (sender,args)=>{
                            var deferral=args.GetDeferral();
                            bool owns=false;
                            try {
                                if(!String.Equals(args.DeviceInformation.Id,id,StringComparison.OrdinalIgnoreCase))return;
                                owns=Interlocked.CompareExchange(ref promptBusy,1,0)==0;
                                if(!owns)return;
                                requested=true;
                                var ceremony=args.PairingKind;
                                var pin=(ceremony==DevicePairingKinds.DisplayPin || ceremony==DevicePairingKinds.ConfirmPinMatch)?args.Pin:"";
                                Console.WriteLine("PROMPT "+ceremony+" "+Encode(pin)); Console.Out.Flush();
                                // This read and all native acceptance/deferral calls run outside the parent's UI process.
                                var answer=await Task.Run(()=>Console.In.ReadLine());
                                if(answer==null || !answer.StartsWith("ALLOW ",StringComparison.Ordinal))return;
                                var value=Decode(answer.Substring(6));
                                if(ceremony==DevicePairingKinds.ProvidePin){
                                    if(String.IsNullOrWhiteSpace(value))return;
                                    args.Accept(value);
                                }else if(ceremony==DevicePairingKinds.ConfirmOnly || ceremony==DevicePairingKinds.DisplayPin || ceremony==DevicePairingKinds.ConfirmPinMatch)args.Accept();
                                else return;
                                approved=true;Console.WriteLine("PHASE APPROVED");Console.Out.Flush();
                            }catch(Exception){/* no approval on a broken pipe or expired request */}
                            finally{if(owns)Interlocked.Exchange(ref promptBusy,0);try{deferral.Complete();}catch(Exception){}}
                        };
                        custom.PairingRequested+=handler;
                        try{
                            var result=await custom.PairAsync(kinds,DevicePairingProtectionLevel.Default,config).AsTask();
                            return result.Status;
                        }finally{custom.PairingRequested-=handler;}
                    },async token=>{
                        if(recovery.BusyChecks==0){Console.WriteLine("PHASE BUSY");Console.Out.Flush();}
                        await Task.Delay(1500,token);
                    },CancellationToken.None);
                    if(status!=DevicePairingResultStatus.Paired && status!=DevicePairingResultStatus.AlreadyPaired)
                        return "WFD_PAIR="+status+"\r\nPAIR_REQUEST="+(requested?"RECEIVED":"NOT_RECEIVED")+
                               "\r\nAPPROVAL_SENT="+(approved?"YES":"NO")+"\r\nPAIR_ATTEMPTS="+recovery.Requests+"  BUSY_CHECKS="+recovery.BusyChecks;
                }
                phase="LINK";Console.WriteLine("PHASE LINK");Console.Out.Flush();
                using(var device=await WiFiDirectDevice.FromIdAsync(id)){
                    if(device==null || device.ConnectionStatus!=WiFiDirectConnectionStatus.Connected)return "WFD_LINK=NOT_CONNECTED";
                    var endpoints=device.GetConnectionEndpointPairs();
                    bool hasEndpoint=false;
                    foreach(var endpoint in endpoints)
                        if(endpoint.LocalHostName!=null && endpoint.RemoteHostName!=null){hasEndpoint=true;break;}
                    if(!hasEndpoint)return "WFD_LINK=CONNECTED\r\nENDPOINT_PAIR=MISSING\r\nP2_REMOTE_TCP=NOT_TESTED";
                    phase="REMOTE";Console.WriteLine("PHASE REMOTE");Console.Out.Flush();
                    try{
                        return await RemotePort.Check(RemotePort.Resolve(endpoints),()=>device.ConnectionStatus==WiFiDirectConnectionStatus.Connected);
                    }catch(Exception ex){
                        return RemotePort.LinkPrefix+"ERROR 0x"+ex.HResult.ToString("X8");
                    }
                }
            }catch(Exception ex){return "WFD_"+phase+"=ERROR 0x"+ex.HResult.ToString("X8")+"\r\nPAIR_REQUEST="+(requested?"RECEIVED":"NOT_RECEIVED");}
        }
    }
}
