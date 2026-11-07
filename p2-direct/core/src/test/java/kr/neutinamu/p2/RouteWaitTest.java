package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.util.*;

public class RouteWaitTest {
    @Test public void readyRouteReturnsImmediatelyWithoutSendingAnything()throws Exception{
        try(Socket expected=new Socket()){
            Socket result=RouteWait.open(()->expected,()->false,ms->{fail("unexpected delay");});
            assertSame(expected,result);assertFalse(result.isConnected());
        }
    }
    @Test public void delayedInterfaceAddressCanBecomeReadyBeforeTcpConnect()throws Exception{
        final int[] calls={0};List<Long> waits=new ArrayList<>();
        try(Socket expected=new Socket()){
            Socket result=RouteWait.open(()->{if(++calls[0]<3)throw new NoRouteToHostException();return expected;},()->false,waits::add);
            assertSame(expected,result);assertEquals(3,calls[0]);assertEquals(Arrays.asList(200L,200L),waits);assertFalse(result.isConnected());
        }
    }
    @Test public void missingRouteStopsAfterThreeSecondsWithoutFallback()throws Exception{
        final int[] calls={0};final long[] delay={0};
        try{RouteWait.open(()->{calls[0]++;throw new NoRouteToHostException();},()->false,ms->{delay[0]+=ms;});fail();}
        catch(NoRouteToHostException expected){assertEquals(16,calls[0]);assertEquals(3000L,delay[0]);}
    }
    @Test public void connectionAndOtherErrorsAreNeverRetried()throws Exception{
        final int[] calls={0};
        try{RouteWait.open(()->{calls[0]++;throw new ConnectException();},()->false,ms->{fail("TCP errors must not retry");});fail();}
        catch(ConnectException expected){assertEquals(1,calls[0]);}
    }
    @Test public void cancellationAndInterruptionStopWaiting()throws Exception{
        final boolean[] cancelled={false};final int[] calls={0};
        try{RouteWait.open(()->{calls[0]++;throw new NoRouteToHostException();},()->cancelled[0],ms->{cancelled[0]=true;});fail();}
        catch(InterruptedIOException expected){assertEquals(1,calls[0]);}
        try{RouteWait.open(()->{throw new NoRouteToHostException();},()->false,ms->{throw new InterruptedException();});fail();}
        catch(InterruptedIOException expected){assertTrue(Thread.currentThread().isInterrupted());}
        finally{Thread.interrupted();}
    }
}
