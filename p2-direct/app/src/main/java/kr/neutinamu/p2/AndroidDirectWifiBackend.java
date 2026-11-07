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
    private final Context context;private final RoomDirectory rooms;private final Diagnostics diagnostics;
    private WifiP2pManager manager;private WifiP2pManager.Channel channel;private String lastSummary;
    AndroidDirectWifiBackend(Context context,RoomDirectory rooms){this(context,rooms,new Diagnostics());}
    AndroidDirectWifiBackend(Context context,RoomDirectory rooms,Diagnostics diagnostics){this.context=context;this.rooms=rooms;this.diagnostics=diagnostics;}
    public boolean open(Runnable lost){
        manager=(WifiP2pManager)context.getSystemService(Context.WIFI_P2P_SERVICE);
        if(manager==null)return false;
        channel=manager.initialize(context,context.getMainLooper(),()->{channel=null;lost.run();});return channel!=null;
    }
    private void permission(){if(channel==null)throw new IllegalStateException();if(context.checkSelfPermission(MainActivity.wifiPermission())!=PackageManager.PERMISSION_GRANTED)throw new SecurityException();}
    private WifiP2pManager.ActionListener result(Consumer<Boolean> done){return new WifiP2pManager.ActionListener(){public void onSuccess(){done.accept(true);}public void onFailure(int reason){done.accept(false);}};}
    @SuppressLint("MissingPermission") public void discover(Consumer<Boolean> done){
        permission();lastSummary=null;diagnostics.event("SCAN_START");
        manager.discoverPeers(channel,new WifiP2pManager.ActionListener(){
            public void onSuccess(){diagnostics.event("SCAN_ACCEPTED");done.accept(true);}
            public void onFailure(int reason){diagnostics.event("SCAN_REJECTED "+reason);done.accept(false);}
        });
    }
    @SuppressLint("MissingPermission") public void peers(Consumer<List<DirectWifi.Peer>> done){
        permission();manager.requestPeers(channel,list->{
            Collection<WifiP2pDevice> devices=list==null?null:list.getDeviceList();
            List<DirectWifi.Peer> registered=roomPeers(devices);recordPeers(devices,registered.size());done.accept(registered);
        });
    }
    void recordPeers(Collection<WifiP2pDevice> devices,int registered){
        int total=0,unknownP2=0,unnamed=0;
        if(devices!=null)for(WifiP2pDevice device:devices){
            if(device==null)continue;total++;
            String name=RoomDirectory.normalize(device.deviceName);
            if(name.isEmpty())unnamed++;
            if(!rooms.containsDevice(name)&&(name.startsWith("TJ_P2_")||"8-0050F204-5".equals(device.primaryDeviceType)||"00080050F2040005".equals(device.primaryDeviceType)))unknownP2++;
        }
        String summary="SCAN_TOTAL "+total+" ROOMS "+registered+" P2_UNKNOWN "+unknownP2+" UNNAMED "+unnamed;
        if(!summary.equals(lastSummary)){lastSummary=summary;diagnostics.event(summary);}
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
