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
        assertTrue(text.contains("P2 직접연결 시험판 0.4"));assertFalse(text.contains("TJAA"));assertFalse(text.contains("192.168."));
    }
    @Test public void managerSettingsBlockedBeforeWifiPreparation(){
        view("tjSettings").performClick();assertTrue(message().contains("먼저 ①"));
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
