package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class RoomProfileTest {
    private static final String DEVICE="TJ_P2_P0201000001_1_B",MAC="02:12:34:56:78:9A";
    private static byte[] identity(String serial){return Arrays.copyOf(("2A1"+serial).getBytes(StandardCharsets.US_ASCII),66);}
    private static CaptureProfile room()throws Exception{return CaptureProfile.forRoom("192.168.49.1",DEVICE,MAC);}
    @Test public void freshPhoneCreatesAnonymousRegistrationAndCurrentAddress()throws Exception{
        CaptureProfile profile=room();byte[] packet=profile.registration();
        assertEquals(3000,Wire.u32(packet,0));assertEquals(47,Wire.u32(packet,12));assertEquals(0,Wire.u32(packet,5));assertEquals(2,packet[9]);
        assertEquals("TJAA",new String(packet,16,4,StandardCharsets.US_ASCII));
        assertEquals("0000000000",new String(packet,28,10,StandardCharsets.US_ASCII));
        assertEquals(MAC,new String(packet,43,17,StandardCharsets.US_ASCII));
        assertTrue(profile.matchesDevice(DEVICE));assertFalse(profile.matchesDevice("TJ_P2_P0201000002_2_B"));
        assertTrue(profile.matchesIdentity(identity("P0201000001")));assertFalse(profile.matchesIdentity(identity("P0201000002")));
    }
    @Test public void rejectsPartialSerialAndNonzeroTrailingData()throws Exception{
        CaptureProfile profile=room();byte[] info=identity("P0201000001");
        assertFalse(profile.matchesIdentity(Arrays.copyOf(info,14)));assertFalse(profile.matchesIdentity(null));
        info[14]='X';assertFalse(profile.matchesIdentity(info));info[14]=0;info[0]=0;assertFalse(profile.matchesIdentity(info));
    }
    @Test public void invalidDeviceHostOrUnavailableCurrentAddressIsNotGuessed()throws Exception{
        for(String name:new String[]{"TJ_P2_OTHER_1_B","TJ_P2_P0201000001_1_B_extra","TJ_P2_P0201000001_1_U",""})
            try{CaptureProfile.forRoom("192.168.49.1",name,MAC);fail();}catch(IOException expected){}
        for(String host:new String[]{"example.com","8.8.8.8","127.0.0.1"})
            try{CaptureProfile.forRoom(host,DEVICE,MAC);fail();}catch(IOException expected){}
        for(String mac:new String[]{"02:00:00:00:00:00","00:00:00:00:00:00","FF:FF:FF:FF:FF:FF",null})
            try{CaptureProfile.forRoom("192.168.49.1",DEVICE,mac);fail();}catch(IOException expected){}
    }
    @Test public void refreshingRadioKeepsSerialConstraintAndDoesNotPersistGuestProfile()throws Exception{
        CaptureProfile next=room().forConnection("192.168.133.1","02:AB:CD:12:34:56");
        assertTrue(next.matchesIdentity(identity("P0201000001")));assertFalse(next.matchesIdentity(identity("P0201000002")));
        assertEquals("02:AB:CD:12:34:56",new String(next.registration(),43,17,StandardCharsets.US_ASCII));
        try{next.storageBytes();fail();}catch(IOException expected){}
    }
    @Test public void savedProfileIsReusableOnlyForSameRoom()throws Exception{
        byte[] capture=ProtocolTest.capture(ProtocolTest.packet(ProtocolTest.login(),true,100),ProtocolTest.packet(ProtocolTest.server(3100,identity("P0201000001")),false,400));
        CaptureProfile saved=CaptureProfile.read(new ByteArrayInputStream(capture));
        assertTrue(saved.matchesDevice(DEVICE));assertFalse(saved.matchesDevice("TJ_P2_P0201000002_2_B"));
        assertTrue(CaptureProfile.fromStorage(saved.storageBytes()).matchesDevice(DEVICE));
    }
    @Test public void guestUsesOnlyMatchingRoomPasswordAndLeavesStaffProfileUnchanged()throws Exception{
        byte[] registration=ProtocolTest.login();Wire.put32(registration,5,73129);
        System.arraycopy("PRIVATE_TEST".getBytes(StandardCharsets.US_ASCII),0,registration,28,12);
        byte[] capture=ProtocolTest.capture(ProtocolTest.packet(registration,true,100),ProtocolTest.packet(ProtocolTest.server(3100,identity("P0201000001")),false,400));
        CaptureProfile saved=CaptureProfile.read(new ByteArrayInputStream(capture));
        CaptureProfile guest=CaptureProfile.forRoom("192.168.49.1",DEVICE,MAC,saved);
        assertEquals(73129,Wire.u32(guest.registration(),5));assertEquals(2,guest.registration()[9]);
        assertEquals("0000000000",new String(guest.registration(),28,10,StandardCharsets.US_ASCII));
        assertArrayEquals(registration,saved.registration());
        assertEquals(0,Wire.u32(CaptureProfile.forRoom("192.168.49.1","TJ_P2_P0201000002_2_B",MAC,saved).registration(),5));
        for(byte[] frame:new byte[][]{Wire.info(),Wire.heartbeat(),Wire.play(10909),Wire.reserve(10909),Wire.pause(),Wire.cancel(),Wire.queue()}){
            byte[] outgoing=guest.packet(frame);assertEquals(2,outgoing[9]);assertEquals(73129,Wire.u32(outgoing,5));
            assertEquals(frame[4],outgoing[4]);assertArrayEquals(Arrays.copyOfRange(frame,10,frame.length),Arrays.copyOfRange(outgoing,10,outgoing.length));
        }
    }
    private static List<Session.State> run(String serial,ByteArrayOutputStream sent)throws Exception{
        byte[] replies=ProtocolTest.cat(ProtocolTest.server(3000,new byte[]{3}),ProtocolTest.server(3100,identity(serial)));
        // Stable input stream so the simulated peer closes after exactly these responses.
        InputStream input=new ByteArrayInputStream(replies);
        Socket stable=new Socket(){public InputStream getInputStream(){return input;}public OutputStream getOutputStream(){return sent;}};
        List<Session.State> states=new ArrayList<>();Session session=new Session(stable,room(),(state,message)->states.add(state));session.run();
        return states;
    }
    @Test public void coldStartHandshakeVerifiesRoomWithoutSendingAnySong()throws Exception{
        ByteArrayOutputStream sent=new ByteArrayOutputStream();assertTrue(run("P0201000001",sent).contains(Session.State.READY));
        List<Wire.Frame> frames=new Wire.Decoder().feed(sent.toByteArray(),sent.size());assertEquals(2,frames.size());
        assertEquals(3000,frames.get(0).code);assertEquals(3100,frames.get(1).code);
    }
    @Test public void differentRoomReplyNeverEnablesPlayback()throws Exception{
        assertFalse(run("P0201000002",new ByteArrayOutputStream()).contains(Session.State.READY));
    }
}
