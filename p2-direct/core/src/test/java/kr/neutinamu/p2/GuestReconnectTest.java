package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Real local TCP sockets; synthetic device identity, no physical P2 claim. */
public class GuestReconnectTest {
    private static final String DEVICE="TJ_P2_P0207654321_7_B";
    private static byte[] identity(){return Arrays.copyOf("2A1P0207654321".getBytes(StandardCharsets.US_ASCII),66);}
    private static void send(Socket peer,int code,byte[] body)throws IOException{
        peer.getOutputStream().write(Wire.encode(code,new byte[]{1,0,0,0,0,2,1,1},body));peer.getOutputStream().flush();
    }
    private static void await(Session session,Session.State expected)throws Exception{
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);
        while(session.state()!=expected&&System.nanoTime()<until)Thread.sleep(5);
        assertEquals(expected,session.state());
    }
    @Test public void remoteCloseThenFreshConnectionKeepsGuestModeAndNeverReplaysSong()throws Exception{
        try(ServerSocket server=new ServerSocket(0,1,InetAddress.getLoopbackAddress())){
            for(int attempt=0;attempt<2;attempt++){
                String mac=attempt==0?"02:11:22:33:44:55":"02:11:22:33:44:66";
                Socket client=new Socket(InetAddress.getLoopbackAddress(),server.getLocalPort());
                try(Socket peer=server.accept()){
                    peer.setSoTimeout(1500);
                    Session session=new Session(client,CaptureProfile.forRoom("192.168.49.1",DEVICE,mac),(s,m)->{});
                    Thread reader=new Thread(session::run);reader.start();
                    try{
                        Wire.Frame registration=ProtocolTest.readFrame(peer);assertEquals(3000,registration.code);assertEquals(2,registration.control[5]);
                        assertEquals(mac,new String(registration.body,27,17,StandardCharsets.US_ASCII));
                        send(peer,3000,new byte[]{7});Wire.Frame info=ProtocolTest.readFrame(peer);assertEquals(3100,info.code);assertEquals(2,info.control[5]);
                        send(peer,3100,identity());await(session,Session.State.READY);
                        for(int i=0;i<3;i++){
                            send(peer,1000,new byte[0]);Wire.Frame keep=ProtocolTest.readFrame(peer);assertEquals(1000,keep.code);assertEquals(2,keep.control[5]);assertEquals(100,Wire.u32(keep.body,0));
                        }
                        if(attempt==0){
                            session.play(10909);Wire.Frame play=ProtocolTest.readFrame(peer);assertEquals(4000,play.code);assertEquals(2,play.control[5]);
                            send(peer,4000,Wire.integer(2));send(peer,4300,ProtocolTest.cat(Wire.integer(10909),new byte[1]));await(session,Session.State.READY);
                        }else{
                            peer.setSoTimeout(150);try{peer.getInputStream().read();fail("Replayed a previous command");}catch(SocketTimeoutException expected){}
                        }
                        peer.shutdownOutput();await(session,Session.State.CLOSED);
                    }finally{session.close();reader.join(2000);assertFalse(reader.isAlive());}
                }
            }
        }
    }
}
