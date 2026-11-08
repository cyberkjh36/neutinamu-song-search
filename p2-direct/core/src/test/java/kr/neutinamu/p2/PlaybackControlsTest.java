package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;
import static kr.neutinamu.p2.ProtocolTest.*;
import static kr.neutinamu.p2.ReservationTest.*;
import java.io.*;
import java.net.*;
import java.util.*;

public class PlaybackControlsTest {
    private static void quiet(QueueHarness h)throws Exception{
        h.peer.setSoTimeout(100);try{readFrame(h.peer);fail("Unexpected extra command");}catch(SocketTimeoutException expected){}finally{h.peer.setSoTimeout(1500);}
    }
    private static void begin(QueueHarness h,boolean next)throws Exception{
        h.ready();if(next)h.session.next();else h.session.playQueued(914,1);
        assertEquals(4200,readFrame(h.peer).code);
        send(h.peer,4200,list(47050,914,47050));
        assertArrayEquals(profile().packet(Wire.cancel()),readFrame(h.peer).bytes());
        assertEquals(Session.State.ADVANCE_STOP,h.session.state());
    }
    @Test public void nextIsStartWithoutNumberNotPauseOrSkipSection(){
        assertArrayEquals(hex("041000000100000000040001040000000b000000"),Wire.next());
        assertEquals(12,Wire.u32(Wire.cancel(),16));
    }
    @Test public void nextReadsActualQueueStopsThenStartsMachineNextOnlyOnce()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            begin(h,true);
            try{h.session.next();fail();}catch(IOException expected){}
            quiet(h);send(h.peer,4100,Wire.integer(12));
            assertArrayEquals(profile().packet(Wire.next()),readFrame(h.peer).bytes());
            send(h.peer,4100,Wire.integer(11));h.barrier();assertEquals(Session.State.ADVANCE_PLAY,h.session.state());
            // A key acknowledgement or another song's status is not playback confirmation.
            send(h.peer,4300,cat(Wire.integer(914),new byte[]{0}));h.barrier();assertEquals(Session.State.ADVANCE_PLAY,h.session.state());
            send(h.peer,4300,cat(Wire.integer(47050),new byte[]{0}));assertEquals(4200,readFrame(h.peer).code);
            send(h.peer,4200,list(914,47050));h.await(Session.State.READY);assertEquals(Arrays.asList(914,47050),h.songs);quiet(h);
        }
    }
    @Test public void tappedQueueSongStartsExactNumberAndRefreshesWithoutDeletingOtherReservations()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            begin(h,false);send(h.peer,4100,Wire.integer(12));assertArrayEquals(profile().packet(Wire.play(914)),readFrame(h.peer).bytes());
            message(h.peer,4000,1,2);h.barrier();assertEquals(Session.State.ADVANCE_PLAY,h.session.state());
            send(h.peer,4300,cat(Wire.integer(914),new byte[]{0}));assertEquals(4200,readFrame(h.peer).code);
            send(h.peer,4200,list(47050,47050));h.await(Session.State.READY);assertEquals(Arrays.asList(47050,47050),h.songs);quiet(h);
        }
    }
    @Test public void emptyQueueDoesNotStopCurrentSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();h.session.next();readFrame(h.peer);send(h.peer,4200,list());h.await(Session.State.READY);assertTrue(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("예약곡이 없습니다")));quiet(h);}
    }
    @Test public void changedQueuePositionDoesNotPlayAnotherSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();h.session.playQueued(914,1);readFrame(h.peer);send(h.peer,4200,list(914,47050));h.await(Session.State.READY);assertEquals(Arrays.asList(914,47050),h.songs);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N15]")));quiet(h);}
    }
    @Test public void onlyRequestedQueueResponseCanAdvanceNotBroadcast()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();h.session.next();readFrame(h.peer);send(h.peer,4220,cat(new byte[7],list(914)));h.barrier();assertEquals(Session.State.ADVANCE_QUEUE,h.session.state());quiet(h);send(h.peer,4200,list(47050));assertEquals(4100,readFrame(h.peer).code);}
    }
    @Test public void invalidQueueDoesNotStopOrStart()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();h.session.next();readFrame(h.peer);send(h.peer,4200,new byte[]{9});h.await(Session.State.READY);assertFalse(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N12]")));quiet(h);}
    }
    @Test public void stopRejectionNeverStartsNext()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){begin(h,true);message(h.peer,4100,3,999);h.await(Session.State.READY);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N13]")));quiet(h);}
    }
    @Test public void playRejectionDoesNotRetryOrConfirm()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){begin(h,false);send(h.peer,4100,Wire.integer(12));readFrame(h.peer);message(h.peer,4000,3,999);h.await(Session.State.READY);assertFalse(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N14]")));quiet(h);}
    }
    @Test public void everyPhaseTimesOutWithoutSendingDependentOrRepeatedCommands()throws Exception{
        for(int phase=0;phase<3;phase++)try(QueueHarness h=new QueueHarness(300)){
            h.ready();h.session.next();readFrame(h.peer);
            if(phase>=1){send(h.peer,4200,list(914));readFrame(h.peer);}
            if(phase>=2){send(h.peer,4100,Wire.integer(12));readFrame(h.peer);}
            h.await(Session.State.READY);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N11]")));quiet(h);
            // A late acknowledgement must not restart the completed transaction.
            send(h.peer,4100,Wire.integer(12));h.barrier();assertEquals(Session.State.READY,h.session.state());quiet(h);
        }
    }
    @Test public void unauthenticatedOrInvalidSelectionsNeverSendCommands()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            try{h.session.next();fail();}catch(IOException expected){}
            try{h.session.playQueued(914,0);fail();}catch(IOException expected){}
            for(int[] pair:new int[][]{{0,0},{914,-1},{914,255},{100000000,0}})try{h.session.playQueued(pair[0],pair[1]);fail();}catch(IllegalArgumentException expected){}
            quiet(h);
        }
    }
    @Test public void disconnectWhileWaitingForStopCannotStartSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){begin(h,true);h.peer.shutdownOutput();h.await(Session.State.CLOSED);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N02]")));}
    }
}
