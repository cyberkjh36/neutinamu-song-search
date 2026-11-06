package kr.neutinamu.p2;

import java.io.*;
import java.nio.file.Files;
import java.util.Arrays;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={29,35})
public class ProfileStoreTest {
    @Rule public TemporaryFolder temporary=new TemporaryFolder();
    static final SecretKey KEY=new SecretKeySpec(new byte[32],"AES");
    static CaptureProfile sample()throws IOException {
        byte[] body=new byte[47];System.arraycopy(new byte[]{'T','J','A','A'},0,body,0,4);
        System.arraycopy("SYNTHETIC".getBytes("US-ASCII"),0,body,12,9);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(bytes);
        out.writeInt(0x50325001);byte[] host="192.168.49.1".getBytes("US-ASCII");out.writeByte(host.length);out.write(host);
        out.write(Wire.encode(3000,new byte[]{1,0,0,0,0,4,0,1},body));out.writeByte(20);out.write(new byte[20]);
        return CaptureProfile.fromStorage(bytes.toByteArray());
    }
    @Test public void restartRestoresEncryptedProfileWithFreshIv()throws Exception {
        File path=new File(temporary.getRoot(),"connection.enc");ProfileStore first=new ProfileStore(path,()->KEY);
        assertNull(first.load());CaptureProfile profile=sample();first.save(profile);byte[] a=Files.readAllBytes(path.toPath());
        assertFalse(new String(a,"ISO-8859-1").contains("SYNTHETIC"));assertFalse(new String(a,"ISO-8859-1").contains(profile.host));
        ProfileStore restarted=new ProfileStore(path,()->KEY);assertArrayEquals(profile.registration(),restarted.load().registration());
        assertEquals(profile.host,restarted.load().host);restarted.save(profile);assertFalse(Arrays.equals(a,Files.readAllBytes(path.toPath())));
        restarted.clear();assertFalse(restarted.exists());assertNull(new ProfileStore(path,()->KEY).load());
    }
    @Test public void tamperingOrWrongKeyNeverLoadsAProfile()throws Exception {
        File path=new File(temporary.getRoot(),"connection.enc");ProfileStore store=new ProfileStore(path,()->KEY);store.save(sample());
        byte[] valid=Files.readAllBytes(path.toPath());
        for(int position:new int[]{0,8,valid.length-1}){
            byte[] corrupt=valid.clone();corrupt[position]^=1;Files.write(path.toPath(),corrupt);
            try{store.load();fail("tampering accepted");}catch(IOException|java.security.GeneralSecurityException expected){}
        }
        Files.write(path.toPath(),valid);byte[] other=new byte[32];other[0]=1;
        try{new ProfileStore(path,()->new SecretKeySpec(other,"AES")).load();fail("wrong key");}catch(java.security.GeneralSecurityException expected){}
    }
    @Test public void failedKeyAccessPreservesPreviouslySavedProfile()throws Exception {
        File path=new File(temporary.getRoot(),"connection.enc");ProfileStore store=new ProfileStore(path,()->KEY);store.save(sample());
        byte[] before=Files.readAllBytes(path.toPath());
        try{new ProfileStore(path,()->{throw new java.security.KeyStoreException();}).save(sample());fail();}catch(java.security.KeyStoreException expected){}
        assertArrayEquals(before,Files.readAllBytes(path.toPath()));assertArrayEquals(sample().registration(),store.load().registration());
    }
    @Test public void oversizedAndTruncatedFilesAreRejectedBeforeUse()throws Exception {
        File path=new File(temporary.getRoot(),"connection.enc");ProfileStore store=new ProfileStore(path,()->KEY);store.save(sample());byte[] valid=Files.readAllBytes(path.toPath());
        for(int length=0;length<valid.length;length++){
            Files.write(path.toPath(),Arrays.copyOf(valid,length));
            try{store.load();fail("truncated accepted "+length);}catch(IOException|java.security.GeneralSecurityException expected){}
        }
        Files.write(path.toPath(),new byte[257]);
        try{new ProfileStore(path,()->{throw new AssertionError("must reject before key access");}).load();fail();}catch(IOException expected){}
    }
}
