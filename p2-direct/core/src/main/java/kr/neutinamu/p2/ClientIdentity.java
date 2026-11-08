package kr.neutinamu.p2;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.Locale;

/** Experimental guest protocol identifier. Never changes a radio MAC or bypasses P2 approval. */
public final class ClientIdentity {
    private ClientIdentity() { }
    public interface Source { String read() throws IOException; }
    public static final class Unavailable extends IOException { }
    public static final class Selection {
        public final String value;
        public final boolean anonymous;
        private Selection(String value, boolean anonymous) { this.value=value;this.anonymous=anonymous; }
    }
    public static boolean valid(String value) {
        return value!=null && value.matches("(?i)[0-9a-f]{2}(?::[0-9a-f]{2}){5}") &&
            !value.equalsIgnoreCase("02:00:00:00:00:00") && !value.equals("00:00:00:00:00:00") &&
            (Integer.parseInt(value.substring(0,2),16)&1)==0;
    }
    public static boolean anonymous(String value) {
        return valid(value) && (Integer.parseInt(value.substring(0,2),16)&3)==2;
    }
    public static String generate(SecureRandom random) {
        byte[] bytes=new byte[6];String value;
        do {
            random.nextBytes(bytes);bytes[0]=(byte)((bytes[0]&0xfc)|2);
            StringBuilder out=new StringBuilder();
            for(byte part:bytes){if(out.length()>0)out.append(':');out.append(String.format(Locale.ROOT,"%02X",part&255));}
            value=out.toString();
        } while(!anonymous(value));
        return value;
    }
    public static Selection resolve(Source current, boolean roomGuest, Source installed) throws IOException {
        try {
            String value=current.read();
            if(valid(value))return new Selection(value.toUpperCase(Locale.ROOT),false);
        } catch(Unavailable|SecurityException hiddenByPlatform) {
            // Android can withhold a local address. Do not read hidden APIs, reuse
            // another phone's address, or change the authenticated staff protocol.
        }
        if(!roomGuest)throw new Unavailable();
        String value=installed.read();
        if(!anonymous(value))throw new IOException("Invalid application client identifier");
        return new Selection(value.toUpperCase(Locale.ROOT),true);
    }
}
