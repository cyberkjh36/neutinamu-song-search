package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;

public class ProtocolTest {
    // Only non-identifying command frames. No captured registration or identity fixture.
    static byte[] hex(String s){String t=s.replace(" ","");byte[] b=new byte[t.length()/2];for(int i=0;i<b.length;i++)b[i]=(byte)Integer.parseInt(t.substring(2*i,2*i+2),16);return b;}
    static byte[] cat(byte[]... parts)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();for(byte[] b:parts)out.write(b);return out.toByteArray();}
    static byte[] login(){byte[] b=new byte[47];System.arraycopy(new byte[]{'T','J','A','A'},0,b,0,4);return Wire.encode(3000,new byte[]{1,0,0,0,0,4,0,1},b);}
    static byte[] id(){return Arrays.copyOf(new byte[]{'T','E','S','T','-','D','E','V','I','C','E'},14);}
    static byte[] server(int code,byte[] body){return Wire.encode(code,new byte[]{1,51,1,0,0,4,1,1},body);}
    static void be16(byte[] b,int o,int n){b[o]=(byte)(n>>8);b[o+1]=(byte)n;}
    static void be32(byte[] b,int o,long n){for(int i=0;i<4;i++)b[o+i]=(byte)(n >>> (24-8*i));}
    static byte[] packet(byte[] body,boolean outgoing,long seq)throws IOException {
        byte[] b=new byte[40+body.length];b[0]=0x45;be16(b,2,b.length);b[9]=6;
        byte[] local={10,1,2,3},remote={(byte)192,(byte)168,(byte)133,1};
        System.arraycopy(outgoing?local:remote,0,b,12,4);System.arraycopy(outgoing?remote:local,0,b,16,4);
        be16(b,20,outgoing?12345:7070);be16(b,22,outgoing?7070:12345);be32(b,24,seq);b[32]=0x50;b[33]=0x18;
        System.arraycopy(body,0,b,40,body.length);byte[] h=new byte[16];Wire.put32(h,8,b.length);Wire.put32(h,12,b.length);return cat(h,b);
    }
    static byte[] capture(byte[]... packets)throws IOException{
        byte[] h=new byte[24];Wire.put32(h,0,0xa1b2c3d4L);h[4]=2;h[6]=4;Wire.put32(h,16,65535);Wire.put32(h,20,101);
        return cat(h,cat(packets));
    }
    static CaptureProfile profile()throws IOException{return CaptureProfile.read(new ByteArrayInputStream(capture(packet(login(),true,100),packet(server(3100,id()),false,400))));}
    @Test public void confirmed10909Packet(){assertArrayEquals(hex("a00f0000020000000004000109000000b00400009d2a000000"),Wire.play(10909));}
    @Test public void confirmedCancelPacket(){assertArrayEquals(hex("041000000100000000040001040000000c000000"),Wire.cancel());}
    @Test public void heartbeatPacket(){assertArrayEquals(hex("e803000001000000000401090400000064000000"),Wire.heartbeat());}
    @Test public void everyTcpSplit()throws Exception{
        byte[] bytes=Wire.play(10909);
        for(int i=0;i<=bytes.length;i++){
            Wire.Decoder d=new Wire.Decoder();List<Wire.Frame> f=d.feed(Arrays.copyOf(bytes,i),i);
            byte[] end=Arrays.copyOfRange(bytes,i,bytes.length);f.addAll(d.feed(end,end.length));d.finish();
            assertEquals(1,f.size());assertArrayEquals(bytes,f.get(0).bytes());
        }
    }
    @Test public void oneByteAndCoalesced()throws Exception{
        byte[] bytes=cat(Wire.play(10909),Wire.cancel(),Wire.heartbeat());Wire.Decoder d=new Wire.Decoder();List<Wire.Frame> f=new ArrayList<>();
        for(byte b:bytes)f.addAll(d.feed(new byte[]{b},1));d.finish();assertEquals(3,f.size());
        assertEquals(3,new Wire.Decoder().feed(bytes,bytes.length).size());
    }
    @Test(expected=IOException.class) public void hugeFrameRejected()throws Exception{byte[] b=new byte[16];Wire.put32(b,12,0xffffffffL);new Wire.Decoder().feed(b,b.length);}
    @Test(expected=IOException.class) public void truncatedFrameRejected()throws Exception{Wire.Decoder d=new Wire.Decoder();d.feed(new byte[7],7);d.finish();}
    @Test public void invalidSongNumbers(){for(int n:new int[]{0,-1,100000000,Integer.MAX_VALUE})try{Wire.play(n);fail();}catch(IllegalArgumentException expected){}}
    @Test public void differentSongChangesOnlyNumber(){byte[] a=Wire.play(10909),b=Wire.play(12345);assertEquals(12345,Wire.u32(b,20));System.arraycopy(a,20,b,20,4);assertArrayEquals(a,b);}
    @Test public void importRegistrationAndIdentity()throws Exception{CaptureProfile p=profile();assertEquals("192.168.133.1",p.host);assertArrayEquals(login(),p.registration());assertTrue(p.matchesIdentity(id()));assertFalse(p.matchesIdentity(new byte[14]));byte[] a=p.registration();a[0]=0;assertArrayEquals(login(),p.registration());}
    @Test public void importOutOfOrderAndDuplicate()throws Exception{
        byte[] l=login();byte[] first=packet(Arrays.copyOf(l,30),true,100),second=packet(Arrays.copyOfRange(l,30,l.length),true,130);
        CaptureProfile p=CaptureProfile.read(new ByteArrayInputStream(capture(second,first,first,packet(server(3100,id()),false,400))));assertArrayEquals(l,p.registration());
    }
    @Test(expected=IOException.class) public void importMissingSegment()throws Exception{
        byte[] l=login();CaptureProfile.read(new ByteArrayInputStream(capture(packet(Arrays.copyOf(l,20),true,100),packet(Arrays.copyOfRange(l,30,l.length),true,130))));
    }
    @Test(expected=IOException.class) public void badCaptureRejected()throws Exception{CaptureProfile.read(new ByteArrayInputStream(new byte[24]));}
    @Test(expected=IOException.class) public void emptyCaptureRejected()throws Exception{CaptureProfile.read(new ByteArrayInputStream(capture()));}
    @Test public void catalogUnicodeAndQuotedFields()throws Exception{
        SongCatalog c=new SongCatalog();c.load(new StringReader("곡번호,곡제목,가수\n10909,꿈,가수\n2,\"Hello, world\",Artist\n3,เพลงไทย,นักร้อง\n4,Tiếng Việt,Trịnh\n5,\"줄\n바꿈\",가수\n"));
        assertEquals(5,c.size());assertEquals(10909,c.search("10909",30).get(0).number);
        assertEquals(4,c.search("Tiếng Việt",30).get(0).number);assertEquals(3,c.search("เพลงไทย",30).get(0).number);
        assertEquals(2,c.search("hello, world",30).get(0).number);assertEquals(5,c.search("줄바꿈",30).get(0).number);
        assertTrue(c.search("",30).isEmpty());
    }
    static Wire.Frame readFrame(Socket socket)throws Exception{
        InputStream in=socket.getInputStream();byte[] h=new byte[16];new DataInputStream(in).readFully(h);
        byte[] body=new byte[(int)Wire.u32(h,12)];new DataInputStream(in).readFully(body);byte[] b=cat(h,body);return new Wire.Decoder().feed(b,b.length).get(0);
    }
    static void send(Socket socket,int code,byte[] body)throws IOException{socket.getOutputStream().write(server(code,body));socket.getOutputStream().flush();}
    static class Harness implements AutoCloseable {
        final ServerSocket server;final Socket peer;final Session session;final Thread thread;final List<String> messages=new CopyOnWriteArrayList<>();final Diagnostics diagnostic=new Diagnostics();
        Harness(int timeout)throws Exception{
            server=new ServerSocket(0,1,InetAddress.getLoopbackAddress());Socket client=new Socket(InetAddress.getLoopbackAddress(),server.getLocalPort());peer=server.accept();peer.setSoTimeout(1500);
            session=new Session(client,profile(),new Session.Listener(){
                public void changed(Session.State s,String m){messages.add(m);}
                public void frame(boolean out,int code,int len,Long scalar){diagnostic.frame(out,code,len,scalar);}
            },timeout,5000);thread=new Thread(session::run);thread.start();assertEquals(3000,readFrame(peer).code);
        }
        void ready()throws Exception{send(peer,3000,new byte[]{0});assertEquals(3100,readFrame(peer).code);send(peer,3100,id());await(Session.State.READY);}
        void await(Session.State state)throws Exception{long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);while(session.state()!=state&&System.nanoTime()<until)Thread.sleep(5);assertEquals(state,session.state());}
        public void close()throws Exception{session.close();peer.close();server.close();thread.join(2000);assertFalse(thread.isAlive());}
    }
    @Test public void sessionConfirmsPlaybackThenCancel()throws Exception{
        try(Harness h=new Harness(2000)){
            h.ready();h.session.play(10909);assertArrayEquals(Wire.play(10909),readFrame(h.peer).bytes());
            send(h.peer,4000,Wire.integer(2));send(h.peer,1000,new byte[0]);assertArrayEquals(Wire.heartbeat(),readFrame(h.peer).bytes());
            assertEquals(Session.State.PLAY,h.session.state());
            try{h.session.play(10909);fail("Duplicate play accepted");}catch(IOException expected){}
            send(h.peer,4300,cat(Wire.integer(99999),new byte[1]));send(h.peer,1000,new byte[0]);readFrame(h.peer);assertEquals(Session.State.PLAY,h.session.state());
            send(h.peer,4300,cat(Wire.integer(10909),new byte[1]));h.await(Session.State.READY);
            h.session.cancel();assertArrayEquals(Wire.cancel(),readFrame(h.peer).bytes());send(h.peer,4100,Wire.integer(12));h.await(Session.State.READY);
        }
    }
    @Test public void noAutomaticRetryAfterTimeout()throws Exception{
        try(Harness h=new Harness(400)){h.ready();h.session.play(10909);readFrame(h.peer);h.await(Session.State.READY);h.peer.setSoTimeout(200);try{h.peer.getInputStream().read();fail("Unexpected retry");}catch(SocketTimeoutException expected){}assertTrue(h.messages.stream().anyMatch(s->s.contains("응답 시간 초과")));}
    }
    @Test public void wrongIdentityClosesSession()throws Exception{
        try(Harness h=new Harness(1000)){send(h.peer,3000,new byte[]{0});readFrame(h.peer);send(h.peer,3100,new byte[14]);h.await(Session.State.CLOSED);try{h.session.play(10909);fail();}catch(IOException expected){}}
    }
    @Test public void nonzeroColourSlotIsAcceptedButStillRequiresIdentity()throws Exception{
        try(Harness h=new Harness(1000)){send(h.peer,3000,new byte[]{7});assertEquals(3100,readFrame(h.peer).code);h.await(Session.State.IDENTIFY);send(h.peer,3100,id());h.await(Session.State.READY);}
    }
    @Test public void partialHeaderSurvivesSocketTimeout()throws Exception{
        try(Harness h=new Harness(1500)){
            byte[] ack=server(3000,new byte[]{0});h.peer.getOutputStream().write(ack,0,3);h.peer.getOutputStream().flush();Thread.sleep(350);
            h.peer.getOutputStream().write(ack,3,ack.length-3);h.peer.getOutputStream().flush();assertEquals(3100,readFrame(h.peer).code);send(h.peer,3100,id());h.await(Session.State.READY);
        }
    }
    @Test public void cancelPendingPlayDoesNotBecomePlaybackSuccess()throws Exception{
        try(Harness h=new Harness(1000)){h.ready();h.session.play(10909);readFrame(h.peer);h.session.cancel();assertEquals(4100,readFrame(h.peer).code);send(h.peer,4300,cat(Wire.integer(10909),new byte[1]));send(h.peer,1000,new byte[0]);readFrame(h.peer);assertEquals(Session.State.CANCEL,h.session.state());send(h.peer,4100,Wire.integer(12));h.await(Session.State.READY);}
    }
    @Test public void errorBodyWithZeroByteIsNeverMistakenForSuccess()throws Exception{
        try(Harness h=new Harness(1000)){
            byte[] error=server(3000,new byte[]{0});error[11]=3;h.peer.getOutputStream().write(error);h.await(Session.State.CLOSED);
            assertTrue(h.messages.get(h.messages.size()-1).contains("[A01]"));
            assertTrue(h.messages.get(h.messages.size()-1).contains("응답값=0"));
            assertFalse(h.messages.get(h.messages.size()-1).contains("승인하지"));
            assertTrue(h.diagnostic.report().contains("RX cmd=3000 bytes=1 value=0"));
            assertFalse(h.diagnostic.report().contains("TX cmd=4000"));
        }
    }
    @Test public void unfamiliarInitialShapeRemainsBlocked()throws Exception{
        try(Harness h=new Harness(1000)){
            send(h.peer,3000,new byte[]{1,2,3});h.await(Session.State.CLOSED);
            assertTrue(h.messages.get(h.messages.size()-1).contains("길이=3바이트"));
            assertTrue(h.messages.get(h.messages.size()-1).contains("형식 미확인"));
            assertTrue(h.diagnostic.report().contains("RX cmd=3000 bytes=3"));
        }
    }
    @Test public void observed3003DoesNotBecomeSuccessfulLoginOrSendControls()throws Exception{
        try(Harness h=new Harness(1000)){
            send(h.peer,3000,Wire.integer(3003));h.await(Session.State.CLOSED);
            assertTrue(h.messages.get(h.messages.size()-1).contains("응답값=3003"));
            try{h.session.play(10909);fail();}catch(IOException expected){}
            assertTrue(h.diagnostic.report().contains("RX cmd=3000 bytes=4 value=3003"));
            assertFalse(h.diagnostic.report().contains("TX cmd=4000"));
            assertFalse(h.diagnostic.report().contains("TX cmd=3100"));
        }
    }
    @Test public void authenticationTimeoutHasSpecificCode()throws Exception{
        try(Harness h=new Harness(400)){h.await(Session.State.CLOSED);assertTrue(h.messages.get(h.messages.size()-1).contains("[A02]"));}
    }
    @Test public void playReplyIsNotPlaybackAndTimeoutExplainsDifference()throws Exception{
        try(Harness h=new Harness(400)){
            h.ready();h.session.play(10909);readFrame(h.peer);send(h.peer,4000,Wire.integer(2));
            h.await(Session.State.READY);assertTrue(h.messages.stream().anyMatch(s->s.contains("[P10]")));
            assertTrue(h.messages.get(h.messages.size()-1).contains("[P11]"));
            assertEquals(1,h.diagnostic.report().split("TX cmd=4000",-1).length-1);
        }
    }

    @Test public void currentConnectionReplacesOnlyMacAndUsesCurrentOwner()throws Exception{
        CaptureProfile original=profile(),live=original.forConnection("192.168.49.1","02:11:22:33:44:55");
        byte[] changed=live.registration(),before=original.registration();
        assertEquals("192.168.49.1",live.host);assertTrue(live.matchesIdentity(id()));
        assertEquals("02:11:22:33:44:55",new String(changed,43,17,"US-ASCII"));
        assertArrayEquals(Arrays.copyOf(before,43),Arrays.copyOf(changed,43));
        assertArrayEquals(new byte[3],Arrays.copyOfRange(changed,60,63));assertArrayEquals(login(),original.registration());
    }
    @Test public void noStaleMacFallbackForInvalidCurrentAddresses()throws Exception{
        for(String mac:new String[]{null,"02:00:00:00:00:00","00:00:00:00:00:00","FF:FF:FF:FF:FF:FF","bad"}){
            try{profile().forConnection("192.168.49.1",mac);fail();}catch(IOException expected){}
        }
        for(String host:new String[]{"8.8.8.8","localhost","192.168.999.1"}){
            try{profile().forConnection(host,"02:11:22:33:44:55");fail();}catch(IOException expected){}
        }
    }
    @Test public void connectionContextIsPreservedInAllCommands()throws Exception{
        byte[] registration=login();Wire.put32(registration,5,123456);registration[9]=2;
        CaptureProfile p=CaptureProfile.read(new ByteArrayInputStream(capture(packet(registration,true,100),packet(server(3100,id()),false,400))));
        for(byte[] frame:new byte[][]{Wire.play(10909),Wire.cancel(),Wire.heartbeat(),Wire.info()}){
            byte[] adjusted=p.packet(frame);assertEquals(123456,Wire.u32(adjusted,5));assertEquals(2,adjusted[9]);
            assertEquals(frame[4],adjusted[4]);assertArrayEquals(Arrays.copyOfRange(frame,10,frame.length),Arrays.copyOfRange(adjusted,10,adjusted.length));
        }
    }
    @Test public void playbackErrorReplyDoesNotClaimAcceptanceOrRetry()throws Exception{
        try(Harness h=new Harness(1000)){
            h.ready();h.session.play(10909);readFrame(h.peer);byte[] error=server(4000,Wire.integer(3003));error[11]=3;h.peer.getOutputStream().write(error);h.await(Session.State.READY);
            assertTrue(h.messages.get(h.messages.size()-1).contains("[P13]"));assertFalse(h.messages.stream().anyMatch(m->m.contains("[P10]")));
            h.peer.setSoTimeout(150);try{h.peer.getInputStream().read();fail();}catch(SocketTimeoutException expected){}
        }
    }
    @Test public void statusDiagnosticsIncludeReasonButNeverMessageContent(){
        Diagnostics d=new Diagnostics();d.status("[A02] private address and credentials");d.status("password=secret");
        assertTrue(d.report().contains("REASON_A02"));assertFalse(d.report().contains("private"));assertFalse(d.report().contains("secret"));
    }
    @Test public void diagnosticsOmitPayloadAndBoundMemory(){
        Diagnostics d=new Diagnostics();d.frame(true,3000,47,123456789L);d.frame(false,3100,66,123456789L);
        assertFalse(d.report().contains("value="));assertFalse(d.report().contains("123456789"));
        try{d.event("private.example.com");fail();}catch(IllegalArgumentException expected){}
        for(int i=0;i<70;i++)d.event("EVENT_"+i);
        assertFalse(d.report().contains("cmd=3000"));assertEquals(50,d.report().split("\n").length);
    }
}
