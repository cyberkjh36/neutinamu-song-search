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
import android.text.InputType;
import android.text.TextWatcher;
import android.text.Editable;
import android.view.*;
import android.view.inputmethod.EditorInfo;
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
    private final ExecutorService searchWorker=Executors.newSingleThreadExecutor();
    private Future<?> pendingSearch;private int searchGeneration,pageOffset;private String activeQuery="";
    private volatile Session session;private volatile Socket connectingSocket;
    private volatile boolean destroyed=false,connecting=false;
    private boolean importing=false,commandQueued=false;
    private final Diagnostics diagnostics=new Diagnostics();
    private String connectionMessage="방 QR을 스캔하거나 ‘주변 P2 찾기’에서 방을 선택하세요.";
    private CaptureProfile profile;private ProfileStore profileStore;private SongCatalog catalog;
    private TextView profileStatus,connectionBanner;
    private TextView status,actionStatus,catalogStatus,selection;
    private ScrollView scroll;private FrameLayout screens;private SongSearchView songSearch;
    private EditText query,number;private LinearLayout results,contentRoot,connectionDetails,selectionPanel,resultsPanel;
    private Button settingsToggle,previousPage,nextPage;private boolean settingsExpanded;
    private Button connect,play,cancel,importButton,search;
    private TextView wifiStatus;
    private P2pRegistration wifiRegistration;
    private DirectWifi directWifi;private String directHost,directInterface;private boolean findAfterPermission,directMode;
    private AlertDialog peerDialog;
    private RoomDirectory rooms=new RoomDirectory();private String roomRequest,activeRoom;private boolean roomPending;
    private boolean receiverRegistered,tjSettingsVisited;
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
        LinearLayout root=new LinearLayout(this);contentRoot=root;root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(22),dp(24),dp(22),dp(30));scroll.addView(root);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(dp(22),dp(24)+insets.getSystemWindowInsetTop(),dp(22),dp(30)+insets.getSystemWindowInsetBottom());return insets;});
        screens=new FrameLayout(this);screens.addView(scroll);setContentView(screens);
        button(root,"← 음성·키보드 노래검색으로 돌아가기",this::showSongSearch).setTag("showSongSearch");
        text(root,"느티나무 · P2 직접연결",27,true);
        text(root,"통합판 0.9.0 · P2 연결 설정",15,false);
        TextView credit=text(root,"made by cyberkjh",14,false);credit.setPadding(0,0,0,dp(8));
        credit.setTextColor(Color.rgb(183,200,216));
        diagnostics.event("APP_OPEN_ANDROID "+android.os.Build.VERSION.SDK_INT);
        connectionBanner=text(root,"○ P2 연결 전",20,true);connectionBanner.setTag("connectionBanner");
        connectionBanner.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        LinearLayout connectionRow=row(root);
        connect=button(connectionRow,"P2 연결",()->{
            if(connecting||importing||directWifi.joining()){feedback("연결 준비 중입니다. 잠시 기다려 주세요.");return;}
            if(session!=null){session.close();session=null;paint();return;}
            beginConnect();
        });connect.setTag("connect");
        button(connectionRow,"주변 P2 찾기",this::findP2).setTag("findP2");equalButtons(connectionRow);
        status=text(root,"방 QR을 스캔하면 해당 방을 찾아 연결합니다. 처음 나오는 권한·연결 확인 창은 허용해 주세요.",15,false);status.setTag("connectionStatus");
        settingsToggle=button(root,"연결 설정 · 도움말 ▾",()->setSettingsExpanded(!settingsExpanded));settingsToggle.setTag("settingsToggle");
        connectionDetails=column(root);connectionDetails.setTag("connectionDetails");connectionDetails.setVisibility(View.GONE);
        text(connectionDetails,"방 QR 연결에는 파일 선택이 필요하지 않습니다. 연결이 안 될 때 직원이 기존 연결 기록을 등록할 수 있습니다.",15,false);
        importButton=button(connectionDetails,"PCAP 연결 기록 선택",this::chooseCapture);importButton.setTag("importProfile");
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
        text(root,"음성·초성으로 노래 찾기",22,true);
        button(root,"🎙 음성으로 노래 찾기",this::startVoiceSearch).setTag("voiceSearch");
        text(root,"제목이나 가수를 말하거나 초성으로 입력하세요.\n예: ㅅㄹ → 사랑 · ㄱㅂㅅ → 김범수",14,false);
        query=input(root,"제목 · 가수 · 초성 · 곡번호",InputType.TYPE_CLASS_TEXT);query.setTag("query");
        query.setImeOptions(EditorInfo.IME_ACTION_SEARCH);query.setSingleLine(true);
        LinearLayout searchRow=row(root);
        search=button(searchRow,"검색",this::search);search.setTag("search");
        button(searchRow,"새 검색",this::newSearch).setTag("newSearch");equalButtons(searchRow);
        query.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_SEARCH){search();return true;}return false;});
        catalogStatus=text(root,"곡 목록을 준비합니다…",14,false);catalogStatus.setTag("catalogStatus");
        selectionPanel=column(root);selectionPanel.setTag("selectionPanel");
        selection=text(selectionPanel,"곡을 선택하거나 번호를 입력하세요.",20,true);selection.setTag("selection");
        number=input(selectionPanel,"곡번호 (예: 10909)",InputType.TYPE_CLASS_NUMBER);number.setTag("songNumber");number.setSingleLine(true);
        number.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){refreshSelection();}public void afterTextChanged(Editable e){}});
        LinearLayout playbackRow=row(selectionPanel);
        play=button(playbackRow,"▶ 곡 시작",()->{
            if(!ensureControlReady(true))return;
            final int song;try{song=Integer.parseInt(number.getText().toString().trim());Wire.play(song);}catch(IllegalArgumentException e){feedback("[P01] 올바른 곡번호를 입력하거나 검색 결과에서 곡을 선택해 주세요.");return;}
            dispatch(true,song);
        });play.setTag("play");
        cancel=button(playbackRow,"■ 곡 취소",()->{if(ensureControlReady(false))dispatch(false,0);});cancel.setTag("cancel");equalButtons(playbackRow);
        actionStatus=text(selectionPanel,"P2에 연결한 뒤 ‘곡 시작’을 눌러 주세요.",15,false);actionStatus.setTag("actionStatus");actionStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        resultsPanel=column(root);resultsPanel.setTag("resultsPanel");
        results=column(resultsPanel);results.setTag("results");
        LinearLayout pageRow=row(resultsPanel);
        previousPage=button(pageRow,"◀ 이전",()->searchPage(Math.max(0,pageOffset-30)));previousPage.setTag("previousPage");
        nextPage=button(pageRow,"다음 ▶",()->searchPage(pageOffset+30));nextPage.setTag("nextPage");equalButtons(pageRow);
        previousPage.setVisibility(View.GONE);nextPage.setVisibility(View.GONE);
        text(root,"검색 결과를 누르면 곡만 선택됩니다. ‘곡 시작’을 눌러야 반주기로 실행 명령을 보냅니다.",14,false);
        wifiRegistration=new P2pRegistration(new AndroidP2pBackend(this),new Handler(getMainLooper()),
            ()->profile==null?null:profile.host,this::showWifiState,diagnostics);
        directWifi=new DirectWifi(new AndroidDirectWifiBackend(this),new Handler(getMainLooper()),new DirectWifi.Listener(){
            public void status(String code,String message){diagnostics.event(code);if(directMode){wifiStatus.setText("["+code+"] "+message);show("["+code+"] "+message);}paint();}
            public void peers(List<DirectWifi.Peer> peers){
                if(destroyed||!directMode||(peerDialog!=null&&peerDialog.isShowing()))return;
                List<DirectWifi.Peer> ordered=rooms.sorted(peers);
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
            public void play(int song){number.setText(String.valueOf(song));if(ensureControlReady(true))dispatch(true,song);paint();}
            public void cancel(){if(ensureControlReady(false))dispatch(false,0);paint();}
            public void refresh(){paint();}
        });
        screens.addView(songSearch.view,new FrameLayout.LayoutParams(-1,-1));
        songSearch.view.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(0,insets.getSystemWindowInsetTop(),0,insets.getSystemWindowInsetBottom());return insets;});
        showSongSearch();
        restoreProfile();
        handleRoomIntent(getIntent());
        paint();
        worker.execute(()->{
            SongCatalog loaded=new SongCatalog();
            try{
                for(String file:new String[]{"catalog-20261018.csv","catalog-update-20261104.csv"})
                    try(Reader r=new InputStreamReader(getAssets().open(file),"UTF-8")){loaded.load(r);}
                ui(()->{catalog=loaded;catalogStatus.setText(String.format(Locale.KOREA,"%,d곡 · 제목·가수·초성·번호로 검색",loaded.size()));search.setEnabled(true);refreshSelection();});
            }catch(IOException e){ui(()->{catalogStatus.setText("곡 목록을 읽지 못했습니다. 곡번호로 시험할 수 있습니다.");search.setEnabled(false);});}
        });
    }
    static String wifiPermission(){return Build.VERSION.SDK_INT>=33?Manifest.permission.NEARBY_WIFI_DEVICES:Manifest.permission.ACCESS_FINE_LOCATION;}
    static String[] wifiPermissions(){return Build.VERSION.SDK_INT>=31&&Build.VERSION.SDK_INT<=32?
        new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION}:new String[]{wifiPermission()};}
    private void findP2(){
        if(connecting||importing||session!=null||directWifi.joining()){feedback("연결 준비 또는 실행 연결 중입니다. 현재 연결을 해제한 뒤 찾아 주세요.");return;}
        roomRequest=null;activeRoom=null;roomPending=false;stopDiscovery();
        directMode=true;directHost=null;directInterface=null;findAfterPermission=true;prepareWifi();
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleRoomIntent(intent);}
    private void handleRoomIntent(Intent intent){
        if(intent==null||intent.getData()==null)return;
        String room=rooms.fromIntent(intent);
        if(room==null){showConnection();feedback("이 QR의 방정보를 확인할 수 없습니다. 직원에게 확인하거나 ‘주변 P2 찾기’를 눌러 주세요.");return;}
        if(session!=null||connecting||directWifi.joining()||commandQueued){
            if(room.equals(activeRoom)&&session!=null&&session.state()==Session.State.READY){showSongSearch();return;}
            showConnection();
            feedback(room.equals(activeRoom)?room+"번방에 연결되어 있거나 연결 중입니다.":"현재 연결을 먼저 해제한 뒤 "+room+"번방 QR을 다시 스캔해 주세요. 다른 방으로 명령을 보내지 않았습니다.");return;
        }
        stopDiscovery();roomRequest=room;activeRoom=null;roomPending=true;directHost=null;directInterface=null;
        showConnection();attemptRoomRequest();
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
            diagnostics.event("P2P_PERMISSION_REQUESTED");requestPermissions(wifiPermissions(),P2P_PERMISSION);return;
        }
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
        if(directWifi!=null)directWifi.changed();
        if(wifiRegistration!=null&&wifiRegistration.registered()){
            diagnostics.event("APP_RESUMED_WITH_P2P");wifiRegistration.refresh(null);
        }
    }
    private void search(){
        searchPage(0);
    }
    private void startVoiceSearch(){
        if(songSearch==null||catalog==null){catalogStatus.setText("곡 목록을 준비하고 있습니다. 잠시 후 다시 눌러 주세요.");return;}
        if(songSearch.isVoicePending())return;
        cancelSearch();final int generation=searchGeneration;final String original=query.getText().toString();
        catalogStatus.setText("음성 인식을 여는 중입니다. 노래 제목이나 가수를 말씀해 주세요.");
        songSearch.startVoice((texts,error)->{
            if(destroyed||generation!=searchGeneration||!original.equals(query.getText().toString()))return;
            if(!error.isEmpty()||texts.isEmpty()){catalogStatus.setText(error.isEmpty()?"말소리를 듣지 못했습니다. 다시 시도해 주세요.":error);return;}
            query.setText(texts.get(0));search();
        });
    }
    private void cancelSearch(){searchGeneration++;if(pendingSearch!=null)pendingSearch.cancel(true);pendingSearch=null;}
    private void newSearch(){
        cancelSearch();activeQuery="";pageOffset=0;query.setText("");number.setText("");results.removeAllViews();
        previousPage.setVisibility(View.GONE);nextPage.setVisibility(View.GONE);
        catalogStatus.setText("새로 찾을 제목·가수·초성 또는 곡번호를 입력하세요.");
        query.requestFocus();scrollTo(query);
        ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(query,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
    }
    private void searchPage(int offset){
        SongCatalog source=catalog;if(source==null)return;
        String q=query.getText().toString().trim();if(!q.equals(activeQuery))offset=0;
        activeQuery=q;cancelSearch();final int generation=searchGeneration,requestedOffset=offset;
        results.removeAllViews();previousPage.setVisibility(View.GONE);nextPage.setVisibility(View.GONE);
        if(q.isEmpty()){catalogStatus.setText("제목·가수·초성 또는 곡번호를 입력해 주세요.");return;}
        catalogStatus.setText("노래를 찾고 있습니다…");
        ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(query.getWindowToken(),0);
        pendingSearch=searchWorker.submit(()->{
            try{SongCatalog.Page page=source.page(q,requestedOffset,30);ui(()->{
                if(generation!=searchGeneration)return;pageOffset=page.offset;
                catalogStatus.setText(page.total==0?"검색 결과가 없습니다. 제목이나 가수 이름을 짧게 입력해 보세요.":
                    String.format(Locale.KOREA,"총 %,d곡 · %,d–%,d번째 · 곡을 선택하세요",page.total,page.offset+1,page.offset+page.songs.size()));
                for(SongCatalog.Song s:page.songs)button(results,s.number+"  "+s.title+"\n"+s.artist,()->{number.setText(String.valueOf(s.number));scrollTo(selectionPanel);});
                previousPage.setVisibility(page.offset>0?View.VISIBLE:View.GONE);
                nextPage.setVisibility(page.hasNext()?View.VISIBLE:View.GONE);
                if(!page.songs.isEmpty())scrollTo(resultsPanel);
            });}catch(CancellationException ignored){}
            catch(RuntimeException e){ui(()->{if(generation==searchGeneration)catalogStatus.setText("검색을 마치지 못했습니다. 검색 버튼을 다시 눌러 주세요.");});}
        });
    }
    private void refreshSelection(){
        if(number==null||selection==null)return;String text=number.getText().toString().trim();
        if(text.isEmpty()){selection.setText("곡을 선택하거나 번호를 입력하세요.");return;}
        try{int value=Integer.parseInt(text);Wire.play(value);SongCatalog.Song song=catalog==null?null:catalog.byNumber(value);
            selection.setText(song==null?value+"번 · 제목 정보 없음":song.title+"\n"+song.artist+" · "+song.number+"번");
        }catch(IllegalArgumentException e){selection.setText("올바른 곡번호를 입력해 주세요.");}
    }
    private void scrollTo(View target){
        target.post(()->{if(destroyed)return;android.graphics.Rect rect=new android.graphics.Rect();target.getDrawingRect(rect);contentRoot.offsetDescendantRectToMyCoords(target,rect);scroll.smoothScrollTo(0,Math.max(0,rect.top-dp(12)));});
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
                socket=socketFor(target,radio);connectingSocket=socket;
                if(destroyed){socket.close();return;}
                socket.connect(new InetSocketAddress(target,7070),5000);
                diagnostics.event("TCP_CONNECTED");
                String mac=currentMac(socket);
                CaptureProfile live=device==null?selected.forConnection(target,mac):
                    selected!=null&&selected.matchesDevice(device)?selected.forConnection(target,mac):CaptureProfile.forRoom(target,device,mac);
                diagnostics.event(device!=null?"ROOM_REGISTRATION_READY":"SAVED_REGISTRATION_READY");
                diagnostics.event("CURRENT_WIFI_ADDRESS_APPLIED");
                final Session[] holder=new Session[1];
                Session opened=new Session(socket,live,new Session.Listener(){
                    @Override public void changed(Session.State state,String message){
                        diagnostics.event("STATE_"+state.name());diagnostics.status(message);
                        ui(()->{if(session!=holder[0])return;if(state==Session.State.CLOSED)session=null;connectionMessage=message;show(message);paint();if(roomRequest!=null&&state==Session.State.READY)showSongSearch();});
                    }
                    @Override public void frame(boolean outgoing,int command,int length,Long scalar){diagnostics.frame(outgoing,command,length,scalar);}
                });
                holder[0]=opened;
                if(destroyed){opened.close();return;}
                session=opened;reader.execute(opened::run);
            }catch(IOException|RuntimeException e){
                if(socket!=null)try{socket.close();}catch(IOException ignored){}
                String code=e instanceof CurrentAddressException?"A03":e instanceof NoRouteToHostException?"N10":e instanceof SocketTimeoutException?"N11":e instanceof ConnectException?"N12":e instanceof SecurityException?"N13":"N14";
                diagnostics.event(code);
                ui(()->{connectionMessage=code.equals("A03")?
                    "[A03] 휴대폰의 현재 Wi-Fi Direct 주소를 읽지 못했습니다. 이전 주소로 대신 접속하지 않았습니다. 안드로이드 버전과 진단 결과를 보내 주세요.":code.equals("N10")?
                    "[N10] P2로 접속할 직접 Wi-Fi 경로가 없습니다. ‘주변 P2 찾기’에서 연결할 반주기를 선택해 주세요.":
                    "["+code+"] P2에 접속하지 못했습니다. 직접 Wi-Fi 연결 상태를 확인하고 PCAPdroid 캡처를 중지해 주세요.";show(connectionMessage);});
            }
            finally{connectingSocket=null;connecting=false;ui(this::paint);}
        });
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
            feedback("[C00] P2 연결이 완료되지 않아 곡 실행·취소 명령을 보내지 않았습니다.\n"+connectionMessage);
            new AlertDialog.Builder(this).setTitle("P2 연결이 필요합니다").setMessage(connectionMessage)
                .setPositiveButton("P2 연결",(d,w)->beginConnect())
                .setNegativeButton("닫기",null).show();return false;
        }
        if(s!=Session.State.READY&&!(s==Session.State.PLAY&&!start)){
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
    private void paint(){
        if(play==null)return;Session active=session;Session.State s=active==null?Session.State.CLOSED:active.state();
        boolean busy=connecting||importing||(directWifi!=null&&directWifi.joining());
        boolean linked=s==Session.State.READY||s==Session.State.PLAY||s==Session.State.CANCEL;
        connectionBanner.setText(linked?"● "+(activeRoom==null?"P2":activeRoom+"번방")+" 연결됨":busy||s==Session.State.AUTH||s==Session.State.IDENTIFY?"◌ 연결 준비 중…":"○ P2 연결 전");
        connectionBanner.setTextColor(linked?accent:fg);
        connect.setEnabled(true);connect.setText(active!=null?"연결 해제":"P2 연결");
        // Clickable guards explain missing connection; a disabled button would look unresponsive.
        importButton.setEnabled(true);play.setEnabled(true);cancel.setEnabled(true);
        play.setText(s==Session.State.PLAY?"시작 확인 중…":"▶ 곡 시작");
        search.setEnabled(catalog!=null);
        if(songSearch!=null)songSearch.state(connectionBanner.getText().toString(),status.getText().toString(),busy||commandQueued||s==Session.State.AUTH||s==Session.State.IDENTIFY||s==Session.State.PLAY||s==Session.State.CANCEL);
    }
    private void show(String text){status.setText(text);if(actionStatus!=null)actionStatus.setText(text);paint();}
    private void showSongSearch(){if(songSearch==null)return;scroll.setVisibility(View.GONE);songSearch.view.setVisibility(View.VISIBLE);paint();}
    private void showConnection(){if(songSearch==null)return;songSearch.view.setVisibility(View.GONE);scroll.setVisibility(View.VISIBLE);scroll.smoothScrollTo(0,0);}
    @Override public void onBackPressed(){if(songSearch!=null&&scroll.getVisibility()==View.VISIBLE){showSongSearch();return;}super.onBackPressed();}
    private void feedback(String text){show(text);Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
    private void ui(Runnable action){runOnUiThread(()->{if(!destroyed)action.run();});}
    @Override protected void onDestroy(){
        destroyed=true;
        if(songSearch!=null)songSearch.close();
        if(peerDialog!=null)peerDialog.dismiss();
        if(directWifi!=null)try{directWifi.close();}catch(RuntimeException ignored){}
        if(receiverRegistered){unregisterReceiver(wifiReceiver);receiverRegistered=false;}
        // Keep the P2P registration throughout onPause/onStop while Settings is open.
        if(wifiRegistration!=null)try{wifiRegistration.close();}catch(RuntimeException ignored){}
        Session s=session;if(s!=null)s.close();Socket pending=connectingSocket;if(pending!=null)try{pending.close();}catch(IOException ignored){}
        cancelSearch();searchWorker.shutdownNow();worker.shutdownNow();reader.shutdownNow();super.onDestroy();
    }
    private LinearLayout column(LinearLayout parent){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);parent.addView(box);return box;}
    private LinearLayout row(LinearLayout parent){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.HORIZONTAL);parent.addView(box);return box;}
    private void equalButtons(LinearLayout row){for(int i=0;i<row.getChildCount();i++){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.topMargin=dp(6);p.bottomMargin=dp(6);if(i>0)p.leftMargin=dp(8);row.getChildAt(i).setLayoutParams(p);}}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView text(LinearLayout parent,String value,int size,boolean bold){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(fg);v.setPadding(0,dp(12),0,dp(10));if(bold)v.setTypeface(null,android.graphics.Typeface.BOLD);parent.addView(v);return v;}
    private Button button(LinearLayout parent,String title,Runnable action){Button b=new Button(this);b.setText(title);b.setTextSize(17);b.setAllCaps(false);b.setMinHeight(dp(58));b.setTextColor(bg);b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(accent));b.setOnClickListener(v->action.run());LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(6);p.bottomMargin=dp(6);parent.addView(b,p);return b;}
    private EditText input(LinearLayout parent,String hint,int type){EditText e=new EditText(this);e.setHint(hint);e.setTextSize(19);e.setTextColor(fg);e.setHintTextColor(Color.LTGRAY);e.setInputType(type);e.setMinHeight(dp(56));parent.addView(e);return e;}
}
