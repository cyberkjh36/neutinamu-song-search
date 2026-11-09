package kr.neutinamu.p2;

import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Private on-device history; no backup, identifiers, network or pending reservations. */
final class PersonalSongsStore {
    private static final int LIMIT=5000,MAX_BYTES=512*1024;
    private final AtomicFile file;
    PersonalSongsStore(Context context){this(new File(context.getNoBackupFilesDir(),"personal-songs-v1.json"));}
    PersonalSongsStore(File path){file=new AtomicFile(path);}
    synchronized JSONArray list()throws IOException {
        if(!file.getBaseFile().exists()&&!new File(file.getBaseFile()+".bak").exists())return new JSONArray();
        try(InputStream in=file.openRead();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
            byte[] buffer=new byte[4096];int n;
            while((n=in.read(buffer))!=-1){if(bytes.size()+n>MAX_BYTES)throw new IOException("History too large");bytes.write(buffer,0,n);}
            JSONArray saved=new JSONArray(bytes.toString("UTF-8"));if(saved.length()>LIMIT)throw new IOException("History too large");
            Set<Integer> seen=new HashSet<>();
            for(int i=0;i<saved.length();i++){JSONObject row=saved.getJSONObject(i);int number=row.getInt("number");long at=row.getLong("lastPlayed");if(number<1||number>99999999||at<1||!seen.add(number))throw new IOException("Invalid history");}
            return saved;
        }catch(JSONException e){throw new IOException("Invalid history",e);}
    }
    synchronized void record(int number,long at)throws IOException {
        if(number<1||number>99999999||at<1)throw new IllegalArgumentException("Invalid played song");
        JSONArray old=list(),next=new JSONArray();
        try{next.put(new JSONObject().put("number",number).put("lastPlayed",at));
            for(int i=0;i<old.length()&&next.length()<LIMIT;i++)if(old.getJSONObject(i).getInt("number")!=number)next.put(old.getJSONObject(i));
        }catch(JSONException e){throw new IOException(e);}
        save(next);
    }
    synchronized void remove(int number)throws IOException {
        JSONArray old=list(),next=new JSONArray();
        try{for(int i=0;i<old.length();i++)if(old.getJSONObject(i).getInt("number")!=number)next.put(old.getJSONObject(i));}
        catch(JSONException e){throw new IOException(e);}
        save(next);
    }
    private void save(JSONArray rows)throws IOException {
        FileOutputStream out=null;
        try{out=file.startWrite();out.write(rows.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(out);}
        catch(IOException|RuntimeException e){if(out!=null)file.failWrite(out);throw e;}
    }
}
