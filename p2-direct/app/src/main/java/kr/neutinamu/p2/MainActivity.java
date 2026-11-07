package kr.neutinamu.p2;

import android.app.Activity;
import android.app.AlertDialog;
import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.ActivityNotFoundException;
import android.content.pm.PackageManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.*;
import android.net.wifi.p2p.WifiP2pManager;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

/** P2 session host and bundled voice/keyboard song search. */
public final class MainActivity extends Activity {
    private static final int PICK_CAPTURE=1,P2P_PERMISSION=2;
    private static final String TJ_PACKAGE="kr.tj.tjsmartplay_U";
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ExecutorService reader=Executors.newSingleThreadExecutor();
    private volatile Session session;private volatile Socket connectingSocket;
    private volatile boolean destroyed=false,connecting=false;
    private boolean importing=false,commandQueued=false;
    private List<Integer> queueSongs=Collections.emptyList();private boolean queueValid;
    private String queueMessage="예약 목록을 열면 반주기의 예약 순서를 확인합니다.";
    private final Diagnostics diagnostics=new Diagnostics();
    private String connectionMessage="방 QR을 스캔하거나 ‘주변 P2 찾기’에서 방을 선택하세요.";
    private CaptureProfile profile;private ProfileStore profileStore;
    private TextView profileStatus,connectionBanner;
    private TextView status;
    private ScrollView scroll;private FrameLayout screens;private SongSearchView songSearch;
    private LinearLayout connectionDetails;
    private Button settingsToggle,connect;private boolean settingsExpanded;
    private AlertDialog toolsDialog;
    private TextView wifiStatus;
    private P2pRegistration wifiRegistration;
    private DirectWifi directWifi;private String directHost,directInterface;private boolean findAfterPermission,directMode;
    private AlertDialog peerDialog;
    private RoomDirectory rooms=new RoomDirectory();private String roomRequest,activeRoom;private boolean roomPending;
    private boolean receiverRegistered,tjSettingsVisited,retryAfterWifiSettings;
    private AlertDialog wifiSetupDialog;
    private final BroadcastReceiver wifiReceiver=new BroadcastReceiver(){
        @Override public void onReceive(Context context,Intent intent){
            if(destroyed)return;
            if(directWifi!=null)directWifi.changed();
            if(wifiRegistration!=null&&wifiRegistration.registered())wifiRegistration.refresh(null);
        }
    };
    private final int bg=Color.rgb(10,27,40),fg=Color.rgb(238,246,245),accent=Color.rgb(186,225,129);

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        profileStore=new ProfileStore(this);
        try(Reader in=new InputStreamReader(getAssets().open("p2-rooms.txt"),"UTF-8")){rooms=RoomDirectory.read(in);}
        catch(IOException e){diagnostics.event("ROOM_DIRECTORY_UNAVAILABLE");}
        scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(bg);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(22),dp(24),dp(22),dp(30));scroll.addView(root);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(dp(22),dp(24)+insets.getSystemWindowInsetTop(),dp(22),dp(30)+insets.getSystemWindowInsetBottom());return insets;});
        screens=new FrameLayout(this);setContentView(screens);
        button(root,"닫기 · 노래 검색으로",this::showSongSearch).setTag("showSongSearch");
        text(root,"연결 도움말",27,true);
        text(root,"통합판 0.11.5 · 직원용 연결 도구",15,false);
        TextView credit=text(root,"made by cyberkjh",14,false);credit.setPadding(0,0,0,dp(8));
        credit.setTextColor(Color.rgb(183,200,216));
        diagnostics.event("APP_OPEN_ANDROID "+android.os.Build.VERSION.SDK_INT);
        connectionBanner=text(root,"○ P2 연결 전",20,true);connectionBanner.setTag("connectionBanner");
        connectionBanner.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        LinearLayout connectionRow=row(root);
        connect=button(connectionRow,"P2 연결",this::toggleConnection);connect.setTag("connect");
        button(connectionRow,"주변 P2 찾기",this::findP2).setTag("findP2");equalButtons(connectionRow);
        status=text(root,"방 QR을 스캔하면 해당 방을 찾아 연결합니다. 처음 나오는 권한·연결 확인 창은 허용해 주세요.",15,false);status.setTag("connectionStatus");
        settingsToggle=button(root,"연결 설정 · 도움말 ▾",()->setSettingsExpanded(!settingsExpanded));settingsToggle.setTag("settingsToggle");
        connectionDetails=column(root);connectionDetails.setTag("connectionDetails");connectionDetails.setVisibility(View.GONE);
        text(connectionDetails,"방 QR 연결에는 파일 선택이 필요하지 않습니다. 연결이 안 될 때 직원이 기존 연결 기록을 등록할 수 있습니다.",15,false);
        button(connectionDetails,"PCAP 연결 기록 선택",this::chooseCapture).setTag("importProfile");
        profileStatus=text(connectionDetails,"손님은 방 QR을 사용하세요. 아래 연결 기록 도구는 직원용입니다.",14,false);profileStatus.setTag("profileStatus");
        text(connectionDetails,"연결 정보는 휴대폰 안에 암호화해 저장합니다. 앱 삭제·데이터 초기화 후에는 다시 선택해야 합니다.",14,false);
        button(connectionDetails,"저장된 연결 정보 지우기",this::askForgetProfile).setTag("forgetProfile");
        button(connectionDetails,"기존 직접 연결 확인",()->{
            if(connecting||session!=null||directWifi.joining()){feedback("현재 연결을 해제하거나 연결 준비가 끝난 뒤 확인해 주세요.");return;}
            roomRequest=null;activeRoom=null;roomPending=false;directMode=false;directHost=null;directInterface=null;prepareWifi();
        }).setTag("prepareWifi");
        wifiStatus=text(connectionDetails,"이미 P2에 연결되어 있다면 ‘기존 직접 연결 확인’을 누르세요.",15,false);wifiStatus.setTag("wifiStatus");
        button(connectionDetails,"TJ매니저 설정 (필요할 때)",this::openTjSettings).setTag("tjSettings");
        button(connectionDetails,"휴대폰 Wi-Fi 설정",()->startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS)));
        text(connectionDetails,"P2와 Wi-Fi Direct로 연결합니다. 반주기 설정에 따라 NFC 준비가 필요할 수 있습니다. TJ매니저가 이미 연결 중이면 기존 직접 연결을 확인한 뒤 해당 앱만 종료하세요.",14,false);
        button(connectionDetails,"진단 결과 복사",()->{
            ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("P2 연결진단",diagnostics.report()));
            Toast.makeText(this,"복사했습니다. 현재 ChatGPT 대화에 붙여넣어 주세요.",Toast.LENGTH_LONG).show();
        });
        button(connectionDetails,"진단 결과 공유",()->{
            diagnostics.event("USER_SHARE");
            Intent share=new Intent(Intent.ACTION_SEND);share.setType("text/plain");share.putExtra(Intent.EXTRA_TEXT,diagnostics.report());
            startActivity(Intent.createChooser(share,"ChatGPT에 진단 결과 보내기"));
        }).setTag("shareDiagnostics");
        text(connectionDetails,"진단에는 개인정보와 인증값을 넣지 않습니다. 공식 TJ 앱이 아니며 아이폰 직접 제어는 지원하지 않습니다.",13,false);
        wifiRegistration=new P2pRegistration(new AndroidP2pBackend(this),new Handler(getMainLooper()),
            ()->profile==null?null:profile.host,this::showWifiState,diagnostics);
        directWifi=new DirectWifi(new AndroidDirectWifiBackend(this,rooms,diagnostics),new Handler(getMainLooper()),new DirectWifi.Listener(){
            public void status(String code,String message){diagnostics.event(code);if(directMode){connectionMessage="["+code+"] "+message;wifiStatus.setText(connectionMessage);show(connectionMessage);}paint();}
            public void peers(List<DirectWifi.Peer> peers){
                if(destroyed||!directMode||(peerDialog!=null&&peerDialog.isShowing()))return;
                List<DirectWifi.Peer> ordered=rooms.registered(peers);
                if(ordered.isEmpty())return;
                String[] names=new String[ordered.size()];for(int i=0;i<names.length;i++)names[i]=rooms.label(ordered.get(i));
                peerDialog=new AlertDialog.Builder(MainActivity.this).setTitle("연결할 방을 선택하세요")
                    .setItems(names,(d,index)->{
                        DirectWifi.Peer selected=ordered.get(index);String room=rooms.room(selected);
                        if(room==null&&profile==null){directWifi.stopFinding();feedback("매장에 등록된 방을 선택해 주세요. 미등록 반주기는 직원의 연결 설정이 필요합니다.");return;}
                        if(room!=null&&ordered.stream().filter(p->room.equals(rooms.room(p))).count()>1){
                            directWifi.stopFinding();feedback("같은 방의 반주기가 여러 대 발견되어 연결하지 않았습니다. 직원에게 확인해 주세요.");return;
                        }
                        activeRoom=room;roomRequest=room;roomPending=false;directHost=null;directWifi.select(selected);
                    })
                    .setNegativeButton("닫기",(d,w)->directWifi.stopFinding()).create();peerDialog.setOnCancelListener(d->directWifi.stopFinding());peerDialog.show();
            }
            public void connected(DirectWifi.Link link){
                if(destroyed)return;
                if(link.interfaceName==null||link.interfaceName.isEmpty()){diagnostics.event("N10");feedback("[N10] 직접 연결의 네트워크 정보를 읽지 못했습니다. 다시 찾아 연결해 주세요.");return;}
                directHost=link.host;directInterface=link.interfaceName;beginConnect();
            }
        });
        songSearch=new SongSearchView(this,new SongSearchView.Host(){
            public void connection(){showConnection();}
            public void connect(){toggleConnection();}
            public void find(){findP2();}
            public void pause(){pauseCommand();}
            public void play(int song){if(ensureControlReady(true))dispatch(true,song);paint();}
            public void reserve(int song){queueCommand(true,song);}
            public void queue(){queueCommand(false,0);}
            public void cancel(){if(ensureControlReady(false))dispatch(false,0);paint();}
            public void refresh(){paint();}
        });
        screens.addView(songSearch.view,new FrameLayout.LayoutParams(-1,-1));
        songSearch.view.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        showSongSearch();
        restoreProfile();
        handleRoomIntent(getIntent());
        paint();
    }
    static String wifiPermission(){return Build.VERSION.SDK_INT>=33?Manifest.permission.NEARBY_WIFI_DEVICES:Manifest.permission.ACCESS_FINE_LOCATION;}
    static String[] wifiPermissions(){return Build.VERSION.SDK_INT>=31&&Build.VERSION.SDK_INT<=32?
        new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION}:new String[]{wifiPermission()};}
    private void toggleConnection(){
        if(connecting||importing||directWifi.joining()||directWifi.searching()){
            feedback("반주기를 찾거나 연결 준비 중입니다. 잠시 기다려 주세요.");return;
        }
        if(session!=null){session.close();session=null;connectionMessage="연결을 해제했습니다.";show(connectionMessage);return;}
        requestConnect();
    }
    private void requestConnect(){
        if(connecting||importing||session!=null||directWifi.joining()||directWifi.searching()){
            feedback("반주기를 찾거나 연결 준비 중입니다. 잠시 기다려 주세요.");return;
        }
        diagnostics.event("CONNECT_TAPPED");
        if(roomRequest!=null){
            // A previous group's host/interface may no longer exist. Re-find the same room.
            directHost=null;directInterface=null;roomPending=true;attemptRoomRequest();return;
        }
        // Preserve the explicit, freshly checked legacy connection path for staff.
        if(profile!=null&&!directMode&&wifiRegistration.state()==P2pRegistration.State.MATCH){
            wifiRegistration.refresh(this::beginConnect);return;
        }
        // A saved profile contains authentication data, not an active wireless connection.
        findP2();
    }
    private void findP2(){
        if(connecting||importing||session!=null||directWifi.joining()){feedback("연결 준비 또는 실행 연결 중입니다. 현재 연결을 해제한 뒤 찾아 주세요.");return;}
        roomRequest=null;activeRoom=null;roomPending=false;stopDiscovery();
        directMode=true;directHost=null;directInterface=null;findAfterPermission=true;prepareWifi();
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleRoomIntent(intent);}
    private void handleRoomIntent(Intent intent){
        if(intent==null||intent.getData()==null)return;
        String room=rooms.fromIntent(intent);
        if(room==null){showSongSearch();feedback("이 QR의 방정보를 확인할 수 없습니다. 직원에게 확인하거나 ‘주변 P2 찾기’를 눌러 주세요.");return;}
        if(session!=null||connecting||directWifi.joining()||commandQueued){
            if(room.equals(activeRoom)&&session!=null&&session.state()==Session.State.READY){showSongSearch();return;}
            showSongSearch();
            feedback(room.equals(activeRoom)?room+"번방에 연결되어 있거나 연결 중입니다.":"현재 연결을 먼저 해제한 뒤 "+room+"번방 QR을 다시 스캔해 주세요. 다른 방으로 명령을 보내지 않았습니다.");return;
        }
        stopDiscovery();roomRequest=room;activeRoom=null;roomPending=true;directHost=null;directInterface=null;
        showSongSearch();attemptRoomRequest();
    }
    private void attemptRoomRequest(){
        if(!roomPending||roomRequest==null||destroyed)return;
        if(importing){show(roomRequest+"번방 · 저장된 연결 정보를 확인하고 있습니다…");return;}
        if(connecting||session!=null||directWifi.joining())return;
        roomPending=false;activeRoom=roomRequest;directMode=true;directHost=null;directInterface=null;
        findAfterPermission=true;show(roomRequest+"번방 반주기를 찾습니다. 다른 방에는 연결하지 않습니다.");prepareWifi();
    }
    private void prepareWifi(){
        if(importing){feedback("연결 정보를 준비 중입니다. 잠시 기다려 주세요.");return;}
        if(profile==null&&!directMode){feedback("[W00] 방 QR을 스캔하거나 ‘주변 P2 찾기’에서 방을 선택하세요.");return;}
        if(checkSelfPermission(wifiPermission())!=PackageManager.PERMISSION_GRANTED){
            wifiStatus.setText(Build.VERSION.SDK_INT>=33?"직접 Wi-Fi 연결 확인을 위해 ‘근처 기기’ 권한을 허용해 주세요.":
                "이 안드로이드 버전에서는 직접 Wi-Fi 연결 확인에 위치 권한이 필요합니다. 위치를 수집하거나 저장하지 않습니다.");
            show(wifiStatus.getText().toString());diagnostics.event("P2P_PERMISSION_REQUESTED");requestPermissions(wifiPermissions(),P2P_PERMISSION);return;
        }
        if(!checkWifiReadiness(true))return;
        if(!receiverRegistered){
            IntentFilter filter=new IntentFilter(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION);
            filter.addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION);
            filter.addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION);
            // These are protected Android system broadcasts; callbacks re-read system state.
            if(Build.VERSION.SDK_INT>=33)registerReceiver(wifiReceiver,filter,Context.RECEIVER_EXPORTED);
            else registerReceiver(wifiReceiver,filter);
            receiverRegistered=true;
        }
        wifiRegistration.prepare();
        if(findAfterPermission){findAfterPermission=false;directWifi.find(roomRequest==null?null:rooms.device(roomRequest));}
    }
    private boolean checkWifiReadiness(boolean prompt){
        WifiReadiness.State state=WifiReadiness.read(this);diagnostics.event("WIFI_SETUP_"+state.name());
        if(state==WifiReadiness.State.READY||state==WifiReadiness.State.UNKNOWN)return true;
        boolean wifiOff=state==WifiReadiness.State.WIFI_OFF;
        String message=wifiOff?"[W30] 휴대폰 Wi-Fi가 꺼져 있습니다. Wi-Fi를 켜고 이 앱으로 돌아오세요.":
            "[W31] 휴대폰의 위치 기능이 꺼져 있습니다. 이 안드로이드 버전에서는 반주기를 찾으려면 ‘위치’를 켜야 합니다. 위치를 켜고 이 앱으로 돌아오세요. 위치 정보는 수집하지 않습니다.";
        connectionMessage=message;wifiStatus.setText(message);show(message);
        if(prompt&&(wifiSetupDialog==null||!wifiSetupDialog.isShowing())){
            wifiSetupDialog=new AlertDialog.Builder(this).setTitle(wifiOff?"Wi-Fi 켜기":"위치 기능 켜기").setMessage(message)
                .setPositiveButton(wifiOff?"Wi-Fi 설정 열기":"위치 설정 열기",(dialog,which)->{
                    try{retryAfterWifiSettings=true;startActivity(new Intent(wifiOff?Settings.ACTION_WIFI_SETTINGS:Settings.ACTION_LOCATION_SOURCE_SETTINGS));}
                    catch(ActivityNotFoundException|SecurityException e){retryAfterWifiSettings=false;feedback("휴대폰 설정에서 Wi-Fi와 위치를 켠 뒤 ‘P2 연결’을 다시 눌러 주세요.");}
                }).setNegativeButton("나중에",null).create();wifiSetupDialog.show();
        }
        return false;
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){
        super.onRequestPermissionsResult(request,permissions,results);
        if(request!=P2P_PERMISSION)return;
        boolean granted=false;
        for(int i=0;i<permissions.length&&i<results.length;i++)if(permissions[i].equals(wifiPermission())&&results[i]==PackageManager.PERMISSION_GRANTED)granted=true;
        if(granted)prepareWifi();
        else{diagnostics.event("P2P_PERMISSION_DENIED");show("[W03] 연결 권한이 허용되지 않았습니다. 방 QR을 다시 스캔하고 권한을 허용해 주세요. Android 12에서는 ‘정확한 위치’가 필요합니다.");wifiStatus.setText(status.getText());}
    }
    private void showWifiState(P2pRegistration.State state){
        if(destroyed||directMode)return;
        String message;
        switch(state){
            case MATCH:message=tjSettingsVisited?
                "[W01] 설정에서 돌아온 뒤에도 직접 Wi-Fi 연결이 확인됩니다. ‘P2 연결’을 눌러 주세요. 아직 노래 실행 연결 전입니다.":
                "[W01] 직접 Wi-Fi 연결과 앱 등록을 확인했습니다. 필요하면 ‘TJ매니저 설정’에서 해당 앱만 종료한 뒤 돌아와 ‘P2 연결’을 눌러 주세요. 아직 노래 실행 연결 전입니다.";break;
            case NO_GROUP:message="[W02] P2 직접 Wi-Fi 연결이 없습니다. 이 앱을 종료하지 않은 채 TJ매니저에서 NFC로 다시 연결하고 돌아오세요.";break;
            case OTHER_GROUP:message="[W04] 현재 직접 연결이 PCAP 기록의 P2 연결 주소와 다릅니다. 같은 반주기에 연결했는지 확인하세요. TJ매니저는 종료하지 마세요.";break;
            case DENIED:message="[W03] 직접 Wi-Fi 연결 확인 권한이 없습니다. ‘기존 직접 연결 확인’을 눌러 권한을 확인해 주세요.";break;
            case TIMEOUT:message="[W05] 안드로이드에서 연결 상태를 받지 못했습니다. ‘기존 직접 연결 확인’을 다시 눌러 주세요. TJ매니저는 종료하지 마세요.";break;
            case UNAVAILABLE:message="[W06] 직접 Wi-Fi 사용 앱으로 등록하거나 상태를 확인하지 못했습니다. Wi-Fi를 켜고 ‘기존 직접 연결 확인’을 다시 눌러 주세요. TJ매니저는 종료하지 마세요.";break;
            default:message="직접 Wi-Fi 연결 상태를 확인하고 있습니다…";
        }
        wifiStatus.setText(message);
    }
    private void openTjSettings(){
        if(connecting||session!=null){feedback("연결 시험을 끝낸 뒤 TJ매니저 설정을 열어 주세요.");return;}
        if(wifiRegistration==null||wifiRegistration.state()!=P2pRegistration.State.MATCH){
            feedback("[W00] 먼저 ‘기존 직접 연결 확인’에서 직접 Wi-Fi 연결 확인을 받아 주세요. TJ매니저를 미리 종료하면 연결이 끊길 수 있습니다.");return;
        }
        // Recheck rather than trusting the old label. Never stop another app ourselves.
        wifiRegistration.refresh(()->{
            try{
                getPackageManager().getPackageInfo(TJ_PACKAGE,0);
                diagnostics.event("TJ_SETTINGS_OPENED");
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+TJ_PACKAGE)));
                tjSettingsVisited=true;
            }catch(PackageManager.NameNotFoundException|ActivityNotFoundException|SecurityException e){
                feedback("TJ매니저 설정을 바로 열 수 없습니다. 휴대폰 설정 → 애플리케이션 → TJ매니저(업주용)에서 강제 중지한 뒤 이 앱으로 돌아오세요.");
            }
        });
    }
    @Override protected void onResume(){
        super.onResume();
        if(retryAfterWifiSettings){
            retryAfterWifiSettings=false;
            if(!destroyed&&!connecting&&session==null&&checkWifiReadiness(false))prepareWifi();
        }
        if(directWifi!=null)directWifi.changed();
        if(wifiRegistration!=null&&wifiRegistration.registered()){
            diagnostics.event("APP_RESUMED_WITH_P2P");wifiRegistration.refresh(null);
        }
    }
    private void setSettingsExpanded(boolean expanded){
        settingsExpanded=expanded;connectionDetails.setVisibility(expanded?View.VISIBLE:View.GONE);
        settingsToggle.setText(expanded?"연결 설정 · 도움말 ▴":"연결 설정 · 도움말 ▾");
    }
    private void chooseCapture(){
        if(connecting||importing||session!=null||(directWifi!=null&&directWifi.joining())){feedback("연결 준비가 끝나거나 연결을 해제한 뒤 기록을 선택해 주세요.");return;}
        Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.setType("*/*");pick.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(pick,PICK_CAPTURE);
    }
    private void stopDiscovery(){
        findAfterPermission=false;
        if(peerDialog!=null){peerDialog.dismiss();peerDialog=null;}
        if(directWifi!=null)directWifi.stopFinding();
    }
    private void restoreProfile(){
        if(!profileStore.exists())return;
        importing=true;profileStatus.setText("저장된 연결 정보를 불러오는 중입니다…");
        worker.execute(()->{
            try{
                CaptureProfile saved=profileStore.load();
                ui(()->{importing=false;profile=saved;
                    if(saved!=null){diagnostics.event("PROFILE_RESTORED");profileStatus.setText("저장된 연결 정보를 불러왔습니다. PCAP 파일을 다시 선택하지 않아도 됩니다.");connectionMessage="[C01] ‘주변 P2 찾기’에서 반주기를 선택해 주세요. 이미 연결되어 있다면 ‘기존 직접 연결 확인’으로 확인할 수 있습니다.";show(connectionMessage);}
                    paint();attemptRoomRequest();});
            }catch(IOException|java.security.GeneralSecurityException|RuntimeException e){ui(()->{
                importing=false;diagnostics.event("PROFILE_RESTORE_FAILED");profileStatus.setText("직원용 연결 기록을 읽지 못했습니다. 방 QR 연결은 계속 사용할 수 있습니다.");setSettingsExpanded(true);paint();attemptRoomRequest();
            });}
        });
    }
    private boolean canForgetProfile(){
        if(importing||connecting||session!=null||commandQueued||(directWifi!=null&&directWifi.joining())){
            feedback("연결 준비가 끝나거나 P2 연결을 해제한 뒤 지워 주세요.");return false;
        }
        return true;
    }
    private void askForgetProfile(){
        if(!canForgetProfile())return;
        new AlertDialog.Builder(this).setTitle("연결 정보를 지울까요?")
            .setMessage("직원용 연결 기록만 지웁니다. 방 QR 연결은 유지되며 원본 PCAP 파일과 반주기의 노래는 삭제하지 않습니다.")
            .setNegativeButton("유지",null).setPositiveButton("지우기",(d,w)->forgetProfile()).show();
    }
    private void forgetProfile(){
        if(!canForgetProfile())return;stopDiscovery();importing=true;
        worker.execute(()->{
            try{profileStore.clear();ui(()->{
                profile=null;directHost=null;directInterface=null;directMode=false;importing=false;roomRequest=null;activeRoom=null;roomPending=false;
                diagnostics.event("PROFILE_FORGOTTEN");profileStatus.setText("직원용 연결 기록을 지웠습니다. 방 QR 또는 주변 P2 찾기를 사용하세요.");
                connectionMessage="방 QR을 스캔하거나 ‘주변 P2 찾기’에서 방을 선택하세요.";show(connectionMessage);wifiStatus.setText(connectionMessage);paint();
            });}catch(IOException|RuntimeException e){ui(()->{importing=false;diagnostics.event("PROFILE_DELETE_FAILED");feedback("연결 정보를 지우지 못했습니다. 다시 시도해 주세요.");paint();});}
        });
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(songSearch!=null&&songSearch.result(request,result,data))return;
        if(request!=PICK_CAPTURE||result!=RESULT_OK||data==null||data.getData()==null)return;
        stopDiscovery();importing=true;diagnostics.event("PROFILE_IMPORT_STARTED");show("연결 기록을 읽는 중입니다…");
        worker.execute(()->{
            try(InputStream in=getContentResolver().openInputStream(data.getData())){
                if(in==null)throw new IOException("파일을 열 수 없습니다.");
                CaptureProfile loaded=CaptureProfile.read(in);
                boolean stored;
                try{profileStore.save(loaded);stored=true;}catch(IOException|java.security.GeneralSecurityException|RuntimeException e){stored=false;}
                final boolean saved=stored;
                ui(()->{profile=loaded;directHost=null;directInterface=null;importing=false;diagnostics.event("PROFILE_IMPORT_OK");diagnostics.event(saved?"PROFILE_SAVED":"PROFILE_SAVE_FAILED");
                    profileStatus.setText(saved?"연결 정보를 암호화해 저장했습니다. 다음부터 자동으로 불러옵니다.":"자동 저장하지 못했습니다. 이번에는 사용할 수 있으나, 다음 실행 때 PCAP을 다시 선택하세요. 이전 저장 정보가 있다면 그대로 유지됩니다.");
                    setSettingsExpanded(!saved);
                    connectionMessage="[C01] 연결 기록을 읽었습니다. ‘주변 P2 찾기’에서 반주기를 선택해 주세요.";show(connectionMessage);if(wifiRegistration.registered())wifiRegistration.refresh(null);paint();attemptRoomRequest();});
            }catch(IOException|RuntimeException e){ui(()->{importing=false;diagnostics.event("PROFILE_IMPORT_FAILED");show("[C02] 초기 NFC 연결부터 기록한 PCAP 파일인지 확인해 주세요.");paint();});}
        });
    }
    private void beginConnect(){
        if(roomRequest!=null&&directHost==null){roomPending=true;attemptRoomRequest();return;}
        if(profile==null&&roomRequest==null){findP2();return;}
        if(importing||connecting||session!=null||(directWifi!=null&&directWifi.joining()))return;
        diagnostics.event("CONNECT_STARTED");
        CaptureProfile selected=profile;String target=directHost==null?selected.host:directHost;
        String device=roomRequest==null?null:rooms.device(roomRequest);
        String radio=directInterface;connecting=true;paint();show("P2에 직접 연결하고 있습니다…");
        worker.execute(()->{
            Socket socket=null;
            try{
                if(radio!=null)diagnostics.event("ROUTE_WAIT");
                socket=radio==null?socketFor(target,null):RouteWait.open(()->socketFor(target,radio),()->destroyed,Thread::sleep);connectingSocket=socket;
                if(destroyed){socket.close();return;}
                socket.connect(new InetSocketAddress(target,7070),5000);
                diagnostics.event("TCP_CONNECTED");
                String mac=currentMac(socket);
                CaptureProfile live=connectionProfile(target,device,mac,selected);
                diagnostics.event(device!=null?"GUEST_ROOM_REGISTRATION_READY":"SAVED_STAFF_REGISTRATION_READY");
                if(device!=null)diagnostics.event(selected!=null&&selected.matchesDevice(device)?"ROOM_KNOWN_PASSWORD":"ROOM_DEFAULT_PASSWORD");
                diagnostics.event("CURRENT_WIFI_ADDRESS_APPLIED");
                final Session[] holder=new Session[1];
                final boolean[] verified=new boolean[1];
                Session opened=new Session(socket,live,new Session.Listener(){
                    @Override public void changed(Session.State state,String message){
                        if(state==Session.State.READY&&!verified[0]){verified[0]=true;diagnostics.event("CONNECTION_VERIFIED");}
                        diagnostics.event("STATE_"+state.name());diagnostics.status(message);
                        ui(()->{if(session!=holder[0])return;if(state==Session.State.CLOSED)session=null;connectionMessage=message;show(message);paint();});
                    }
                    @Override public void frame(boolean outgoing,int command,int length,Long scalar){diagnostics.frame(outgoing,command,length,scalar);}
                    @Override public void queue(List<Integer> songs,String message,boolean valid){ui(()->{
                        if(session!=holder[0])return;queueSongs=songs;queueMessage=message;queueValid=valid;paint();
                    });}
                });
                holder[0]=opened;
                if(destroyed){opened.close();return;}
                session=opened;reader.execute(opened::run);
            }catch(IOException|RuntimeException e){
                if(socket!=null)try{socket.close();}catch(IOException ignored){}
                String code=e instanceof CurrentAddressException?"A03":e instanceof NoRouteToHostException?"N10":e instanceof SocketTimeoutException?"N11":e instanceof ConnectException?"N12":e instanceof SecurityException?"N13":"N14";
                diagnostics.event(code);
                ui(()->{if(code.equals("N10")){directHost=null;directInterface=null;}connectionMessage=code.equals("A03")?
                    "[A03] 휴대폰의 현재 Wi-Fi Direct 주소를 읽지 못했습니다. 이전 주소로 대신 접속하지 않았습니다. 안드로이드 버전과 진단 결과를 보내 주세요.":code.equals("N10")?
                    "[N10] 반주기로 접속할 무선 주소를 확인하지 못했습니다. Wi-Fi와 위치 기능을 켜고 ‘"+(roomRequest==null?"P2 연결":roomRequest+"번방 연결")+"’을 다시 눌러 주세요. 반주기를 다시 찾아 연결합니다.":
                    "["+code+"] P2에 접속하지 못했습니다. 직접 Wi-Fi 연결 상태를 확인하고 PCAPdroid 캡처를 중지해 주세요.";show(connectionMessage);});
            }
            finally{connectingSocket=null;connecting=false;ui(this::paint);}
        });
    }
    static CaptureProfile connectionProfile(String target,String device,String mac,CaptureProfile saved)throws IOException {
        if(device!=null)return CaptureProfile.forRoom(target,device,mac,saved);
        if(saved==null)throw new IOException("No saved connection profile");
        return saved.forConnection(target,mac);
    }
    private static final class CurrentAddressException extends IOException { }
    private static String currentMac(Socket socket)throws IOException {
        NetworkInterface iface=NetworkInterface.getByInetAddress(socket.getLocalAddress());
        byte[] mac=iface==null?null:iface.getHardwareAddress();
        if(mac==null||mac.length!=6||(mac[0]&1)!=0)throw new CurrentAddressException();
        StringBuilder value=new StringBuilder();for(byte part:mac){if(value.length()>0)value.append(':');value.append(String.format(Locale.ROOT,"%02X",part&255));}
        String result=value.toString();if(result.equals("02:00:00:00:00:00")||result.equals("00:00:00:00:00:00"))throw new CurrentAddressException();return result;
    }
    private Socket socketFor(String host,String radio)throws IOException {
        InetAddress remote=InetAddress.getByName(host);
        if(radio!=null){
            // The selected Wi-Fi Direct group identifies the exact interface. Never use a
            // different Wi-Fi network merely because its subnet overlaps the P2's subnet.
            NetworkInterface iface=NetworkInterface.getByName(radio);
            if(iface!=null&&iface.isUp())for(InterfaceAddress address:iface.getInterfaceAddresses()){
                InetAddress local=address.getAddress();if(!(local instanceof Inet4Address))continue;
                int prefix=address.getNetworkPrefixLength();byte[] a=local.getAddress(),b=remote.getAddress();
                if(b.length!=4||prefix<=0||prefix>32)continue;
                boolean match=true;for(int i=0;i<prefix;i++)if(((a[i/8]^b[i/8])&(128>>(i%8)))!=0){match=false;break;}
                if(match){Socket socket=new Socket();socket.bind(new InetSocketAddress(local,0));diagnostics.event("ROUTE_SELECTED_P2P_INTERFACE");return socket;}
            }
            throw new NoRouteToHostException();
        }
        ConnectivityManager manager=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        // Match a concrete local route, never bind the whole process to Wi-Fi.
        for(Network network:manager.getAllNetworks()){
            NetworkCapabilities caps=manager.getNetworkCapabilities(network);LinkProperties props=manager.getLinkProperties(network);
            if(caps==null||props==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))continue;
            for(RouteInfo route:props.getRoutes())if(!route.isDefaultRoute()&&route.matches(remote)){diagnostics.event("ROUTE_WIFI_NETWORK");return network.getSocketFactory().createSocket();}
        }
        // Wi-Fi Direct may not appear among ConnectivityManager's ordinary networks.
        Enumeration<NetworkInterface> interfaces=NetworkInterface.getNetworkInterfaces();
        while(interfaces!=null&&interfaces.hasMoreElements()){
            NetworkInterface iface=interfaces.nextElement();if(!iface.isUp()||iface.isLoopback())continue;
            for(InterfaceAddress address:iface.getInterfaceAddresses()){
                InetAddress local=address.getAddress();int prefix=address.getNetworkPrefixLength();
                if(!(local instanceof Inet4Address)||prefix<=0||prefix>32)continue;
                byte[] a=local.getAddress(),b=remote.getAddress();if(b.length!=4)continue;
                boolean match=true;for(int i=0;i<prefix;i++)if(((a[i/8]^b[i/8])&(128>>(i%8)))!=0){match=false;break;}
                if(match){Socket s=new Socket();s.bind(new InetSocketAddress(local,0));diagnostics.event("ROUTE_DIRECT_INTERFACE");return s;}
            }
        }
        throw new NoRouteToHostException();
    }
    private boolean ensureControlReady(boolean start){
        if(commandQueued||connecting||importing){feedback("[WAIT] 연결 준비 또는 명령 전송 중입니다. 잠시 기다려 주세요.");return false;}
        Session active=session;Session.State s=active==null?Session.State.CLOSED:active.state();
        if(s==Session.State.CLOSED){
            diagnostics.event("CONTROL_BLOCKED_NOT_CONNECTED");
            feedback("[C00] P2 연결이 완료되지 않아 곡 시작·예약·취소 명령을 보내지 않았습니다.\n"+connectionMessage);
            new AlertDialog.Builder(this).setTitle("P2 연결이 필요합니다").setMessage(connectionMessage)
                .setPositiveButton("P2 연결",(d,w)->requestConnect())
                .setNegativeButton("닫기",null).show();return false;
        }
        if(s!=Session.State.READY&&!((s==Session.State.PLAY||s==Session.State.QUEUE)&&!start)){
            diagnostics.event("CONTROL_BLOCKED_BUSY");feedback("[WAIT] 이전 명령의 응답 또는 초기 연결 확인을 기다리고 있습니다.\n"+connectionMessage);return false;
        }
        return true;
    }
    private void dispatch(boolean start,int song){
        Session active=session;if(active==null||commandQueued){feedback("[WAIT] 연결 상태를 확인해 주세요.");return;}
        commandQueued=true;diagnostics.event(start?"PLAY_TAPPED":"CANCEL_TAPPED");
        show(start?"[P00] 시작 버튼 입력을 받았습니다. 요청을 전송합니다…":"[C10] 취소 버튼 입력을 받았습니다. 요청을 전송합니다…");
        worker.execute(()->{
            try{if(start)active.play(song);else active.cancel();}
            catch(IOException|RuntimeException e){diagnostics.event("COMMAND_SEND_FAILED");ui(()->show("[P02] 명령 전송 또는 처리에 실패했습니다. 반주기 화면을 확인하고 진단 결과를 공유해 주세요."));}
            finally{ui(()->{commandQueued=false;paint();});}
        });
    }
    private void pauseCommand(){
        if(!ensureControlReady(true)){paint();return;}
        Session active=session;if(active==null||commandQueued)return;
        commandQueued=true;diagnostics.event("PAUSE_TAPPED");show("일시정지·계속 요청 중…");
        worker.execute(()->{
            try{active.pause();}
            catch(IOException|RuntimeException e){diagnostics.event("PAUSE_SEND_FAILED");ui(()->show("일시정지·계속 요청을 확인하지 못했습니다. 반주기 화면을 확인해 주세요."));}
            finally{ui(()->{commandQueued=false;paint();});}
        });
    }
    private void queueCommand(boolean reserve,int song){
        if(!ensureControlReady(true)){paint();return;}
        Session active=session;if(active==null||commandQueued)return;
        commandQueued=true;diagnostics.event(reserve?"RESERVE_TAPPED":"QUEUE_REQUESTED");
        queueValid=false;queueSongs=Collections.emptyList();queueMessage=reserve?"예약 요청의 응답을 기다립니다…":"P2 예약 목록을 불러오는 중…";
        // Never keep a previous room's list or optimistically append an unconfirmed reservation.
        show(queueMessage);
        worker.execute(()->{
            try{if(reserve)active.reserve(song);else active.requestQueue();}
            catch(IOException|RuntimeException e){diagnostics.event("QUEUE_COMMAND_FAILED");ui(()->{
                if(session!=active)return;queueValid=false;queueMessage="예약 요청 또는 목록을 확인하지 못했습니다. 연결 상태를 확인하세요.";show(queueMessage);
            });}
            finally{ui(()->{commandQueued=false;paint();});}
        });
    }
    private void paint(){
        if(status==null)return;Session active=session;Session.State s=active==null?Session.State.CLOSED:active.state();
        boolean searching=directWifi!=null&&directWifi.searching();
        boolean busy=connecting||importing||searching||(directWifi!=null&&directWifi.joining());
        boolean linked=s==Session.State.READY||s==Session.State.PLAY||s==Session.State.CANCEL||s==Session.State.PAUSE||s==Session.State.RESERVE||s==Session.State.QUEUE;
        if(!linked){queueValid=false;queueSongs=Collections.emptyList();queueMessage="먼저 P2에 연결해 주세요.";}
        String roomLabel=roomRequest==null?"P2":roomRequest+"번방";
        connectionBanner.setText(linked?"● "+(activeRoom==null?"P2":activeRoom+"번방")+" 연결됨":searching?"◌ "+roomLabel+" 찾는 중…":busy||s==Session.State.AUTH||s==Session.State.IDENTIFY?"◌ "+roomLabel+" 연결 준비 중…":"○ "+roomLabel+" 연결 전");
        connectionBanner.setTextColor(linked?accent:fg);
        connect.setEnabled(true);connect.setText(active!=null?"연결 해제":roomLabel+" 연결");
        if(songSearch!=null){
            songSearch.state(connectionBanner.getText().toString(),status.getText().toString(),busy||commandQueued||(s!=Session.State.READY&&s!=Session.State.CLOSED),linked);
            songSearch.queue(queueSongs,queueMessage,queueValid);
        }
    }
    private void show(String text){status.setText(text);paint();}
    private void showSongSearch(){
        if(songSearch==null)return;
        if(toolsDialog!=null)toolsDialog.dismiss();
        songSearch.view.setVisibility(View.VISIBLE);paint();
    }
    private void showConnection(){
        if(songSearch==null)return;
        if(toolsDialog==null){
            toolsDialog=new AlertDialog.Builder(this).setView(scroll).create();
        }
        if(!toolsDialog.isShowing())toolsDialog.show();
        scroll.smoothScrollTo(0,0);
    }
    @Override public void onBackPressed(){
        if(toolsDialog!=null&&toolsDialog.isShowing()){toolsDialog.dismiss();return;}
        super.onBackPressed();
    }
    private void feedback(String text){show(text);Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
    private void ui(Runnable action){runOnUiThread(()->{if(!destroyed)action.run();});}
    @Override protected void onDestroy(){
        destroyed=true;
        retryAfterWifiSettings=false;if(wifiSetupDialog!=null)wifiSetupDialog.dismiss();
        if(toolsDialog!=null)toolsDialog.dismiss();
        if(songSearch!=null)songSearch.close();
        if(peerDialog!=null)peerDialog.dismiss();
        if(directWifi!=null)try{directWifi.close();}catch(RuntimeException ignored){}
        if(receiverRegistered){unregisterReceiver(wifiReceiver);receiverRegistered=false;}
        // Keep the P2P registration throughout onPause/onStop while Settings is open.
        if(wifiRegistration!=null)try{wifiRegistration.close();}catch(RuntimeException ignored){}
        Session s=session;if(s!=null)s.close();Socket pending=connectingSocket;if(pending!=null)try{pending.close();}catch(IOException ignored){}
        worker.shutdownNow();reader.shutdownNow();super.onDestroy();
    }
    private LinearLayout column(LinearLayout parent){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);parent.addView(box);return box;}
    private LinearLayout row(LinearLayout parent){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.HORIZONTAL);parent.addView(box);return box;}
    private void equalButtons(LinearLayout row){for(int i=0;i<row.getChildCount();i++){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.topMargin=dp(6);p.bottomMargin=dp(6);if(i>0)p.leftMargin=dp(8);row.getChildAt(i).setLayoutParams(p);}}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView text(LinearLayout parent,String value,int size,boolean bold){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(fg);v.setPadding(0,dp(12),0,dp(10));if(bold)v.setTypeface(null,android.graphics.Typeface.BOLD);parent.addView(v);return v;}
    private Button button(LinearLayout parent,String title,Runnable action){Button b=new Button(this);b.setText(title);b.setTextSize(17);b.setAllCaps(false);b.setMinHeight(dp(58));b.setTextColor(bg);b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(accent));b.setOnClickListener(v->action.run());LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(6);p.bottomMargin=dp(6);parent.addView(b,p);return b;}
}
