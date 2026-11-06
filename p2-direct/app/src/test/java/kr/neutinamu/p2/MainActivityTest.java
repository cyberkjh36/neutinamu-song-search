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
@Config(sdk={28,35})
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
        assertTrue(text.contains("P2 연결진단 0.2"));assertFalse(text.contains("TJAA"));assertFalse(text.contains("192.168."));
    }
}
