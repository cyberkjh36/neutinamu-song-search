package kr.neutinamu.p2;
import android.content.Intent;
import android.net.Uri;
import java.io.*;
import java.util.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk={29,35})
public class RoomDirectoryTest {
    static RoomDirectory sample()throws IOException{return RoomDirectory.read(new StringReader("1번 TJ_P2_TEST_A_1_B\n5번 TJ_P2_TEST_B_4_B\n12번방 TJ_P2_TEST_C_7_B\n"));}
    static Intent link(String query){return new Intent(Intent.ACTION_VIEW,Uri.parse("neutinamu-p2://connect?"+query));}
    @Test public void exactDeviceMapsToRoomNotDeviceSuffix()throws Exception{
        RoomDirectory rooms=sample();DirectWifi.Peer peer=new DirectWifi.Peer("TJ_P2_TEST_B_4_B","aa:bb");
        assertEquals("5번방",rooms.label(peer));assertEquals("5",rooms.room(peer));assertEquals("aa:bb",peer.address);
        assertNull(rooms.room(new DirectWifi.Peer("TJ_P2_OTHER_4_B","cc:dd")));
        assertNull(rooms.room(new DirectWifi.Peer("DIRECT-XY-TJ_P2_TEST_B_4_B","cc:dd")));
    }
    @Test public void sortedDisplayKeepsOriginalPeerIdentity()throws Exception{
        RoomDirectory rooms=sample();DirectWifi.Peer one=new DirectWifi.Peer("TJ_P2_TEST_A_1_B","01"),five=new DirectWifi.Peer("TJ_P2_TEST_B_4_B","05"),twelve=new DirectWifi.Peer("TJ_P2_TEST_C_7_B","12"),other=new DirectWifi.Peer("unknown","99");
        List<DirectWifi.Peer> sorted=rooms.sorted(Arrays.asList(other,twelve,five,one));
        assertSame(one,sorted.get(0));assertSame(five,sorted.get(1));assertSame(twelve,sorted.get(2));assertSame(other,sorted.get(3));
        assertTrue(rooms.label(other).startsWith("미등록 반주기"));
    }
    @Test public void handlesAttachmentLineEndingsAndCase()throws Exception{
        RoomDirectory rooms=RoomDirectory.read(new StringReader("\uFEFF\r\n\r\n1번 TJ_P2_TEST_A_1_B\r\n"));
        assertEquals("1",rooms.room(new DirectWifi.Peer(" tj_p2_test_a_1_b ","01")));
    }
    @Test public void duplicateOrMalformedMappingFailsClosed(){
        for(String text:new String[]{"1번 TJ_P2_TEST_A\n1번 TJ_P2_TEST_B","1번 TJ_P2_TEST_A\n2번 TJ_P2_TEST_A","0번 TJ_P2_TEST_A","1번 arbitrary-host"}){
            try{RoomDirectory.read(new StringReader(text));fail(text);}catch(IOException expected){}
        }
    }
    @Test public void qrAcceptsOnlyKnownSingleRoom()throws Exception{
        RoomDirectory rooms=sample();assertEquals("5",rooms.fromIntent(link("room=5")));
        for(String query:new String[]{"room=4","room=05","room=5&room=1","room=5&host=192.168.49.1","room=5&song=10909","room=5#play","room=5%26room=1","room="})assertNull(query,rooms.fromIntent(link(query)));
    }
    @Test public void qrRejectsOtherActionsAndAuthorities()throws Exception{
        RoomDirectory rooms=sample();assertNull(rooms.fromIntent(null));
        assertNull(rooms.fromIntent(new Intent(Intent.ACTION_SEND,Uri.parse("neutinamu-p2://connect?room=1"))));
        for(String uri:new String[]{"https://connect?room=1","neutinamu-p2://other?room=1","neutinamu-p2://connect:7070?room=1","neutinamu-p2://connect/play?room=1","neutinamu-p2://user@connect?room=1"})assertNull(uri,rooms.fromIntent(new Intent(Intent.ACTION_VIEW,Uri.parse(uri))));
    }
    @Test public void existingPrintedHttpsQrTargetsSameRoomAndRejectsOtherPaths()throws Exception{
        RoomDirectory rooms=sample();
        assertEquals("5",rooms.fromIntent(new Intent(Intent.ACTION_VIEW,Uri.parse("https://cyberkjh36.github.io/neutinamu-song-search/p2-room.html?room=5"))));
        for(String url:new String[]{"http://cyberkjh36.github.io/neutinamu-song-search/p2-room.html?room=5","https://other.github.io/neutinamu-song-search/p2-room.html?room=5","https://cyberkjh36.github.io/neutinamu-song-search/?room=5","https://cyberkjh36.github.io/neutinamu-song-search/p2-room.html?room=5&song=10909"})
            assertNull(url,rooms.fromIntent(new Intent(Intent.ACTION_VIEW,Uri.parse(url))));
    }


    @Test public void radioAliasMapsToRoomButPreservesFullProtocolIdentity()throws Exception{
        String full="TJ_P2_P0207654321_7_B",radio="TJ_P2_7654321_7_B";
        RoomDirectory rooms=RoomDirectory.read(new StringReader("8번방 "+full+"\n"));
        DirectWifi.Peer discovered=new DirectWifi.Peer(radio,"02:11:22:33:44:55");
        assertEquals("8",rooms.room(discovered));assertTrue(rooms.containsDevice(radio));
        assertEquals(full,rooms.device("8"));assertSame(discovered,rooms.registered(Collections.singletonList(discovered)).get(0));
        CaptureProfile profile=CaptureProfile.forRoom("192.168.49.1",rooms.device("8"),"02:11:22:33:44:55");
        byte[] identity=Arrays.copyOf("P2BP0207654321".getBytes("US-ASCII"),20);
        assertTrue(profile.matchesIdentity(identity));identity[13]='2';assertFalse(profile.matchesIdentity(identity));
    }
    @Test public void aliasesRequireTheWholeSerialAndSuffix()throws Exception{
        RoomDirectory rooms=RoomDirectory.read(new StringReader("8번 TJ_P2_P0207654321_7_B"));
        for(String name:new String[]{"TJ_P2_7654322_7_B","TJ_P2_7654321_8_B","TJ_P2_7654321_7_C","TJ_P2_P0217654321_7_B","DIRECT-XX-TJ_P2_7654321_7_B","TJ_P2_7654321_7_B_EXTRA"})
            assertFalse(name,rooms.containsDevice(name));
        assertTrue(rooms.containsDevice(" tj_p2_7654321_7_b "));
        assertTrue(rooms.containsDevice("TJ_P2_P0207654321_7_B"));
    }
    @Test public void twoRoomsWithSameRadioAliasAreRejected()throws Exception{
        try{RoomDirectory.read(new StringReader("1번 TJ_P2_P0207654321_7_B\n8번 TJ_P2_7654321_7_B"));fail();}
        catch(IOException expected){}
    }

}
