using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Threading;
using System.Threading.Tasks;
using Windows.Networking;

namespace Neutinamu.RoomLink
{
    internal sealed class DirectRoute
    {
        public IPAddress Local;
        public IPAddress Remote;
        public static DirectRoute From(IPAddress local,IPAddress remote)
        {
            if(local==null || remote==null || local.AddressFamily!=remote.AddressFamily
                || local.Equals(remote) || !IsUnicast(local) || !IsUnicast(remote))return null;
            if(local.IsIPv6LinkLocal && local.ScopeId!=0 && remote.IsIPv6LinkLocal){
                if(remote.ScopeId!=0 && remote.ScopeId!=local.ScopeId)return null;
                if(remote.ScopeId==0)remote=new IPAddress(remote.GetAddressBytes(),local.ScopeId);
            }
            return new DirectRoute {Local=local,Remote=remote};
        }

        static bool IsUnicast(IPAddress ip)
        {
            if(IPAddress.IsLoopback(ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any) ||
               ip.Equals(IPAddress.Broadcast) || ip.IsIPv6Multicast || ip.IsIPv4MappedToIPv6)return false;
            return ip.AddressFamily==AddressFamily.InterNetworkV6 || (ip.AddressFamily==AddressFamily.InterNetwork && ip.GetAddressBytes()[0]<224);
        }
    }

    internal static class RemotePort
    {
        internal const int P2RemotePort=7070;
        internal const string TransportReached="REACHABLE";
        internal const string LinkPrefix="WFD_LINK=CONNECTED\r\nENDPOINT_PAIR=PRESENT\r\nP2_REMOTE_TCP=";

        internal static List<DirectRoute> Resolve(IEnumerable<EndpointPair> endpoints)
        {
            var routes=new List<DirectRoute>();

            foreach(var ep in endpoints){
                if(ep.LocalHostName==null || ep.RemoteHostName==null ||
                    !IPAddress.TryParse(ep.LocalHostName.CanonicalName,out var local) ||
                    !IPAddress.TryParse(ep.RemoteHostName.CanonicalName,out var remote))continue;
                if(local.IsIPv6LinkLocal && local.ScopeId==0){
                    var adapter=ep.LocalHostName.IPInformation?.NetworkAdapter?.NetworkAdapterId;
                    if(!adapter.HasValue)continue;
                    try{
                        var nic=NetworkInterface.GetAllNetworkInterfaces().FirstOrDefault(n=>
                            Guid.TryParse(n.Id,out var nicId) && nicId==adapter.Value);
                        var ipv6=nic?.GetIPProperties().GetIPv6Properties();
                        if(ipv6==null || ipv6.Index<=0)continue;
                        local=new IPAddress(local.GetAddressBytes(),ipv6.Index);
                    }catch(NetworkInformationException){continue;}
                     catch(NotSupportedException){continue;}
                }
                if(local.IsIPv6LinkLocal && local.ScopeId==0)continue;
                var route=DirectRoute.From(local,remote);
                if(route!=null && !routes.Any(r=>r.Local.Equals(route.Local) && r.Remote.Equals(route.Remote)))routes.Add(route);
            }
            return routes.OrderBy(r=>r.Local.AddressFamily==AddressFamily.InterNetwork?0:1).ToList();
        }

        static async Task<string> Connect(IPAddress local,IPAddress remote,int port,int timeoutMs)
        {
            using(var socket=new TcpClient(local.AddressFamily))
            using(var timer=new CancellationTokenSource()){
                // Use the local Wi-Fi Direct address for the device the user selected.
                // Closing after the TCP handshake intentionally sends no application bytes.
                try{
                    socket.Client.Bind(new IPEndPoint(local,0));
                    var connect=socket.ConnectAsync(remote,port);
                    var delay=Task.Delay(timeoutMs,timer.Token);
                    if(await Task.WhenAny(connect,delay)!=connect && !connect.IsCompleted){
                        socket.Close();
                        _=Observe(connect);
                        return "TIMEOUT";
                    }
                    await connect;
                    return TransportReached;
                }catch(SocketException ex){
                    switch(ex.SocketErrorCode){
                        case SocketError.ConnectionRefused:return "REFUSED";
                        case SocketError.TimedOut:return "TIMEOUT";
                        case SocketError.HostUnreachable:
                        case SocketError.NetworkUnreachable:return "UNREACHABLE";
                        default:return "SOCKET_ERROR_"+ex.NativeErrorCode;
                    }
                }finally{timer.Cancel();}
            }
        }

        static async Task Observe(Task task)
        {
            try{await task.ConfigureAwait(false);}catch(Exception){}
        }

        internal static async Task<string> Check(IEnumerable<DirectRoute> routes,Func<bool> stillConnected)
        {
            var results=new List<string>();
            foreach(var route in routes){
                if(!stillConnected())return "WFD_LINK=DISCONNECTED\r\nP2_REMOTE_TCP=INCOMPLETE";
                string outcome=await Connect(route.Local,route.Remote,P2RemotePort,4000);
                if(outcome==TransportReached)return LinkPrefix+outcome+
                    "\r\n리모컨 서비스 포트에 접속했습니다. 이 시험에서 등록 및 HDMI 전환 명령은 보내지 않습니다.";
                if(!results.Contains(outcome))results.Add(outcome);
            }
            if(!stillConnected())return "WFD_LINK=DISCONNECTED\r\nP2_REMOTE_TCP=INCOMPLETE";
            return LinkPrefix+(results.Count==0?"NO_USABLE_ROUTE":String.Join(",",results))+
                "\r\n결과 복사를 눌러 이 내용을 보내 주세요.";
        }

        internal static async Task<bool> SelfTest()
        {
            var local=IPAddress.Parse("192.0.2.1");
            if(DirectRoute.From(local,IPAddress.IPv6Loopback)!=null || DirectRoute.From(local,local)!=null ||
                DirectRoute.From(local,IPAddress.Broadcast)!=null || DirectRoute.From(local,IPAddress.Parse("192.0.2.2"))==null ||
                DirectRoute.From(IPAddress.Parse("fe80::1%12"),IPAddress.Parse("fe80::2")).Remote.ScopeId!=12)return false;
            if(!(await Check(new DirectRoute[0],()=>true)).Contains("P2_REMOTE_TCP=NO_USABLE_ROUTE"))return false;
            var listener=new TcpListener(IPAddress.Loopback,0);
            listener.Start();
            int port=((IPEndPoint)listener.LocalEndpoint).Port;
            try{
                var accept=listener.AcceptTcpClientAsync();
                if(await Connect(IPAddress.Loopback,IPAddress.Loopback,port,2000)!=TransportReached)return false;
                using(var client=await accept){
                    var stream=client.GetStream();var buffer=new byte[1];
                    var count=await stream.ReadAsync(buffer,0,1);
                    if(count!=0)return false;
                }
            }finally{listener.Stop();}
            string closed=await Connect(IPAddress.Loopback,IPAddress.Loopback,port,8000);
            if(closed!="REFUSED" && closed!="TIMEOUT")throw new InvalidOperationException("closed local port: "+closed);
            return true;
        }
    }
}
