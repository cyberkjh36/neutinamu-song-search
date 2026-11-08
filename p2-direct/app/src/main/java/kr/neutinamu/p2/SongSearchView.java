package kr.neutinamu.p2;

import android.annotation.SuppressLint;
import android.app.*;
import android.content.*;
import android.net.Uri;
import android.speech.RecognizerIntent;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Only bundled, allow-listed assets can execute in the view with the narrow native bridge. */
final class SongSearchView {
    static final String HOME="https://appassets.androidplatform.net/search/index.html";
    static final int VOICE=71,IMPORT=72,EXPORT=73;
    static final int MAX_CSV=16*1024*1024;
    private static final Set<String> ASSETS=new HashSet<>(Arrays.asList("index.html","chosung.js","native-search.js","p2-ui.mjs","p2-client.mjs","p2.css","icon.svg","icon-192.png","icon-512.png","catalog-20261018.csv","catalog-update-20261104.csv"));
    interface Host { void connection();void connect();void find();void next();void playQueued(int number,int index);void cancelQueued(int number,int index);void play(int number);void reserve(int number);void queue();void cancel();void refresh(); }
    interface VoiceResult { void received(List<String> texts,String error); }
    final WebView view;final Bridge bridge=new Bridge();
    private final Activity activity;private final Host host;private final ExecutorService files=Executors.newSingleThreadExecutor();
    private volatile boolean closed;private boolean voicePending,filePending;private String exportText;
    private VoiceResult pendingVoiceResult;
    SongSearchView(Activity activity,Host host){this.activity=activity;this.host=host;view=new WebView(activity);configure();}
    @SuppressLint("SetJavaScriptEnabled") private void configure(){
        view.setTag("songSearchWeb");view.setBackgroundColor(0xff081522);
        WebSettings settings=view.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setAllowFileAccessFromFileURLs(false);settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
        view.addJavascriptInterface(bridge,"NeutiP2");
        view.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return resource(r.getUrl());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,String url){return resource(Uri.parse(url));}
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return navigate(r.getUrl(),r.hasGesture());}
            @Override public boolean shouldOverrideUrlLoading(WebView v,String url){return true;}
            @Override public void onPageFinished(WebView v,String url){if(HOME.equals(url))host.refresh();}
        });
        view.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){
                if(!HOME.equals(url)){result.cancel();return true;}
                new AlertDialog.Builder(activity).setMessage(message).setPositiveButton("확인",(d,w)->result.confirm()).setNegativeButton("취소",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
        });
        view.loadUrl(HOME);
    }
    static String assetPath(Uri uri){
        if(!"https".equals(uri.getScheme())||!"appassets.androidplatform.net".equals(uri.getHost())||uri.getPort()!=-1||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null)return null;
        String path=uri.getEncodedPath();if(path==null||!path.startsWith("/search/"))return null;
        String name=path.substring(8);return ASSETS.contains(name)?(name.startsWith("catalog-")?name:"song-search/"+name):null;
    }
    WebResourceResponse resource(Uri uri){
        String path=assetPath(uri);
        if(path!=null)try{
            String mime=path.endsWith(".html")?"text/html":path.endsWith(".js")||path.endsWith(".mjs")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".png")?"image/png":path.endsWith(".svg")?"image/svg+xml":"text/csv";
            Map<String,String> headers=new HashMap<>();headers.put("Content-Security-Policy","default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'");
            headers.put("X-Content-Type-Options","nosniff");return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,activity.getAssets().open(path));
        }catch(IOException ignored){}
        return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
    }
    private boolean navigate(Uri uri,boolean gesture){
        // External official search opens outside this privileged view; no credentials or bridge travel with it.
        if(gesture&&"https".equals(uri.getScheme())&&"www.tjmedia.com".equals(uri.getHost())&&"/song/accompaniment_search".equals(uri.getPath()))
            try{activity.startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(ActivityNotFoundException ignored){fileMessage("공식 검색 사이트를 열 브라우저가 없습니다.");}
        return true;
    }
    final class Bridge {
        @JavascriptInterface public void command(String json){if(json==null||json.length()>512)return;ui(()->handle(json));}
        @JavascriptInterface public void saveCsv(String name,String content){
            if(name==null||!name.matches("[^/\\\\]{1,80}\\.csv")||content==null||content.length()>MAX_CSV){ui(()->fileMessage("내보낼 파일이 너무 크거나 형식이 잘못되었습니다."));return;}
            ui(()->save(name,content));
        }
    }
    void handle(String json){
        try{JSONObject request=new JSONObject(json);String command=request.getString("command");
            switch(command){
                case "connection":host.connection();break;
                case "connect":host.connect();break;
                case "find":host.find();break;
                case "next":host.next();break;
                case "status":host.refresh();break;
                case "play":case "reserve":String n=request.optString("number");if(!n.matches("[1-9][0-9]{0,7}")){fileMessage("올바른 곡번호를 선택해 주세요.");host.refresh();return;}if(command.equals("play"))host.play(Integer.parseInt(n));else host.reserve(Integer.parseInt(n));break;
                case "queuePlay":case "queueCancel":
                    String number=request.optString("number"),position=request.optString("index");
                    if(!number.matches("[1-9][0-9]{0,7}")||!position.matches("0|[1-9][0-9]{0,2}")||Integer.parseInt(position)>254){fileMessage("예약 목록에서 곡을 다시 선택해 주세요.");host.refresh();return;}
                    if(command.equals("queuePlay"))host.playQueued(Integer.parseInt(number),Integer.parseInt(position));
                    else host.cancelQueued(Integer.parseInt(number),Integer.parseInt(position));break;
                case "queue":host.queue();break;
                case "cancel":host.cancel();break;
                case "voice":startVoice();break;
                case "import":pickCsv();break;
                default:break;
            }
        }catch(JSONException|NumberFormatException ignored){host.refresh();}
    }
    private void startVoice(){startVoice(this::voice);}
    boolean isVoicePending(){return voicePending;}
    void startVoice(VoiceResult result){
        if(closed||voicePending)return;voicePending=true;pendingVoiceResult=result;
        Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ko-KR");intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,5);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT,"노래 제목이나 가수를 말씀해 주세요");
        try{activity.startActivityForResult(intent,VOICE);}catch(ActivityNotFoundException|SecurityException e){finishVoice(new ArrayList<>(),"휴대폰의 음성 인식을 열 수 없습니다. 검색칸의 키보드 마이크를 이용해 주세요.");}
    }
    private void finishVoice(List<String> texts,String error){
        VoiceResult result=pendingVoiceResult;voicePending=false;pendingVoiceResult=null;
        if(!closed&&result!=null)result.received(texts,error);
    }
    private void pickCsv(){
        if(filePending)return;filePending=true;
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"text/csv","text/plain","text/tab-separated-values","application/csv"});
        try{activity.startActivityForResult(intent,IMPORT);}catch(ActivityNotFoundException e){filePending=false;fileMessage("파일 선택 앱을 열 수 없습니다.");}
    }
    private void save(String name,String content){
        if(filePending){fileMessage("먼저 열려 있는 파일 선택을 마쳐 주세요.");return;}
        if(content.getBytes(StandardCharsets.UTF_8).length>MAX_CSV){fileMessage("CSV 파일은 16MB까지 저장할 수 있습니다.");return;}
        filePending=true;exportText=content;
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("text/csv").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,name);
        try{activity.startActivityForResult(intent,EXPORT);}catch(ActivityNotFoundException e){filePending=false;exportText=null;fileMessage("파일 저장 화면을 열 수 없습니다.");}
    }
    boolean result(int request,int result,Intent data){
        if(request==VOICE){if(!voicePending)return true;
            ArrayList<String> texts=result==Activity.RESULT_OK&&data!=null?data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS):null;
            List<String> safe=new ArrayList<>();if(texts!=null)for(String s:texts){if(s!=null&&!s.trim().isEmpty()&&s.length()<=200)safe.add(s);if(safe.size()==5)break;}
            finishVoice(safe,safe.isEmpty()?(result==Activity.RESULT_CANCELED?"음성 검색을 취소했습니다.":"말소리를 듣지 못했습니다. 다시 시도해 주세요."):"");return true;
        }
        if(request!=IMPORT&&request!=EXPORT)return false;
        boolean expected=filePending;filePending=false;String text=exportText;exportText=null;if(!expected)return true;
        Uri uri=data==null?null:data.getData();
        if(result!=Activity.RESULT_OK||uri==null||!"content".equals(uri.getScheme())){fileMessage("파일 선택을 취소했습니다.");return true;}
        files.execute(()->{
            try{
                if(request==IMPORT){String csv;try(InputStream in=activity.getContentResolver().openInputStream(uri)){csv=readCsv(in);}ui(()->js("onP2NativeImport",new JSONArray().put(csv).put("")));}
                else{if(text==null)throw new IOException();try(OutputStream out=activity.getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException();out.write(text.getBytes(StandardCharsets.UTF_8));}ui(()->fileMessage("CSV 파일을 저장했습니다."));}
            }catch(IOException|RuntimeException e){ui(()->fileMessage("파일을 읽거나 저장하지 못했습니다. 16MB 이하의 UTF-8 CSV 파일인지 확인해 주세요."));}
        });return true;
    }
    static String readCsv(InputStream in)throws IOException{
        if(in==null)throw new IOException();ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;
        while((n=in.read(buffer))!=-1){if(bytes.size()+n>MAX_CSV)throw new IOException("CSV too large");bytes.write(buffer,0,n);}return bytes.toString("UTF-8");
    }
    private void voice(List<String> texts,String error){js("onP2NativeVoice",new JSONArray().put(new JSONArray(texts)).put(error));}
    private void fileMessage(String text){js("onP2NativeFile",new JSONArray().put(text));}
    void state(String label,String message,boolean busy,boolean connected){state(label,message,busy,connected,false);}
    void state(String label,String message,boolean busy,boolean connected,boolean reconnecting){
        try{JSONObject state=new JSONObject().put("label",label).put("message",message).put("busy",busy).put("connected",connected).put("reconnecting",reconnecting);js("onP2NativeState",new JSONArray().put(state));}catch(JSONException ignored){}
    }
    void queue(List<Integer> songs,String message,boolean valid){
        try{js("onP2NativeQueue",new JSONArray().put(new JSONObject().put("songs",new JSONArray(songs)).put("message",message).put("valid",valid)));}catch(JSONException ignored){}
    }
    void playback(int song,boolean known){
        boolean valid=known&&song>=0&&song<=99999999;
        try{js("onP2NativePlayback",new JSONArray().put(new JSONObject().put("number",valid?song:0).put("known",valid)));}catch(JSONException ignored){}
    }
    void openQueue(){js("onP2NativeQueueOpen",new JSONArray());}
    private void js(String function,JSONArray arguments){if(!closed)view.evaluateJavascript("window."+function+"&&window."+function+".apply(null,"+arguments.toString().replace("\u2028","\\u2028").replace("\u2029","\\u2029")+")",null);}
    private void ui(Runnable action){activity.runOnUiThread(()->{if(!closed)action.run();});}
    void close(){if(closed)return;closed=true;voicePending=false;pendingVoiceResult=null;exportText=null;files.shutdownNow();view.removeJavascriptInterface("NeutiP2");view.destroy();}
}
