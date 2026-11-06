package kr.neutinamu.p2;

import java.io.StringReader;
import java.util.*;
import java.util.concurrent.CancellationException;
import org.junit.Test;
import static org.junit.Assert.*;

public class SongCatalogTest {
    @Test public void allResultsCanBePagedWithoutMissingOrRepeatingSongs()throws Exception{
        SongCatalog catalog=new SongCatalog();StringBuilder csv=new StringBuilder("number,title,artist\n");
        for(int i=1;i<=65;i++)csv.append(i).append(",사랑 ").append(i).append(",가수\n");
        catalog.load(new StringReader(csv.toString()));Set<Integer> seen=new LinkedHashSet<>();
        for(int offset:new int[]{0,30,60}){SongCatalog.Page page=catalog.page("사랑",offset,30);assertEquals(65,page.total);
            for(SongCatalog.Song song:page.songs)assertTrue(seen.add(song.number));assertEquals(offset<60,page.hasNext());}
        assertEquals(65,seen.size());assertEquals(5,catalog.page("사랑",60,30).songs.size());
    }
    @Test public void songNumberWinsOverATitleThatLooksLikeANumber()throws Exception{
        SongCatalog c=new SongCatalog();c.load(new StringReader("1,10909,가수\n2,꿈,다른가수\n10909,꿈,원가수\n3,꿈속,가수\n"));
        assertEquals(10909,c.page("10909",0,1).songs.get(0).number);
        assertEquals(Arrays.asList(2,10909,3),numbers(c.page("꿈",0,30)));
    }
    @Test public void titleAndSingerCanBeTypedInEitherOrderIncludingUnicodeSpaces()throws Exception{
        SongCatalog c=new SongCatalog();c.load(new StringReader("1,꿈,조용필\n2,꿈,다른가수\n3,เพลงไทย,นักร้อง\n4,Tiếng Việt,Trịnh\n"));
        assertEquals(1,c.search("조용필 꿈",30).get(0).number);assertEquals(1,c.search("꿈\u00a0조용필",30).get(0).number);
        assertEquals(3,c.search("นักร้อง เพลงไทย",30).get(0).number);
        assertEquals(4,c.search("Trịnh Tiếng Việt",30).get(0).number);assertTrue(c.search("꿈 없는가수",30).isEmpty());
    }
    @Test public void catalogUpdateReplacesOldTitleForDirectNumberEntry()throws Exception{
        SongCatalog c=new SongCatalog();c.load(new StringReader("1,Old,Artist\n"));c.load(new StringReader("1,New,Artist\n"));
        assertEquals(1,c.size());assertEquals("New",c.byNumber(1).title);assertTrue(c.search("Old",30).isEmpty());assertNull(c.byNumber(2));
    }
    @Test public void emptyPagesAndInvalidBoundsAreHandled()throws Exception{
        SongCatalog c=new SongCatalog();c.load(new StringReader("1,꿈,가수\n"));
        assertEquals(0,c.page("\u00a0  ",0,30).total);assertFalse(c.page("없음",0,30).hasNext());
        assertEquals(1,c.page("꿈",99,30).offset);assertTrue(c.page("꿈",99,30).songs.isEmpty());
        assertEquals(1,c.page("꿈",0,Integer.MAX_VALUE).songs.size());
        for(int[] pair:new int[][]{{-1,30},{0,0},{0,-1}})try{c.page("꿈",pair[0],pair[1]);fail();}catch(IllegalArgumentException expected){}
    }
    @Test public void cancelledSearchStopsInsteadOfDelayingNewSearch()throws Exception{
        SongCatalog c=new SongCatalog();c.load(new StringReader("1,꿈,가수\n"));Thread.currentThread().interrupt();
        try{c.page("꿈",0,30);fail();}catch(CancellationException expected){}finally{Thread.interrupted();}
    }
    private List<Integer> numbers(SongCatalog.Page page){List<Integer> n=new ArrayList<>();for(SongCatalog.Song song:page.songs)n.add(song.number);return n;}
}
