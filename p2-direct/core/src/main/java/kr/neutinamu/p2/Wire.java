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
    /** Playback notification: LE song number + one opaque option byte. Zero has no song title. */
    public static int playingSong(Frame frame)throws IOException {
        if(frame.code!=4300||frame.bodyType()!=1||frame.body.length!=5)throw new IOException("Invalid playback notification");
        long song=u32(frame.body,0);
        if(song>99999999)throw new IOException("Invalid playing song");
        return (int)song;
    }
    /** 4200: count + 9-byte entries; 4220: 7-byte update metadata, then the same list. */
    public static List<Integer> queueSongs(Frame frame)throws IOException {
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
        return java.util.Collections.unmodifiableList(songs);
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
