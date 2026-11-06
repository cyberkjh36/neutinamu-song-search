package kr.neutinamu.p2;

import android.app.Activity;
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
    private CaptureProfile profile;private SongCatalog catalog;
    private TextView status,catalogStatus,selection;
    private EditText query,number;private LinearLayout results;
    private Button connect,play,cancel,importButton,search;
    private final int bg=Color.rgb(10,27,40),fg=Color.rgb(238,246,245),accent=Color.rgb(186,225,129);

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(bg);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(22),dp(24),dp(22),dp(30));scroll.addView(root);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(dp(22),dp(24)+insets.getSystemWindowInsetTop(),dp(22),dp(30)+insets.getSystemWindowInsetBottom());return insets;});
        setContentView(scroll);
        text(root,"느티나무 · P2 직접연결",27,true);
        text(root,"안드로이드 시험판 0.1 · 실제 반주기 검증 필요",15,false);
        text(root,"1  연결 준비",22,true);
        text(root,"TJ매니저에서 NFC로 P2에 연결한 뒤, 홈 화면으로 돌아와 이 앱을 여세요. P2와의 Wi-Fi 연결이 유지되어야 합니다. PC와 8자리 연결번호는 사용하지 않습니다.",16,false);
        importButton=button(root,"내 PCAP 연결 기록 선택",()->{
            if(connecting||session!=null){show("연결을 해제한 뒤 기록을 바꿔 주세요.");return;}
            Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.setType("*/*");pick.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(pick,PICK_CAPTURE);
        });
        text(root,"보내 주신 PCAPdroid 파일을 선택하세요. 연결정보는 이 앱의 메모리에서만 사용하며 서버에 올리지 않습니다. 앱을 완전히 종료하면 다시 선택해야 합니다.",14,false);
        connect=button(root,"P2 연결 시험",()->{
            if(connecting){show("연결 응답을 기다리는 중입니다.");return;}
            if(session!=null){session.close();session=null;paint();return;}
            beginConnect();
        });
        button(root,"휴대폰 Wi-Fi 설정 열기",()->startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS)));
        status=text(root,"연결 기록을 먼저 선택해 주세요.",17,true);
        text(root,"2  노래 찾기",22,true);
        query=input(root,"노래 제목 · 가수 · 곡번호",InputType.TYPE_CLASS_TEXT);
        query.setImeOptions(EditorInfo.IME_ACTION_SEARCH);query.setSingleLine(true);
        search=button(root,"검색",this::search);
        query.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_SEARCH){search();return true;}return false;});
        catalogStatus=text(root,"기존 곡 목록을 준비합니다…",14,false);
        results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);root.addView(results);
        text(root,"3  선택한 곡 실행",22,true);
        number=input(root,"곡번호 직접 입력 (예: 10909)",InputType.TYPE_CLASS_NUMBER);
        selection=text(root,"검색 결과를 누르면 곡번호가 선택됩니다.",16,false);
        play=button(root,"▶  선택한 곡 시작",()->{
            final int song;try{song=Integer.parseInt(number.getText().toString().trim());Wire.play(song);}catch(IllegalArgumentException e){show("올바른 곡번호를 입력해 주세요.");return;}
            dispatch(true,song);
        });
        cancel=button(root,"■  현재 곡 취소",()->dispatch(false,0));
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
        for(SongCatalog.Song s:found)button(results,s.number+"  "+s.title+"\n"+s.artist,()->{number.setText(String.valueOf(s.number));selection.setText(s.title+" · "+s.artist);number.requestFocus();});
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=PICK_CAPTURE||result!=RESULT_OK||data==null||data.getData()==null)return;
        importButton.setEnabled(false);connect.setEnabled(false);show("연결 기록을 읽는 중입니다…");
        worker.execute(()->{
            try(InputStream in=getContentResolver().openInputStream(data.getData())){
                if(in==null)throw new IOException("파일을 열 수 없습니다.");
                CaptureProfile loaded=CaptureProfile.read(in);
                ui(()->{profile=loaded;show("연결 기록을 확인했습니다. 같은 휴대폰·P2에서 연결 시험을 누르세요.");importButton.setEnabled(true);paint();});
            }catch(IOException|RuntimeException e){ui(()->{show("연결 기록을 읽지 못했습니다. 초기 NFC 연결부터 기록한 PCAP 파일인지 확인해 주세요.");importButton.setEnabled(true);paint();});}
        });
    }
    private void beginConnect(){
        if(profile==null){show("연결 기록을 먼저 선택해 주세요.");return;}
        CaptureProfile selected=profile;connecting=true;paint();show("P2에 직접 연결하고 있습니다…");
        worker.execute(()->{
            Socket socket=null;
            try{
                socket=socketFor(selected.host);connectingSocket=socket;
                if(destroyed){socket.close();return;}
                socket.connect(new InetSocketAddress(selected.host,7070),5000);
                final Session[] holder=new Session[1];
                Session opened=new Session(socket,selected,(state,message)->ui(()->{
                    if(session!=holder[0])return;
                    if(state==Session.State.CLOSED)session=null;
                    show(message);paint();
                }));
                holder[0]=opened;
                if(destroyed){opened.close();return;}
                session=opened;reader.execute(opened::run);
            }catch(IOException|RuntimeException e){if(socket!=null)try{socket.close();}catch(IOException ignored){}ui(()->show("P2에 닿지 못했습니다. 공식 앱에서 연결한 Wi-Fi가 유지되는지 확인하세요. PCAPdroid 캡처는 중지해 주세요."));}
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
            for(RouteInfo route:props.getRoutes())if(!route.isDefaultRoute()&&route.matches(remote))return network.getSocketFactory().createSocket();
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
                if(match){Socket s=new Socket();s.bind(new InetSocketAddress(local,0));return s;}
            }
        }
        throw new IOException("No matching local route");
    }
    private void dispatch(boolean start,int song){
        Session active=session;if(active==null){show("먼저 P2에 연결해 주세요.");return;}
        // Disable immediately so two fast taps cannot queue duplicate starts.
        play.setEnabled(false);cancel.setEnabled(false);
        worker.execute(()->{try{if(start)active.play(song);else active.cancel();}catch(IOException|RuntimeException e){ui(()->{show("명령을 보내지 못했거나 응답을 확인하지 못했습니다. 반주기 화면을 확인해 주세요.");paint();});}});
    }
    private void paint(){
        if(play==null)return;Session active=session;Session.State s=active==null?Session.State.CLOSED:active.state();
        connect.setEnabled(profile!=null&&!connecting);connect.setText(active!=null?"연결 해제":"P2 연결 시험");
        importButton.setEnabled(active==null&&!connecting);play.setEnabled(s==Session.State.READY);
        cancel.setEnabled(s==Session.State.READY||s==Session.State.PLAY);search.setEnabled(catalog!=null);
    }
    private void show(String text){status.setText(text);}
    private void ui(Runnable action){runOnUiThread(()->{if(!destroyed)action.run();});}
    @Override protected void onDestroy(){destroyed=true;Session s=session;if(s!=null)s.close();Socket pending=connectingSocket;if(pending!=null)try{pending.close();}catch(IOException ignored){}worker.shutdownNow();reader.shutdownNow();super.onDestroy();}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView text(LinearLayout parent,String value,int size,boolean bold){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(fg);v.setPadding(0,dp(12),0,dp(10));if(bold)v.setTypeface(null,1);parent.addView(v);return v;}
    private Button button(LinearLayout parent,String title,Runnable action){Button b=new Button(this);b.setText(title);b.setTextSize(17);b.setAllCaps(false);b.setMinHeight(dp(58));b.setTextColor(bg);b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(accent));b.setOnClickListener(v->action.run());LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(6);p.bottomMargin=dp(6);parent.addView(b,p);return b;}
    private EditText input(LinearLayout parent,String hint,int type){EditText e=new EditText(this);e.setHint(hint);e.setTextSize(19);e.setTextColor(fg);e.setHintTextColor(Color.LTGRAY);e.setInputType(type);e.setMinHeight(dp(56));parent.addView(e);return e;}
}
