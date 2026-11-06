package kr.neutinamu.p2;

import java.util.ArrayDeque;

/** No payloads, addresses, phone numbers, MACs, profile identity or exception messages. */
public final class Diagnostics {
    private final ArrayDeque<String> lines=new ArrayDeque<>();
    private final long started=System.nanoTime();
    public synchronized void event(String code){
        if(!code.matches("[A-Z0-9_ -]{1,64}"))throw new IllegalArgumentException("Use a fixed diagnostic code");
        add(code);
    }
    public synchronized void frame(boolean outgoing,int command,int length,Long scalar){
        // Only numeric single-value responses may enter a report. Never log a raw body.
        boolean allowed=!outgoing&&((command==3000&&(length==1||length==4))||((command==4000||command==4100)&&length==4));
        add((outgoing?"TX":"RX")+" cmd="+command+" bytes="+length+(allowed&&scalar!=null?" value="+scalar:""));
    }
    private void add(String text){
        while(lines.size()>=48)lines.removeFirst();
        lines.addLast(((System.nanoTime()-started)/1000000)+"ms "+text);
    }
    public synchronized String report(){return "P2 연결진단 0.2\n개인정보·인증값·주소·원본 패킷은 포함하지 않습니다.\n"+String.join("\n",lines);}
}
