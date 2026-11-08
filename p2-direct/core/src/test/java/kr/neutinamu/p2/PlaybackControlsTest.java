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
        h.peer.setSoTimeout(80);try{readFrame(h.peer);fail("Unexpected extra command");}catch(SocketTimeoutException expected){}finally{h.peer.setSoTimeout(1500);}
    }
    private static void packet(QueueHarness h,byte[] expected)throws Exception{assertArrayEquals(profile().packet(expected),readFrame(h.peer).bytes());}
    private static void playing(QueueHarness h,int song)throws Exception{send(h.peer,4300,cat(Wire.integer(song),new byte[]{0}));}
    private static void begin(QueueHarness h,boolean next)throws Exception{
        h.ready();if(next)h.session.next();else h.session.playQueued(914,1);packet(h,Wire.queue());send(h.peer,4200,list(47050,914,47050));
        if(!next){packet(h,Wire.moveReserved(3,914,1,0));message(h.peer,4210,9,100);packet(h,Wire.queue());send(h.peer,4200,list(914,47050,47050));}
        packet(h,Wire.cancel());assertEquals(Session.State.ADVANCE_STOP,h.session.state());
    }
    private static void stopped(QueueHarness h,int... order)throws Exception{
        send(h.peer,4100,Wire.integer(12));packet(h,Wire.queue());assertEquals(Session.State.ADVANCE_RECHECK,h.session.state());
        send(h.peer,4200,list(order));packet(h,Wire.next());
    }
    private static void consumed(QueueHarness h,int song,int... remaining)throws Exception{
        playing(h,song);packet(h,Wire.queue());send(h.peer,4200,list(remaining));h.await(Session.State.READY);assertEquals(toList(remaining),h.songs);
    }
    private static List<Integer> toList(int... songs){List<Integer> result=new ArrayList<>();for(int song:songs)result.add(song);return result;}
    @Test public void wireUsesOfficialZeroBasedMoveAndNumberlessStart(){
        assertArrayEquals(hex("72100000010000000004000108000000056c270000030200"),Wire.moveReserved(5,10092,2,0));
        assertArrayEquals(hex("041000000100000000040001040000000b000000"),Wire.next());assertEquals(12,Wire.u32(Wire.cancel(),16));
    }
    @Test public void invalidQueueMovesNeverProducePackets(){
        for(int[] a:new int[][]{{0,914,0,0},{256,914,1,0},{5,0,2,0},{5,100000000,2,0},{5,914,-1,0},{5,914,5,0},{5,914,2,5},{5,914,2,2}})
            try{Wire.moveReserved(a[0],a[1],a[2],a[3]);fail();}catch(IllegalArgumentException expected){}
    }
    @Test public void snapshotPreservesDuplicateMetadataAndOnlyMovesOneEntry()throws Exception{
        byte[] data=list(914,47050,914);data[5]=1;data[23]=2;
        Wire.QueueSnapshot before=Wire.queueSnapshot(frame(4200,data));Wire.QueueSnapshot moved=before.moveToFront(2);
        assertEquals(toList(914,914,47050),moved.songs);assertEquals(toList(914,47050),moved.withoutFirst().songs);
        assertEquals(toList(914,47050,914),before.songs);
        assertFalse(before.sameOrder(Wire.queueSnapshot(frame(4200,list(914,47050,914)))));
        assertFalse(moved.sameOrder(before.moveToFront(0)));assertTrue(before.sameOrder(Wire.queueSnapshot(frame(4220,cat(new byte[7],data)))));
    }
    @Test public void nextReadsActualQueueStopsRechecksThenStartsMachineNextOnlyOnce()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            begin(h,true);try{h.session.next();fail();}catch(IOException expected){}quiet(h);stopped(h,47050,914,47050);
            send(h.peer,4100,Wire.integer(11));h.barrier();assertEquals(Session.State.ADVANCE_PLAY,h.session.state());
            playing(h,914);h.barrier();assertEquals(Session.State.ADVANCE_PLAY,h.session.state());
            consumed(h,47050,914,47050);assertTrue(h.messages.stream().anyMatch(s->s.contains("실행한 항목이 예약에서 빠졌습니다")));quiet(h);
        }
    }
    @Test public void thirdOfFiveIsConsumedThenRemainingPlayInOriginalOrder()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            h.ready();h.session.playQueued(10092,2);packet(h,Wire.queue());send(h.peer,4200,list(10909,914,10092,47050,16398));
            packet(h,Wire.moveReserved(5,10092,2,0));message(h.peer,4210,9,100);packet(h,Wire.queue());
            send(h.peer,4200,list(10092,10909,914,47050,16398));packet(h,Wire.cancel());stopped(h,10092,10909,914,47050,16398);
            consumed(h,10092,10909,914,47050,16398);quiet(h);
            int[] remaining={10909,914,47050,16398};
            for(int i=0;i<remaining.length;i++){
                int[] order=Arrays.copyOfRange(remaining,i,remaining.length);h.session.next();packet(h,Wire.queue());
                send(h.peer,4200,list(order));packet(h,Wire.cancel());stopped(h,order);
                consumed(h,remaining[i],Arrays.copyOfRange(remaining,i+1,remaining.length));quiet(h);
            }
            assertTrue(h.songs.isEmpty());
        }
    }
    @Test public void eachSelectedPositionMovesToFrontAndRetainsOthers()throws Exception{
        int[] original={10909,914,10092,47050,16398};
        for(int index=0;index<5;index++)try(QueueHarness h=new QueueHarness(1500)){
            h.ready();h.session.playQueued(original[index],index);packet(h,Wire.queue());send(h.peer,4200,list(original));
            List<Integer> expected=toList(original);expected.add(0,expected.remove(index));int[] moved=expected.stream().mapToInt(Integer::intValue).toArray();
            if(index>0){packet(h,Wire.moveReserved(5,original[index],index,0));message(h.peer,4210,9,100);packet(h,Wire.queue());send(h.peer,4200,list(moved));}
            packet(h,Wire.cancel());stopped(h,moved);consumed(h,original[index],Arrays.copyOfRange(moved,1,5));quiet(h);
        }
    }
    @Test public void duplicateSelectionConsumesOnlyChosenOccurrence()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            h.ready();h.session.playQueued(914,2);packet(h,Wire.queue());send(h.peer,4200,list(914,47050,914,10909,914));
            packet(h,Wire.moveReserved(5,914,2,0));message(h.peer,4210,9,100);packet(h,Wire.queue());send(h.peer,4200,list(914,914,47050,10909,914));
            packet(h,Wire.cancel());stopped(h,914,914,47050,10909,914);consumed(h,914,914,47050,10909,914);assertEquals(2,Collections.frequency(h.songs,914));
        }
    }
    @Test public void searchStartUsesQueueHeadWithoutAddingOrStartingSearchSelection()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            h.ready();h.session.startInOrder(10092);packet(h,Wire.queue());send(h.peer,4200,list(914,47050));packet(h,Wire.cancel());
            stopped(h,914,47050);consumed(h,914,47050);quiet(h);
        }
    }
    @Test public void searchStartUsesSelectedSongOnlyWhenActualQueueIsEmpty()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            h.ready();h.session.startInOrder(10092);packet(h,Wire.queue());send(h.peer,4200,list());packet(h,Wire.play(10092));
            playing(h,10092);h.await(Session.State.READY);quiet(h);
        }
    }
    @Test public void emptyQueueDoesNotStopCurrentSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();h.session.next();readFrame(h.peer);send(h.peer,4200,list());h.await(Session.State.READY);assertTrue(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("예약곡이 없습니다")));quiet(h);}
    }
    @Test public void changedQueuePositionDoesNotPlayAnotherSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();h.session.playQueued(914,1);readFrame(h.peer);send(h.peer,4200,list(914,47050));h.await(Session.State.READY);assertEquals(toList(914,47050),h.songs);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N15]")));quiet(h);}
    }
    @Test public void moveAcceptanceWithoutExpectedListDoesNotStopCurrentSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();h.session.playQueued(914,1);packet(h,Wire.queue());send(h.peer,4200,list(47050,914));packet(h,Wire.moveReserved(2,914,1,0));
            message(h.peer,4210,9,100);packet(h,Wire.queue());send(h.peer,4200,list(47050,914));h.await(Session.State.READY);
            assertTrue(h.valid);assertEquals(toList(47050,914),h.songs);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N17]")));quiet(h);
        }
    }
    @Test public void moveRejectionNeverStopsOrStartsAndDoesNotRetry()throws Exception{
        for(int value:new int[]{4211,4212,999})try(QueueHarness h=new QueueHarness(1000)){
            h.ready();h.session.playQueued(914,1);packet(h,Wire.queue());send(h.peer,4200,list(47050,914));readFrame(h.peer);message(h.peer,4210,9,value);h.await(Session.State.READY);assertFalse(h.valid);quiet(h);
        }
    }
    @Test public void changedQueueAfterStopDoesNotStartDifferentSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){begin(h,true);send(h.peer,4100,Wire.integer(12));packet(h,Wire.queue());send(h.peer,4200,list(914,47050));h.await(Session.State.READY);assertEquals(toList(914,47050),h.songs);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N17]")));quiet(h);}
    }
    @Test public void changedDuplicateMetadataAfterStopAlsoBlocksStart()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){begin(h,true);send(h.peer,4100,Wire.integer(12));packet(h,Wire.queue());byte[] changed=list(47050,914,47050);changed[5]=1;send(h.peer,4200,changed);h.await(Session.State.READY);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N17]")));quiet(h);}
    }
    @Test public void missingConsumptionIsShownTruthfullyAndNeverHiddenOrDeletedLocally()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){begin(h,true);stopped(h,47050,914,47050);consumed(h,47050,47050,914,47050);assertEquals(3,h.songs.size());assertTrue(h.messages.stream().anyMatch(s->s.contains("[N18]")));quiet(h);}
    }
    @Test public void onlyRequestedQueueResponseCanAdvanceNotBroadcast()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();h.session.next();readFrame(h.peer);send(h.peer,4220,cat(new byte[7],list(914)));h.barrier();assertEquals(Session.State.ADVANCE_QUEUE,h.session.state());quiet(h);send(h.peer,4200,list(47050));packet(h,Wire.cancel());}
    }
    @Test public void updateBroadcastCannotReplaceMoveAcknowledgement()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            h.ready();h.session.playQueued(914,1);packet(h,Wire.queue());send(h.peer,4200,list(47050,914));readFrame(h.peer);
            send(h.peer,4220,cat(new byte[7],list(914,47050)));h.barrier();assertEquals(Session.State.ADVANCE_MOVE,h.session.state());quiet(h);
        }
    }
    @Test public void invalidQueueDoesNotStopOrStart()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){h.ready();h.session.next();readFrame(h.peer);send(h.peer,4200,new byte[]{9});h.await(Session.State.READY);assertFalse(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N12]")));quiet(h);}
    }
    @Test public void stopRejectionNeverStartsNext()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){begin(h,true);message(h.peer,4100,3,999);h.await(Session.State.READY);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N13]")));quiet(h);}
    }
    @Test public void playRejectionDoesNotRetryOrConfirm()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){begin(h,false);stopped(h,914,47050,47050);message(h.peer,4100,3,999);h.await(Session.State.READY);assertFalse(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N14]")));quiet(h);}
    }
    @Test public void everyPhaseTimesOutWithoutSendingDependentOrRepeatedCommands()throws Exception{
        for(int phase=0;phase<7;phase++)try(QueueHarness h=new QueueHarness(300)){
            h.ready();h.session.playQueued(914,1);readFrame(h.peer);
            if(phase>=1){send(h.peer,4200,list(47050,914,47050));readFrame(h.peer);}
            if(phase>=2){message(h.peer,4210,9,100);readFrame(h.peer);}
            if(phase>=3){send(h.peer,4200,list(914,47050,47050));readFrame(h.peer);}
            if(phase>=4){send(h.peer,4100,Wire.integer(12));readFrame(h.peer);}
            if(phase>=5){send(h.peer,4200,list(914,47050,47050));readFrame(h.peer);}
            if(phase>=6){playing(h,914);readFrame(h.peer);}
            h.await(Session.State.READY);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N11]")));quiet(h);
            message(h.peer,4210,9,100);send(h.peer,4100,Wire.integer(12));playing(h,914);h.barrier();assertEquals(Session.State.READY,h.session.state());quiet(h);
        }
    }
    @Test public void unauthenticatedOrInvalidSelectionsNeverSendCommands()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){
            try{h.session.next();fail();}catch(IOException expected){}
            try{h.session.startInOrder(914);fail();}catch(IOException expected){}
            try{h.session.playQueued(914,0);fail();}catch(IOException expected){}
            for(int[] pair:new int[][]{{0,0},{914,-1},{914,255},{100000000,0}})try{h.session.playQueued(pair[0],pair[1]);fail();}catch(IllegalArgumentException expected){}
            quiet(h);
        }
    }
    @Test public void disconnectWhileWaitingForStopCannotStartSong()throws Exception{
        try(QueueHarness h=new QueueHarness(1000)){begin(h,true);h.peer.shutdownOutput();h.await(Session.State.CLOSED);assertTrue(h.messages.stream().anyMatch(s->s.contains("[N02]")));}
    }
}
