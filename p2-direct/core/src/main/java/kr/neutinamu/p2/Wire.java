package kr.neutinamu.p2;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Legacy frame layout checked against the user's capture and uploaded Android client. */
public final class Wire {
    public static final int MAX_BODY = 1024 * 1024;
    private static final byte[] NORMAL = {1,0,0,0,0,4,0,1};
    private static final byte[] INFO = {1,0,0,0,0,4,0,0};
    private static final byte[] PLAY = {2,0,0,0,0,4,0,1};
    private static final byte[] KEEP = {1,0,0,0,0,4,1,9};
    private Wire() {}
    public static long u32(byte[] b, int o) {
        return (b[o]&255L)|((b[o+1]&255L)<<8)|((b[o+2]&255L)<<16)|((b[o+3]&255L)<<24);
    }
    static void put32(byte[] b, int o, long n) { for(int i=0;i<4;i++) b[o+i]=(byte)(n >>> (8*i)); }
    public static byte[] integer(long n) { byte[] b=new byte[4];put32(b,0,n);return b; }
    public static byte[] encode(int code, byte[] control, byte[] body) {
        if(code<0||control.length!=8||body.length>MAX_BODY) throw new IllegalArgumentException("Invalid frame");
        byte[] b=new byte[16+body.length];put32(b,0,code);System.arraycopy(control,0,b,4,8);
        put32(b,12,body.length);System.arraycopy(body,0,b,16,body.length);return b;
    }
    public static byte[] info() { return encode(3100,INFO,new byte[0]); }
    public static byte[] heartbeat() { return encode(1000,KEEP,integer(100)); }
    public static byte[] play(int song) {
        return songCommand(1200,song);
    }
    /** Normal reservation (1100), never priority reservation (1110) or start (1200). */
    public static byte[] reserve(int song) { return songCommand(1100,song); }
    private static byte[] songCommand(int key,int song) {
        // Range is a UI constraint, not a discovered protocol limit.
        if(song<1||song>99999999) throw new IllegalArgumentException("Invalid song number");
        byte[] b=new byte[9];put32(b,0,key);put32(b,4,song);return encode(4000,PLAY,b);
    }
    public static byte[] queue() { return encode(4200,INFO,new byte[0]); }
    /** Official queue order operation: current count, song, operation 3, zero-based source/destination. */
    public static byte[] moveReserved(int count,int song,int from,int to) {
        if(count<1||count>255||song<1||song>99999999||from<0||to<0||from>=count||to>=count||from==to)
            throw new IllegalArgumentException("Invalid reservation move");
        byte[] body=new byte[8];body[0]=(byte)count;put32(body,1,song);body[5]=3;body[6]=(byte)from;body[7]=(byte)to;
        return encode(4210,NORMAL,body);
    }
    /** Remove one reservation by its zero-based position, never stop the playing song. */
    public static byte[] removeReserved(int count,int song,int index) {
        if(count<1||count>255||song<1||song>99999999||index<0||index>=count)
            throw new IllegalArgumentException("Invalid reservation removal");
        byte[] body=new byte[8];body[0]=(byte)count;put32(body,1,song);body[5]=2;body[6]=(byte)index;
        return encode(4210,NORMAL,body);
    }
    /** Playback notification: LE song number + one opaque option byte. Zero has no song title. */
    public static int playingSong(Frame frame)throws IOException {
        if(frame.code!=4300||frame.bodyType()!=1||frame.body.length!=5)throw new IOException("Invalid playback notification");
        long song=u32(frame.body,0);
        if(song>99999999)throw new IOException("Invalid playing song");
        return (int)song;
    }
    /** 4200: count + 9-byte entries; 4220: 7-byte update metadata, then the same list. */
    public static List<Integer> queueSongs(Frame frame)throws IOException {
        return queueSnapshot(frame).songs;
    }
    public static QueueSnapshot queueSnapshot(Frame frame)throws IOException {
        int offset=frame.code==4200?0:frame.code==4220?7:-1;
        if(offset<0||frame.bodyType()!=1||frame.body.length<=offset)throw new IOException("Invalid queue response");
        int count=frame.body[offset]&255;
        if(frame.body.length!=offset+1+count*9)throw new IOException("Invalid queue size");
        List<Integer> songs=new ArrayList<>();
        for(int i=0;i<count;i++){
            long song=u32(frame.body,offset+1+i*9);
            if(song<1||song>99999999)throw new IOException("Invalid queue song");
            songs.add((int)song);
        }
        return new QueueSnapshot(songs,Arrays.copyOfRange(frame.body,offset+1,frame.body.length));
    }
    /** Retains opaque per-entry bytes so equal song numbers do not hide a changed reservation. */
    public static final class QueueSnapshot {
        public final List<Integer> songs;private final byte[] entries;
        private QueueSnapshot(List<Integer> songs,byte[] entries){this.songs=java.util.Collections.unmodifiableList(new ArrayList<>(songs));this.entries=entries.clone();}
        public boolean sameOrder(QueueSnapshot other){return other!=null&&Arrays.equals(entries,other.entries);}
        public QueueSnapshot moveToFront(int index){
            if(index<0||index>=songs.size())throw new IllegalArgumentException("Invalid queue index");
            List<Integer> order=new ArrayList<>(songs);order.add(0,order.remove(index));byte[] moved=entries.clone();
            System.arraycopy(entries,index*9,moved,0,9);System.arraycopy(entries,0,moved,9,index*9);
            return new QueueSnapshot(order,moved);
        }
        public QueueSnapshot withoutFirst(){
            if(songs.isEmpty())throw new IllegalStateException("Empty queue");
            return new QueueSnapshot(songs.subList(1,songs.size()),Arrays.copyOfRange(entries,9,entries.length));
        }
        public QueueSnapshot without(int index){
            if(index<0||index>=songs.size())throw new IllegalArgumentException("Invalid queue index");
            List<Integer> remaining=new ArrayList<>(songs);remaining.remove(index);
            byte[] kept=new byte[entries.length-9];System.arraycopy(entries,0,kept,0,index*9);
            System.arraycopy(entries,(index+1)*9,kept,index*9,entries.length-(index+1)*9);
            return new QueueSnapshot(remaining,kept);
        }
    }
    public static byte[] cancel() { return encode(4100,NORMAL,integer(12)); }
    /** Start with no song number: use the machine's next reserved song. */
    public static byte[] next() { return encode(4100,NORMAL,integer(11)); }
    /** P2 pause/resume toggle. One explicit tap, never an automatic retry. */
    public static byte[] pause() { return encode(4100,NORMAL,integer(25)); }
    public static final class Frame {
        public final int code;
        public final byte[] control,body;
        Frame(byte[] b) { code=(int)u32(b,0);control=Arrays.copyOfRange(b,4,12);body=Arrays.copyOfRange(b,16,b.length); }
        public byte[] bytes() { return encode(code,control,body); }
        public int bodyType(){return control[7]&255;}
    }
    /** Handles arbitrary TCP boundaries without discarding a partial header on timeouts. */
    public static final class Decoder {
        private byte[] buffer=new byte[0];
        public List<Frame> feed(byte[] bytes,int count) throws IOException {
            if(count<0||count>bytes.length||buffer.length+count>MAX_BODY+16+8192) throw new IOException("Frame buffer limit");
            byte[] next=Arrays.copyOf(buffer,buffer.length+count);
            System.arraycopy(bytes,0,next,buffer.length,count);int at=0;List<Frame> frames=new ArrayList<>();
            while(next.length-at>=16) {
                long len=u32(next,at+12);
                if(len>MAX_BODY) { buffer=new byte[0];throw new IOException("Invalid frame length"); }
                int end=at+16+(int)len;if(end>next.length)break;
                frames.add(new Frame(Arrays.copyOfRange(next,at,end)));at=end;
            }
            buffer=Arrays.copyOfRange(next,at,next.length);return frames;
        }
        public void finish() throws IOException { if(buffer.length!=0)throw new IOException("Truncated frame"); }
    }
}
