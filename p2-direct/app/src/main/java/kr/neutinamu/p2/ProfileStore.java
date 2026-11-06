package kr.neutinamu.p2;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.Arrays;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** One encrypted template, confined to this installation and excluded from backup. */
final class ProfileStore {
    private static final String ALIAS="p2-profile-v1";
    private static final byte[] HEADER="P2ENC01".getBytes(StandardCharsets.US_ASCII);
    interface Keys { SecretKey get() throws GeneralSecurityException,IOException; }
    private final AtomicFile file;private final Keys keys;
    ProfileStore(Context context){this(new File(context.getNoBackupFilesDir(),"connection.enc"),ProfileStore::androidKey);}
    ProfileStore(File path,Keys keys){file=new AtomicFile(path);this.keys=keys;}
    boolean exists(){return file.getBaseFile().exists()||new File(file.getBaseFile()+".bak").exists();}
    private static SecretKey androidKey()throws GeneralSecurityException,IOException {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return (SecretKey)store.getKey(ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    synchronized void save(CaptureProfile profile)throws IOException,GeneralSecurityException {
        byte[] plain=profile.storageBytes();byte[] sealed;
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        try{cipher.init(Cipher.ENCRYPT_MODE,keys.get());cipher.updateAAD(HEADER);sealed=cipher.doFinal(plain);}
        finally{Arrays.fill(plain,(byte)0);}
        byte[] iv=cipher.getIV();if(iv.length!=12)throw new GeneralSecurityException("Invalid IV length");
        FileOutputStream out=null;
        try{out=file.startWrite();out.write(HEADER);out.write(iv);out.write(sealed);file.finishWrite(out);}
        catch(IOException|RuntimeException e){if(out!=null)file.failWrite(out);throw e;}
    }
    synchronized CaptureProfile load()throws IOException,GeneralSecurityException {
        if(!exists())return null;
        // Bound input before allocating or accessing the Keystore.
        byte[] bytes;
        try(InputStream in=file.openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[256];int n;
            while((n=in.read(buffer))!=-1){if(out.size()+n>256)throw new IOException("Saved profile is too large");out.write(buffer,0,n);}
            bytes=out.toByteArray();
        }
        if(bytes.length<HEADER.length+12+16||!Arrays.equals(HEADER,Arrays.copyOf(bytes,HEADER.length)))
            throw new IOException("Invalid encrypted profile");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,keys.get(),new GCMParameterSpec(128,bytes,HEADER.length,12));
        cipher.updateAAD(HEADER);byte[] plain=cipher.doFinal(bytes,HEADER.length+12,bytes.length-HEADER.length-12);
        try{return CaptureProfile.fromStorage(plain);}finally{Arrays.fill(plain,(byte)0);}
    }
    synchronized void clear()throws IOException {
        file.delete();if(exists())throw new IOException("Saved profile could not be deleted");
    }
}
