// Loopback only. No Windows radio or physical P2 is used by this runner.
using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using Neutinamu.P2Wifi;
static class RoomFixture
{
    static int reservations, removals, registrations, videos, plays;
    static async Task Respond(NetworkStream stream)
    {
        int queued=0;
        try
        {
            for(;;)
            {
                var f=await Protocol.Read(stream);
                byte type=1;
                byte[] body;
                int code=f.Code;
                switch(code)
                {
                    case 3000: registrations++; body=new byte[]{11};break;
                    case 3100: body=new byte[66];Encoding.ASCII.GetBytes("P2AP0201234567").CopyTo(body,0);break;
                    case 4200: body=new byte[queued==0?1:10];if(queued!=0){body[0]=1;BitConverter.GetBytes(queued).CopyTo(body,1);}break;
                    case 4000:
                        int action=BitConverter.ToInt32(f.Body,0);
                        int song=BitConverter.ToInt32(f.Body,4);
                        if(action==1100){queued=song;reservations++;body=BitConverter.GetBytes(2);}
                        else if(action==1200){code=4300;plays++;body=new byte[5];BitConverter.GetBytes(song).CopyTo(body,0);}
                        else throw new InvalidDataException("Unexpected action");
                        break;
                    case 4210:
                        if(f.Body[5]!=2 || queued==0) throw new InvalidDataException("Unexpected queue operation");
                        removals++; queued=0;type=9;body=BitConverter.GetBytes(100);break;
                    case 4100:
                        if(BitConverter.ToInt32(f.Body,0)==35) videos++;
                        body=f.Body;break;
                    default: throw new InvalidDataException("Unexpected request");
                }
                var reply=Protocol.Packet(code,body,type);
                await stream.WriteAsync(reply,0,reply.Length);
            }
        }
        catch(EndOfStreamException){}
    }
    static async Task Test()
    {
        var listener=new TcpListener(IPAddress.Loopback,0);
        listener.Start();
        try
        {
            using(var client=new TcpClient())
            {
                var accepted=listener.AcceptTcpClientAsync();
                await client.ConnectAsync(IPAddress.Loopback,((IPEndPoint)listener.LocalEndpoint).Port);
                using(var peer=await accepted)
                {
                    var server=Respond(peer.GetStream());
                    var result=await Compatibility.AutoConnectSession(client.GetStream(),"P0201234567","02:11:22:33:44:55",()=>true,
                        line=>{Console.WriteLine(line);Console.Out.Flush();},()=>Task.Run(()=>Console.ReadLine()));
                    await server;
                    if(!result.Contains("ENDED")||registrations!=1||reservations!=1||removals!=1||plays!=1||videos!=1)
                        throw new InvalidDataException("Shared connection transaction count mismatch");
                }
            }
        }
        finally {listener.Stop();}
    }
    static int Main()
    {
        try {Test().GetAwaiter().GetResult();Console.WriteLine("Shared connection verified");return 0;}
        catch(Exception ex){Console.Error.WriteLine(ex);return 1;}
    }
}
