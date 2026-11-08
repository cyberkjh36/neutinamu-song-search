package kr.neutinamu.p2;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.*;
import java.lang.reflect.Field;
import java.time.Duration;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,29,35})
public class ConnectionKeeperServiceTest {
    private ServiceController<ConnectionKeeperService> controller;private ConnectionKeeperService service;
    @Before public void open(){controller=Robolectric.buildService(ConnectionKeeperService.class).create();service=controller.get();}
    @After public void close(){if(controller!=null)controller.destroy();}
    private Object field(String name)throws Exception{Field f=ConnectionKeeperService.class.getDeclaredField(name);f.setAccessible(true);return f.get(service);}
    @Test public void foregroundConnectionHoldsCpuAndWifiUntilStopped()throws Exception{
        PowerManager.WakeLock cpu=(PowerManager.WakeLock)field("cpu");WifiManager.WifiLock wifi=(WifiManager.WifiLock)field("wifi");
        assertNotNull(cpu);assertNotNull(wifi);assertTrue(cpu.isHeld());assertTrue(wifi.isHeld());
        Notification notification=shadowOf(service).getLastForegroundNotification();assertNotNull(notification);assertNotNull(notification.contentIntent);
        assertTrue((notification.flags&Notification.FLAG_ONGOING_EVENT)!=0);
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(100));assertTrue(cpu.isHeld());
        controller.destroy();controller=null;assertFalse(cpu.isHeld());assertFalse(wifi.isHeld());
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMinutes(2));assertFalse(cpu.isHeld());
    }
    @Test public void processRestartDoesNotReconnectOrReplayControls(){
        assertEquals(Service.START_NOT_STICKY,service.onStartCommand(null,0,1));assertNull(service.onBind(new Intent()));
    }
    @Test public void keeperIsPrivateAndStopsWithUserTask()throws Exception{
        ServiceInfo info=service.getPackageManager().getServiceInfo(new ComponentName(service,ConnectionKeeperService.class),0);
        assertFalse(info.exported);assertTrue((info.flags&ServiceInfo.FLAG_STOP_WITH_TASK)!=0);
        if(Build.VERSION.SDK_INT>=29)assertEquals(ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,info.getForegroundServiceType());
    }
}
