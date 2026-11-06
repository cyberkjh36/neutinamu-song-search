package kr.neutinamu.p2;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Looper;
import android.view.View;
import java.io.*;
import java.lang.reflect.Field;
import java.util.concurrent.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.*;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=29,qualifiers="w360dp-h740dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class MainActivityLayoutTest {
    @Test public void compactPhoneShowsSearchWithoutOpeningSettings()throws Exception{
        org.robolectric.android.controller.ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).setup();MainActivity app=controller.get();
        try{
            Field worker=MainActivity.class.getDeclaredField("worker");worker.setAccessible(true);
            ((ExecutorService)worker.get(app)).submit(()->{}).get(10,TimeUnit.SECONDS);shadowOf(Looper.getMainLooper()).idle();
            View decor=app.getWindow().getDecorView();int width=360,height=740;
            decor.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY));decor.layout(0,0,width,height);
            View search=decor.findViewWithTag("search"),details=decor.findViewWithTag("connectionDetails");
            int[] position=new int[2];search.getLocationOnScreen(position);assertTrue("Search must be visible on a compact phone",position[1]+search.getHeight()<height);
            assertEquals(View.GONE,details.getVisibility());
            Bitmap bitmap=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);decor.draw(new Canvas(bitmap));
            File folder=new File("build/reports/p2-ui");assertTrue(folder.isDirectory()||folder.mkdirs());
            try(OutputStream out=new FileOutputStream(new File(folder,"P2_0.6_compact.png"))){assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,out));}bitmap.recycle();
        }finally{controller.pause().stop().destroy();}
    }
}
