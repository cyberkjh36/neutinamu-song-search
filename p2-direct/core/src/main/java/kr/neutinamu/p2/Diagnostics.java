package kr.neutinamu.p2;

import java.util.ArrayDeque;

/** No payloads, addresses, phone numbers, MACs, profile identity or exception messages. */
public final class Diagnostics {
    private final ArrayDeque<String> lines=new ArrayDeque<>();
    private final long started=System.nanoTime();
    private final String version;private final int sdk;
    public Diagnostics(){this("development",-1);}
    public Diagnostics(String version,int sdk){
        if(version==null||!version.matches("[A-Za-z0-9._-]{1,64}")||sdk < -1||sdk > 1000)throw new IllegalArgumentException("Invalid build information");
        this.version=version;this.sdk=sdk;
    }
    private long heartbeatRx,heartbeatTx,lastHeartbeatRx=-1,lastHeartbeatTx=-1;
    private long attempts,verified,lastFailureMs=-1;
    private String firstFailure="NONE",lastFailure="NONE";
    public synchronized void status(String message){
        java.util.regex.Matcher m=java.util.regex.Pattern.compile("^\\[([A-Z][0-9]{2})\\]").matcher(message);
        if(m.find()){
            String code=m.group(1);
            failure(code);
            event("REASON_"+code);
        }
    }
    public synchronized void event(String code){
        if(!code.matches("[A-Z0-9_ -]{1,64}"))throw new IllegalArgumentException("Use a fixed diagnostic code");
        if(code.equals("CONNECT_STARTED"))attempts++;
        if(code.equals("CONNECTION_VERIFIED"))verified++;
        failure(code);
        add(code);
    }
    private void failure(String code){
        if(code.matches("A0[123]|I0[12]|N0[123]|N1[0-4]")){
            if(firstFailure.equals("NONE"))firstFailure=code;lastFailure=code;lastFailureMs=elapsed();
        }
    }
    public synchronized void frame(boolean outgoing,int command,int length,Long scalar){
        // Repeated idle traffic must not evict the user's start/cancel evidence.
        if(command==1000){
            if(outgoing){heartbeatTx++;lastHeartbeatTx=elapsed();}
            else{heartbeatRx++;lastHeartbeatRx=elapsed();}
            return;
        }
        // Only numeric single-value responses may enter a report. Never log a raw body.
        boolean allowed=!outgoing&&((command==3000&&(length==1||length==4))||((command==4000||command==4100)&&length==4));
        add((outgoing?"TX":"RX")+" cmd="+command+" bytes="+length+(allowed&&scalar!=null?" value="+scalar:""));
    }
    private void add(String text){
        while(lines.size()>=48)lines.removeFirst();
        lines.addLast(elapsed()+"ms "+text);
    }
    private long elapsed(){return (System.nanoTime()-started)/1000000;}
    public synchronized String report(){return "느티나무노래방 전용 리모컨 "+version+" · ANDROID_SDK="+sdk+"\n개인정보·인증값·주소·원본 패킷은 포함하지 않습니다.\n"+
        "UPTIME_MS="+elapsed()+"\nHEARTBEAT_RX="+heartbeatRx+" LAST_RX_MS="+lastHeartbeatRx+
        "\nHEARTBEAT_TX="+heartbeatTx+" LAST_TX_MS="+lastHeartbeatTx+
        "\nCONNECTION_ATTEMPTS="+attempts+" VERIFIED="+verified+" FIRST_FAILURE="+firstFailure+" LAST_FAILURE="+lastFailure+" LAST_FAILURE_MS="+lastFailureMs+"\n"+String.join("\n",lines);}
}
