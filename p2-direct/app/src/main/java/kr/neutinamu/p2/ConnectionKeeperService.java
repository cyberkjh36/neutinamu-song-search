package kr.neutinamu.p2;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.*;

/** Keeps the live remote-control session responsive when the screen sleeps. No socket or song commands. */
public final class ConnectionKeeperService extends Service {
    static final int NOTIFICATION_ID=7070;
    private static final String CHANNEL="p2_connection";
    private final Handler handler=new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock cpu;private WifiManager.WifiLock wifi;
    private boolean running;
    private final Runnable renew=new Runnable(){public void run(){if(!running)return;holdCpu();handler.postDelayed(this,45000);}};
    @Override public void onCreate(){
        super.onCreate();
        try{
            NotificationManager manager=getSystemService(NotificationManager.class);
            manager.createNotificationChannel(new NotificationChannel(CHANNEL,"반주기 연결 유지",NotificationManager.IMPORTANCE_LOW));
            Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pending=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Notification notification=new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.p2_connection)
                .setContentTitle("느티나무노래방 리모컨 연결 유지")
                .setContentText("눌러서 리모컨을 엽니다. 사용 후 앱에서 연결을 해제하세요.")
                .setContentIntent(pending).setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .setCategory(Notification.CATEGORY_SERVICE).build();
            if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION_ID,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            else startForeground(NOTIFICATION_ID,notification);
            running=true;
            PowerManager power=getSystemService(PowerManager.class);
            cpu=power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Neutinamu:liveP2");cpu.setReferenceCounted(false);
            holdCpu();handler.postDelayed(renew,45000);
            WifiManager managerWifi=(WifiManager)getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if(managerWifi!=null){wifi=managerWifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF,"Neutinamu:liveP2");wifi.setReferenceCounted(false);wifi.acquire();}
        }catch(RuntimeException unavailable){release();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    }
    private void holdCpu(){if(cpu!=null)cpu.acquire(90000);}
    private void release(){
        running=false;handler.removeCallbacks(renew);
        if(cpu!=null&&cpu.isHeld())cpu.release();
        if(wifi!=null&&wifi.isHeld())wifi.release();
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){return START_NOT_STICKY;}
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public void onDestroy(){release();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
}
