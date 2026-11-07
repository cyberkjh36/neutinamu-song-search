package kr.neutinamu.p2;

import java.io.*;
import java.net.*;
import java.util.function.BooleanSupplier;

/** Wait only for a selected interface's address; no TCP/auth/song retries. */
public final class RouteWait {
    public interface Opener { Socket open() throws IOException; }
    public interface Pause { void sleep(long milliseconds) throws InterruptedException; }
    private RouteWait() {}
    public static Socket open(Opener opener,BooleanSupplier cancelled,Pause pause)throws IOException {
        for(int attempt=0;attempt<16;attempt++){
            if(cancelled.getAsBoolean()||Thread.currentThread().isInterrupted())throw new InterruptedIOException("Connection cancelled");
            try{return opener.open();}
            catch(NoRouteToHostException unavailable){if(attempt==15)throw unavailable;}
            try{pause.sleep(200);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new InterruptedIOException("Connection cancelled");}
        }
        throw new AssertionError();
    }
}
