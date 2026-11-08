package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;
import static kr.neutinamu.p2.ProtocolTest.*;
import static kr.neutinamu.p2.ReservationTest.*;
import java.io.*;
import java.net.*;
import java.util.*;

public class ReservationCancelTest {
    private static void packet(QueueHarness h,byte[] expected)throws Exception{assertArrayEquals(profile().packet(expected),readFrame(h.peer).bytes());}
    private static void quiet(QueueHarness h)throws Exception{h.peer.setSoTimeout(80);try{readFrame(h.peer);fail("Unexpected command");}catch(SocketTimeoutException expected){}finally{h.peer.setSoTimeout(1500);}}
    private static void seed(QueueHarness h,byte[] data)throws Exception{send(h.peer,4220,cat(new byte[7],data));h.barrier();}
    private static void begin(QueueHarness h,int song,int index,int... songs)throws Exception{
        h.ready();seed(h,list(songs));h.session.cancelQueued(song,index);packet(h,Wire.queue());
    }
    @Test public void packetUsesSingleEntryRemovalAndNeverStopOrStart(){
        assertArrayEquals(hex("72100000010000000004000108000000056c270000020200"),Wire.removeReserved(5,10092,2));
        assertArrayEquals(hex("721000000100000000040001080000000192030000020000"),Wire.removeReserved(1,914,0));
        for(int[] a:new int[][]{{0,914,0},{256,914,0},{3,0,0},{3,100000000,0},{3,914,-1},{3,914,3}})
            try{Wire.removeReserved(a[0],a[1],a[2]);fail();}catch(IllegalArgumentException expected){}
    }
    @Test public void eachPositionRemovesOnlyThatEntryAndKeepsPlayback()throws Exception{
        int[] original={10909,914,10092,47050,16398};
        for(int index=0;index<5;index++)try(QueueHarness h=new QueueHarness(1500)){
            begin(h,original[index],index,original);
            send(h.peer,4300,cat(Wire.integer(914),new byte[]{0}));
            send(h.peer,4200,list(original));packet(h,Wire.removeReserved(5,original[index],index));
            assertEquals(5,h.songs.size());assertEquals(914,h.playing);assertTrue(h.playbackKnown);
            message(h.peer,4210,9,100);packet(h,Wire.queue());assertEquals(Session.State.REMOVE_VERIFY,h.session.state());
            int[] remaining=new int[4];for(int i=0,j=0;i<5;i++)if(i!=index)remaining[j++]=original[i];
            send(h.peer,4200,list(remaining));h.await(Session.State.READY);assertTrue(h.valid);
            assertArrayEquals(remaining,h.songs.stream().mapToInt(Integer::intValue).toArray());
            assertTrue(h.messages.stream().anyMatch(s->s.contains("예약 취소 완료")));assertEquals(914,h.playing);
            assertEquals(Collections.singletonList(914),h.playbackEvents);quiet(h);
        }
    }
    @Test public void duplicateNumbersKeepOtherOccurrencesAndTheirMetadata()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            h.ready();byte[] before=list(914,47050,914,10909,914);before[5]=1;before[23]=2;before[41]=3;
            seed(h,before);h.session.cancelQueued(914,2);packet(h,Wire.queue());send(h.peer,4200,before);packet(h,Wire.removeReserved(5,914,2));
            message(h.peer,4210,9,100);packet(h,Wire.queue());byte[] after=list(914,47050,10909,914);after[5]=1;after[32]=3;
            send(h.peer,4200,after);h.await(Session.State.READY);assertEquals(Arrays.asList(914,47050,10909,914),h.songs);
            assertTrue(h.messages.stream().anyMatch(s->s.contains("예약 취소 완료")));quiet(h);
        }
    }
    @Test public void lastReservationBecomesEmptyOnlyAfterMachineConfirmation()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            begin(h,914,0,914);send(h.peer,4200,list(914));packet(h,Wire.removeReserved(1,914,0));
            assertEquals(Collections.singletonList(914),h.songs);message(h.peer,4210,9,100);packet(h,Wire.queue());
            assertEquals(Collections.singletonList(914),h.songs);send(h.peer,4200,list());h.await(Session.State.READY);assertTrue(h.valid);assertTrue(h.songs.isEmpty());quiet(h);
        }
    }
    @Test public void changedOrderOrOpaqueDuplicateMetadataPreventsRemoval()throws Exception{
        for(boolean metadataOnly:new boolean[]{false,true})try(QueueHarness h=new QueueHarness(1500)){
            begin(h,914,1,47050,914,47050);byte[] fresh=metadataOnly?list(47050,914,47050):list(914,47050,47050);if(metadataOnly)fresh[14]=7;
            send(h.peer,4200,fresh);h.await(Session.State.READY);assertTrue(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[R23]")));quiet(h);
        }
    }
    @Test public void rejectionNeverRetriesRemovalOrClosesConnection()throws Exception{
        for(int[] reply:new int[][]{{9,4211},{9,4212},{9,999},{3,100},{1,100}})try(QueueHarness h=new QueueHarness(1500)){
            begin(h,914,1,47050,914);send(h.peer,4200,list(47050,914));packet(h,Wire.removeReserved(2,914,1));
            message(h.peer,4210,reply[0],reply[1]);h.await(Session.State.READY);assertFalse(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[R22]")));quiet(h);h.barrier();
        }
    }
    @Test public void broadcastUpdatesListButDoesNotSubstituteForRequiredReplies()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            begin(h,914,1,47050,914);seed(h,list(47050,914));assertEquals(Session.State.REMOVE_QUEUE,h.session.state());
            send(h.peer,4200,list(47050,914));packet(h,Wire.removeReserved(2,914,1));
            seed(h,list(47050));assertEquals(Session.State.REMOVE_SEND,h.session.state());
            message(h.peer,4210,9,100);packet(h,Wire.queue());seed(h,list(47050));assertEquals(Session.State.REMOVE_VERIFY,h.session.state());
            send(h.peer,4200,list(47050));h.await(Session.State.READY);assertTrue(h.valid);quiet(h);
        }
    }
    @Test public void acceptedButUnchangedListStaysVisibleWithoutFakeDeletion()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            begin(h,914,1,47050,914);send(h.peer,4200,list(47050,914));packet(h,Wire.removeReserved(2,914,1));
            message(h.peer,4210,9,100);packet(h,Wire.queue());send(h.peer,4200,list(47050,914));h.await(Session.State.READY);
            assertEquals(Arrays.asList(47050,914),h.songs);assertTrue(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[R24]")));quiet(h);
        }
    }
    @Test public void everyTimeoutStopsAndLateRepliesCannotSendAnotherRemoval()throws Exception{
        for(int phase=0;phase<3;phase++)try(QueueHarness h=new QueueHarness(300)){
            begin(h,914,1,47050,914);
            if(phase>=1){send(h.peer,4200,list(47050,914));packet(h,Wire.removeReserved(2,914,1));}
            if(phase>=2){message(h.peer,4210,9,100);packet(h,Wire.queue());}
            h.await(Session.State.READY);assertFalse(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[R21]")));quiet(h);
            message(h.peer,4210,9,100);send(h.peer,4200,list(47050,914));h.barrier();assertEquals(Session.State.READY,h.session.state());quiet(h);
        }
    }
    @Test public void invalidSnapshotsAndDuplicateTapsDoNotSendExtraCommands()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            try{h.session.cancelQueued(914,0);fail();}catch(IOException expected){}
            h.ready();try{h.session.cancelQueued(914,0);fail();}catch(IOException expected){}
            seed(h,list(47050,914));try{h.session.cancelQueued(914,0);fail();}catch(IOException expected){}
            try{h.session.cancelQueued(0,0);fail();}catch(IllegalArgumentException expected){}
            h.session.cancelQueued(914,1);packet(h,Wire.queue());
            try{h.session.cancelQueued(914,1);fail();}catch(IOException expected){}
            try{h.session.next();fail();}catch(IOException expected){}
            try{h.session.cancel();fail();}catch(IOException expected){}
            send(h.peer,4200,new byte[]{2});h.await(Session.State.READY);assertFalse(h.valid);assertTrue(h.messages.stream().anyMatch(s->s.contains("[R25]")));quiet(h);
        }
    }
    @Test public void disconnectDuringRemovalNeverContinuesTransaction()throws Exception{
        try(QueueHarness h=new QueueHarness(1500)){
            begin(h,914,1,47050,914);send(h.peer,4200,list(47050,914));packet(h,Wire.removeReserved(2,914,1));
            h.peer.shutdownOutput();h.await(Session.State.CLOSED);assertEquals(-1,h.peer.getInputStream().read());
            assertFalse(h.messages.stream().anyMatch(s->s.contains("예약 취소 완료")));
        }
    }
}
