package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;
import static kr.neutinamu.p2.ProtocolTest.*;
import static kr.neutinamu.p2.ReservationTest.*;
import java.io.*;
import java.util.*;

public class NowPlayingTest {
    static void playing(QueueHarness h,int song)throws Exception{send(h.peer,4300,cat(Wire.integer(song),new byte[]{0}));h.barrier();}
    @Test public void parsesOnlyExactPlaybackNotifications()throws Exception{
        assertEquals(10909,Wire.playingSong(frame(4300,cat(Wire.integer(10909),new byte[]{0}))));
        assertEquals(0,Wire.playingSong(frame(4300,new byte[5])));
        for(byte[] body:new byte[][]{new byte[0],new byte[4],new byte[6],cat(Wire.integer(-1),new byte[]{0}),cat(Wire.integer(100000000),new byte[]{0})})
            try{Wire.playingSong(frame(4300,body));fail();}catch(IOException expected){}
        try{Wire.playingSong(frame(4200,new byte[5]));fail();}catch(IOException expected){}
    }
    @Test public void listensToOtherRemotesWhileIdleAndDoesNotChangeReservations()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();send(h.peer,4220,cat(new byte[7],list(47050,914,47050)));playing(h,47050);
            assertEquals(47050,h.playing);assertTrue(h.playbackKnown);assertEquals(Arrays.asList(47050,914,47050),h.songs);
            playing(h,914);assertEquals(914,h.playing);assertEquals(Session.State.READY,h.session.state());
        }
    }
    @Test public void selectedSongOrAcceptedRequestCannotReplaceActualPlayingSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();playing(h,914);h.session.play(10909);readFrame(h.peer);
            message(h.peer,4000,1,2);h.barrier();assertEquals(914,h.playing);
            playing(h,10909);assertEquals(10909,h.playing);h.await(Session.State.READY);
        }
    }
    @Test public void stopClearsOnlyAfterItsResponse()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();playing(h,914);h.session.cancel();readFrame(h.peer);assertEquals(914,h.playing);
            send(h.peer,4100,Wire.integer(12));h.await(Session.State.READY);assertEquals(0,h.playing);assertTrue(h.playbackKnown);
        }
    }
    @Test public void externalStopUpdatesDisplayWithoutIssuingAnotherCommand()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();playing(h,914);send(h.peer,4100,Wire.integer(12));h.barrier();assertEquals(0,h.playing);assertTrue(h.playbackKnown);assertEquals(Session.State.READY,h.session.state());}
    }
    @Test public void endOrInvalidNotificationClearsStaleTitleWithoutGuessingState()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();playing(h,914);playing(h,0);assertFalse(h.playbackKnown);assertEquals(0,h.playing);
            playing(h,47050);send(h.peer,4300,new byte[]{1});h.barrier();assertFalse(h.playbackKnown);assertEquals(0,h.playing);
        }
    }
    @Test public void initialConnectionAndUnidentifiedFramesNeverClaimCurrentSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){playing(h,914);assertTrue(h.playbackEvents.isEmpty());h.ready();assertFalse(h.playbackKnown);assertTrue(h.playbackEvents.isEmpty());}
    }
    @Test public void duplicateReportsDoNotFloodTheUiAndClosingClearsCurrentSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();playing(h,914);playing(h,914);assertEquals(Arrays.asList(914),h.playbackEvents);h.session.close();assertFalse(h.playbackKnown);assertEquals(Arrays.asList(914,-1),h.playbackEvents);}
    }
    @Test public void playbackDuringQueueReadDoesNotCompleteThePendingQueueCommand()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();h.session.requestQueue();readFrame(h.peer);playing(h,914);assertEquals(Session.State.QUEUE,h.session.state());assertEquals(914,h.playing);send(h.peer,4200,list(47050));h.await(Session.State.READY);}
    }
}
