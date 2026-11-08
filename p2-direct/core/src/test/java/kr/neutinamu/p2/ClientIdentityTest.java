package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.Arrays;

public class ClientIdentityTest {
    private static final String INSTALLED="02:12:34:56:78:9A";
    @Test public void realAddressKeepsExistingConnectionAndNeverReadsFallback()throws Exception {
        ClientIdentity.Selection s=ClientIdentity.resolve(()->"ac:12:34:56:78:9a",true,()->{throw new AssertionError();});
        assertEquals("AC:12:34:56:78:9A",s.value);assertFalse(s.anonymous);
    }
    @Test public void hiddenAndPlaceholderAddressesUseGuestIdentifier()throws Exception {
        for(String value:new String[]{null,"02:00:00:00:00:00","00:00:00:00:00:00","FF:FF:FF:FF:FF:FF","bad"}) {
            ClientIdentity.Selection s=ClientIdentity.resolve(()->value,true,()->INSTALLED);
            assertEquals(INSTALLED,s.value);assertTrue(s.anonymous);
        }
        assertTrue(ClientIdentity.resolve(()->{throw new ClientIdentity.Unavailable();},true,()->INSTALLED).anonymous);
        assertTrue(ClientIdentity.resolve(()->{throw new SecurityException();},true,()->INSTALLED).anonymous);
    }
    @Test public void staffRegistrationNeverUsesGuestCompatibilityIdentity()throws Exception {
        try {ClientIdentity.resolve(()->null,false,()->{throw new AssertionError();});fail();}
        catch(ClientIdentity.Unavailable expected){}
    }
    @Test public void networkAndStorageFailuresAreNotHiddenOrRetried()throws Exception {
        IOException problem=new IOException("test");
        try {ClientIdentity.resolve(()->{throw problem;},true,()->{throw new AssertionError();});fail();}
        catch(IOException expected){assertSame(problem,expected);}
        try {ClientIdentity.resolve(()->null,true,()->{throw problem;});fail();}
        catch(IOException expected){assertSame(problem,expected);}
        for(String bad:new String[]{null,"02:00:00:00:00:00","00:11:22:33:44:55","FF:FF:FF:FF:FF:FF"}) {
            try {ClientIdentity.resolve(()->null,true,()->bad);fail();}catch(IOException expected){}
        }
    }
    @Test public void generatedValuesAreLocallyAdministeredUnicastAndNotPlaceholders() {
        SecureRandom source=new SecureRandom(){private int call;@Override public void nextBytes(byte[] bytes){Arrays.fill(bytes,(byte)call++);}};
        String first=ClientIdentity.generate(source),second=ClientIdentity.generate(source);
        assertTrue(ClientIdentity.anonymous(first));assertTrue(ClientIdentity.anonymous(second));assertNotEquals(first,second);
    }
    @Test public void twoGuestInstancesHaveDistinctIdentifiersWithoutChangingRoomOrPassword()throws Exception {
        String device="TJ_P2_P0207654321_7_B",other="06:AB:CD:EF:12:34";
        CaptureProfile first=CaptureProfile.forRoom("192.168.49.1",device,INSTALLED);
        CaptureProfile second=CaptureProfile.forRoom("192.168.49.1",device,other);
        byte[] a=first.registration(),b=second.registration();
        assertEquals(2,a[9]);assertEquals(2,b[9]);assertArrayEquals(Arrays.copyOf(a,43),Arrays.copyOf(b,43));
        assertEquals(INSTALLED,new String(a,43,17,"US-ASCII"));assertEquals(other,new String(b,43,17,"US-ASCII"));
        assertTrue(first.matchesDevice(device));assertTrue(second.matchesDevice(device));
        assertFalse(first.matchesDevice("TJ_P2_P0207654322_7_B"));
    }
    @Test public void diagnosticVersionPlatformAndDirectA03SurviveRingBuffer() {
        Diagnostics d=new Diagnostics("0.11.10-a16-trial",36);
        d.event("CONNECT_STARTED");d.event("TCP_CONNECTED");d.event("A03");
        for(int i=0;i<100;i++)d.event("P2P_CHECKING");
        String report=d.report();
        assertTrue(report.startsWith("느티나무노래방 전용 리모컨 0.11.10-a16-trial · ANDROID_SDK=36"));
        assertTrue(report.contains("CONNECTION_ATTEMPTS=1 VERIFIED=0 FIRST_FAILURE=A03 LAST_FAILURE=A03"));
        assertFalse(report.contains(INSTALLED));assertFalse(report.contains("0.11.5"));
    }
}
