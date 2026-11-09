package kr.neutinamu.p2;

import java.io.*;
import java.net.*;
import java.util.Arrays;
import java.util.List;
import java.util.Collections;

/** One live connection; never retries a play/cancel command automatically. */
public final class Session implements Closeable {
    public enum State { AUTH, IDENTIFY, READY, PLAY, CANCEL, PAUSE, RESERVE, QUEUE, ADVANCE_QUEUE, ADVANCE_MOVE, ADVANCE_CONFIRM, ADVANCE_STOP, ADVANCE_RECHECK, ADVANCE_PLAY, ADVANCE_VERIFY, REMOVE_QUEUE, REMOVE_SEND, REMOVE_VERIFY, CLOSED }
    public interface Listener {
        void changed(State state,String message);
        default void frame(boolean outgoing,int command,int bodyLength,Long scalar) {}
        default void queue(List<Integer> songs,String message,boolean valid) {}
        default void playback(int song,boolean known) {}
        default void personalSong(int song) {}
    }
    private final Socket socket;private final CaptureProfile profile;private final Listener listener;
    private State state=State.AUTH;private long deadline,lastReceived;private int wanted;
    private final int commandTimeoutMs,idleTimeoutMs;
    private boolean playReply;private int reservedSong;
    private enum QueueAction { NEXT, SELECTED, SEARCH }
    private QueueAction queueAction;private int selectedQueueIndex;
    private Wire.QueueSnapshot expectedQueue;
    private Wire.QueueSnapshot lastQueue,removeBefore;private int removeSong,removeIndex;
    private int playingSong;private boolean playbackKnown;
    private final java.util.Set<Integer> ownReservations=new java.util.HashSet<>();
    private long playbackRevision,personalRevision=-1;
    public Session(Socket socket,CaptureProfile profile,Listener listener)throws IOException {
        this(socket,profile,listener,10000,60000);
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
                        if(advancing()){
                            advanceFailed("[N11] 예약곡 실행 단계의 응답을 확인하지 못했습니다. 반주기 화면과 최신 예약 목록을 확인해 주세요. 자동 재전송하지 않습니다.");continue;
                        }
                        if(removing()){
                            removalFailed("[R21] 예약 취소 결과를 확인하지 못했습니다. 중복 요청을 피하려면 목록을 새로고침해 주세요. 자동 재전송하지 않습니다.");continue;
                        }
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
        else if((f.code==4000||f.code==4100||f.code==4210)&&f.body.length==4)scalar=Wire.u32(f.body,0);
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
        Integer reportedSong=null;
        if(f.code==4300){
            try{reportedSong=Wire.playingSong(f);updatePlayback(reportedSong,reportedSong>0);}
            catch(IOException invalid){updatePlayback(0,false);}
        }
        // Observe every authenticated notification, including commands from another remote.
        // A play request or its acceptance never substitutes for a reported playing song.
        if(f.code==4100&&f.bodyType()==1&&Arrays.equals(f.body,Wire.integer(12)))updatePlayback(0,true);
        if(state==State.REMOVE_SEND&&f.code==4210){
            if(f.bodyType()==9&&f.body.length==4&&Wire.u32(f.body,0)==100){
                change(State.REMOVE_VERIFY,"예약 취소 응답을 받았습니다. 남은 목록을 확인합니다…");write(Wire.queue());
            }else removalFailed("[R22] 반주기가 예약 취소를 승인하지 않았습니다. 목록을 새로고침해 주세요.");
            return;
        }
        if(state==State.ADVANCE_MOVE&&f.code==4210){
            if(f.bodyType()==9&&f.body.length==4&&Wire.u32(f.body,0)==100){
                change(State.ADVANCE_CONFIRM,"선택한 예약곡의 순서 변경 응답을 받았습니다. 실제 목록을 확인합니다…");write(Wire.queue());
            }else advanceFailed("[N16] 예약 순서 변경을 확인하지 못했습니다. 곡을 시작하지 않았습니다. 목록을 새로고침해 주세요.");
            return;
        }
        if(state==State.ADVANCE_STOP&&f.code==4100){
            if(f.bodyType()==1&&Arrays.equals(f.body,Wire.integer(12))){
                change(State.ADVANCE_RECHECK,"정지 응답을 받았습니다. 시작 전 예약 순서를 다시 확인합니다…");write(Wire.queue());
            }else if(f.bodyType()==3||f.bodyType()==9)advanceFailed("[N13] 정지 요청을 확인하지 못해 다음 시작 명령을 보내지 않았습니다.");
            return;
        }
        if(state==State.ADVANCE_PLAY){
            if(f.code==4100){
                if(f.bodyType()==3||(f.bodyType()==9&&(scalar==null||scalar!=100))){advanceFailed("[N14] 반주기가 시작 요청을 승인하지 않았습니다. 반주기 화면을 확인해 주세요.");return;}
                listener.changed(state,"예약곡 시작 응답을 받았습니다. "+wanted+"번 재생 확인을 기다립니다…");return;
            }
            if(reportedSong!=null&&reportedSong>0&&reportedSong==wanted){
                personalSong(wanted);
                change(State.ADVANCE_VERIFY,"P2에서 "+wanted+"번 재생 상태를 받았습니다. 남은 예약 순서를 확인합니다…");write(Wire.queue());return;
            }
        }
        if(state==State.PAUSE&&f.code==4100){
            if(f.bodyType()==1&&Arrays.equals(f.body,Wire.integer(25)))
                change(State.READY,"일시정지·계속 요청의 응답을 받았습니다. 다시 누르면 상태가 바뀝니다. 반주기 화면과 소리를 확인해 주세요.");
            else if(f.bodyType()==3||f.bodyType()==9)
                change(State.READY,"[S13] 반주기가 일시정지·계속 요청을 승인하지 않았습니다. 반주기 화면을 확인하세요. 자동 재전송하지 않습니다.");
            return;
        }
        if(f.code==4200||f.code==4220){
            List<Integer> songs;Wire.QueueSnapshot snapshot;
            try{snapshot=Wire.queueSnapshot(f);songs=snapshot.songs;}catch(IOException invalid){
                lastQueue=null;
                String message="[Q12] 예약 목록을 확인하지 못했습니다. 새로고침을 눌러 주세요.";
                listener.queue(Collections.emptyList(),message,false);
                if(removing()&&f.code==4200){removalFailed("[R25] 예약 목록을 확인하지 못해 취소 처리를 멈췄습니다. 목록을 새로고침해 주세요.");return;}
                if(advancing()&&f.code==4200){advanceFailed("[N12] 예약 목록을 확인하지 못해 후속 실행을 중단했습니다. 반주기 화면과 목록을 확인해 주세요.");return;}
                if(state==State.QUEUE){reservedSong=0;change(State.READY,message);}return;
            }
            lastQueue=snapshot;
            String message="P2 예약곡 "+songs.size()+"곡 · 반주기에서 받은 순서입니다.";
            if(state==State.QUEUE&&reservedSong>0&&songs.contains(reservedSong)){
                ownReservations.add(reservedSong);message=reservedSong+"번이 P2 예약 목록에 있습니다. · 총 "+songs.size()+"곡";
            }
            listener.queue(songs,message,true);
            if(f.code==4200&&removing()){
                if(state==State.REMOVE_QUEUE){
                    if(!removeBefore.sameOrder(snapshot)){
                        clearRemoval();change(State.READY,"[R23] 예약 목록이 바뀌어 취소하지 않았습니다. 최신 목록에서 다시 선택해 주세요.");return;
                    }
                    change(State.REMOVE_SEND,removeSong+"번 예약 취소 요청 중…");
                    write(Wire.removeReserved(songs.size(),removeSong,removeIndex));return;
                }
                if(state==State.REMOVE_VERIFY){
                    if(removeBefore.without(removeIndex).sameOrder(snapshot))ownReservations.remove(removeSong);
                    String result=removeBefore.without(removeIndex).sameOrder(snapshot)?
                        removeSong+"번 예약 취소 완료 · 남은 예약 "+songs.size()+"곡":
                        "[R24] 취소 응답은 받았지만 남은 목록이 예상과 다릅니다. 표시된 반주기 목록을 확인해 주세요.";
                    clearRemoval();change(State.READY,result);return;
                }
            }
            if(f.code==4200&&advancing()){
                if(state==State.ADVANCE_QUEUE){
                    if(songs.isEmpty()){
                        if(queueAction==QueueAction.SEARCH){int fallback=wanted;clearAdvance();change(State.READY,"예약곡이 없어 선택한 곡을 실행합니다…");play(fallback);}
                        else{clearAdvance();change(State.READY,"예약곡이 없습니다. 노래를 찾아 먼저 예약해 주세요. 현재 곡은 정지하지 않았습니다.");}
                        return;
                    }
                    if(queueAction==QueueAction.SELECTED&&(selectedQueueIndex>=songs.size()||songs.get(selectedQueueIndex)!=wanted)){
                        clearAdvance();change(State.READY,"[N15] 예약 순서가 바뀌었습니다. 갱신된 목록에서 곡을 다시 눌러 주세요. 현재 곡은 정지하지 않았습니다.");return;
                    }
                    expectedQueue=snapshot;
                    if(queueAction==QueueAction.SELECTED&&selectedQueueIndex>0){
                        expectedQueue=snapshot.moveToFront(selectedQueueIndex);
                        change(State.ADVANCE_MOVE,"선택한 예약곡을 먼저 실행하도록 순서를 준비합니다…");
                        write(Wire.moveReserved(songs.size(),wanted,selectedQueueIndex,0));return;
                    }
                    wanted=songs.get(0);stopForQueue();return;
                }
                if(state==State.ADVANCE_CONFIRM||state==State.ADVANCE_RECHECK){
                    if(!expectedQueue.sameOrder(snapshot)){
                        clearAdvance();change(State.READY,"[N17] 예약 순서가 예상과 달라 시작을 멈췄습니다. 최신 목록에서 다시 선택해 주세요.");return;
                    }
                    if(state==State.ADVANCE_CONFIRM){stopForQueue();return;}
                    change(State.ADVANCE_PLAY,"첫 번째 예약곡 "+wanted+"번을 실행합니다…");write(Wire.next());return;
                }
                if(state==State.ADVANCE_VERIFY){
                    String result=expectedQueue.withoutFirst().sameOrder(snapshot)?
                        wanted+"번 재생 확인 · 실행한 항목이 예약에서 빠졌습니다. 남은 "+songs.size()+"곡은 예약 순서대로 진행합니다.":
                        "[N18] 곡 재생은 확인했으나 남은 예약 목록이 예상과 다릅니다. 표시된 반주기 목록을 확인해 주세요.";
                    clearAdvance();change(State.READY,result);return;
                }
            }
            if(state==State.QUEUE){reservedSong=0;change(State.READY,message);}
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
        if(state==State.PLAY&&reportedSong!=null&&reportedSong>0&&reportedSong==wanted){
            personalSong(wanted);change(State.READY,"P2에서 "+wanted+"번 재생 상태를 받았습니다. 실제 화면과 소리를 확인해 주세요.");
        }
        else if(state==State.CANCEL&&f.code==4100&&f.bodyType()==1&&Arrays.equals(f.body,Wire.integer(12)))
            change(State.READY,"정지 응답을 받았습니다. 반주기 화면과 소리를 확인해 주세요.");
    }
    public synchronized void play(int song)throws IOException {
        if(state!=State.READY)throw new IOException("연결 준비 또는 이전 명령 처리를 기다려 주세요.");
        byte[] packet=Wire.play(song);wanted=song;playReply=false;change(State.PLAY,"[P00] "+song+"번 시작 요청 중…");
        try{write(packet);}catch(IOException e){fail("전송 결과를 확인하지 못했습니다. 자동 재전송하지 않습니다.");throw e;}
    }
    public synchronized void cancel()throws IOException {
        if(state!=State.READY&&state!=State.PLAY&&state!=State.QUEUE)throw new IOException("P2 연결 상태를 확인해 주세요.");
        reservedSong=0;
        change(State.CANCEL,"현재 곡 정지 요청 중…");
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
    public synchronized void cancelQueued(int song,int index)throws IOException {
        if(song<1||song>99999999||index<0||index>254)throw new IllegalArgumentException("Invalid queue selection");
        if(state!=State.READY)throw new IOException("이전 명령의 응답을 기다려 주세요.");
        if(lastQueue==null||index>=lastQueue.songs.size()||lastQueue.songs.get(index)!=song)
            throw new IOException("예약 목록을 새로고침한 뒤 다시 선택해 주세요.");
        removeBefore=lastQueue;removeSong=song;removeIndex=index;
        change(State.REMOVE_QUEUE,"취소 전 최신 예약 목록을 확인합니다…");
        try{write(Wire.queue());}catch(IOException e){fail("예약 취소 요청의 전송 결과를 확인하지 못했습니다. 자동 재전송하지 않습니다.");throw e;}
    }
    private boolean removing(){return state==State.REMOVE_QUEUE||state==State.REMOVE_SEND||state==State.REMOVE_VERIFY;}
    private void clearRemoval(){removeBefore=null;removeSong=0;removeIndex=0;}
    private void removalFailed(String message){clearRemoval();lastQueue=null;listener.queue(Collections.emptyList(),message,false);change(State.READY,message);}
    /** One explicit tap is one transaction; each dependent command requires the previous response. */
    public synchronized void next()throws IOException { advance(QueueAction.NEXT,0,0); }
    /** Search-screen Start respects the actual queue; only an empty queue uses the selected song. */
    public synchronized void startInOrder(int song)throws IOException {
        if(song<1||song>99999999)throw new IllegalArgumentException("Invalid song number");
        advance(QueueAction.SEARCH,song,0);
    }
    public synchronized void playQueued(int song,int index)throws IOException {
        if(song<1||song>99999999||index<0||index>254)throw new IllegalArgumentException("Invalid queue selection");
        advance(QueueAction.SELECTED,song,index);
    }
    private void advance(QueueAction action,int song,int index)throws IOException {
        if(state!=State.READY)throw new IOException("연결 준비 또는 이전 명령 처리를 기다려 주세요.");
        queueAction=action;expectedQueue=null;wanted=song;selectedQueueIndex=index;reservedSong=0;
        change(State.ADVANCE_QUEUE,"최신 예약 순서를 확인합니다…");
        try{write(Wire.queue());}catch(IOException e){fail("예약 목록 요청을 보내지 못했습니다. 곡 시작 명령은 보내지 않았습니다.");throw e;}
    }
    private boolean advancing(){return state.name().startsWith("ADVANCE_");}
    private void clearAdvance(){queueAction=null;expectedQueue=null;}
    private void stopForQueue()throws IOException {
        change(State.ADVANCE_STOP,"현재 곡을 정지한 뒤 예약곡 "+wanted+"번을 시작합니다…");write(Wire.cancel());
    }
    private void advanceFailed(String message){clearAdvance();listener.queue(Collections.emptyList(),message,false);change(State.READY,message);}
    private void updatePlayback(int song,boolean known){
        if(playingSong==song&&playbackKnown==known)return;
        playingSong=song;playbackKnown=known;++playbackRevision;listener.playback(song,known);
        if(known&&song>0&&ownReservations.remove(song))personalSong(song);
    }
    private void personalSong(int song){
        if(!playbackKnown||playingSong!=song||personalRevision==playbackRevision)return;
        personalRevision=playbackRevision;ownReservations.remove(song);listener.personalSong(song);
    }
    private synchronized void fail(String message){if(state==State.CLOSED)return;state=State.CLOSED;ownReservations.clear();clearAdvance();clearRemoval();lastQueue=null;updatePlayback(0,false);try{socket.close();}catch(IOException ignored){}listener.changed(state,message);}
    @Override public void close(){fail("연결을 해제했습니다.");}
}
