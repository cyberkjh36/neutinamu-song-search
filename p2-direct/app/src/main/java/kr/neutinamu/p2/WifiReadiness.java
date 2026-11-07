package kr.neutinamu.p2;

import android.content.Context;
import android.location.LocationManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.Settings;

/** Reads toggles only. Does not request or collect the phone's location. */
final class WifiReadiness {
    enum State { READY, WIFI_OFF, LOCATION_OFF, UNKNOWN }
    static State read(Context context){
        try{
            WifiManager wifi=(WifiManager)context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if(wifi==null)return State.UNKNOWN;
            if(!wifi.isWifiEnabled())return State.WIFI_OFF;
            // API 33+ uses NEARBY_WIFI_DEVICES with neverForLocation.
            if(Build.VERSION.SDK_INT<33){
                LocationManager location=(LocationManager)context.getSystemService(Context.LOCATION_SERVICE);
                if(location==null)return State.UNKNOWN;
                boolean enabled=Build.VERSION.SDK_INT>=28?location.isLocationEnabled():
                    Settings.Secure.getInt(context.getContentResolver(),Settings.Secure.LOCATION_MODE,Settings.Secure.LOCATION_MODE_OFF)!=Settings.Secure.LOCATION_MODE_OFF;
                if(!enabled)return State.LOCATION_OFF;
            }
            return State.READY;
        }catch(RuntimeException e){return State.UNKNOWN;}
    }
}
