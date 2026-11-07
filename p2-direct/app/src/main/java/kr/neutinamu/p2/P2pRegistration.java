package kr.neutinamu.p2;

import android.os.Handler;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Keeps our Wi-Fi P2P client registered while the user visits TJ's app settings.
 * A registered client is NOT proof of radio connectivity or P2 authentication.
 * All methods and backend callbacks run on the main thread. */
final class P2pRegistration implements AutoCloseable {
    enum State { IDLE, CHECKING, MATCH, NO_GROUP, OTHER_GROUP, UNAVAILABLE, DENIED, TIMEOUT, CLOSED }
    static final class Info {
        final boolean formed,localOwner;final String owner;
        Info(boolean formed,boolean localOwner,String owner){this.formed=formed;this.localOwner=localOwner;this.owner=owner;}
    }
    interface Backend {
        boolean open(Runnable disconnected);
        void info(Consumer<Info> result);
        void close();
    }
    private final Backend backend;private final Handler handler;private final Supplier<String> target;
    private final Consumer<State> changed;private final Diagnostics diagnostics;
    private boolean registered,closed;private int generation;private Runnable timeout;
    private State state=State.IDLE;
    P2pRegistration(Backend backend,Handler handler,Supplier<String> target,Consumer<State> changed,Diagnostics diagnostics){
        this.backend=backend;this.handler=handler;this.target=target;this.changed=changed;this.diagnostics=diagnostics;
    }
    State state(){return state;}
    boolean registered(){return registered&&!closed;}
    void prepare(){
        if(closed)return;
        try{
            if(!registered){
                registered=backend.open(()->{
                    if(closed)return;
                    registered=false;invalidate();publish(State.UNAVAILABLE);
                });
                if(!registered){publish(State.UNAVAILABLE);return;}
                diagnostics.event("P2P_CHANNEL_REGISTERED");
            }
            refresh(null);
        }catch(SecurityException e){publish(State.DENIED);}
        catch(RuntimeException e){publish(State.UNAVAILABLE);}
    }
    void refresh(Runnable afterMatchingConnection){
        if(!registered())return;
        invalidate();final int request=generation;publish(State.CHECKING);
        timeout=()->{if(!closed&&request==generation){invalidate();publish(State.TIMEOUT);}};
        handler.postDelayed(timeout,5000);
        try{
            backend.info(info->{
                if(closed||request!=generation)return;
                invalidate();String expected=target.get();
                State result=info==null||!info.formed?State.NO_GROUP:
                    !info.localOwner&&expected!=null&&expected.equals(info.owner)?State.MATCH:State.OTHER_GROUP;
                publish(result);
                if(result==State.MATCH&&afterMatchingConnection!=null)afterMatchingConnection.run();
            });
        }catch(SecurityException e){invalidate();publish(State.DENIED);}
        catch(RuntimeException e){invalidate();publish(State.UNAVAILABLE);}
    }
    private void invalidate(){generation++;if(timeout!=null)handler.removeCallbacks(timeout);timeout=null;}
    private void publish(State next){state=next;diagnostics.event("P2P_"+next.name());changed.accept(next);}
    @Override public void close(){
        if(closed)return;closed=true;invalidate();
        try{if(registered)backend.close();}finally{registered=false;state=State.CLOSED;}
    }
}
