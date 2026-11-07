package kr.neutinamu.p2;

import java.io.*;
import java.util.*;
import java.text.Normalizer;

/** Existing repository CSV catalog, read offline; no new song source or cloud service. */
public final class SongCatalog {
    public static final class Song {
        public final int number;public final String title,artist;private final String hay,titleKey;
        Song(int n,String t,String a){number=n;title=t;artist=a;titleKey=normalize(t);hay=normalize(t+" "+a);}
    }
    public static final class Page {
        public final List<Song> songs;public final int total,offset;
        Page(List<Song> songs,int total,int offset){this.songs=Collections.unmodifiableList(songs);this.total=total;this.offset=offset;}
        public boolean hasNext(){return offset+songs.size()<total;}
    }
    private static final java.util.regex.Pattern SPACE=java.util.regex.Pattern.compile("[\\s\\p{Z}]+");
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
    public Song byNumber(int number){return songs.get(number);}
    private static String normalize(String s){return SPACE.matcher(Normalizer.normalize(s,Normalizer.Form.NFC).toLowerCase(Locale.ROOT)).replaceAll("");}
    public List<Song> search(String query,int limit) {
        return page(query,0,limit).songs;
    }
    public Page page(String query,int offset,int limit) {
        if(offset<0||limit<1)throw new IllegalArgumentException("Invalid page");
        String q=normalize(query);if(q.isEmpty())return new Page(new ArrayList<>(),0,0);
        List<String> terms=new ArrayList<>();for(String part:SPACE.split(query)){String term=normalize(part);if(!term.isEmpty())terms.add(term);}
        java.util.regex.Pattern initial=initialPattern(q);List<java.util.regex.Pattern> termPatterns=new ArrayList<>();
        for(String term:terms)termPatterns.add(initialPattern(term));
        List<Song> numbers=new ArrayList<>(),exact=new ArrayList<>(),rest=new ArrayList<>();
        for(Song s:songs.values()){
            if(Thread.currentThread().isInterrupted())throw new java.util.concurrent.CancellationException();
            if(String.valueOf(s.number).equals(q))numbers.add(s);
            else if(s.titleKey.equals(q))exact.add(s);
            else if(s.hay.contains(q)||containsAll(s.hay,terms,termPatterns)||(initial!=null&&initial.matcher(s.hay).find()))rest.add(s);
        }
        numbers.addAll(exact);numbers.addAll(rest);int start=Math.min(offset,numbers.size());
        int end=start+(int)Math.min((long)limit,numbers.size()-start);
        return new Page(new ArrayList<>(numbers.subList(start,end)),numbers.size(),start);
    }
    private static boolean containsAll(String text,List<String> terms,List<java.util.regex.Pattern> patterns){
        for(int i=0;i<terms.size();i++)if(!text.contains(terms.get(i))&&(patterns.get(i)==null||!patterns.get(i).matcher(text).find()))return false;return true;
    }
    private static java.util.regex.Pattern initialPattern(String query){
        String initials="ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";StringBuilder pattern=new StringBuilder();boolean found=false;
        for(char c:query.toCharArray()){
            int i=c>=0x1100&&c<=0x1112?c-0x1100:initials.indexOf(c);
            if(i>=0){found=true;pattern.append('[').append((char)(0xac00+i*588)).append('-').append((char)(0xac00+(i+1)*588-1)).append(']');}
            else pattern.append(java.util.regex.Pattern.quote(String.valueOf(c)));
        }
        return found?java.util.regex.Pattern.compile(pattern.toString()):null;
    }
}
