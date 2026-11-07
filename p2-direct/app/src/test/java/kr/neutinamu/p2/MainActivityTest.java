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
    @Before public void open(){controller=Robolectric.buildActivity(MainActivity.class).setup();app=controller.get();}
    @After public void close(){AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();if(dialog!=null)dialog.dismiss();controller.pause().stop().destroy();shadowOf(Looper.getMainLooper()).idle();}
    private <T extends View>T view(String tag){return app.getWindow().getDecorView().findViewWithTag(tag);}
    private String message(){return ((TextView)view("actionStatus")).getText().toString();}
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
    private void finishSearch()throws Exception{
        shadowOf(Looper.getMainLooper()).idle();
        ((java.util.concurrent.ExecutorService)field("searchWorker")).submit(()->{}).get(10,java.util.concurrent.TimeUnit.SECONDS);
        shadowOf(Looper.getMainLooper()).idle();
    }
    private void installCatalog()throws Exception{
        finishWorker();SongCatalog catalog=new SongCatalog();StringBuilder csv=new StringBuilder();
        for(int i=1;i<=65;i++)csv.append(i).append(",사랑 ").append(i).append(",가수\n");
        catalog.load(new java.io.StringReader(csv.toString()));set("catalog",catalog);call("paint");
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
        web.handle("{\"command\":\"connection\"}");assertEquals(View.GONE,web.view.getVisibility());
        view("showSongSearch").performClick();assertEquals(View.VISIBLE,web.view.getVisibility());
        web.handle("{\"command\":\"play\",\"number\":\"10909\"}");
        assertEquals("10909",((EditText)view("songNumber")).getText().toString());assertTrue(message().contains("[C00]"));assertNull(field("session"));
        assertFalse(((Diagnostics)field("diagnostics")).report().contains("PLAY_TAPPED"));
        web.handle("{\"command\":\"connection\"}");app.onBackPressed();assertEquals(View.VISIBLE,web.view.getVisibility());
    }
    @Test public void resultsBeyondThirtyAreReachableAndSelectionNeverStartsSong()throws Exception{
        installCatalog();EditText query=view("query");query.setText("사랑");assertEquals(0,((LinearLayout)view("results")).getChildCount());
        view("search").performClick();finishSearch();LinearLayout list=view("results");assertEquals(30,list.getChildCount());
        assertTrue(((TextView)view("catalogStatus")).getText().toString().contains("65"));
        view("nextPage").performClick();finishSearch();assertTrue(((Button)list.getChildAt(0)).getText().toString().startsWith("31  "));
        view("nextPage").performClick();finishSearch();assertEquals(5,list.getChildCount());assertEquals(View.GONE,view("nextPage").getVisibility());
        list.getChildAt(4).performClick();assertEquals("65",((EditText)view("songNumber")).getText().toString());
        assertTrue(((TextView)view("selection")).getText().toString().contains("사랑 65"));assertNull(field("session"));
        assertFalse(((Diagnostics)field("diagnostics")).report().contains("PLAY_TAPPED"));
        view("previousPage").performClick();finishSearch();assertEquals(30,list.getChildCount());
    }
    @Test public void manualNumberChangeCannotLeavePreviouslySelectedTitle()throws Exception{
        installCatalog();EditText number=view("songNumber");number.setText("1");assertTrue(((TextView)view("selection")).getText().toString().contains("사랑 1"));
        number.setText("2");String title=((TextView)view("selection")).getText().toString();assertTrue(title.contains("사랑 2"));assertFalse(title.contains("사랑 1"));
        number.setText("10909");assertTrue(((TextView)view("selection")).getText().toString().contains("제목 정보 없음"));
        number.setText("");assertTrue(((TextView)view("selection")).getText().toString().contains("곡을 선택"));
    }
    @Test public void newSearchClearsSelectionAndRejectsLateResultsWithoutSendingCancel()throws Exception{
        installCatalog();((EditText)view("query")).setText("사랑");((EditText)view("songNumber")).setText("1");view("search").performClick();
        view("newSearch").performClick();finishSearch();assertEquals(0,((LinearLayout)view("results")).getChildCount());
        assertEquals("",((EditText)view("query")).getText().toString());assertEquals("",((EditText)view("songNumber")).getText().toString());
        assertFalse(((Diagnostics)field("diagnostics")).report().contains("CANCEL_TAPPED"));assertNull(field("session"));
    }
    @Test public void settingsToggleKeepsQueryAndSelectedNumber()throws Exception{
        ((EditText)view("query")).setText("꿈");((EditText)view("songNumber")).setText("10909");
        assertEquals(View.GONE,view("connectionDetails").getVisibility());view("settingsToggle").performClick();assertEquals(View.VISIBLE,view("connectionDetails").getVisibility());
        view("settingsToggle").performClick();assertEquals(View.GONE,view("connectionDetails").getVisibility());
        assertEquals("꿈",((EditText)view("query")).getText().toString());assertEquals("10909",((EditText)view("songNumber")).getText().toString());
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
    @Test public void brokenSavedProfileExplainsReimportAndDoesNotConnect()throws Exception{
        java.io.File path=new java.io.File(app.getNoBackupFilesDir(),"test-broken.enc");
        try(java.io.FileOutputStream out=new java.io.FileOutputStream(path)){out.write(new byte[]{1,2,3});}
        ProfileStore store=new ProfileStore(path,()->ProfileStoreTest.KEY);
        try{set("profileStore",store);call("restoreProfile");finishWorker();assertNull(field("profile"));assertNull(field("session"));
            assertTrue(((TextView)view("profileStatus")).getText().toString().contains("다시 선택"));assertEquals(false,field("importing"));
        }finally{store.clear();}
    }
    @Test public void startBeforeConnectionIsClickableAndExplained()throws Exception{
        ((EditText)view("songNumber")).setText("10909");
        Button button=view("play");assertTrue(button.isEnabled());assertTrue(button.performClick());
        assertTrue(message().contains("[C00]"));assertTrue(message().contains("명령을 보내지 않았습니다"));
        assertTrue(ShadowAlertDialog.getLatestAlertDialog().isShowing());assertNull(field("session"));
    }
    @Test public void cancelBeforeConnectionExplainsMissingConnection(){
        assertTrue(view("cancel").isEnabled());view("cancel").performClick();assertTrue(message().contains("[C00]"));
    }
    @Test public void connectionWithoutProfileOpensPicker(){
        assertTrue(view("connect").isEnabled());view("connect").performClick();
        assertEquals(Intent.ACTION_OPEN_DOCUMENT,shadowOf(app).getNextStartedActivity().getAction());
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
        assertTrue(text.contains("P2 직접연결 통합판 0.7"));assertFalse(text.contains("TJAA"));assertFalse(text.contains("192.168."));
    }
    @Test public void managerSettingsBlockedBeforeWifiPreparation(){
        view("tjSettings").performClick();assertTrue(message().contains("기존 직접 연결 확인"));
        assertNull(shadowOf(app).getNextStartedActivity());
    }
    @Test @Config(sdk={28,29,31,35}) public void preparationNeedsCaptureAndPermissionDenialDoesNotClaimSuccess(){
        view("prepareWifi").performClick();assertEquals(Intent.ACTION_OPEN_DOCUMENT,shadowOf(app).getNextStartedActivity().getAction());
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
}
