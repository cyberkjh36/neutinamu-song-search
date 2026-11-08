package kr.neutinamu.p2;

import android.app.AlertDialog;
import android.content.Intent;
import android.os.Looper;
import android.view.View;
import android.widget.*;
import java.lang.reflect.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlertDialog;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,29,35})
public class MainActivityTest {
    private ActivityController<MainActivity> controller;private MainActivity app;
    @Before public void open(){
        controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();
        ((android.net.wifi.WifiManager)app.getSystemService(android.content.Context.WIFI_SERVICE)).setWifiEnabled(true);
        shadowOf((android.location.LocationManager)app.getSystemService(android.content.Context.LOCATION_SERVICE)).setLocationEnabled(true);
    }
    @After public void close(){AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();if(dialog!=null)dialog.dismiss();controller.pause().stop().destroy();shadowOf(Looper.getMainLooper()).idle();}
    private <T extends View>T view(String tag){
        T main=app.getWindow().getDecorView().findViewWithTag(tag);if(main!=null)return main;
        try{return ((View)field("scroll")).findViewWithTag(tag);}catch(Exception e){throw new AssertionError(e);}
    }
    private void command(String command)throws Exception{((SongSearchView)field("songSearch")).handle("{\"command\":\""+command+"\"}");}
    private String message(){return ((TextView)view("connectionStatus")).getText().toString();}
    private Object field(String name)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(app);}
    private void set(String name,Object value)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(app,value);}
    private void call(String name)throws Exception{Method method=MainActivity.class.getDeclaredMethod(name);method.setAccessible(true);method.invoke(app);}
    private void finishWorker()throws Exception{
        // Older Android dialog buttons post their listener to the main Handler.
        // Dispatch that click before placing a barrier behind the background work.
        shadowOf(Looper.getMainLooper()).idle();
        ((java.util.concurrent.ExecutorService)field("worker")).submit(()->{}).get(10,java.util.concurrent.TimeUnit.SECONDS);
        shadowOf(Looper.getMainLooper()).idle();
    }
    private DirectWifiTest.Fake fakeDiscovery()throws Exception{
        DirectWifi old=(DirectWifi)field("directWifi");Field listener=DirectWifi.class.getDeclaredField("listener");listener.setAccessible(true);
        DirectWifiTest.Fake backend=new DirectWifiTest.Fake();DirectWifi replacement=new DirectWifi(backend,new android.os.Handler(Looper.getMainLooper()),(DirectWifi.Listener)listener.get(old));
        old.close();set("directWifi",replacement);return backend;
    }
    @Test public void roomQrAndExplicitStaffConnectionUseSeparateRegistrationModes()throws Exception{
        CaptureProfile saved=ProfileStoreTest.sample();byte[] original=saved.registration();
        String mac="02:11:22:33:44:55";
        CaptureProfile guest=MainActivity.connectionProfile("192.168.49.1","TJ_P2_P0207654321_7_B",mac,saved);
        assertEquals(2,guest.registration()[9]);assertEquals("0000000000",new String(guest.registration(),28,10,"US-ASCII"));
        CaptureProfile staff=MainActivity.connectionProfile("192.168.49.1",null,mac,saved);
        assertEquals(4,staff.registration()[9]);assertEquals("SYNTHETIC",new String(staff.registration(),28,9,"US-ASCII"));
        assertArrayEquals(original,saved.registration());
    }
    @Test public void qrRoomIsPreservedWhenWifiSettingsBlocksDiscoveryAndResumesAfterReturn()throws Exception{
        finishWorker();set("rooms",RoomDirectory.read(new java.io.StringReader("8번 TJ_P2_TEST_EIGHT_7_B\n")));DirectWifiTest.Fake backend=fakeDiscovery();
        shadowOf(app).grantPermissions(MainActivity.wifiPermission());
        android.net.wifi.WifiManager wifi=(android.net.wifi.WifiManager)app.getSystemService(android.content.Context.WIFI_SERVICE);wifi.setWifiEnabled(false);
        app.onNewIntent(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://cyberkjh36.github.io/neutinamu-song-search/p2-room.html?room=8")));
        assertTrue(message().contains("[W30]"));assertNull(backend.discovery);assertEquals("8",field("roomRequest"));
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick();shadowOf(Looper.getMainLooper()).idle();
        assertEquals(android.provider.Settings.ACTION_WIFI_SETTINGS,shadowOf(app).getNextStartedActivity().getAction());
        controller.pause();wifi.setWifiEnabled(true);controller.resume();
        assertNotNull(backend.discovery);assertEquals("8",field("roomRequest"));assertNull(field("session"));assertEquals(0,backend.joined);
    }
    @Test @Config(sdk={28,29}) public void locationOffExplainsSettingsAndReturningWithoutChangeDoesNotScanOrLoop()throws Exception{
        finishWorker();DirectWifiTest.Fake backend=fakeDiscovery();shadowOf(app).grantPermissions(MainActivity.wifiPermission());
        android.location.LocationManager location=(android.location.LocationManager)app.getSystemService(android.content.Context.LOCATION_SERVICE);shadowOf(location).setLocationEnabled(false);
        view("connect").performClick();assertTrue(message().contains("[W31]"));assertNull(backend.discovery);
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick();shadowOf(Looper.getMainLooper()).idle();
        assertEquals(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS,shadowOf(app).getNextStartedActivity().getAction());
        controller.pause().resume();assertNull(backend.discovery);assertFalse(ShadowAlertDialog.getLatestAlertDialog().isShowing());
        shadowOf(location).setLocationEnabled(true);view("connect").performClick();assertNotNull(backend.discovery);
    }
    @Test public void integratedButtonsUseExistingAuthenticatedSessionAndDoNotDoubleSend()throws Exception{
        finishWorker();java.io.ByteArrayOutputStream sent=new java.io.ByteArrayOutputStream();
        java.net.Socket socket=new java.net.Socket(){@Override public java.io.OutputStream getOutputStream(){return sent;}};
        CaptureProfile profile=ProfileStoreTest.sample();Session session=new Session(socket,profile,(state,message)->{});
        Field state=Session.class.getDeclaredField("state");state.setAccessible(true);state.set(session,Session.State.READY);set("session",session);
        try{
            SongSearchView web=(SongSearchView)field("songSearch");web.handle("{\"command\":\"connection\"}");view("showSongSearch").performClick();assertSame(session,field("session"));
            web.handle("{\"command\":\"play\",\"number\":\"10909\"}");
            web.handle("{\"command\":\"play\",\"number\":\"10909\"}");finishWorker();
            assertArrayEquals(profile.packet(Wire.play(10909)),sent.toByteArray());assertEquals(Session.State.PLAY,session.state());
            web.handle("{\"command\":\"cancel\"}");finishWorker();
            java.io.ByteArrayOutputStream expected=new java.io.ByteArrayOutputStream();expected.write(profile.packet(Wire.play(10909)));expected.write(profile.packet(Wire.cancel()));
            assertArrayEquals(expected.toByteArray(),sent.toByteArray());assertEquals(Session.State.CANCEL,session.state());
        }finally{session.close();set("session",null);}
    }
    @Test public void integratedSearchAndConnectionShareOneSessionAndPlaybackGuard()throws Exception{
        SongSearchView web=(SongSearchView)field("songSearch");assertEquals(View.VISIBLE,web.view.getVisibility());
        web.handle("{\"command\":\"connection\"}");assertEquals(View.VISIBLE,web.view.getVisibility());assertTrue(((AlertDialog)field("toolsDialog")).isShowing());
        view("showSongSearch").performClick();assertEquals(View.VISIBLE,web.view.getVisibility());
        web.handle("{\"command\":\"play\",\"number\":\"10909\"}");
        assertTrue(message().contains("[C00]"));assertNull(field("session"));
        assertFalse(((Diagnostics)field("diagnostics")).report().contains("PLAY_TAPPED"));
        web.handle("{\"command\":\"connection\"}");app.onBackPressed();assertEquals(View.VISIBLE,web.view.getVisibility());
    }
    @Test public void reservationAndQueueUseLiveSessionAndRejectDuplicateTap()throws Exception{
        finishWorker();java.io.ByteArrayOutputStream sent=new java.io.ByteArrayOutputStream();
        java.net.Socket socket=new java.net.Socket(){@Override public java.io.OutputStream getOutputStream(){return sent;}};
        CaptureProfile profile=ProfileStoreTest.sample();Session session=new Session(socket,profile,(state,message)->{});
        Field state=Session.class.getDeclaredField("state");state.setAccessible(true);state.set(session,Session.State.READY);set("session",session);
        try{
            SongSearchView web=(SongSearchView)field("songSearch");web.handle("{\"command\":\"reserve\",\"number\":\"47050\"}");web.handle("{\"command\":\"reserve\",\"number\":\"47050\"}");finishWorker();
            assertArrayEquals(profile.packet(Wire.reserve(47050)),sent.toByteArray());assertEquals(Session.State.RESERVE,session.state());assertFalse((Boolean)field("queueValid"));
            sent.reset();state.set(session,Session.State.READY);web.handle("{\"command\":\"queue\"}");finishWorker();
            assertArrayEquals(profile.packet(Wire.queue()),sent.toByteArray());assertEquals(Session.State.QUEUE,session.state());
        }finally{session.close();set("session",null);}
    }
    @Test public void disconnectedReservationIsNotSentAndPreviousRoomListIsCleared()throws Exception{
        finishWorker();set("queueSongs",java.util.Arrays.asList(47050,914));set("queueValid",true);call("paint");
        assertFalse((Boolean)field("queueValid"));assertTrue(((java.util.List<?>)field("queueSongs")).isEmpty());
        ((SongSearchView)field("songSearch")).handle("{\"command\":\"reserve\",\"number\":\"47050\"}");
        assertTrue(message().contains("[C00]"));assertFalse(((Diagnostics)field("diagnostics")).report().contains("RESERVE_TAPPED"));
    }
    @Test public void onlyOneSearchSurfaceAndToolsNeverReplaceIt()throws Exception{
        SongSearchView web=(SongSearchView)field("songSearch");
        assertEquals(1,((FrameLayout)field("screens")).getChildCount());
        assertNull(view("query"));assertNull(view("songNumber"));assertNull(view("voiceSearch"));
        command("connection");assertTrue(((AlertDialog)field("toolsDialog")).isShowing());
        assertEquals(View.VISIBLE,web.view.getVisibility());
        view("settingsToggle").performClick();assertEquals(View.VISIBLE,view("connectionDetails").getVisibility());
        app.onBackPressed();assertFalse(((AlertDialog)field("toolsDialog")).isShowing());assertSame(web,field("songSearch"));
        command("connection");view("showSongSearch").performClick();assertFalse(((AlertDialog)field("toolsDialog")).isShowing());
    }
    @Test public void roomPickerShowsOnlyNumberedRoomsAndKeepsSelectedPeer()throws Exception{
        set("rooms",RoomDirectoryTest.sample());DirectWifiTest.Fake backend=fakeDiscovery();shadowOf(app).grantPermissions(MainActivity.wifiPermission());
        command("find");backend.discovery.accept(true);
        DirectWifi.Peer one=new DirectWifi.Peer("TJ_P2_TEST_A_1_B","01"),five=new DirectWifi.Peer("TJ_P2_TEST_B_4_B","05");
        backend.peers.accept(java.util.Arrays.asList(five,new DirectWifi.Peer("PRIVATE_UNREGISTERED_ID","99"),one));
        AlertDialog picker=ShadowAlertDialog.getLatestAlertDialog();android.widget.ListAdapter items=picker.getListView().getAdapter();
        assertEquals(2,items.getCount());assertEquals("1번방",items.getItem(0));assertEquals("5번방",items.getItem(1));
        picker.getListView().performItemClick(null,1,1);shadowOf(Looper.getMainLooper()).idle();
        backend.reply(new DirectWifi.Link(false,false,null,null));assertSame(five,backend.selectedPeer);assertEquals("5",field("roomRequest"));
    }
    @Test public void mainConnectionButtonStartsDiscoveryWithoutOpeningAnotherScreen()throws Exception{
        DirectWifiTest.Fake backend=fakeDiscovery();shadowOf(app).grantPermissions(MainActivity.wifiPermission());
        command("connect");assertNotNull(backend.discovery);assertNull(field("toolsDialog"));
        assertEquals(View.VISIBLE,((SongSearchView)field("songSearch")).view.getVisibility());
        Object first=backend.discovery;command("connect");assertSame(first,backend.discovery);
    }
    @Test public void nextUsesAuthenticatedSessionOnceAndKeepsConnectionBanner()throws Exception{
        java.io.ByteArrayOutputStream sent=new java.io.ByteArrayOutputStream();
        Session session=new Session(new java.net.Socket(){@Override public java.io.OutputStream getOutputStream(){return sent;}},ProfileStoreTest.sample(),(state,message)->{});
        Field state=Session.class.getDeclaredField("state");state.setAccessible(true);state.set(session,Session.State.READY);set("session",session);
        try{
            command("next");command("next");finishWorker();
            assertArrayEquals(ProfileStoreTest.sample().packet(Wire.queue()),sent.toByteArray());assertEquals(Session.State.ADVANCE_QUEUE,session.state());
            assertTrue(((TextView)view("connectionBanner")).getText().toString().contains("연결됨"));
            assertFalse(((Diagnostics)field("diagnostics")).report().contains("PLAY_TAPPED"));
        }finally{session.close();set("session",null);}
    }
    @Test public void nextBeforeConnectionNeverSendsCommand()throws Exception{
        command("next");assertTrue(message().contains("[C00]"));assertNull(field("session"));
        assertFalse(((Diagnostics)field("diagnostics")).report().contains("NEXT_TAPPED"));
    }
    @Test public void queueTapChecksCurrentRoomListThenSerializesLatestQueueRequest()throws Exception{
        java.io.ByteArrayOutputStream sent=new java.io.ByteArrayOutputStream();
        Session session=new Session(new java.net.Socket(){@Override public java.io.OutputStream getOutputStream(){return sent;}},ProfileStoreTest.sample(),(state,message)->{});
        Field state=Session.class.getDeclaredField("state");state.setAccessible(true);state.set(session,Session.State.READY);set("session",session);
        try{
            SongSearchView web=(SongSearchView)field("songSearch");
            String request="{\"command\":\"queuePlay\",\"number\":\"914\",\"index\":1}";
            web.handle(request);finishWorker();assertEquals(0,sent.size());
            set("queueSongs",java.util.Arrays.asList(47050,914,47050));set("queueValid",true);
            web.handle(request);web.handle(request);finishWorker();
            assertArrayEquals(ProfileStoreTest.sample().packet(Wire.queue()),sent.toByteArray());
            assertEquals(Session.State.ADVANCE_QUEUE,session.state());
            for(Session.State phase:new Session.State[]{Session.State.ADVANCE_QUEUE,Session.State.ADVANCE_STOP,Session.State.ADVANCE_PLAY}){
                state.set(session,phase);call("paint");assertTrue(((TextView)view("connectionBanner")).getText().toString().contains("연결됨"));
            }
        }finally{session.close();set("session",null);}
    }
    @Test public void closingConnectionClearsCurrentPlaybackAndKeeper()throws Exception{
        Session session=new Session(new java.net.Socket(),ProfileStoreTest.sample(),(state,message)->{});
        Field state=Session.class.getDeclaredField("state");state.setAccessible(true);state.set(session,Session.State.READY);set("session",session);
        set("nowPlayingSong",914);set("playbackKnown",true);call("paint");assertTrue((Boolean)field("keeperRequested"));
        controller.pause().stop();assertTrue((Boolean)field("keeperRequested"));assertEquals(Session.State.READY,session.state());
        controller.start().resume();command("connect");assertEquals(0,field("nowPlayingSong"));assertFalse((Boolean)field("playbackKnown"));assertFalse((Boolean)field("keeperRequested"));
    }
    private void scheduleLoss(String reason)throws Exception{
        Method m=MainActivity.class.getDeclaredMethod("scheduleRecovery",String.class);m.setAccessible(true);m.invoke(app,reason);
    }
    private void verifiedRoom(String room)throws Exception{
        set("rooms",RoomDirectoryTest.sample());set("roomRequest",room);set("activeRoom",room);
        ReconnectPolicy p=(ReconnectPolicy)field("recovery");p.start(room);p.connected(room,android.os.SystemClock.elapsedRealtime());
    }
    @Test public void recoveryFindsOnlyPreviouslyVerifiedRoomAndNeverIssuesPlay()throws Exception{
        finishWorker();DirectWifiTest.Fake backend=fakeDiscovery();shadowOf(app).grantPermissions(MainActivity.wifiPermission());verifiedRoom("5");
        scheduleLoss("[N02] disconnected");assertTrue((Boolean)field("recoveryPending"));assertNull(backend.discovery);
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(1501));assertNotNull(backend.discovery);
        backend.discovery.accept(true);DirectWifi.Peer five=new DirectWifi.Peer("TJ_P2_TEST_B_4_B","05");
        backend.peers.accept(java.util.Arrays.asList(new DirectWifi.Peer("TJ_P2_TEST_A_1_B","01"),five));
        backend.reply(new DirectWifi.Link(false,false,null,null));assertSame(five,backend.selectedPeer);
        assertFalse(((Diagnostics)field("diagnostics")).report().contains("PLAY_TAPPED"));assertFalse((Boolean)field("commandQueued"));
    }
    @Test public void backgroundRecoveryWaitsForReturnAndCanBeCancelled()throws Exception{
        finishWorker();DirectWifiTest.Fake backend=fakeDiscovery();verifiedRoom("5");controller.pause();
        scheduleLoss("[N01] timeout");shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(20));assertNull(backend.discovery);
        controller.resume();assertNotNull(field("recoveryTask"));command("connect");assertFalse((Boolean)field("recoveryPending"));
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(20));assertNull(backend.discovery);
    }
    @Test public void changedRoomOrAuthenticationRejectionDoesNotAutoReconnect()throws Exception{
        finishWorker();DirectWifiTest.Fake backend=fakeDiscovery();verifiedRoom("5");scheduleLoss("[A01] rejected");assertFalse((Boolean)field("recoveryPending"));
        verifiedRoom("5");scheduleLoss("[N02] closed");set("roomRequest","1");
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(2));assertNull(backend.discovery);assertFalse((Boolean)field("recoveryPending"));
    }
    @Test public void disconnectFromMainSurfaceClearsRoomQueue()throws Exception{
        Session session=new Session(new java.net.Socket(),ProfileStoreTest.sample(),(state,message)->{});
        Field state=Session.class.getDeclaredField("state");state.setAccessible(true);state.set(session,Session.State.READY);set("session",session);
        set("queueSongs",java.util.Arrays.asList(10909));set("queueValid",true);
        command("connect");assertEquals(Session.State.CLOSED,session.state());assertNull(field("session"));
        assertFalse((Boolean)field("queueValid"));assertNull(field("toolsDialog"));
    }
    @Test public void bannerRequiresProtocolReadinessNotJustSavedProfile()throws Exception{
        set("profile",ProfileStoreTest.sample());call("paint");assertTrue(((TextView)view("connectionBanner")).getText().toString().contains("연결 전"));
        Session session=new Session(new java.net.Socket(),ProfileStoreTest.sample(),(state,message)->{});
        try{set("session",session);call("paint");assertTrue(((TextView)view("connectionBanner")).getText().toString().contains("준비 중"));
            Field state=Session.class.getDeclaredField("state");state.setAccessible(true);state.set(session,Session.State.READY);call("paint");
            assertTrue(((TextView)view("connectionBanner")).getText().toString().contains("연결됨"));
        }finally{session.close();set("session",null);call("paint");}
        assertTrue(((TextView)view("connectionBanner")).getText().toString().contains("연결 전"));
    }
    @Test public void savedProfileRestoresWithoutConnectingOrStartingPlayback()throws Exception{
        java.io.File path=new java.io.File(app.getNoBackupFilesDir(),"test-profile.enc");
        ProfileStore store=new ProfileStore(path,()->ProfileStoreTest.KEY);store.save(ProfileStoreTest.sample());
        try{
            set("profileStore",store);call("restoreProfile");finishWorker();
            assertNotNull(field("profile"));assertNull(field("session"));assertNull(field("connectingSocket"));assertEquals(false,field("connecting"));
            assertTrue(((TextView)view("profileStatus")).getText().toString().contains("불러왔습니다"));
            assertNull(shadowOf(app).getNextStartedActivity());
            view("forgetProfile").performClick();AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).performClick();assertTrue(store.exists());
            view("forgetProfile").performClick();ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick();finishWorker();
            assertNull(field("profile"));assertFalse(store.exists());assertNull(field("session"));
        }finally{store.clear();}
    }
    @Test public void brokenSavedProfileExplainsRoomQrOptionAndDoesNotConnect()throws Exception{
        java.io.File path=new java.io.File(app.getNoBackupFilesDir(),"test-broken.enc");
        try(java.io.FileOutputStream out=new java.io.FileOutputStream(path)){out.write(new byte[]{1,2,3});}
        ProfileStore store=new ProfileStore(path,()->ProfileStoreTest.KEY);
        try{set("profileStore",store);call("restoreProfile");finishWorker();assertNull(field("profile"));assertNull(field("session"));
            assertTrue(((TextView)view("profileStatus")).getText().toString().contains("방 QR"));assertEquals(false,field("importing"));
        }finally{store.clear();}
    }
    @Test public void startBeforeConnectionIsClickableAndExplained()throws Exception{
        ((SongSearchView)field("songSearch")).handle("{\"command\":\"play\",\"number\":\"10909\"}");
        assertTrue(message().contains("[C00]"));assertTrue(message().contains("명령을 보내지 않았습니다"));
        assertTrue(ShadowAlertDialog.getLatestAlertDialog().isShowing());assertNull(field("session"));
    }
    @Test public void cancelBeforeConnectionExplainsMissingConnection()throws Exception{
        command("cancel");assertTrue(message().contains("[C00]"));
    }
    @Test public void connectionWithoutProfileStartsDiscoveryWithoutFilePicker(){
        assertTrue(view("connect").isEnabled());view("connect").performClick();
        assertEquals("android.content.pm.action.REQUEST_PERMISSIONS",shadowOf(app).getNextStartedActivity().getAction());
    }
    @Test public void savedProfileAloneCannotSkipWirelessDiscovery()throws Exception{
        finishWorker();CaptureProfile saved=ProfileStoreTest.sample();set("profile",saved);
        DirectWifiTest.Fake backend=fakeDiscovery();shadowOf(app).grantPermissions(MainActivity.wifiPermission());
        view("connect").performClick();
        assertNotNull(backend.discovery);assertSame(saved,field("profile"));assertNull(field("connectingSocket"));assertNull(field("session"));
        assertFalse(((Diagnostics)field("diagnostics")).report().contains("CONNECT_STARTED"));
        assertTrue(((TextView)view("connectionBanner")).getText().toString().contains("찾는 중"));
        assertNull(shadowOf(app).getNextStartedActivity());
    }
    @Test public void retryClearsStaleRouteAndOnlyRediscoversQrRoom()throws Exception{
        finishWorker();set("rooms",RoomDirectoryTest.sample());set("profile",ProfileStoreTest.sample());set("roomRequest","5");set("activeRoom","5");
        set("directHost","192.0.2.55");set("directInterface","old-p2p");set("directMode",true);
        DirectWifiTest.Fake backend=fakeDiscovery();shadowOf(app).grantPermissions(MainActivity.wifiPermission());
        view("connect").performClick();assertNull(field("directHost"));assertNull(field("directInterface"));assertEquals("5",field("roomRequest"));
        assertEquals("5번방 연결",((Button)view("connect")).getText().toString());assertTrue(((TextView)view("connectionBanner")).getText().toString().contains("5번방 찾는 중"));
        Object first=backend.discovery;view("connect").performClick();assertSame(first,backend.discovery);
        backend.discovery.accept(true);backend.peers.accept(java.util.Collections.singletonList(new DirectWifi.Peer("TJ_P2_TEST_A_1_B","01")));assertEquals(0,backend.joined);
        DirectWifi.Peer five=new DirectWifi.Peer("TJ_P2_TEST_B_4_B","05");backend.peers.accept(java.util.Collections.singletonList(five));backend.reply(new DirectWifi.Link(false,false,null,null));
        assertSame(five,backend.selectedPeer);assertEquals(1,backend.joined);assertNull(field("session"));assertFalse(((Diagnostics)field("diagnostics")).report().contains("PLAY_TAPPED"));
    }
    @Test public void httpsRoomEightRetainsTargetAfterPermissionDenialAndRetry()throws Exception{
        finishWorker();set("rooms",RoomDirectory.read(new java.io.StringReader("8번 TJ_P2_TEST_EIGHT_7_B\n")));DirectWifiTest.Fake backend=fakeDiscovery();
        shadowOf(app).denyPermissions(MainActivity.wifiPermission());
        app.onNewIntent(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://cyberkjh36.github.io/neutinamu-song-search/p2-room.html?room=8")));
        assertEquals("8",field("roomRequest"));assertEquals("8번방 연결",((Button)view("connect")).getText().toString());assertNull(backend.discovery);
        app.onRequestPermissionsResult(2,new String[]{MainActivity.wifiPermission()},new int[]{android.content.pm.PackageManager.PERMISSION_DENIED});assertTrue(message().contains("[W03]"));
        shadowOf(app).grantPermissions(MainActivity.wifiPermission());view("connect").performClick();
        assertNotNull(backend.discovery);assertEquals("8",field("roomRequest"));assertTrue(((TextView)view("connectionBanner")).getText().toString().contains("8번방 찾는 중"));assertNull(field("session"));
    }
    @Test public void missingConnectionDialogAlsoDiscoversInsteadOfUsingSavedAddress()throws Exception{
        finishWorker();set("profile",ProfileStoreTest.sample());DirectWifiTest.Fake backend=fakeDiscovery();shadowOf(app).grantPermissions(MainActivity.wifiPermission());
        ((SongSearchView)field("songSearch")).handle("{\"command\":\"play\",\"number\":\"10909\"}");
        ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick();shadowOf(Looper.getMainLooper()).idle();
        assertNotNull(backend.discovery);assertNull(field("session"));assertNull(field("connectingSocket"));
        assertFalse(((Diagnostics)field("diagnostics")).report().contains("PLAY_TAPPED"));
    }
    @Test public void discoveryTimeoutReleasesBusyStateAndAllowsSameRoomRetry()throws Exception{
        finishWorker();set("rooms",RoomDirectoryTest.sample());set("roomRequest","5");DirectWifiTest.Fake backend=fakeDiscovery();shadowOf(app).grantPermissions(MainActivity.wifiPermission());
        view("connect").performClick();Object first=backend.discovery;backend.discovery.accept(true);
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(20));assertTrue(message().contains("[W21]"));assertFalse(((DirectWifi)field("directWifi")).searching());
        assertTrue(((TextView)view("connectionBanner")).getText().toString().contains("5번방 연결 전"));
        view("connect").performClick();assertNotSame(first,backend.discovery);assertEquals("5",field("roomRequest"));assertNull(field("session"));
    }
    @Test public void diagnosisShownAtBothConnectionAndPlayControls()throws Exception{
        Method show=MainActivity.class.getDeclaredMethod("show",String.class);show.setAccessible(true);
        String text="[A01] 초기 응답 길이=1바이트, 응답값=1";show.invoke(app,text);
        assertEquals(text,message());assertEquals(text,((TextView)view("connectionStatus")).getText().toString());
    }
    @Test public void sharingRequiresUserChooserAndContainsNoRawCapture(){
        view("shareDiagnostics").performClick();Intent chooser=shadowOf(app).getNextStartedActivity();
        assertEquals(Intent.ACTION_CHOOSER,chooser.getAction());
        Intent send=chooser.getParcelableExtra(Intent.EXTRA_INTENT);assertNotNull(send);
        assertEquals("text/plain",send.getType());String text=send.getStringExtra(Intent.EXTRA_TEXT);
        assertTrue(text.contains("느티나무노래방 전용 리모컨 0.11.5"));assertFalse(text.contains("TJAA"));assertFalse(text.contains("192.168."));
    }
    @Test public void managerSettingsBlockedBeforeWifiPreparation(){
        view("tjSettings").performClick();assertTrue(message().contains("기존 직접 연결 확인"));
        assertNull(shadowOf(app).getNextStartedActivity());
    }
    @Test @Config(sdk={28,29,31,35}) public void preparationNeedsCaptureAndPermissionDenialDoesNotClaimSuccess(){
        view("prepareWifi").performClick();assertNull(shadowOf(app).getNextStartedActivity());
        app.onRequestPermissionsResult(2,new String[]{MainActivity.wifiPermission()},new int[]{android.content.pm.PackageManager.PERMISSION_DENIED});
        assertTrue(((TextView)view("wifiStatus")).getText().toString().contains("[W03]"));
        assertEquals(android.os.Build.VERSION.SDK_INT>=33?"android.permission.NEARBY_WIFI_DEVICES":"android.permission.ACCESS_FINE_LOCATION",MainActivity.wifiPermission());
        if(android.os.Build.VERSION.SDK_INT==31)assertArrayEquals(new String[]{"android.permission.ACCESS_FINE_LOCATION","android.permission.ACCESS_COARSE_LOCATION"},MainActivity.wifiPermissions());
    }
    @Test public void wifiClientSurvivesSettingsLifecycleUntilActivityDestroyed()throws Exception{
        final int[] counts=new int[3];
        P2pRegistration.Backend backend=new P2pRegistration.Backend(){
            public boolean open(Runnable lost){counts[0]++;return true;}
            public void info(java.util.function.Consumer<P2pRegistration.Info> result){counts[1]++;result.accept(new P2pRegistration.Info(true,false,"192.0.2.1"));}
            public void close(){counts[2]++;}
        };
        P2pRegistration registration=new P2pRegistration(backend,new android.os.Handler(Looper.getMainLooper()),()->"192.0.2.1",s->{},new Diagnostics());
        Field f=MainActivity.class.getDeclaredField("wifiRegistration");f.setAccessible(true);f.set(app,registration);registration.prepare();
        controller.pause().stop();assertEquals(0,counts[2]);assertTrue(registration.registered());
        controller.start().resume();assertEquals(1,counts[0]);assertEquals(2,counts[1]);assertEquals(0,counts[2]);
        controller.pause().stop().destroy();assertEquals(1,counts[2]);assertFalse(registration.registered());
        // Recreate only so the common teardown still owns a live Activity.
        controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();
    }
    @Test public void freshRoomQrWaitsForPermissionThenFindsCorrectRoomWithoutProfile()throws Exception{
        finishWorker();set("rooms",RoomDirectoryTest.sample());
        DirectWifi old=(DirectWifi)field("directWifi");Field listener=DirectWifi.class.getDeclaredField("listener");listener.setAccessible(true);
        DirectWifiTest.Fake backend=new DirectWifiTest.Fake();DirectWifi replacement=new DirectWifi(backend,new android.os.Handler(Looper.getMainLooper()),(DirectWifi.Listener)listener.get(old));old.close();set("directWifi",replacement);
        shadowOf(app).denyPermissions(MainActivity.wifiPermission());
        app.onNewIntent(RoomDirectoryTest.link("room=5"));
        assertEquals(View.VISIBLE,((SongSearchView)field("songSearch")).view.getVisibility());assertNull(field("toolsDialog"));
        assertEquals("5",field("roomRequest"));assertEquals(false,field("roomPending"));assertNull(field("profile"));assertNull(backend.discovery);
        assertEquals("android.content.pm.action.REQUEST_PERMISSIONS",shadowOf(app).getNextStartedActivity().getAction());assertNull(field("session"));
        shadowOf(app).grantPermissions(MainActivity.wifiPermission());
        app.onRequestPermissionsResult(2,new String[]{MainActivity.wifiPermission()},new int[]{android.content.pm.PackageManager.PERMISSION_GRANTED});
        backend.discovery.accept(true);DirectWifi.Peer five=new DirectWifi.Peer("TJ_P2_TEST_B_4_B","05");
        backend.peers.accept(java.util.Arrays.asList(new DirectWifi.Peer("TJ_P2_TEST_A_1_B","01"),five));backend.reply(new DirectWifi.Link(false,false,null,null));
        assertSame(five,backend.selectedPeer);assertEquals(1,backend.joined);assertEquals("5",field("activeRoom"));assertNull(field("profile"));
        assertFalse(((Diagnostics)field("diagnostics")).report().contains("PLAY_TAPPED"));
    }
    @Test public void sameRoomQrReturnsToSearchWhenAlreadyConnected()throws Exception{
        finishWorker();set("rooms",RoomDirectoryTest.sample());set("activeRoom","1");set("roomRequest","1");
        Session session=new Session(new java.net.Socket(),ProfileStoreTest.sample(),(state,message)->{});
        Field state=Session.class.getDeclaredField("state");state.setAccessible(true);state.set(session,Session.State.READY);set("session",session);
        try{app.onNewIntent(RoomDirectoryTest.link("room=1"));assertSame(session,field("session"));assertEquals(View.VISIBLE,((SongSearchView)field("songSearch")).view.getVisibility());}
        finally{session.close();set("session",null);}
    }
    @Test public void invalidRoomQrCannotReplaceCurrentTarget()throws Exception{
        finishWorker();set("rooms",RoomDirectoryTest.sample());set("roomRequest","1");
        app.onNewIntent(RoomDirectoryTest.link("room=5&song=10909"));assertEquals("1",field("roomRequest"));assertNull(field("session"));
    }
    @Test public void roomQrWaitsForAsyncRestoreThenFindsOnlyAssignedDevice()throws Exception{
        finishWorker();set("rooms",RoomDirectoryTest.sample());set("importing",true);
        app.onNewIntent(RoomDirectoryTest.link("room=5"));assertEquals(true,field("roomPending"));
        DirectWifi old=(DirectWifi)field("directWifi");Field listener=DirectWifi.class.getDeclaredField("listener");listener.setAccessible(true);
        DirectWifiTest.Fake backend=new DirectWifiTest.Fake();DirectWifi replacement=new DirectWifi(backend,new android.os.Handler(Looper.getMainLooper()),(DirectWifi.Listener)listener.get(old));old.close();set("directWifi",replacement);
        shadowOf(app).grantPermissions(MainActivity.wifiPermission());set("profile",ProfileStoreTest.sample());set("importing",false);call("attemptRoomRequest");
        backend.discovery.accept(true);DirectWifi.Peer five=new DirectWifi.Peer("TJ_P2_TEST_B_4_B","05");
        backend.peers.accept(java.util.Arrays.asList(new DirectWifi.Peer("TJ_P2_TEST_A_1_B","01"),five));backend.reply(new DirectWifi.Link(false,false,null,null));
        assertSame(five,backend.selectedPeer);assertEquals("5",field("activeRoom"));assertEquals(false,field("roomPending"));assertNull(field("session"));
    }
    @Test public void anotherRoomQrNeverInterruptsExistingAuthenticatedSession()throws Exception{
        finishWorker();set("rooms",RoomDirectoryTest.sample());set("activeRoom","1");set("roomRequest","1");
        Session session=new Session(new java.net.Socket(),ProfileStoreTest.sample(),(state,message)->{});set("session",session);
        try{app.onNewIntent(RoomDirectoryTest.link("room=5"));assertSame(session,field("session"));assertEquals("1",field("roomRequest"));assertTrue(message().contains("현재 연결을 먼저 해제"));}
        finally{session.close();set("session",null);}
    }

}
