package kr.neutinamu.p2;

import java.io.*;
import java.util.*;
import java.text.Normalizer;

/** Existing repository CSV catalog, read offline; no new song source or cloud service. */
public final class SongCatalog {
    public static final class Song {
        public final int number;public final String title,artist;private final String hay;
        Song(int n,String t,String a){number=n;title=t;artist=a;hay=normalize(t+" "+a);}
    }
    private final Map<Integer,Song> songs=new LinkedHashMap<>();
    public void load(Reader reader)throws IOException {
        PushbackReader in=new PushbackReader(new BufferedReader(reader),1);
        List<String> row=new ArrayList<>();StringBuilder field=new StringBuilder();boolean quote=false;int c;
        while((c=in.read())!=-1) {
            if(c==0xfeff&&row.isEmpty()&&field.length()==0)continue;
            if(c=='"') {
                if(quote){int next=in.read();if(next=='"')field.append('"');else{quote=false;if(next!=-1)in.unread(next);}}
                else if(field.length()==0)quote=true;else field.append('"');
            } else if(!quote&&(c==','||c=='\n'||c=='\r')) {
                row.add(field.toString());field.setLength(0);
                if(c!=','){add(row);row.clear();if(c=='\r'){int next=in.read();if(next!='\n'&&next!=-1)in.unread(next);}}
            } else field.append((char)c);
        }
        if(quote)throw new IOException("Unclosed CSV quote");
        if(field.length()>0||!row.isEmpty()){row.add(field.toString());add(row);}
    }
    private void add(List<String> row) {
        if(row.size()<3)return;
        try{int n=Integer.parseInt(row.get(0).trim());String title=row.get(1).trim();if(n>0&&n<=99999999&&!title.isEmpty())songs.put(n,new Song(n,title,row.get(2).trim()));}catch(NumberFormatException ignored){}
    }
    public int size(){return songs.size();}
    private static String normalize(String s){return Normalizer.normalize(s,Normalizer.Form.NFC).toLowerCase(Locale.ROOT).replaceAll("\\s+","");}
    public List<Song> search(String query,int limit) {
        List<Song> exact=new ArrayList<>(),rest=new ArrayList<>();String q=normalize(query.trim());if(q.isEmpty())return exact;
        for(Song s:songs.values()){
            if(String.valueOf(s.number).equals(q)||normalize(s.title).equals(q))exact.add(s);
            else if(s.hay.contains(q)&&rest.size()<limit)rest.add(s);
        }
        exact.addAll(rest);return new ArrayList<>(exact.subList(0,Math.min(limit,exact.size())));
    }
}
