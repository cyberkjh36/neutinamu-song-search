package kr.neutinamu.p2;

import android.os.Handler;
import java.util.*;
import java.util.function.Consumer;

/** User-selected Wi-Fi Direct connection. Radio completion is not P2 authentication. */
final class DirectWifi implements AutoCloseable {
    static final class Peer {
        final String name,address;
        Peer(String name,String address){this.name=name;this.address=address;}
    }
    static final class Link {
        final boolean formed,localOwner;final String owner,host,interfaceName;
        Link(boolean formed,boolean localOwner,String owner,String host){this(formed,localOwner,owner,host,null);}
        Link(boolean formed,boolean localOwner,String owner,String host,String interfaceName){this.formed=formed;this.localOwner=localOwner;this.owner=owner;this.host=host;this.interfaceName=interfaceName;}
    }
    interface Backend {
        boolean open(Runnable lost);
        void discover(Consumer<Boolean> done);
        void peers(Consumer<List<Peer>> done);
        void link(Consumer<Link> done);
        void join(Peer peer,Consumer<Boolean> done);
        void close();
    }
    interface Listener {
        void status(String code,String message);
        void peers(List<Peer> peers);
        void connected(Link link);
    }
    private final Backend backend;private final Handler handler;private final Listener listener;
    private boolean opened,closed,joining,searching;private int generation;private List<Peer> peers=Collections.emptyList();
    private Peer selected;private String targetName;private Runnable timeout,poll;
    DirectWifi(Backend backend,Handler handler,Listener listener){this.backend=backend;this.handler=handler;this.listener=listener;}
    boolean joining(){return joining;}
    private void invalidate(){generation++;if(timeout!=null)handler.removeCallbacks(timeout);if(poll!=null)handler.removeCallbacks(poll);timeout=null;poll=null;}
    private boolean current(int request){return !closed&&generation==request;}
    private void fail(String code,String message){invalidate();joining=false;searching=false;selected=null;listener.status(code,message);}
    void find(){find(null);}
    void find(String target){
        if(closed||joining)return;targetName=target==null?null:RoomDirectory.normalize(target);invalidate();searching=true;peers=Collections.emptyList();selected=null;int request=generation;
        try{
            if(!opened){opened=backend.open(()->{opened=false;if(!closed)fail("W26","Wi-Fi Direct 사용 등록이 끊겼습니다. 다시 찾아 주세요.");});}
            if(!opened){fail("W26","Wi-Fi Direct를 사용할 수 없습니다.");return;}
            listener.status("W20","주변 반주기를 찾는 중입니다…");
            timeout=()->{if(current(request))fail("W21","반주기를 찾지 못했습니다. Wi-Fi와 위치 기능을 켜고 P2의 연결 대기 상태를 확인해 주세요.");};
            handler.postDelayed(timeout,20000);
            backend.discover(ok->{if(!current(request))return;if(ok)changed();else fail("W21","기기 검색을 시작하지 못했습니다. Wi-Fi·위치 기능과 권한을 확인해 주세요.");});
        }catch(SecurityException e){fail("W23","Wi-Fi Direct 권한을 허용해 주세요.");}
        catch(RuntimeException e){fail("W26","Wi-Fi Direct 검색을 시작하지 못했습니다.");}
    }
    void changed(){
        if(closed||!opened)return;int request=generation;
        if(joining){check(request,false);return;}
        if(!searching)return;
        try{backend.peers(list->{
            if(!current(request)||!searching||joining||list==null||list.isEmpty())return;
            LinkedHashMap<String,Peer> unique=new LinkedHashMap<>();
            for(Peer peer:list)if(peer!=null&&peer.address!=null&&!peer.address.isEmpty())unique.put(peer.address,peer);
            if(unique.isEmpty())return;
            peers=new ArrayList<>(unique.values());
            if(targetName!=null){
                Peer match=null;
                for(Peer peer:peers)if(targetName.equals(RoomDirectory.normalize(peer.name))){
                    if(match!=null){fail("W28","같은 방 이름의 반주기가 여러 대 발견되어 연결하지 않았습니다. 직원에게 확인해 주세요.");return;}
                    match=peer;
                }
                // Unrelated devices must not cancel the deadline or open the room picker.
                if(match!=null)select(match);
                return;
            }
            if(timeout!=null)handler.removeCallbacks(timeout);timeout=null;
            listener.peers(Collections.unmodifiableList(peers));
        });}catch(SecurityException e){fail("W23","주변 기기를 확인할 권한이 없습니다.");}
        catch(RuntimeException e){fail("W26","주변 기기를 확인하지 못했습니다.");}
    }
    void stopFinding(){if(!joining){searching=false;invalidate();}}
    void select(Peer peer){
        if(closed||joining||!searching||peer==null||peers.stream().noneMatch(p->p.address.equals(peer.address)))return;
        invalidate();searching=false;selected=peer;joining=true;int request=generation;
        listener.status("W22","선택한 반주기에 Wi-Fi Direct 연결 중입니다. 연결 확인 창이 나오면 승인해 주세요.");
        timeout=()->{if(current(request))fail("W25","직접 연결이 완료되지 않았습니다. P2에서 연결을 허용했는지 확인해 주세요.");};
        handler.postDelayed(timeout,45000);check(request,true);
    }
    private void check(int request,boolean canStart){
        if(!current(request)||!joining)return;
        try{backend.link(link->{
            if(!current(request)||!joining)return;
            if(link!=null&&link.formed){
                if(link.localOwner||link.owner==null||!link.owner.equalsIgnoreCase(selected.address)||link.host==null){
                    fail("W24","선택한 반주기와 현재 Wi-Fi Direct 연결이 다릅니다. 휴대폰 Wi-Fi Direct에서 기존 연결을 해제한 뒤 다시 선택해 주세요.");return;
                }
                invalidate();joining=false;listener.status("W27","직접 무선 연결을 확인했습니다. 이어서 반주기 응답을 확인합니다…");listener.connected(link);return;
            }
            if(canStart){
                try{backend.join(selected,ok->{if(!current(request))return;if(ok)schedule(request);else fail("W25","P2 직접 연결 요청이 거절되었습니다. 반주기 연결 대기 상태를 확인해 주세요.");});}
                catch(SecurityException e){fail("W23","Wi-Fi Direct 연결 권한이 없습니다.");}
                catch(RuntimeException e){fail("W26","직접 연결 요청을 보내지 못했습니다.");}
            }else schedule(request);
        });}catch(SecurityException e){fail("W23","Wi-Fi Direct 연결 권한이 없습니다.");}
        catch(RuntimeException e){fail("W26","직접 연결 상태를 확인하지 못했습니다.");}
    }
    private void schedule(int request){if(!current(request))return;if(poll!=null)handler.removeCallbacks(poll);poll=()->check(request,false);handler.postDelayed(poll,1000);}
    @Override public void close(){if(closed)return;closed=true;invalidate();joining=false;if(opened)backend.close();opened=false;}
}
