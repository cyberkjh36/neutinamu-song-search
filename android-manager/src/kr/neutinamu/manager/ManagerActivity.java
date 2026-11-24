package kr.neutinamu.manager;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.JsPromptResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Locale;

public class ManagerActivity extends Activity {
    private static final String HOST = "cyberkjh36.github.io";
    private static final String ROOT = "/neutinamu-song-search/";
    private static final int AUDIO = 41, IMPORT = 42, EXPORT = 43;
    private WebView web;
    private String entry;
    private SpeechRecognizer recognizer;
    private int voiceId;
    private String voiceLanguage;
    private ValueCallback<Uri[]> importResult;
    private String exportText;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        boolean p2 = getPackageName().endsWith(".p2");
        entry = ROOT + (p2 ? "p2wifi" : "wk") + "/manager.html";
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(244,246,239));
        FrameLayout frame = new FrameLayout(this);
        frame.addView(web);
        if (Build.VERSION.SDK_INT >= 35 && getApplicationInfo().targetSdkVersion >= 35) {
            frame.setOnApplyWindowInsetsListener((v, i) -> {
                android.graphics.Insets pad = i.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(pad.left, pad.top, pad.right, pad.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(frame);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return appResource(request);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                if (!request.isForMainFrame()) return true;
                if (isEntry(uri)) return false;
                if (request.hasGesture() && "https".equals(uri.getScheme())) {
                    try {startActivity(new Intent(Intent.ACTION_VIEW,uri));} catch(ActivityNotFoundException ignored) {}
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsPrompt(WebView view,String url,String name,String value,JsPromptResult result) {
                Uri origin=Uri.parse(url);
                if (!"https".equals(origin.getScheme()) || !HOST.equals(origin.getEncodedAuthority()) || !isEntry(Uri.parse(view.getUrl()==null?"":view.getUrl()))) return false;
                if (!"neuti-manager-voice".equals(name) && !"neuti-manager-export".equals(name)) return false;
                boolean accepted=false;
                try {
                    JSONObject msg=new JSONObject(value);
                    if ("neuti-manager-voice".equals(name)) accepted=voiceRequest(msg);
                    else accepted=exportCsv(msg);
                } catch(JSONException ignored) {}
                result.confirm(accepted?"ok":"");return true;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if(importResult!=null)importResult.onReceiveValue(null);
                importResult=callback;
                Intent choose=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try {startActivityForResult(choose,IMPORT);} catch(ActivityNotFoundException e){importResult=null;callback.onReceiveValue(null);}
                return true;
            }
        });
        web.loadUrl("https://"+HOST+entry);
    }
    private boolean isEntry(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getEncodedAuthority()) && entry.equals(uri.getPath());
    }
    private WebResourceResponse appResource(WebResourceRequest request) {
        Uri uri=request.getUrl();
        if(!"GET".equals(request.getMethod()) || !"https".equals(uri.getScheme()) || !HOST.equals(uri.getEncodedAuthority())) return null;
        String path=uri.getPath();
        if(path==null || !path.startsWith(ROOT))return null;
        String asset=path.substring(ROOT.length());
        if(asset.contains("..")||asset.contains("\\")||asset.startsWith("/")||asset.endsWith("/sw.js"))return missing();
        if(asset.equals("catalog-updates.json") || asset.startsWith("data/favorites/"))return null;
        try {
            InputStream stream=getAssets().open("site/"+asset);
            String type=asset.endsWith(".html")?"text/html":asset.endsWith(".js")||asset.endsWith(".mjs")?"text/javascript":
                asset.endsWith(".css")?"text/css":asset.endsWith(".webmanifest")?"application/manifest+json":
                asset.endsWith(".json")?"application/json":asset.endsWith(".csv")?"text/csv":
                asset.endsWith(".png")?"image/png":asset.endsWith(".svg")?"image/svg+xml":"application/octet-stream";
            return new WebResourceResponse(type,type.startsWith("image/")?null:"UTF-8",200,"OK",
                Collections.singletonMap("Content-Security-Policy","frame-src 'none'"),stream);
        } catch (FileNotFoundException e) {return null;}
          catch (IOException e) {return missing();}
    }
    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
    }
    private boolean exportCsv(JSONObject msg) throws JSONException {
        if(exportText!=null)return false;
        String name=msg.getString("name"),data=msg.getString("text");
        if(!name.toLowerCase(Locale.ROOT).endsWith(".csv")||name.contains("/")||name.contains("\\")||data.length()>16000000)return false;
        exportText=data;
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("text/csv").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,name);
        try {startActivityForResult(intent,EXPORT);return true;} catch(ActivityNotFoundException e){exportText=null;return false;}
    }
    @Override protected void onActivityResult(int code,int result,Intent data) {
        super.onActivityResult(code,result,data);
        Uri uri=result==RESULT_OK && data!=null ? data.getData() : null;
        if(code==IMPORT && importResult!=null){importResult.onReceiveValue(uri==null?null:new Uri[]{uri});importResult=null;}
        if(code==EXPORT){
            String text=exportText;exportText=null;
            if(uri!=null && text!=null)new Thread(()->{
                try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){
                    if(out==null)throw new IOException();out.write(text.getBytes(StandardCharsets.UTF_8));
                } catch(IOException|SecurityException e){runOnUiThread(()->Toast.makeText(this,"파일을 저장하지 못했습니다.",Toast.LENGTH_LONG).show());}
            }).start();
        }
    }
    private boolean voiceRequest(JSONObject msg) throws JSONException {
        int id=msg.getInt("id");String op=msg.getString("op");
        if("start".equals(op)){
            if(id<=0 || voiceId!=0)return false;
            voiceId=id;voiceLanguage=msg.optString("lang","ko-KR");
            if(!voiceLanguage.matches("[A-Za-z]{2,3}(-[A-Za-z]{2,4})?"))voiceLanguage="ko-KR";
            web.post(()->{
                if(voiceId!=id)return;
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},AUDIO);
                else listen(id);
            });return true;
        }
        if(id!=voiceId)return false;
        if("cancel".equals(op)){endVoice();return true;}
        if("stop".equals(op) && recognizer!=null){recognizer.stopListening();return true;}
        return false;
    }
    @Override public void onRequestPermissionsResult(int code,String[] names,int[] grants) {
        super.onRequestPermissionsResult(code,names,grants);
        if(code!=AUDIO || voiceId==0)return;
        if(grants.length>0 && grants[0]==PackageManager.PERMISSION_GRANTED)listen(voiceId);
        else voiceError(voiceId,"not-allowed");
    }
    private void listen(final int id) {
        if(!SpeechRecognizer.isRecognitionAvailable(this)){voiceError(id,"service-not-allowed");return;}
        try {
            recognizer=SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new RecognitionListener(){
                public void onReadyForSpeech(Bundle b){emit(id,"start",null,null);}
                public void onBeginningOfSpeech(){emit(id,"speechstart",null,null);}
                public void onEndOfSpeech(){emit(id,"audioend",null,null);}
                public void onRmsChanged(float rms){} public void onBufferReceived(byte[] b){} public void onEvent(int event,Bundle b){}
                public void onError(int code){
                    String error=code==SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS?"not-allowed":
                        code==SpeechRecognizer.ERROR_NO_MATCH||code==SpeechRecognizer.ERROR_SPEECH_TIMEOUT?"no-speech":
                        code==SpeechRecognizer.ERROR_NETWORK||code==SpeechRecognizer.ERROR_NETWORK_TIMEOUT?"network":"audio-capture";
                    voiceError(id,error);
                }
                public void onPartialResults(Bundle b){deliver(id,b,false);}
                public void onResults(Bundle b){deliver(id,b,true);}
            });
            Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE,voiceLanguage).putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,5)
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true);
            recognizer.startListening(intent);
        }catch(RuntimeException e){voiceError(id,"audio-capture");}
    }
    private void deliver(int id,Bundle b,boolean done){
        if(id!=voiceId)return;
        ArrayList<String> words=b==null?null:b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if(done && (words==null||words.isEmpty())){voiceError(id,"no-speech");return;}
        emit(id,done?"final":"partial",words,null);if(done)endVoice();
    }
    private void voiceError(int id,String reason){if(id!=voiceId)return;emit(id,"error",null,reason);endVoice();}
    private void emit(int id,String type,ArrayList<String> words,String error) {
        if(id!=voiceId || web==null)return;
        JSONObject event=new JSONObject();
        try{event.put("id",id).put("type",type).put("words",words==null?new JSONArray():new JSONArray(words)).put("error",error);}
        catch(JSONException e){return;}
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('neuti-voice',{detail:"+event+"}))",null);
    }
    private void endVoice(){voiceId=0;if(recognizer!=null){recognizer.destroy();recognizer=null;}}
    @Override protected void onStop(){if(voiceId!=0)voiceError(voiceId,"aborted");super.onStop();}
    @Override public void onBackPressed(){
        web.evaluateJavascript("(function(){var d=document.querySelector('dialog[open]');if(d){var e=new Event('cancel',{cancelable:true});if(d.dispatchEvent(e)&&d.open)d.close();return true;}return false;})()",v->{
            if(!"true".equals(v))new AlertDialog.Builder(this).setMessage("리모컨을 닫을까요?").setPositiveButton("닫기",(d,w)->finish()).setNegativeButton("계속 사용",null).show();
        });
    }
    @Override protected void onDestroy(){endVoice();if(web!=null){web.destroy();web=null;}super.onDestroy();}
}
