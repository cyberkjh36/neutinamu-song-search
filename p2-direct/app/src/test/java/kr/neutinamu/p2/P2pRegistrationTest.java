package kr.neutinamu.p2;

import android.os.Handler;
import android.os.Looper;
import java.time.Duration;
import java.util.*;
import java.util.function.Consumer;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={29,35})
public class P2pRegistrationTest {
    private static final String HOST="192.0.2.1";
    private static final class Fake implements P2pRegistration.Backend {
        int opens,closes;boolean available=true,denied;Runnable lost;
        final List<Consumer<P2pRegistration.Info>> requests=new ArrayList<>();
        public boolean open(Runnable callback){opens++;lost=callback;return available;}
        public void info(Consumer<P2pRegistration.Info> callback){if(denied)throw new SecurityException("private details");requests.add(callback);}
        public void close(){closes++;}
        void reply(boolean formed,boolean owner,String address){requests.get(requests.size()-1).accept(new P2pRegistration.Info(formed,owner,address));}
    }
    private Fake backend;private P2pRegistration client;private Diagnostics diagnostic;
    @Before public void setup(){backend=new Fake();diagnostic=new Diagnostics();client=new P2pRegistration(backend,new Handler(Looper.getMainLooper()),()->HOST,s->{},diagnostic);}
    @After public void close(){client.close();shadowOf(Looper.getMainLooper()).idle();}
    @Test public void registrationIsNotRadioConnectionAndRepeatedPrepareUsesOneClient(){
        client.prepare();assertEquals(P2pRegistration.State.CHECKING,client.state());assertTrue(client.registered());
        backend.reply(true,false,HOST);assertEquals(P2pRegistration.State.MATCH,client.state());
        client.prepare();assertEquals(1,backend.opens);assertEquals(P2pRegistration.State.CHECKING,client.state());
    }
    @Test public void noGroupPreventsSettingsHandoff(){
        client.prepare();backend.reply(true,false,HOST);final boolean[] handed={false};
        client.refresh(()->handed[0]=true);backend.reply(false,false,null);
        assertEquals(P2pRegistration.State.NO_GROUP,client.state());assertFalse(handed[0]);
    }
    @Test public void differentAddressAndLocalGroupOwnerAreNotTargetConnection(){
        client.prepare();backend.reply(true,false,"192.0.2.2");assertEquals(P2pRegistration.State.OTHER_GROUP,client.state());
        client.refresh(null);backend.reply(true,true,HOST);assertEquals(P2pRegistration.State.OTHER_GROUP,client.state());
    }
    @Test public void handoffRequiresFreshMatchingInfoAndNeverLogsAddress(){
        client.prepare();backend.reply(true,false,HOST);final boolean[] handed={false};
        client.refresh(()->handed[0]=true);assertFalse(handed[0]);backend.reply(true,false,HOST);
        assertTrue(handed[0]);assertFalse(diagnostic.report().contains(HOST));assertFalse(diagnostic.report().contains("TX cmd="));
    }
    @Test public void timeoutCannotBeReversedByStaleCallback(){
        client.prepare();shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(5));
        assertEquals(P2pRegistration.State.TIMEOUT,client.state());backend.reply(true,false,HOST);assertEquals(P2pRegistration.State.TIMEOUT,client.state());
    }
    @Test public void olderQueryCannotOverwriteNewQuery(){
        client.prepare();Consumer<P2pRegistration.Info> old=backend.requests.get(0);client.refresh(null);
        backend.reply(false,false,null);old.accept(new P2pRegistration.Info(true,false,HOST));
        assertEquals(P2pRegistration.State.NO_GROUP,client.state());
    }
    @Test public void lostChannelInvalidatesReadinessAndCanBeRegisteredAgain(){
        client.prepare();backend.reply(true,false,HOST);backend.lost.run();assertFalse(client.registered());
        assertEquals(P2pRegistration.State.UNAVAILABLE,client.state());backend.reply(true,false,HOST);assertFalse(client.registered());
        client.prepare();assertEquals(2,backend.opens);
    }
    @Test public void closingPendingQueryDoesNotReopenOrRunHandoff(){
        client.prepare();final boolean[] handed={false};client.refresh(()->handed[0]=true);client.close();client.close();
        backend.reply(true,false,HOST);assertEquals(1,backend.closes);assertEquals(P2pRegistration.State.CLOSED,client.state());assertFalse(handed[0]);
    }
    @Test public void missingServiceOrPermissionDoesNotClaimConnection(){
        backend.available=false;client.prepare();assertFalse(client.registered());assertEquals(P2pRegistration.State.UNAVAILABLE,client.state());
        backend.available=true;backend.denied=true;client.prepare();assertEquals(P2pRegistration.State.DENIED,client.state());
        assertFalse(diagnostic.report().contains("private details"));
    }
}
