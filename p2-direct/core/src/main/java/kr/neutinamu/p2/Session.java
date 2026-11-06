package kr.neutinamu.p2;

import java.io.*;
import java.net.*;
import java.util.Arrays;

/** One live connection; never retries a play/cancel command automatically. */
public final class Session implements Closeable {
    public enum State { AUTH, IDENTIFY, READY, PLAY, CANCEL, CLOSED }
    public interface Listener { void changed(State state,String message); }
    private final Socket socket;private final CaptureProfile profile;private final Listener listener;
    private State state=State.AUTH;private long deadline,lastReceived;private int wanted;
    private final int commandTimeoutMs,idleTimeoutMs;
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
    private void write(byte[] frame)throws IOException{socket.getOutputStream().write(frame);socket.getOutputStream().flush();}
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
                    if(t-lastReceived>idleTimeoutMs)throw new IOException("No heartbeat");
                    if(state!=State.READY&&t>deadline) {
                        if(state==State.AUTH||state==State.IDENTIFY)throw new IOException("Handshake timeout");
                        change(State.READY,"응답 시간 초과: 결과를 확인하지 못했습니다. 반주기 화면을 확인하세요. 자동으로 다시 보내지 않습니다.");
                    }
                }
            }
        }catch(IOException|RuntimeException e) {fail("연결을 종료했습니다. P2의 Wi-Fi 연결과 공식 앱 연결 상태를 확인해 주세요.");}
    }
    private synchronized void receive(Wire.Frame f)throws IOException {
        if(state==State.CLOSED)return;lastReceived=now();
        if(f.code==1000&&f.body.length==0){write(Wire.heartbeat());return;}
        if(state==State.AUTH&&f.code==3000) {
            if(f.body.length!=1||f.body[0]!=0){fail("P2가 초기 연결을 승인하지 않았습니다. 이 기록의 연결정보를 재사용할 수 있는지 추가 확인이 필요합니다.");return;}
            change(State.IDENTIFY,"연결된 반주기를 확인합니다…");write(Wire.info());return;
        }
        if(state==State.IDENTIFY&&f.code==3100) {
            if(!profile.matchesIdentity(f.body)){fail("기록에 있는 반주기와 현재 반주기가 다릅니다. 시작 명령을 보내지 않고 연결을 해제했습니다.");return;}
            change(State.READY,"P2 연결 응답 확인 · 곡을 선택한 뒤 시작을 누르세요.");return;
        }
        // 4000/2 is only observed acceptance; never display playback success for it.
        if(state==State.PLAY&&f.code==4300&&f.body.length==5&&Wire.u32(f.body,0)==wanted)
            change(State.READY,"P2에서 "+wanted+"번 재생 상태를 받았습니다. 실제 화면과 소리를 확인해 주세요.");
        else if(state==State.CANCEL&&f.code==4100&&Arrays.equals(f.body,Wire.integer(12)))
            change(State.READY,"취소 응답을 받았습니다. 반주기에서 노래가 멈췄는지 확인해 주세요.");
    }
    public synchronized void play(int song)throws IOException {
        if(state!=State.READY)throw new IOException("연결 준비 또는 이전 명령 처리를 기다려 주세요.");
        byte[] packet=Wire.play(song);wanted=song;change(State.PLAY,song+"번 시작 요청 중…");
        try{write(packet);}catch(IOException e){fail("전송 결과를 확인하지 못했습니다. 자동 재전송하지 않습니다.");throw e;}
    }
    public synchronized void cancel()throws IOException {
        if(state!=State.READY&&state!=State.PLAY)throw new IOException("P2 연결 상태를 확인해 주세요.");
        change(State.CANCEL,"현재 곡 취소 요청 중…");
        try{write(Wire.cancel());}catch(IOException e){fail("취소 결과를 확인하지 못했습니다.");throw e;}
    }
    private synchronized void fail(String message){if(state==State.CLOSED)return;state=State.CLOSED;try{socket.close();}catch(IOException ignored){}listener.changed(state,message);}
    @Override public void close(){fail("연결을 해제했습니다.");}
}
