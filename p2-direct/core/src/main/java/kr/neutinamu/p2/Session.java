package kr.neutinamu.p2;

import java.io.*;
import java.net.*;
import java.util.Arrays;
import java.util.List;
import java.util.Collections;

/** One live connection; never retries a play/cancel command automatically. */
public final class Session implements Closeable {
    public enum State { AUTH, IDENTIFY, READY, PLAY, CANCEL, PAUSE, RESERVE, QUEUE, CLOSED }
    public interface Listener {
        void changed(State state,String message);
        default void frame(boolean outgoing,int command,int bodyLength,Long scalar) {}
        default void queue(List<Integer> songs,String message,boolean valid) {}
    }
    private final Socket socket;private final CaptureProfile profile;private final Listener listener;
    private State state=State.AUTH;private long deadline,lastReceived;private int wanted;
    private final int commandTimeoutMs,idleTimeoutMs;
    private boolean playReply;private int reservedSong;
    public Session(Socket socket,CaptureProfile profile,Listener listener)throws IOException {
        this(socket,profile,listener,10000,30000);
    }
    Session(Socket socket,CaptureProfile profile,Listener listener,int commandTimeoutMs,int idleTimeoutMs)throws IOException {
        this.socket=socket;this.profile=profile;this.listener=listener;
        this.commandTimeoutMs=commandTimeoutMs;this.idleTimeoutMs=idleTimeoutMs;
        socket.setSoTimeout(250);socket.setTcpNoDelay(true);
    }
    private static long now(){return System.nanoTime()/1000000;}
    public synchronized State state(){return state;}
    private void change(State s,String text){state=s;deadline=now()+commandTimeoutMs;listener.changed(s,text);}
    private void write(byte[] frame)throws IOException{
        socket.getOutputStream().write(profile.packet(frame));socket.getOutputStream().flush();
        listener.frame(true,(int)Wire.u32(frame,0),frame.length-16,null);
    }
    public void run() {
        try {
            synchronized(this){if(state==State.CLOSED)return;lastReceived=now();change(State.AUTH,"P2의 연결 응답을 기다립니다…");write(profile.registration());}
            Wire.Decoder decoder=new Wire.Decoder();byte[] buf=new byte[8192];
            while(state()!=State.CLOSED) {
                try {
                    int n=socket.getInputStream().read(buf);if(n<0){decoder.finish();throw new EOFException();}
                    for(Wire.Frame frame:decoder.feed(buf,n))receive(frame);
                } catch(SocketTimeoutException expected) { /* Decoder preserves partial data. */ }
                synchronized(this) {
                    long t=now();
                    if(state==State.CLOSED)break;
                    if(t-lastReceived>idleTimeoutMs){fail("[N01] P2의 연결 유지 응답이 없어 연결을 종료했습니다.");break;}
                    if(state!=State.READY&&t>deadline) {
                        if(state==State.AUTH){fail("[A02] P2에 접속했지만 초기 연결 응답이 없습니다.");break;}
                        if(state==State.IDENTIFY){fail("[I02] 초기 응답은 받았지만 반주기 확인 응답이 없습니다.");break;}
                        if(state==State.RESERVE||state==State.QUEUE){
                            String message=state==State.RESERVE?"[R11] 예약 응답을 받지 못했습니다. 중복 예약을 피하려면 예약 목록을 먼저 확인하세요. 자동 재전송하지 않습니다.":"[Q11] 예약 목록 응답을 받지 못했습니다. 새로고침을 눌러 다시 확인하세요.";
                            reservedSong=0;listener.queue(Collections.emptyList(),message,false);change(State.READY,message);continue;
                        }
                        if(state==State.PAUSE){change(State.READY,"[S11] 일시정지·계속 응답을 받지 못했습니다. 반주기 화면을 확인하세요. 자동 재전송하지 않습니다.");continue;}
                        String code=state==State.CANCEL?"C11":playReply?"P11":"P12";
                        String detail=state==State.CANCEL?"취소 응답이 없습니다.":playReply?"시작 요청 응답은 받았지만 곡 재생 확인은 받지 못했습니다.":"시작 요청에 대한 응답이 없습니다.";
                        change(State.READY,"["+code+"] 응답 시간 초과: "+detail+" 반주기 화면을 확인하세요. 자동 재전송하지 않습니다.");
                    }
                }
            }
        }catch(EOFException e){fail("[N02] P2가 통신 연결을 닫았습니다.");}
        catch(IOException|RuntimeException e) {fail("[N03] 통신 중 오류로 연결을 종료했습니다. 진단 결과를 공유해 주세요.");}
    }
    private synchronized void receive(Wire.Frame f)throws IOException {
        if(state==State.CLOSED)return;lastReceived=now();
        Long scalar=null;
        if(f.code==3000&&(f.body.length==1||f.body.length==4))scalar=f.body.length==1?(long)(f.body[0]&255):Wire.u32(f.body,0);
        else if((f.code==4000||f.code==4100)&&f.body.length==4)scalar=Wire.u32(f.body,0);
        listener.frame(false,f.code,f.body.length,scalar);
        if(f.code==1000&&f.body.length==0){write(Wire.heartbeat());return;}
        if(state==State.AUTH&&f.code==3000) {
            if(f.bodyType()!=1||f.body.length!=1){
                fail("[A01] P2 초기 연결이 완료되지 않았습니다. 응답종류="+f.bodyType()+", 길이="+f.body.length+"바이트, 응답값="+(scalar==null?"형식 미확인":scalar)+". 아래 ‘진단 결과 공유’를 눌러 알려 주세요.");return;
            }
            // This byte is a user colour/slot identifier, not a zero-only status code.
            change(State.IDENTIFY,"사용자 식별값을 받았습니다. 연결된 반주기를 확인합니다…");write(Wire.info());return;
        }
        if(state==State.IDENTIFY&&f.code==3100) {
            if(f.bodyType()!=1||!profile.matchesIdentity(f.body)){fail("[I01] 기록과 반주기 식별정보가 다릅니다. 곡 시작 명령은 보내지 않았습니다.");return;}
            change(State.READY,"[READY] P2 연결 응답 확인 · 곡을 선택한 뒤 시작을 누르세요.");return;
        }
        if(state==State.AUTH||state==State.IDENTIFY)return;
        if(state==State.PAUSE&&f.code==4100){
            if(f.bodyType()==1&&Arrays.equals(f.body,Wire.integer(25)))
                change(State.READY,"일시정지·계속 요청의 응답을 받았습니다. 다시 누르면 상태가 바뀝니다. 반주기 화면과 소리를 확인해 주세요.");
            else if(f.bodyType()==3||f.bodyType()==9)
                change(State.READY,"[S13] 반주기가 일시정지·계속 요청을 승인하지 않았습니다. 반주기 화면을 확인하세요. 자동 재전송하지 않습니다.");
            return;
        }
        if(f.code==4200||f.code==4220){
            try{
                List<Integer> songs=Wire.queueSongs(f);
                String message="P2 예약곡 "+songs.size()+"곡 · 반주기에서 받은 순서입니다.";
                if(state==State.QUEUE&&reservedSong>0&&songs.contains(reservedSong))message=reservedSong+"번이 P2 예약 목록에 있습니다. · 총 "+songs.size()+"곡";
                listener.queue(songs,message,true);
                if(state==State.QUEUE){reservedSong=0;change(State.READY,message);}
            }catch(IOException invalid){
                String message="[Q12] 예약 목록을 확인하지 못했습니다. 새로고침을 눌러 주세요.";
                listener.queue(Collections.emptyList(),message,false);
                if(state==State.QUEUE){reservedSong=0;change(State.READY,message);}
            }
            return;
        }
        if(state==State.RESERVE&&f.code==4000){
            if((f.bodyType()==1&&scalar!=null&&scalar==2)||(f.bodyType()==9&&scalar!=null&&scalar==100)){
                change(State.QUEUE,"예약 요청 응답을 받았습니다. P2 예약 목록을 확인합니다…");write(Wire.queue());
            }else{
                reservedSong=0;String message="[R13] 반주기가 예약 요청을 승인하지 않았거나 응답 형식을 확인할 수 없습니다. 예약 목록을 확인하세요. 자동 재전송하지 않습니다.";
                listener.queue(Collections.emptyList(),message,false);change(State.READY,message);
            }
            return;
        }
        // 4000/2 is only observed acceptance; never display playback success for it.
        if(state==State.PLAY&&f.code==4000){
            if(f.bodyType()==3||(f.bodyType()==9&&(scalar==null||scalar!=100))){
                change(State.READY,"[P13] 반주기가 시작 요청에 오류 또는 안내를 보냈습니다. 응답값="+(scalar==null?"형식 미확인":scalar)+". 자동 재전송하지 않습니다.");return;
            }
            playReply=true;
            // Progress must not reset the command deadline or imply playback success.
            listener.changed(state,"[P10] 시작 요청 응답을 받았습니다. 응답값="+(scalar==null?"형식 미확인":scalar)+" · 실제 재생 확인을 기다립니다…");
        }
        if(state==State.PLAY&&f.code==4300&&f.bodyType()==1&&f.body.length==5&&Wire.u32(f.body,0)==wanted)
            change(State.READY,"P2에서 "+wanted+"번 재생 상태를 받았습니다. 실제 화면과 소리를 확인해 주세요.");
        else if(state==State.CANCEL&&f.code==4100&&f.bodyType()==1&&Arrays.equals(f.body,Wire.integer(12)))
            change(State.READY,"취소 응답을 받았습니다. 반주기에서 노래가 멈췄는지 확인해 주세요.");
    }
    public synchronized void play(int song)throws IOException {
        if(state!=State.READY)throw new IOException("연결 준비 또는 이전 명령 처리를 기다려 주세요.");
        byte[] packet=Wire.play(song);wanted=song;playReply=false;change(State.PLAY,"[P00] "+song+"번 시작 요청 중…");
        try{write(packet);}catch(IOException e){fail("전송 결과를 확인하지 못했습니다. 자동 재전송하지 않습니다.");throw e;}
    }
    public synchronized void cancel()throws IOException {
        if(state!=State.READY&&state!=State.PLAY&&state!=State.QUEUE)throw new IOException("P2 연결 상태를 확인해 주세요.");
        reservedSong=0;
        change(State.CANCEL,"현재 곡 취소 요청 중…");
        try{write(Wire.cancel());}catch(IOException e){fail("취소 결과를 확인하지 못했습니다.");throw e;}
    }
    public synchronized void pause()throws IOException {
        if(state!=State.READY)throw new IOException("연결 준비 또는 이전 명령 처리를 기다려 주세요.");
        change(State.PAUSE,"일시정지·계속 요청 중…");
        try{write(Wire.pause());}catch(IOException e){fail("일시정지·계속 전송 결과를 확인하지 못했습니다. 자동 재전송하지 않습니다.");throw e;}
    }
    public synchronized void reserve(int song)throws IOException {
        if(state!=State.READY)throw new IOException("연결 준비 또는 이전 명령 처리를 기다려 주세요.");
        byte[] packet=Wire.reserve(song);reservedSong=song;change(State.RESERVE,song+"번 예약 요청 중…");
        try{write(packet);}catch(IOException e){fail("예약 전송 결과를 확인하지 못했습니다. 자동 재전송하지 않습니다.");throw e;}
    }
    public synchronized void requestQueue()throws IOException {
        if(state!=State.READY)throw new IOException("이전 명령의 응답을 기다려 주세요.");
        reservedSong=0;change(State.QUEUE,"P2 예약 목록을 불러오는 중…");
        try{write(Wire.queue());}catch(IOException e){fail("예약 목록 요청을 보내지 못했습니다.");throw e;}
    }
    private synchronized void fail(String message){if(state==State.CLOSED)return;state=State.CLOSED;try{socket.close();}catch(IOException ignored){}listener.changed(state,message);}
    @Override public void close(){fail("연결을 해제했습니다.");}
}
