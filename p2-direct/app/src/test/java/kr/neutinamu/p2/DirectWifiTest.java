package kr.neutinamu.p2;

import android.os.*;
import java.time.Duration;
import java.util.*;
import java.util.function.Consumer;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class) @Config(sdk={29,35})
public class DirectWifiTest {
    static final DirectWifi.Peer PEER=new DirectWifi.Peer("Test P2","02:11:22:33:44:55");
    static final DirectWifi.Link UP=new DirectWifi.Link(true,false,PEER.address,"192.168.49.1","p2p0");
    static class Fake implements DirectWifi.Backend {
        DirectWifi.Peer selectedPeer;boolean denied,available=true;int joined,closed;Runnable lost;Consumer<Boolean> discovery,join;
        Consumer<List<DirectWifi.Peer>> peers;List<Consumer<DirectWifi.Link>> links=new ArrayList<>();
        public boolean open(Runnable lost){this.lost=lost;return available;}
        public void discover(Consumer<Boolean> done){if(denied)throw new SecurityException();discovery=done;}
        public void peers(Consumer<List<DirectWifi.Peer>> done){peers=done;}
        public void link(Consumer<DirectWifi.Link> done){links.add(done);}
        public void join(DirectWifi.Peer peer,Consumer<Boolean> done){joined++;selectedPeer=peer;join=done;}
        public void close(){closed++;}
        void reply(DirectWifi.Link link){links.get(links.size()-1).accept(link);}
    }
    Fake backend;DirectWifi client;List<String> codes,hosts;List<DirectWifi.Peer> visible;
    @Before public void setup(){backend=new Fake();codes=new ArrayList<>();hosts=new ArrayList<>();client=new DirectWifi(backend,new Handler(Looper.getMainLooper()),new DirectWifi.Listener(){
        public void status(String code,String text){codes.add(code);}public void peers(List<DirectWifi.Peer> list){visible=list;}public void connected(DirectWifi.Link link){hosts.add(link.host);}
    });}
    @After public void close(){client.close();}
    void found(){client.find();backend.discovery.accept(true);backend.peers.accept(Collections.singletonList(PEER));}
    @Test public void discoveryNeverConnectsUntilUserSelects(){found();assertEquals(1,visible.size());assertEquals(0,backend.joined);assertTrue(hosts.isEmpty());}
    @Test public void requestAcceptedIsNotConnectionAndMatchingOwnerIsRequired(){
        found();client.select(visible.get(0));backend.reply(new DirectWifi.Link(false,false,null,null));assertEquals(1,backend.joined);
        backend.join.accept(true);assertTrue(hosts.isEmpty());shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(1));backend.reply(UP);
        assertEquals(Collections.singletonList("192.168.49.1"),hosts);assertFalse(client.joining());
    }
    @Test public void existingOtherGroupCannotBeSilentlyReplaced(){
        found();client.select(PEER);backend.reply(new DirectWifi.Link(true,false,"02:00:11:22:33:44","192.168.49.1"));
        assertTrue(codes.contains("W24"));assertEquals(0,backend.joined);assertTrue(hosts.isEmpty());
    }
    @Test public void phoneAsGroupOwnerIsNotP2(){found();client.select(PEER);backend.reply(new DirectWifi.Link(true,true,PEER.address,"192.168.49.1"));assertTrue(codes.contains("W24"));assertTrue(hosts.isEmpty());}
    @Test public void existingMatchingGroupCanBeUsedWithoutAnotherJoin(){found();client.select(PEER);backend.reply(UP);assertEquals(1,hosts.size());assertEquals(0,backend.joined);}
    @Test public void staleCallbackAfterTimeoutCannotConnect(){
        found();client.select(PEER);Consumer<DirectWifi.Link> old=backend.links.get(0);shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(45));old.accept(UP);
        assertTrue(codes.contains("W25"));assertTrue(hosts.isEmpty());assertFalse(client.joining());
    }
    @Test public void delayedPeerCallbackAfterCloseOrCancelIsIgnored(){
        client.find();backend.discovery.accept(true);client.stopFinding();backend.peers.accept(Collections.singletonList(PEER));assertNull(visible);
        client.close();backend.discovery.accept(true);assertNull(visible);assertEquals(1,backend.closed);
    }
    @Test public void discoveryTimeoutAndPermissionDenialHaveSpecificGuidance(){
        client.find();backend.discovery.accept(true);shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(20));assertTrue(codes.contains("W21"));
        backend.denied=true;client.find();assertTrue(codes.contains("W23"));assertTrue(hosts.isEmpty());
    }
    @Test public void duplicateUpdatesDoNotBreakSelectionFromVisibleDialog(){
        found();DirectWifi.Peer old=visible.get(0);client.changed();backend.peers.accept(Collections.singletonList(new DirectWifi.Peer("Test P2",PEER.address)));
        client.select(old);backend.reply(UP);assertEquals(1,hosts.size());
    }
    @Test public void lostRegistrationAndDestroyedActivityInvalidatePendingJoin(){
        found();client.select(PEER);backend.lost.run();backend.reply(UP);assertTrue(hosts.isEmpty());assertTrue(codes.contains("W26"));
        found();client.select(PEER);client.close();backend.reply(UP);assertTrue(hosts.isEmpty());
    }
    @Test public void qrSelectsOnlyExactTargetAndUsesItsAddress(){
        client.find("Test P2");backend.discovery.accept(true);
        backend.peers.accept(Arrays.asList(new DirectWifi.Peer("Different P2","11:22"),PEER));
        assertNull(visible);backend.reply(new DirectWifi.Link(false,false,null,null));
        assertSame(PEER,backend.selectedPeer);assertEquals(1,backend.joined);
    }
    @Test public void unrelatedPeersDoNotDisableQrDeadlineOrOpenPicker(){
        client.find("Target P2");backend.discovery.accept(true);backend.peers.accept(Collections.singletonList(PEER));
        assertNull(visible);assertEquals(0,backend.joined);
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(20));assertTrue(codes.contains("W21"));
        backend.peers.accept(Collections.singletonList(new DirectWifi.Peer("Target P2","99:99")));assertEquals(0,backend.joined);
    }
    @Test public void duplicateQrTargetNamesNeverChooseArbitrarily(){
        client.find("Test P2");backend.discovery.accept(true);backend.peers.accept(Arrays.asList(PEER,new DirectWifi.Peer("Test P2","99:99")));
        assertTrue(codes.contains("W28"));assertEquals(0,backend.joined);assertTrue(hosts.isEmpty());
    }
    @Test public void cancellingQrAndStartingManualDiscoveryClearsTarget(){
        client.find("Target P2");backend.discovery.accept(true);client.stopFinding();
        client.find();backend.discovery.accept(true);backend.peers.accept(Collections.singletonList(PEER));
        assertEquals(1,visible.size());assertEquals(0,backend.joined);
    }

}
