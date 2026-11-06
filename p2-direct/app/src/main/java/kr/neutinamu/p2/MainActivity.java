package kr.neutinamu.p2;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.*;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.*;
import android.view.inputmethod.EditorInfo;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

/** Native-only trial. Does not expose a socket bridge to arbitrary web content. */
public final class MainActivity extends Activity {
    private static final int PICK_CAPTURE=1;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ExecutorService reader=Executors.newSingleThreadExecutor();
    private volatile Session session;private volatile Socket connectingSocket;
    private volatile boolean destroyed=false,connecting=false;
    private boolean importing=false,commandQueued=false;
    private final Diagnostics diagnostics=new Diagnostics();
    private String connectionMessage="PCAP 연결 기록을 선택하고 P2 연결 시험을 눌러 주세요.";
    private CaptureProfile profile;private SongCatalog catalog;
    private TextView status,actionStatus,catalogStatus,selection;
    private ScrollView scroll;
    private EditText query,number;private LinearLayout results;
    private Button connect,play,cancel,importButton,search;
    private final int bg=Color.rgb(10,27,40),fg=Color.rgb(238,246,245),accent=Color.rgb(186,225,129);

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(bg);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(22),dp(24),dp(22),dp(30));scroll.addView(root);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(dp(22),dp(24)+insets.getSystemWindowInsetTop(),dp(22),dp(30)+insets.getSystemWindowInsetBottom());return insets;});
        setContentView(scroll);
        text(root,"느티나무 · P2 직접연결",27,true);
        text(root,"연결진단 시험판 0.2 · 실제 반주기 검증 필요",15,false);
        diagnostics.event("APP_OPEN_ANDROID "+android.os.Build.VERSION.SDK_INT);
        text(root,"1  연결 준비",22,true);
        text(root,"TJ매니저에서 NFC로 P2에 연결한 뒤 홈 버튼으로 나와 이 앱을 여세요. 휴대폰과 P2의 직접 Wi-Fi 연결을 유지하는 시험입니다. 매장 공유기의 같은 와이파이에 접속하라는 뜻이 아닙니다. 검색은 P2 연결 없이도 되지만, 곡 실행은 연결 확인 후 가능합니다.",16,false);
        importButton=button(root,"내 PCAP 연결 기록 선택",this::chooseCapture);
        text(root,"보내 주신 PCAPdroid 파일을 선택하세요. 연결정보는 이 앱의 메모리에서만 사용하며 서버에 올리지 않습니다. 앱을 완전히 종료하면 다시 선택해야 합니다.",14,false);
        connect=button(root,"P2 연결 시험",()->{
            if(connecting||importing){feedback("연결 준비 중입니다. 잠시 기다려 주세요.");return;}
            if(session!=null){session.close();session=null;paint();return;}
            beginConnect();
        });connect.setTag("connect");
        button(root,"휴대폰 Wi-Fi 설정 열기",()->startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS)));
        status=text(root,"[C00] 아직 P2에 연결되지 않았습니다. 검색만 가능합니다.",17,true);status.setTag("connectionStatus");
        text(root,"2  노래 찾기",22,true);
        query=input(root,"노래 제목 · 가수 · 곡번호",InputType.TYPE_CLASS_TEXT);query.setTag("query");
        query.setImeOptions(EditorInfo.IME_ACTION_SEARCH);query.setSingleLine(true);
        search=button(root,"검색",this::search);search.setTag("search");
        query.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_SEARCH){search();return true;}return false;});
        catalogStatus=text(root,"기존 곡 목록을 준비합니다…",14,false);
        results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);root.addView(results);
        text(root,"3  선택한 곡 실행",22,true);
        number=input(root,"곡번호 직접 입력 (예: 10909)",InputType.TYPE_CLASS_NUMBER);number.setTag("songNumber");
        selection=text(root,"검색 결과를 누르면 곡번호가 선택됩니다.",16,false);
        actionStatus=text(root,"[C00] 검색은 가능하지만 P2 연결 전에는 곡을 실행할 수 없습니다.",18,true);
        actionStatus.setTag("actionStatus");actionStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        play=button(root,"▶  선택한 곡 시작",()->{
            if(!ensureControlReady(true))return;
            final int song;try{song=Integer.parseInt(number.getText().toString().trim());Wire.play(song);}catch(IllegalArgumentException e){feedback("[P01] 올바른 곡번호를 입력하거나 검색 결과에서 곡을 선택해 주세요.");return;}
            dispatch(true,song);
        });play.setTag("play");
        cancel=button(root,"■  현재 곡 취소",()->{if(ensureControlReady(false))dispatch(false,0);});cancel.setTag("cancel");
        button(root,"진단 결과 공유",()->{
            diagnostics.event("USER_SHARE");
            Intent share=new Intent(Intent.ACTION_SEND);share.setType("text/plain");share.putExtra(Intent.EXTRA_TEXT,diagnostics.report());
            startActivity(Intent.createChooser(share,"ChatGPT에 진단 결과 보내기"));
        }).setTag("shareDiagnostics");
        button(root,"진단 결과 복사",()->{
            ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("P2 연결진단",diagnostics.report()));
            Toast.makeText(this,"복사했습니다. ChatGPT 대화창에 붙여넣어 주세요.",Toast.LENGTH_LONG).show();
        });
        text(root,"작동하지 않으면 위 안내 문구를 보내 주시거나 ‘진단 결과 공유’에서 ChatGPT를 선택해 주세요. 개인정보와 인증값은 포함하지 않습니다.",14,false);
        text(root,"시작 버튼을 누르면 반주기에서 곡이 바뀔 수 있습니다. 시험판은 시작·취소만 지원합니다. 응답이 없으면 반복해서 누르지 말고 반주기 화면을 확인해 주세요.",14,false);
        text(root,"공식 TJ 앱이 아닙니다. 새 NFC 연결 설정과 아이폰 직접 제어는 아직 구현되지 않았습니다.",13,false);
        paint();
        worker.execute(()->{
            SongCatalog loaded=new SongCatalog();
            try{
                for(String file:new String[]{"catalog-20261018.csv","catalog-update-20261104.csv"})
                    try(Reader r=new InputStreamReader(getAssets().open(file),"UTF-8")){loaded.load(r);}
                ui(()->{catalog=loaded;catalogStatus.setText(String.format(Locale.KOREA,"%,d곡 · 제목·가수 또는 번호로 검색",loaded.size()));search.setEnabled(true);});
            }catch(IOException e){ui(()->{catalogStatus.setText("곡 목록을 읽지 못했습니다. 곡번호로 시험할 수 있습니다.");search.setEnabled(false);});}
        });
    }
    private void search(){
        if(catalog==null)return;String q=query.getText().toString().trim();results.removeAllViews();
        if(q.isEmpty()){catalogStatus.setText("제목·가수 또는 곡번호를 입력해 주세요.");return;}
        List<SongCatalog.Song> found=catalog.search(q,30);
        catalogStatus.setText(found.isEmpty()?"검색 결과가 없습니다.":"검색 결과 "+found.size()+"곡 (최대 30곡) · 곡을 선택하세요.");
        for(SongCatalog.Song s:found)button(results,s.number+"  "+s.title+"\n"+s.artist,()->{
            number.setText(String.valueOf(s.number));selection.setText(s.title+" · "+s.artist);
            ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(query.getWindowToken(),0);
            actionStatus.post(()->scroll.smoothScrollTo(0,number.getTop()));
        });
    }
    private void chooseCapture(){
        if(connecting||importing||session!=null){feedback("연결 준비가 끝나거나 연결을 해제한 뒤 기록을 선택해 주세요.");return;}
        Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.setType("*/*");pick.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(pick,PICK_CAPTURE);
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=PICK_CAPTURE||result!=RESULT_OK||data==null||data.getData()==null)return;
        importing=true;diagnostics.event("PROFILE_IMPORT_STARTED");show("연결 기록을 읽는 중입니다…");
        worker.execute(()->{
            try(InputStream in=getContentResolver().openInputStream(data.getData())){
                if(in==null)throw new IOException("파일을 열 수 없습니다.");
                CaptureProfile loaded=CaptureProfile.read(in);
                ui(()->{profile=loaded;importing=false;diagnostics.event("PROFILE_IMPORT_OK");connectionMessage="[C01] 연결 기록을 읽었습니다. 아직 P2 연결 전입니다. ‘P2 연결 시험’을 눌러 주세요.";show(connectionMessage);paint();});
            }catch(IOException|RuntimeException e){ui(()->{importing=false;diagnostics.event("PROFILE_IMPORT_FAILED");show("[C02] 초기 NFC 연결부터 기록한 PCAP 파일인지 확인해 주세요.");paint();});}
        });
    }
    private void beginConnect(){
        if(profile==null){feedback("[C00] PCAP 연결 기록을 먼저 선택해 주세요.");chooseCapture();return;}
        if(importing||connecting||session!=null)return;
        diagnostics.event("CONNECT_STARTED");
        CaptureProfile selected=profile;connecting=true;paint();show("P2에 직접 연결하고 있습니다…");
        worker.execute(()->{
            Socket socket=null;
            try{
                socket=socketFor(selected.host);connectingSocket=socket;
                if(destroyed){socket.close();return;}
                socket.connect(new InetSocketAddress(selected.host,7070),5000);
                diagnostics.event("TCP_CONNECTED");
                final Session[] holder=new Session[1];
                Session opened=new Session(socket,selected,new Session.Listener(){
                    @Override public void changed(Session.State state,String message){
                        diagnostics.event("STATE_"+state.name());
                        ui(()->{if(session!=holder[0])return;if(state==Session.State.CLOSED)session=null;connectionMessage=message;show(message);paint();});
                    }
                    @Override public void frame(boolean outgoing,int command,int length,Long scalar){diagnostics.frame(outgoing,command,length,scalar);}
                });
                holder[0]=opened;
                if(destroyed){opened.close();return;}
                session=opened;reader.execute(opened::run);
            }catch(IOException|RuntimeException e){
                if(socket!=null)try{socket.close();}catch(IOException ignored){}
                String code=e instanceof NoRouteToHostException?"N10":e instanceof SocketTimeoutException?"N11":e instanceof ConnectException?"N12":e instanceof SecurityException?"N13":"N14";
                diagnostics.event(code);
                ui(()->{connectionMessage="["+code+"] P2에 접속하지 못했습니다. TJ매니저로 만든 직접 Wi-Fi 연결을 유지하고 PCAPdroid 캡처를 중지해 주세요.";show(connectionMessage);});
            }
            finally{connectingSocket=null;connecting=false;ui(this::paint);}
        });
    }
    private Socket socketFor(String host)throws IOException {
        InetAddress remote=InetAddress.getByName(host);
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
                .setPositiveButton(profile==null?"연결 기록 선택":"P2 연결 시험",(d,w)->{if(profile==null)chooseCapture();else beginConnect();})
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
        connect.setEnabled(true);connect.setText(active!=null?"연결 해제":"P2 연결 시험");
        // Clickable guards explain missing connection; a disabled button would look unresponsive.
        importButton.setEnabled(true);play.setEnabled(true);cancel.setEnabled(true);
        play.setText(s==Session.State.PLAY?"시작 요청 확인 중…":"▶  선택한 곡 시작");
        search.setEnabled(catalog!=null);
    }
    private void show(String text){status.setText(text);if(actionStatus!=null)actionStatus.setText(text);}
    private void feedback(String text){show(text);Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
    private void ui(Runnable action){runOnUiThread(()->{if(!destroyed)action.run();});}
    @Override protected void onDestroy(){destroyed=true;Session s=session;if(s!=null)s.close();Socket pending=connectingSocket;if(pending!=null)try{pending.close();}catch(IOException ignored){}worker.shutdownNow();reader.shutdownNow();super.onDestroy();}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView text(LinearLayout parent,String value,int size,boolean bold){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(fg);v.setPadding(0,dp(12),0,dp(10));if(bold)v.setTypeface(null,android.graphics.Typeface.BOLD);parent.addView(v);return v;}
    private Button button(LinearLayout parent,String title,Runnable action){Button b=new Button(this);b.setText(title);b.setTextSize(17);b.setAllCaps(false);b.setMinHeight(dp(58));b.setTextColor(bg);b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(accent));b.setOnClickListener(v->action.run());LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(6);p.bottomMargin=dp(6);parent.addView(b,p);return b;}
    private EditText input(LinearLayout parent,String hint,int type){EditText e=new EditText(this);e.setHint(hint);e.setTextSize(19);e.setTextColor(fg);e.setHintTextColor(Color.LTGRAY);e.setInputType(type);e.setMinHeight(dp(56));parent.addView(e);return e;}
}
