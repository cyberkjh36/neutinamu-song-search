package kr.neutinamu.p2;

import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

/** Random app-scoped identifier, excluded from backup; contains no physical device address. */
final class GuestIdentityStore {
    private final AtomicFile file;
    GuestIdentityStore(Context context){this(new File(context.getNoBackupFilesDir(),"guest-client-id-v1"));}
    GuestIdentityStore(File path){file=new AtomicFile(path);}
    synchronized String get()throws IOException {
        if(file.getBaseFile().exists()||new File(file.getBaseFile()+".bak").exists()) {
            byte[] bytes=new byte[17];
            try(InputStream in=file.openRead()) {
                new DataInputStream(in).readFully(bytes);
                if(in.read()!=-1)throw new IOException("Invalid guest identifier length");
            }
            String value=new String(bytes,StandardCharsets.US_ASCII);
            if(!ClientIdentity.anonymous(value))throw new IOException("Invalid saved guest identifier");
            return value;
        }
        String value=ClientIdentity.generate(new SecureRandom());FileOutputStream out=null;
        try {
            out=file.startWrite();out.write(value.getBytes(StandardCharsets.US_ASCII));file.finishWrite(out);
        } catch(IOException|RuntimeException e) {
            if(out!=null)file.failWrite(out);throw e;
        }
        return value;
    }
}
