package kr.neutinamu.p2;
import org.junit.Test;
import static org.junit.Assert.*;
import static kr.neutinamu.p2.ProtocolTest.*;
import static kr.neutinamu.p2.ReservationTest.*;
import static kr.neutinamu.p2.NowPlayingTest.playing;
import java.util.*;

public class PersonalSongTest {
    private void reserve(QueueHarness h,int number)throws Exception{
        h.session.reserve(number);readFrame(h.peer);message(h.peer,4000,1,2);assertEquals(4200,readFrame(h.peer).code);
        send(h.peer,4200,list(number));h.await(Session.State.READY);
    }
    @Test public void ownStartRequiresMatchingActualPlaybackNotSearchOrAck()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();playing(h,914);assertTrue(h.personalEvents.isEmpty());
            h.session.play(10909);readFrame(h.peer);message(h.peer,4000,1,2);h.barrier();assertTrue(h.personalEvents.isEmpty());
            playing(h,47050);assertTrue(h.personalEvents.isEmpty());playing(h,10909);h.await(Session.State.READY);
            assertEquals(Arrays.asList(10909),h.personalEvents);playing(h,10909);assertEquals(1,h.personalEvents.size());
        }
    }
    @Test public void reservationIsSavedOnlyWhenItActuallyPlays()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();reserve(h,10909);assertTrue(h.personalEvents.isEmpty());playing(h,914);assertTrue(h.personalEvents.isEmpty());
            playing(h,10909);assertEquals(Arrays.asList(10909),h.personalEvents);
            playing(h,0);playing(h,10909);assertEquals(1,h.personalEvents.size());
        }
    }
    @Test public void reservingCurrentlyPlayingSongWaitsForNextPlayback()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();playing(h,914);reserve(h,914);playing(h,914);assertTrue(h.personalEvents.isEmpty());
            playing(h,0);playing(h,914);assertEquals(Arrays.asList(914),h.personalEvents);
        }
    }
    @Test public void rejectedAndUnconfirmedRequestsAreNotRemembered()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();h.session.reserve(10909);readFrame(h.peer);message(h.peer,4000,3,999);h.await(Session.State.READY);
            playing(h,10909);assertTrue(h.personalEvents.isEmpty());
        }
        try(QueueHarness h=new QueueHarness(250)){
            h.ready();h.session.play(914);readFrame(h.peer);h.await(Session.State.READY);playing(h,914);assertTrue(h.personalEvents.isEmpty());
        }
    }
    @Test public void explicitQueueStartRemembersActualFirstSongInsteadOfSearchSelection()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();h.session.startInOrder(10092);assertEquals(4200,readFrame(h.peer).code);
            send(h.peer,4200,list(914,10909));assertEquals(4100,readFrame(h.peer).code);
            send(h.peer,4100,Wire.integer(12));assertEquals(4200,readFrame(h.peer).code);
            send(h.peer,4200,list(914,10909));assertEquals(4100,readFrame(h.peer).code);
            send(h.peer,4300,cat(Wire.integer(914),new byte[]{0}));assertEquals(4200,readFrame(h.peer).code);
            send(h.peer,4200,list(10909));h.await(Session.State.READY);assertEquals(Arrays.asList(914),h.personalEvents);
        }
    }
    @Test public void cancelledReservationIsNotSavedByALaterExternalPlay()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();reserve(h,914);h.session.cancelQueued(914,0);readFrame(h.peer);
            send(h.peer,4200,list(914));readFrame(h.peer);message(h.peer,4210,9,100);readFrame(h.peer);
            send(h.peer,4200,list());h.await(Session.State.READY);playing(h,914);assertTrue(h.personalEvents.isEmpty());
        }
    }
    @Test public void anotherPhoneOrNewSessionDoesNotInheritReservations()throws Exception{
        try(QueueHarness first=new QueueHarness(1000);QueueHarness second=new QueueHarness(1000)){
            first.ready();second.ready();reserve(first,914);playing(second,914);assertTrue(second.personalEvents.isEmpty());
            playing(first,914);assertEquals(Arrays.asList(914),first.personalEvents);
        }
    }
}
