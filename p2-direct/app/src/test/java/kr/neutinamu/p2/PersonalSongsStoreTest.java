package kr.neutinamu.p2;
import org.junit.*;
import static org.junit.Assert.*;
import org.junit.runner.RunWith;
import org.junit.rules.TemporaryFolder;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import java.io.*;
import java.nio.file.Files;
import org.json.JSONArray;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={29,35})
public class PersonalSongsStoreTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    @Test public void recordsSurviveReopeningWithoutDuplicatesAndSortByLastPlay()throws Exception{
        File file=new File(folder.getRoot(),"one.json");PersonalSongsStore store=new PersonalSongsStore(file);
        store.record(914,1000);store.record(10909,2000);store.record(914,3000);
        JSONArray rows=new PersonalSongsStore(file).list();assertEquals(2,rows.length());
        assertEquals(914,rows.getJSONObject(0).getInt("number"));assertEquals(3000,rows.getJSONObject(0).getLong("lastPlayed"));
        assertEquals(10909,rows.getJSONObject(1).getInt("number"));
    }
    @Test public void phonesHaveSeparateListsAndRemovingOneSongPreservesOthers()throws Exception{
        PersonalSongsStore first=new PersonalSongsStore(new File(folder.getRoot(),"one")),second=new PersonalSongsStore(new File(folder.getRoot(),"two"));
        first.record(914,1000);first.record(10909,2000);assertEquals(0,second.list().length());
        second.record(47050,3000);first.remove(914);assertEquals(10909,first.list().getJSONObject(0).getInt("number"));
        assertEquals(47050,second.list().getJSONObject(0).getInt("number"));
    }
    @Test public void historyUsesAppPrivateNoBackupDirectory()throws Exception{
        android.content.Context context=RuntimeEnvironment.getApplication();PersonalSongsStore store=new PersonalSongsStore(context);
        store.record(914,1000);File file=new File(context.getNoBackupFilesDir(),"personal-songs-v1.json");assertTrue(file.isFile());
        String text=new String(Files.readAllBytes(file.toPath()),"UTF-8");assertTrue(text.contains("914"));assertFalse(text.contains("http"));
    }
    @Test public void damagedExistingFileIsNotSilentlyOverwritten()throws Exception{
        File file=folder.newFile();byte[] bad="not json".getBytes("UTF-8");Files.write(file.toPath(),bad);
        try{new PersonalSongsStore(file).record(914,1000);fail();}catch(IOException expected){}
        assertArrayEquals(bad,Files.readAllBytes(file.toPath()));
    }
    @Test public void invalidSongsAndStorageFailureAreReported()throws Exception{
        PersonalSongsStore store=new PersonalSongsStore(new File(folder.getRoot(),"good"));
        for(int number:new int[]{0,-1,100000000})try{store.record(number,1000);fail();}catch(IllegalArgumentException expected){}
        File parent=folder.newFile();try{new PersonalSongsStore(new File(parent,"child")).record(914,1000);fail();}catch(IOException expected){}
    }
}
