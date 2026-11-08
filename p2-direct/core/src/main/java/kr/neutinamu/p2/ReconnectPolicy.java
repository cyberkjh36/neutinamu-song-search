package kr.neutinamu.p2;

/** Bounded recovery of a previously verified room. Never chooses rooms or replays controls. */
public final class ReconnectPolicy {
    private static final int[] DELAYS={1500,4000,9000};
    private String room;private boolean verified;private int attempts;private long connectedAt=-1;
    public void start(String selectedRoom){cancel();if(selectedRoom!=null&&selectedRoom.matches("[1-9][0-9]{0,2}"))room=selectedRoom;}
    public String room(){return room;}
    public int attempts(){return attempts;}
    public void connected(String selectedRoom,long now){if(room!=null&&room.equals(selectedRoom)){verified=true;connectedAt=now;}}
    public int retry(String message,long now){
        if(room==null||!verified)return -1;
        if(message==null||!message.matches("^\\[(N01|N02|N03|N10|N11|N12|N14|W21|W26)\\].*")){cancel();return -1;}
        // Short connect/drop loops share one budget. Only a minute of actual connection resets it.
        if(connectedAt>=0&&now-connectedAt>=60000)attempts=0;
        connectedAt=-1;
        return attempts<DELAYS.length?DELAYS[attempts++]:-1;
    }
    public void cancel(){room=null;verified=false;attempts=0;connectedAt=-1;}
}
