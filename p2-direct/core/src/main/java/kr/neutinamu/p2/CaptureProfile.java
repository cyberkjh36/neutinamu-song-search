package kr.neutinamu.p2;

import java.io.*;
import java.util.*;
import java.nio.charset.StandardCharsets;

/** Imports only local TCP/7070 registration + device identity. Never logs payloads. */
public final class CaptureProfile {
    public final String host;
    private final byte[] registration, identity;
    private CaptureProfile(String host,byte[] registration,byte[] identity) {
        this.host=host;this.registration=registration.clone();this.identity=identity.clone();
    }
    public byte[] registration() { return registration.clone(); }
    /** Sensitive bytes: callers must encrypt before persisting; never publish or log. */
    public byte[] storageBytes() throws IOException {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(bytes);
        out.writeInt(0x50325001);byte[] h=host.getBytes(StandardCharsets.US_ASCII);
        out.writeByte(h.length);out.write(h);out.write(registration);out.writeByte(identity.length);out.write(identity);
        return bytes.toByteArray();
    }
    public static CaptureProfile fromStorage(byte[] bytes) throws IOException {
        if(bytes==null||bytes.length>128)throw new IOException("Invalid saved profile");
        DataInputStream in=new DataInputStream(new ByteArrayInputStream(bytes));
        if(in.readInt()!=0x50325001)throw new IOException("Unsupported saved profile");
        int n=in.readUnsignedByte();if(n<7||n>15)throw new IOException("Invalid saved address");
        String host=new String(readExact(in,n),StandardCharsets.US_ASCII);validateHost(host);
        byte[] registration=readExact(in,63);
        if(Wire.u32(registration,0)!=3000||Wire.u32(registration,12)!=47||
            registration[16]!='T'||registration[17]!='J'||registration[18]!='A'||registration[19]!='A')
            throw new IOException("Invalid saved registration");
        int length=in.readUnsignedByte();if(length<14||length>20)throw new IOException("Invalid saved identity");
        byte[] identity=readExact(in,length);if(in.read()!=-1)throw new IOException("Unexpected saved data");
        return new CaptureProfile(host,registration,identity);
    }
    private static void validateHost(String host)throws IOException {
        if(host==null||!host.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}"))throw new IOException("Invalid local address");
        String[] parts=host.split("\\.");byte[] address=new byte[4];
        for(int i=0;i<4;i++){int value=Integer.parseInt(parts[i]);if(value>255)throw new IOException("Invalid local address");address[i]=(byte)value;}
        if(!privateIp(address,0))throw new IOException("A private P2 address is required");
    }
    /** Refresh the phone address for this radio connection. Never replay a stale MAC. */
    public CaptureProfile forConnection(String currentHost,String currentMac) throws IOException {
        validateHost(currentHost);
        if(currentMac==null||!currentMac.matches("(?i)[0-9a-f]{2}(?::[0-9a-f]{2}){5}")||
            currentMac.equalsIgnoreCase("02:00:00:00:00:00")||currentMac.equals("00:00:00:00:00:00")||
            (Integer.parseInt(currentMac.substring(0,2),16)&1)!=0)throw new IOException("Current Wi-Fi Direct address unavailable");
        byte[] fresh=registration.clone();Arrays.fill(fresh,43,63,(byte)0);
        byte[] mac=currentMac.toUpperCase(Locale.ROOT).getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(mac,0,fresh,43,mac.length);
        return new CaptureProfile(currentHost,fresh,identity);
    }
    /** Keep the connection password and app-protocol marker for subsequent requests. */
    byte[] packet(byte[] packet){byte[] result=packet.clone();System.arraycopy(registration,5,result,5,5);return result;}
    public boolean matchesIdentity(byte[] info) {
        return info.length>=identity.length && Arrays.equals(identity,Arrays.copyOf(info,identity.length));
    }
    public static CaptureProfile read(InputStream input) throws IOException {
        byte[] global=readExact(input,24);
        if(Wire.u32(global,0)!=0xa1b2c3d4L||Wire.u32(global,20)!=101)
            throw new IOException("PCAPdroid의 PCAP(원시 IP) 파일을 선택해 주세요. PCAPNG는 지원하지 않습니다.");
        Map<String,Flow> flows=new LinkedHashMap<>();long consumed=24;int packets=0;
        while(true) {
            int first=input.read();if(first<0)break;
            byte[] h=new byte[16];h[0]=(byte)first;readRest(input,h,1,15);
            long n=Wire.u32(h,8);consumed+=16+n;
            if(n>1024*1024||consumed>64*1024*1024||++packets>100000)throw new IOException("Capture size limit");
            byte[] p=readExact(input,(int)n);
            if(p.length<40||(p[0]&0xf0)!=0x40||p[9]!=6)continue;
            int ihl=(p[0]&15)*4,total=be16(p,2);
            if(ihl<20||total>p.length||total<ihl+20||(be16(p,6)&0x3fff)!=0)continue;
            int sp=be16(p,ihl),dp=be16(p,ihl+2);if(sp!=7070&&dp!=7070)continue;
            boolean outbound=dp==7070;int remote=outbound?16:12,local=outbound?12:16;
            if(!privateIp(p,remote))continue;
            int start=ihl+(p[ihl+12]>>>4&15)*4;
            if(start<ihl+20||start>total||start==total)continue;
            String key=ip(p,local)+":"+(outbound?sp:dp)+"/"+ip(p,remote);
            Flow flow=flows.get(key);
            if(flow==null) {
                if(flows.size()>=16)throw new IOException("Too many P2 sessions");
                flow=new Flow(ip(p,remote));flows.put(key,flow);
            }
            long seq=be32(p,ihl+4);if((p[ihl+13]&2)!=0)seq++;
            flow.add(outbound,seq,Arrays.copyOfRange(p,start,total));
        }
        CaptureProfile result=null;
        for(Flow f:flows.values()) {
            List<Wire.Frame> outgoing=decode(f.out),incoming=decode(f.in);
            byte[] registration=null,id=null;
            for(Wire.Frame frame:outgoing)if(frame.code==3000&&frame.body.length==47&&
                frame.body[0]=='T'&&frame.body[1]=='J'&&frame.body[2]=='A'&&frame.body[3]=='A')registration=frame.bytes();
            for(Wire.Frame frame:incoming)if(frame.code==3100&&frame.body.length>=14)id=Arrays.copyOf(frame.body,Math.min(20,frame.body.length));
            if(registration!=null&&id!=null) {
                if(result!=null&&(!result.host.equals(f.host)||!Arrays.equals(result.identity,id)))
                    throw new IOException("여러 반주기가 기록되어 있습니다. 한 대만 연결한 기록을 선택해 주세요.");
                result=new CaptureProfile(f.host,registration,id);
            }
        }
        if(result==null)throw new IOException("P2 초기 연결 정보가 없습니다. NFC 연결부터 기록한 파일이 필요합니다.");
        return result;
    }
    private static List<Wire.Frame> decode(TreeMap<Long,byte[]> chunks) throws IOException {
        Wire.Decoder decoder=new Wire.Decoder();List<Wire.Frame> result=new ArrayList<>();
        long next=-1;
        for(Map.Entry<Long,byte[]> e:chunks.entrySet()) {
            if(next!=-1&&e.getKey()!=next)throw new IOException("P2 통신 기록에 누락 또는 겹침이 있습니다.");
            result.addAll(decoder.feed(e.getValue(),e.getValue().length));next=e.getKey()+e.getValue().length;
        }
        decoder.finish();return result;
    }
    private static final class Flow {
        final String host;final TreeMap<Long,byte[]> out=new TreeMap<>(),in=new TreeMap<>();int bytes;
        Flow(String h) {host=h;}
        void add(boolean outbound,long seq,byte[] payload)throws IOException {
            TreeMap<Long,byte[]> map=outbound?out:in;byte[] old=map.get(seq);
            if(old!=null) { if(Arrays.equals(old,payload))return;throw new IOException("Conflicting TCP retransmission"); }
            if((bytes+=payload.length)>2*1024*1024)throw new IOException("Control stream size limit");
            map.put(seq,payload);
        }
    }
    private static boolean privateIp(byte[] b,int o) {
        int a=b[o]&255,c=b[o+1]&255;return a==10||(a==192&&c==168)||(a==172&&c>=16&&c<=31);
    }
    private static String ip(byte[] b,int o){return (b[o]&255)+"."+(b[o+1]&255)+"."+(b[o+2]&255)+"."+(b[o+3]&255);}
    private static int be16(byte[] b,int o){return ((b[o]&255)<<8)|(b[o+1]&255);}
    private static long be32(byte[] b,int o){return ((b[o]&255L)<<24)|((b[o+1]&255L)<<16)|((b[o+2]&255L)<<8)|(b[o+3]&255L);}
    private static byte[] readExact(InputStream in,int n)throws IOException{byte[] b=new byte[n];readRest(in,b,0,n);return b;}
    private static void readRest(InputStream in,byte[] b,int o,int n)throws IOException {
        while(n>0){int r=in.read(b,o,n);if(r<0)throw new EOFException("Truncated capture");if(r==0)continue;o+=r;n-=r;}
    }
}
