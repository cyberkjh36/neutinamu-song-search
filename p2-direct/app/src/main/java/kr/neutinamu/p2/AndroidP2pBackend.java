package kr.neutinamu.p2;

import android.content.Context;
import android.annotation.SuppressLint;
import android.content.pm.PackageManager;
import android.net.wifi.p2p.WifiP2pManager;
import android.os.Build;
import java.util.function.Consumer;

/** Uses only public Android APIs. Never removes a group or changes Wi-Fi settings. */
final class AndroidP2pBackend implements P2pRegistration.Backend {
    private final Context context;private WifiP2pManager manager;private WifiP2pManager.Channel channel;
    AndroidP2pBackend(Context context){this.context=context;}
    @Override public boolean open(Runnable lost){
        manager=(WifiP2pManager)context.getSystemService(Context.WIFI_P2P_SERVICE);
        if(manager==null)return false;
        channel=manager.initialize(context,context.getMainLooper(),()->{channel=null;lost.run();});
        return channel!=null;
    }
    @SuppressLint("MissingPermission") // Checked below; revocation is handled by P2pRegistration.
    @Override public void info(Consumer<P2pRegistration.Info> result){
        if(channel==null)throw new IllegalStateException();
        if(context.checkSelfPermission(MainActivity.wifiPermission())!=PackageManager.PERMISSION_GRANTED)throw new SecurityException();
        manager.requestConnectionInfo(channel,info->result.accept(info==null?null:
            new P2pRegistration.Info(info.groupFormed,info.isGroupOwner,
                info.groupOwnerAddress==null?null:info.groupOwnerAddress.getHostAddress())));
    }
    @Override public void close(){
        WifiP2pManager.Channel current=channel;channel=null;
        if(current!=null&&Build.VERSION.SDK_INT>=27)current.close();
        // API 26 has no public close method. Binder/process death releases registration.
    }
}
