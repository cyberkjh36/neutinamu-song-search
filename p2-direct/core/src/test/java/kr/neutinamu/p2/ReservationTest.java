package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;
import static kr.neutinamu.p2.ProtocolTest.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

public class ReservationTest {
    static byte[] list(int... songs)throws Exception{
        ByteArrayOutputStream out=new ByteArrayOutputStream();out.write(songs.length);
        for(int song:songs){out.write(Wire.integer(song));out.write(new byte[5]);}return out.toByteArray();
    }
    static Wire.Frame frame(int code,byte[] body)throws Exception{byte[] bytes=server(code,body);return new Wire.Decoder().feed(bytes,bytes.length).get(0);}
    static void message(Socket socket,int code,int type,int value)throws Exception{
        socket.getOutputStream().write(Wire.encode(code,new byte[]{1,0,0,0,0,4,1,(byte)type},Wire.integer(value)));socket.getOutputStream().flush();
    }
    static final class QueueHarness implements AutoCloseable {
        final ServerSocket server;final Socket peer;final Session session;final Thread thread;
        final List<String> messages=new CopyOnWriteArrayList<>();volatile List<Integer> songs;volatile boolean valid;
        QueueHarness(int timeout)throws Exception{
            server=new ServerSocket(0,1,InetAddress.getLoopbackAddress());Socket client=new Socket(InetAddress.getLoopbackAddress(),server.getLocalPort());peer=server.accept();peer.setSoTimeout(1500);
            session=new Session(client,profile(),new Session.Listener(){
                public void changed(Session.State state,String message){messages.add(message);}
                public void queue(List<Integer> data,String message,boolean ok){songs=data;valid=ok;messages.add(message);}
            },timeout,5000);thread=new Thread(session::run);thread.start();assertEquals(3000,readFrame(peer).code);
        }
        void ready()throws Exception{send(peer,3000,new byte[]{7});assertEquals(3100,readFrame(peer).code);send(peer,3100,id());await(Session.State.READY);}
        void await(Session.State state)throws Exception{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);while(session.state()!=state&&System.nanoTime()<end)Thread.sleep(5);assertEquals(state,session.state());}
        void barrier()throws Exception{send(peer,1000,new byte[0]);assertEquals(1000,readFrame(peer).code);}
        public void close()throws Exception{session.close();peer.close();server.close();thread.join(2000);assertFalse(thread.isAlive());}
    }
    @Test public void reservePacketUsesNormalReservationAndNeverStart(){
        assertArrayEquals(hex("a00f00000200000000040001090000004c0400009d2a000000"),Wire.reserve(10909));
        assertEquals(1100,Wire.u32(Wire.reserve(10909),16));assertEquals(1200,Wire.u32(Wire.play(10909),16));
        assertArrayEquals(hex("68100000010000000004000000000000"),Wire.queue());
    }
    @Test public void queuePreservesOrderAndDuplicateSongs()throws Exception{
        List<Integer> songs=Wire.queueSongs(frame(4200,list(47050,914,47050)));assertEquals(Arrays.asList(47050,914,47050),songs);
        assertEquals(songs,Wire.queueSongs(frame(4220,cat(new byte[7],list(47050,914,47050)))));
        assertTrue(Wire.queueSongs(frame(4200,list())).isEmpty());
        try{songs.add(3);fail();}catch(UnsupportedOperationException expected){}
    }
    @Test public void malformedListsNeverBecomeEmptyOrPartialSuccess()throws Exception{
        for(byte[] body:new byte[][]{new byte[0],new byte[]{1},cat(new byte[]{0},new byte[9]),list(0),list(-1),list(100000000),cat(list(1),new byte[1])}){
            try{Wire.queueSongs(frame(4200,body));fail();}catch(IOException expected){}
        }
        try{Wire.queueSongs(frame(4220,new byte[7]));fail();}catch(IOException expected){}
    }
    @Test public void queueReadAndReservationAreBlockedUntilIdentified()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            try{h.session.reserve(10909);fail();}catch(IOException expected){}
            try{h.session.requestQueue();fail();}catch(IOException expected){}
            send(h.peer,4200,list(10909));h.barrier();assertNull(h.songs);assertEquals(Session.State.AUTH,h.session.state());
        }
    }
    @Test public void reservationWaitsForAckThenReadsRealListWithoutStarting()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            h.ready();h.session.reserve(10909);assertArrayEquals(profile().packet(Wire.reserve(10909)),readFrame(h.peer).bytes());
            try{h.session.reserve(10909);fail("duplicate reservation");}catch(IOException expected){}
            send(h.peer,4220,cat(new byte[7],list(914,10909)));h.barrier();assertEquals(Session.State.RESERVE,h.session.state());
            message(h.peer,4000,1,2);assertEquals(4200,readFrame(h.peer).code);h.await(Session.State.QUEUE);
            send(h.peer,4200,list(914,10909));h.await(Session.State.READY);assertTrue(h.valid);assertEquals(Arrays.asList(914,10909),h.songs);
            assertTrue(h.messages.stream().anyMatch(s->s.contains("10909번이 P2 예약 목록에 있습니다")));
        }
    }
    @Test public void message100AlsoRequestsQueueWithoutAssumingPlayback()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){h.ready();h.session.reserve(10909);readFrame(h.peer);message(h.peer,4000,9,100);assertEquals(4200,readFrame(h.peer).code);send(h.peer,4200,list());h.await(Session.State.READY);assertTrue(h.valid);assertTrue(h.songs.isEmpty());assertFalse(h.messages.stream().anyMatch(s->s.contains("예약 완료")));}
    }
    @Test public void rejectionDoesNotRetryOrPretendSuccess()throws Exception{
        for(int type:new int[]{3,9,1})try(QueueHarness h=new QueueHarness(1000)){h.ready();h.session.reserve(10909);readFrame(h.peer);message(h.peer,4000,type,999);h.await(Session.State.READY);assertFalse(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[R13]")));h.barrier();}
    }
    @Test public void timeoutNeverResendsMutation()throws Exception{
        try(QueueHarness h=new QueueHarness(300)){h.ready();h.session.reserve(10909);readFrame(h.peer);h.await(Session.State.READY);assertFalse(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[R11]")));h.peer.setSoTimeout(150);try{readFrame(h.peer);fail();}catch(SocketTimeoutException expected){}}
    }
    @Test public void invalidAndTimedOutQueueKeepConnectionUsable()throws Exception{
        try(QueueHarness h=new QueueHarness(300)){h.ready();h.session.requestQueue();readFrame(h.peer);send(h.peer,4200,new byte[]{4});h.await(Session.State.READY);assertFalse(h.valid);h.session.requestQueue();readFrame(h.peer);h.await(Session.State.READY);assertTrue(h.messages.stream().anyMatch(s->s.contains("[Q11]")));h.session.requestQueue();readFrame(h.peer);send(h.peer,4200,list(914));h.await(Session.State.READY);assertEquals(Arrays.asList(914),h.songs);}
    }
    @Test public void lateQueueCannotCompletePlayAndCancelCanInterruptQueueRead()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){h.ready();h.session.play(10909);readFrame(h.peer);send(h.peer,4200,list(914));h.barrier();assertEquals(Session.State.PLAY,h.session.state());h.session.cancel();readFrame(h.peer);send(h.peer,4100,Wire.integer(12));h.await(Session.State.READY);h.session.requestQueue();readFrame(h.peer);h.session.cancel();assertEquals(4100,readFrame(h.peer).code);send(h.peer,4200,list());h.barrier();assertEquals(Session.State.CANCEL,h.session.state());send(h.peer,4100,Wire.integer(12));h.await(Session.State.READY);}
    }
    @Test public void queueBroadcastUpdatesActualOrderWhileReady()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();send(h.peer,4220,cat(new byte[7],list(3,2,1)));h.barrier();assertEquals(Session.State.READY,h.session.state());assertEquals(Arrays.asList(3,2,1),h.songs);}
    }
}
