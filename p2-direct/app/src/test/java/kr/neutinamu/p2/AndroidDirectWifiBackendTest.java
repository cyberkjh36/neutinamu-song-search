package kr.neutinamu.p2;

import android.net.wifi.p2p.WifiP2pDevice;
import java.io.StringReader;
import java.util.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk={29,35})
public class AndroidDirectWifiBackendTest {
    static WifiP2pDevice peer(String name,String address,String category){
        WifiP2pDevice p=new WifiP2pDevice();p.deviceName=name;p.deviceAddress=address;p.primaryDeviceType=category;return p;
    }
    static RoomDirectory rooms()throws Exception{
        return RoomDirectory.read(new StringReader("1번방 TJ_P2_TEST_ONE_1_B\n8번방 TJ_P2_TEST_EIGHT_7_B\n"));
    }
    @Test public void registeredRoomSurvivesMissingOrDifferentDeviceCategory()throws Exception{
        AndroidDirectWifiBackend backend=new AndroidDirectWifiBackend(RuntimeEnvironment.getApplication(),rooms());
        for(String type:new String[]{null,"","8-0050F204-5","00080050F2040005","1-0050F204-1"}){
            List<DirectWifi.Peer> result=backend.roomPeers(Collections.singletonList(peer("TJ_P2_TEST_EIGHT_7_B","08",type)));
            assertEquals(1,result.size());assertEquals("08",result.get(0).address);assertEquals("8번방",rooms().label(result.get(0)));
        }
    }
    @Test public void categoryAloneOrSimilarSuffixCannotIdentifyARoom()throws Exception{
        AndroidDirectWifiBackend backend=new AndroidDirectWifiBackend(RuntimeEnvironment.getApplication(),rooms());
        List<DirectWifi.Peer> result=backend.roomPeers(Arrays.asList(
            peer("TJ_P2_OTHER_7_B","99","8-0050F204-5"),
            peer("DIRECT-XX-TJ_P2_TEST_EIGHT_7_B","98",null),
            peer(null,"97","8-0050F204-5"),
            peer("TJ_P2_TEST_EIGHT_7_B",null,null),
            peer("TJ_P2_TEST_EIGHT_7_B"," ",null),null));
        assertTrue(result.isEmpty());assertTrue(backend.roomPeers(null).isEmpty());
    }
    @Test public void roomLabelsAreSortedWithoutExposingIdsAndRetainActualAddresses()throws Exception{
        RoomDirectory rooms=rooms();AndroidDirectWifiBackend backend=new AndroidDirectWifiBackend(RuntimeEnvironment.getApplication(),rooms);
        List<DirectWifi.Peer> sorted=rooms.registered(backend.roomPeers(Arrays.asList(
            peer(" tj_p2_test_eight_7_b ","08",null),peer("TJ_P2_TEST_ONE_1_B","01",null))));
        assertEquals(2,sorted.size());assertEquals("1번방",rooms.label(sorted.get(0)));assertEquals("8번방",rooms.label(sorted.get(1)));
        assertEquals("01",sorted.get(0).address);assertEquals("08",sorted.get(1).address);
        assertEquals("미등록 반주기",rooms.label(new DirectWifi.Peer("PRIVATE_DEVICE_ID","99")));
    }
    @Test public void diagnosticsDistinguishNoPeersFromUnmappedP2WithoutNamesOrAddresses()throws Exception{
        Diagnostics diagnostics=new Diagnostics();AndroidDirectWifiBackend backend=new AndroidDirectWifiBackend(RuntimeEnvironment.getApplication(),rooms(),diagnostics);
        backend.recordPeers(Collections.emptyList(),0);
        List<WifiP2pDevice> peers=Arrays.asList(peer("TJ_P2_PRIVATE_SERIAL_7_B","secret-mac",null),peer(null,"secret-2","8-0050F204-5"));
        backend.recordPeers(peers,0);backend.recordPeers(peers,0);
        String report=diagnostics.report();assertTrue(report.contains("SCAN_TOTAL 0 ROOMS 0"));assertTrue(report.contains("SCAN_TOTAL 2 ROOMS 0 P2_UNKNOWN 2 UNNAMED 1"));
        assertEquals(report.indexOf("SCAN_TOTAL 2"),report.lastIndexOf("SCAN_TOTAL 2"));
        assertFalse(report.contains("PRIVATE_SERIAL"));assertFalse(report.contains("secret"));
    }
}
