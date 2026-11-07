package kr.neutinamu.p2;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.wifi.WpsInfo;
import android.net.wifi.p2p.*;
import android.os.Build;
import java.util.*;
import java.util.function.Consumer;

/** Public Android APIs only. No group removal, MAC spoofing, hidden APIs or NFC emulation. */
final class AndroidDirectWifiBackend implements DirectWifi.Backend {
    private final Context context;private final RoomDirectory rooms;private WifiP2pManager manager;private WifiP2pManager.Channel channel;
    AndroidDirectWifiBackend(Context context,RoomDirectory rooms){this.context=context;this.rooms=rooms;}
    public boolean open(Runnable lost){
        manager=(WifiP2pManager)context.getSystemService(Context.WIFI_P2P_SERVICE);
        if(manager==null)return false;
        channel=manager.initialize(context,context.getMainLooper(),()->{channel=null;lost.run();});return channel!=null;
    }
    private void permission(){if(channel==null)throw new IllegalStateException();if(context.checkSelfPermission(MainActivity.wifiPermission())!=PackageManager.PERMISSION_GRANTED)throw new SecurityException();}
    private WifiP2pManager.ActionListener result(Consumer<Boolean> done){return new WifiP2pManager.ActionListener(){public void onSuccess(){done.accept(true);}public void onFailure(int reason){done.accept(false);}};}
    @SuppressLint("MissingPermission") public void discover(Consumer<Boolean> done){permission();manager.discoverPeers(channel,result(done));}
    @SuppressLint("MissingPermission") public void peers(Consumer<List<DirectWifi.Peer>> done){
        permission();manager.requestPeers(channel,list->done.accept(roomPeers(list==null?null:list.getDeviceList())));
    }
    List<DirectWifi.Peer> roomPeers(Collection<WifiP2pDevice> devices){
        List<DirectWifi.Peer> result=new ArrayList<>();
        if(devices!=null)for(WifiP2pDevice device:devices){
            // A registered exact device name identifies the room. Some radio results
            // omit/change the WPS category; it must not hide a known room.
            if(device!=null&&rooms.containsDevice(device.deviceName)&&device.deviceAddress!=null&&!device.deviceAddress.trim().isEmpty())
                result.add(new DirectWifi.Peer(device.deviceName,device.deviceAddress));
        }
        return result;
    }
    @SuppressLint("MissingPermission") public void link(Consumer<DirectWifi.Link> done){
        permission();manager.requestConnectionInfo(channel,info->{
            if(info==null||!info.groupFormed){done.accept(new DirectWifi.Link(false,false,null,null));return;}
            if(channel==null){done.accept(null);return;}
            try{permission();manager.requestGroupInfo(channel,group->done.accept(group==null?null:new DirectWifi.Link(true,info.isGroupOwner,
                group==null||group.getOwner()==null?null:group.getOwner().deviceAddress,
                info.groupOwnerAddress==null?null:info.groupOwnerAddress.getHostAddress(),group.getInterface())));}
            catch(SecurityException e){done.accept(null);}
        });
    }
    @SuppressLint("MissingPermission") public void join(DirectWifi.Peer peer,Consumer<Boolean> done){
        permission();WifiP2pConfig config=new WifiP2pConfig();config.deviceAddress=peer.address;
        config.groupOwnerIntent=0;config.wps.setup=WpsInfo.PBC;manager.connect(channel,config,result(done));
    }
    public void close(){WifiP2pManager.Channel current=channel;channel=null;if(current!=null&&Build.VERSION.SDK_INT>=27)current.close();}
}
