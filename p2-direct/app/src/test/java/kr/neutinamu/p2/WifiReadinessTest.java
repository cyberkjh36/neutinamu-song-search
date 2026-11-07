package kr.neutinamu.p2;

import android.content.Context;
import android.location.LocationManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.Settings;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class) @Config(sdk={26,29,32,35})
public class WifiReadinessTest {
    Context context;
    @Before public void setup(){context=RuntimeEnvironment.getApplication();wifi(true);location(true);}
    void wifi(boolean enabled){((WifiManager)context.getSystemService(Context.WIFI_SERVICE)).setWifiEnabled(enabled);}
    void location(boolean enabled){
        if(Build.VERSION.SDK_INT>=28)shadowOf((LocationManager)context.getSystemService(Context.LOCATION_SERVICE)).setLocationEnabled(enabled);
        else Settings.Secure.putInt(context.getContentResolver(),Settings.Secure.LOCATION_MODE,enabled?Settings.Secure.LOCATION_MODE_HIGH_ACCURACY:Settings.Secure.LOCATION_MODE_OFF);
    }
    @Test public void readyWithBothTogglesOn(){assertEquals(WifiReadiness.State.READY,WifiReadiness.read(context));}
    @Test public void disabledWifiIsReportedBeforeLocation(){wifi(false);location(false);assertEquals(WifiReadiness.State.WIFI_OFF,WifiReadiness.read(context));}
    @Test public void olderAndroidNeedsLocationButNearbyPermissionAndroidDoesNot(){
        location(false);assertEquals(Build.VERSION.SDK_INT<33?WifiReadiness.State.LOCATION_OFF:WifiReadiness.State.READY,WifiReadiness.read(context));
    }
}
