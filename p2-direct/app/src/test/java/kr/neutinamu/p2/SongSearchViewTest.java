package kr.neutinamu.p2;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Looper;
import android.speech.RecognizerIntent;
import android.webkit.WebSettings;
import java.io.*;
import java.util.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={29,35})
public class SongSearchViewTest {
    private Activity activity;private SongSearchView search;private List<String> calls;
    @Before public void open(){activity=Robolectric.buildActivity(Activity.class).setup().get();calls=new ArrayList<>();search=new SongSearchView(activity,new SongSearchView.Host(){
        public void connection(){calls.add("settings");}public void connect(){calls.add("connect");}public void find(){calls.add("find");}public void next(){calls.add("next");}public void playQueued(int n,int index){calls.add("queuePlay:"+n+":"+index);}public void cancelQueued(int n,int index){calls.add("queueCancel:"+n+":"+index);}public void play(int n){calls.add("play:"+n);}public void reserve(int n){calls.add("reserve:"+n);}public void queue(){calls.add("queue");}public void cancel(){calls.add("cancel");}public void refresh(){calls.add("status");}
    });calls.clear();}
    @After public void close(){search.close();activity.finish();}
    @Test public void bridgeAcceptsOnlyExplicitKnownActionsAndStrictSongNumbers(){
        search.handle("{\"command\":\"play\",\"number\":\"10909\"}");search.handle("{\"command\":\"cancel\"}");
        assertEquals(Arrays.asList("play:10909","cancel"),calls);calls.clear();
        for(String n:new String[]{"0","-1","0010909","10909x","999999999","1.5","1e4"})search.handle("{\"command\":\"play\",\"number\":\""+n+"\"}");
        assertFalse(calls.stream().anyMatch(s->s.startsWith("play:")));
        search.handle("{\"command\":\"socket\",\"url\":\"https://example.com\"}");search.handle("not json");
        assertFalse(calls.contains("connect"));
    }
    @Test public void explicitConnectionAndNextActionsStaySeparateFromSettings(){
        for(String action:new String[]{"connect","find","next","connection"})search.handle("{\"command\":\""+action+"\"}");
        assertEquals(Arrays.asList("connect","find","next","settings"),calls);
    }
    @Test public void queueSelectionRequiresExactNumberAndBoundedIntegerPosition(){
        search.handle("{\"command\":\"queuePlay\",\"number\":\"914\",\"index\":1}");
        assertEquals(Arrays.asList("queuePlay:914:1"),calls);calls.clear();
        for(String index:new String[]{"-1","255","1.5","01","1e2","null","true"})search.handle("{\"command\":\"queuePlay\",\"number\":\"914\",\"index\":\""+index+"\"}");
        search.handle("{\"command\":\"queuePlay\",\"number\":\"914\"}");
        search.handle("{\"command\":\"queuePlay\",\"number\":\"0\",\"index\":0}");
        search.handle("{\"command\":\"pause\"}");
        assertFalse(calls.stream().anyMatch(x->x.startsWith("queuePlay:")||x.equals("pause")));
    }
    @Test public void queueCancellationRequiresExactNumberAndBoundedIntegerPosition(){
        search.handle("{\"command\":\"queueCancel\",\"number\":\"914\",\"index\":1}");
        assertEquals(Arrays.asList("queueCancel:914:1"),calls);calls.clear();
        for(String index:new String[]{"-1","255","1.5","01","1e2","null","true"})search.handle("{\"command\":\"queueCancel\",\"number\":\"914\",\"index\":\""+index+"\"}");
        search.handle("{\"command\":\"queueCancel\",\"number\":\"914\"}");
        search.handle("{\"command\":\"queueCancel\",\"number\":\"0\",\"index\":0}");
        search.handle("{\"command\":\"pause\"}");
        assertFalse(calls.stream().anyMatch(x->x.startsWith("queueCancel:")||x.equals("pause")));
    }
    @Test public void playbackDisplayIsReadOnlyAndRejectsInvalidSongNumbers(){
        search.playback(914,true);assertTrue(shadowOf(search.view).getLastEvaluatedJavascript().contains("onP2NativePlayback"));
        assertTrue(shadowOf(search.view).getLastEvaluatedJavascript().contains("\"number\":914"));assertTrue(calls.isEmpty());
        search.playback(-1,true);assertTrue(shadowOf(search.view).getLastEvaluatedJavascript().contains("\"known\":false"));
        search.playback(0,true);assertTrue(shadowOf(search.view).getLastEvaluatedJavascript().contains("\"known\":true"));assertTrue(calls.isEmpty());
    }
    @Test public void assetsCannotReadProfilesOrLoadRemoteCode()throws Exception{
        assertEquals("song-search/index.html",SongSearchView.assetPath(Uri.parse(SongSearchView.HOME)));
        assertEquals("catalog-20261018.csv",SongSearchView.assetPath(Uri.parse("https://appassets.androidplatform.net/search/catalog-20261018.csv")));
        for(String url:new String[]{"file:///data/data/private/connection.enc","content://private/secret","https://evil.com/search/index.html","https://appassets.androidplatform.net.evil.com/search/index.html","https://appassets.androidplatform.net:7070/search/index.html","https://appassets.androidplatform.net/search/../connection.enc","https://appassets.androidplatform.net/search/%2e%2e/connection.enc","https://appassets.androidplatform.net/search/index.html?q=x"}){
            assertNull(url,SongSearchView.assetPath(Uri.parse(url)));assertEquals(403,search.resource(Uri.parse(url)).getStatusCode());
        }
        assertEquals(200,search.resource(Uri.parse(SongSearchView.HOME)).getStatusCode());
        WebSettings s=search.view.getSettings();assertFalse(s.getAllowFileAccess());assertFalse(s.getAllowContentAccess());assertFalse(s.getAllowUniversalAccessFromFileURLs());
        assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW,s.getMixedContentMode());
    }
    @Test public void reservationBridgeValidatesNumbersAndOnlyExplicitQueueRequest(){
        search.handle("{\"command\":\"reserve\",\"number\":\"10909\"}");search.handle("{\"command\":\"queue\"}");
        assertEquals(Arrays.asList("reserve:10909","queue"),calls);calls.clear();
        for(String n:new String[]{"0","-1","0010909","10909x","999999999","1.5","1e4"})search.handle("{\"command\":\"reserve\",\"number\":\""+n+"\"}");
        assertFalse(calls.stream().anyMatch(s->s.startsWith("reserve:")));
        search.handle("{\"command\":\"deleteQueue\"}");assertFalse(calls.contains("queue"));
    }
    @Test public void microphoneOpensAndroidSpeechActivityOnlyOnceAndCanRetryAfterCancel(){
        search.handle("{\"command\":\"voice\"}");Intent started=shadowOf(activity).getNextStartedActivity();
        assertNotNull(started);assertEquals(RecognizerIntent.ACTION_RECOGNIZE_SPEECH,started.getAction());assertEquals("ko-KR",started.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE));
        assertEquals(5,started.getIntExtra(RecognizerIntent.EXTRA_MAX_RESULTS,0));
        search.handle("{\"command\":\"voice\"}");assertNull(shadowOf(activity).getNextStartedActivity());
        assertTrue(search.result(SongSearchView.VOICE,Activity.RESULT_CANCELED,null));
        search.handle("{\"command\":\"voice\"}");assertNotNull(shadowOf(activity).getNextStartedActivity());
        Intent result=new Intent().putStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS,new ArrayList<>(Arrays.asList("꿈","조용필 꿈")));
        search.result(SongSearchView.VOICE,Activity.RESULT_OK,result);
        assertTrue(calls.isEmpty()); // Speech never issues playback.
    }
    @Test public void importAndExportRequireDocumentPickerAndCancelClearsBusyState(){
        search.handle("{\"command\":\"import\"}");assertEquals(Intent.ACTION_OPEN_DOCUMENT,shadowOf(activity).getNextStartedActivity().getAction());
        search.result(SongSearchView.IMPORT,Activity.RESULT_CANCELED,null);
        search.bridge.saveCsv("songs.csv","곡번호,곡제목,가수\n10909,노래,가수");shadowOf(Looper.getMainLooper()).idle();
        Intent save=shadowOf(activity).getNextStartedActivity();assertEquals(Intent.ACTION_CREATE_DOCUMENT,save.getAction());assertEquals("songs.csv",save.getStringExtra(Intent.EXTRA_TITLE));
        search.result(SongSearchView.EXPORT,Activity.RESULT_CANCELED,null);
        search.bridge.saveCsv("../evil.csv","x");shadowOf(Looper.getMainLooper()).idle();assertNull(shadowOf(activity).getNextStartedActivity());
    }
    @Test public void speechResultReturnsOnlyToRequestingScreenAndNeverAfterClose(){
        List<String> received=new ArrayList<>();search.startVoice((texts,error)->received.addAll(texts));
        assertNotNull(shadowOf(activity).getNextStartedActivity());
        search.handle("{\"command\":\"voice\"}");assertNull(shadowOf(activity).getNextStartedActivity());
        Intent data=new Intent().putStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS,new ArrayList<>(Arrays.asList(null," ","사랑해")));
        search.result(SongSearchView.VOICE,Activity.RESULT_OK,data);
        assertEquals(Arrays.asList("사랑해"),received);assertFalse(search.isVoicePending());assertTrue(calls.isEmpty());
        search.result(SongSearchView.VOICE,Activity.RESULT_OK,data);assertEquals(1,received.size());
        search.startVoice((texts,error)->received.addAll(texts));search.close();
        search.result(SongSearchView.VOICE,Activity.RESULT_OK,data);assertEquals(1,received.size());
    }
    @Test public void csvReadIsUtf8AndBounded()throws Exception{
        String value="곡번호,제목,가수\n1,꿈,조용필";
        assertEquals(value,SongSearchView.readCsv(new ByteArrayInputStream(value.getBytes("UTF-8"))));
        try{SongSearchView.readCsv(new ByteArrayInputStream(new byte[SongSearchView.MAX_CSV+1]));fail();}catch(IOException expected){}
    }
    @Test public void queuedJavascriptCannotActAfterDestruction(){
        search.close();search.bridge.command("{\"command\":\"play\",\"number\":\"10909\"}");shadowOf(Looper.getMainLooper()).idle();assertTrue(calls.isEmpty());
    }
}
