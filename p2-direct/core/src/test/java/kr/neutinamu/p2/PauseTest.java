package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;
import static kr.neutinamu.p2.ProtocolTest.*;
import static kr.neutinamu.p2.ReservationTest.*;
import java.io.IOException;
import java.net.SocketTimeoutException;

public class PauseTest {
    @Test public void pausePacketIsControlKey25NotStartOrCancel(){
        assertArrayEquals(hex("0410000001000000000400010400000019000000"),Wire.pause());
    }
    @Test public void onlyReadyConnectionCanToggleAndDoubleTapIsBlocked()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            try{h.session.pause();fail();}catch(IOException expected){}
            h.ready();h.session.pause();assertArrayEquals(profile().packet(Wire.pause()),readFrame(h.peer).bytes());
            try{h.session.pause();fail();}catch(IOException expected){}
            try{h.session.reserve(10909);fail();}catch(IOException expected){}
            send(h.peer,4100,Wire.integer(25));h.await(Session.State.READY);
            h.session.pause();assertArrayEquals(profile().packet(Wire.pause()),readFrame(h.peer).bytes());
            send(h.peer,4100,Wire.integer(25));h.await(Session.State.READY);
        }
    }
    @Test public void unrelatedCancelAndQueueRepliesCannotCompletePause()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            h.ready();h.session.pause();readFrame(h.peer);
            send(h.peer,4100,Wire.integer(12));send(h.peer,4200,list(10909));h.barrier();
            assertEquals(Session.State.PAUSE,h.session.state());assertTrue(h.valid);
            send(h.peer,4100,Wire.integer(25));h.await(Session.State.READY);
            h.session.cancel();assertArrayEquals(profile().packet(Wire.cancel()),readFrame(h.peer).bytes());
            send(h.peer,4100,Wire.integer(25));h.barrier();assertEquals(Session.State.CANCEL,h.session.state());
            send(h.peer,4100,Wire.integer(12));h.await(Session.State.READY);
        }
    }
    @Test public void timeoutNeverRetriesToggleOrClaimsPaused()throws Exception{
        try(QueueHarness h=new QueueHarness(300)){
            h.ready();h.session.pause();readFrame(h.peer);h.await(Session.State.READY);
            assertTrue(h.messages.stream().anyMatch(m->m.contains("[S11]")));
            assertFalse(h.messages.stream().anyMatch(m->m.contains("일시정지했습니다")));
            h.peer.setSoTimeout(150);try{readFrame(h.peer);fail();}catch(SocketTimeoutException expected){}
        }
    }
    @Test public void rejectedPauseReturnsToReadyWithoutRetry()throws Exception{
        for(int type:new int[]{3,9})try(QueueHarness h=new QueueHarness(1000)){
            h.ready();h.session.pause();readFrame(h.peer);message(h.peer,4100,type,999);h.await(Session.State.READY);
            assertTrue(h.messages.stream().anyMatch(m->m.contains("[S13]")));h.barrier();
        }
    }
}
