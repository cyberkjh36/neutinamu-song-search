package kr.neutinamu.p2;

import org.junit.*;
import static org.junit.Assert.*;
import org.junit.runner.RunWith;
import org.junit.rules.TemporaryFolder;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import java.io.*;
import java.nio.charset.StandardCharsets;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={29,35})
public class GuestIdentityStoreTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    @Test public void identitySurvivesStoreAndActivityRecreation()throws Exception {
        File file=new File(folder.getRoot(),"phone-one");
        String first=new GuestIdentityStore(file).get();
        assertTrue(ClientIdentity.anonymous(first));
        assertEquals(first,new GuestIdentityStore(file).get());
        assertEquals(first,new GuestIdentityStore(file).get());
        assertEquals(17,file.length());
    }
    @Test public void distinctInstallationsAreNotGivenASharedConstant()throws Exception {
        String one=new GuestIdentityStore(new File(folder.getRoot(),"one")).get();
        String two=new GuestIdentityStore(new File(folder.getRoot(),"two")).get();
        assertNotEquals(one,two);
    }
    @Test public void runtimeStorageUsesNoBackupDirectory()throws Exception {
        android.content.Context context=RuntimeEnvironment.getApplication();
        String value=new GuestIdentityStore(context).get();
        File file=new File(context.getNoBackupFilesDir(),"guest-client-id-v1");
        assertTrue(file.exists());assertTrue(ClientIdentity.anonymous(value));
    }
    @Test public void corruptionIsReportedInsteadOfSendingAChangedOrSharedIdentifier()throws Exception {
        for(String value:new String[]{"bad","02:00:00:00:00:00","00:11:22:33:44:55","02:12:34:56:78:9Aextra"}) {
            File file=folder.newFile();
            try(FileOutputStream out=new FileOutputStream(file)){out.write(value.getBytes(StandardCharsets.US_ASCII));}
            try{new GuestIdentityStore(file).get();fail();}catch(IOException expected){}
        }
    }
    @Test public void storageFailureDoesNotReturnAnUnpersistedIdentifier()throws Exception {
        File parent=folder.newFile();
        try{new GuestIdentityStore(new File(parent,"child")).get();fail();}catch(IOException expected){}
    }
}
