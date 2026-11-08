package kr.neutinamu.p2;

import org.junit.Test;
import static org.junit.Assert.*;

public class ReconnectPolicyTest {
    @Test public void neverRetriesAnUnverifiedConnection(){ReconnectPolicy p=new ReconnectPolicy();p.start("8");assertEquals(-1,p.retry("[N02] dropped",100));}
    @Test public void shortFlapsShareABoundedBudget(){
        ReconnectPolicy p=new ReconnectPolicy();p.start("8");p.connected("8",0);
        for(int i=0;i<3;i++){assertEquals(new int[]{1500,4000,9000}[i],p.retry("[N02] dropped",i*10000+1000));p.connected("8",i*10000+2000);}
        assertEquals(-1,p.retry("[N03] failed",40000));assertEquals(3,p.attempts());assertEquals("8",p.room());
    }
    @Test public void stableConnectionReplenishesBudget(){ReconnectPolicy p=new ReconnectPolicy();p.start("8");p.connected("8",0);p.retry("[N02] dropped",500);p.connected("8",1000);assertEquals(1500,p.retry("[N01] timeout",61000));}
    @Test public void authenticationIdentityAndExplicitDisconnectNeverRetry(){
        for(String reason:new String[]{"[A01] rejected","[A02] timeout","[I01] wrong device","[N13] permission","[W24] another group","[W25] denied","[W28] ambiguous","연결을 해제했습니다."}){
            ReconnectPolicy p=new ReconnectPolicy();p.start("8");p.connected("8",0);assertEquals(reason,-1,p.retry(reason,100));assertNull(p.room());
        }
    }
    @Test public void cancellingOrChangingRoomCannotReusePreviousVerification(){
        ReconnectPolicy p=new ReconnectPolicy();p.start("8");p.connected("8",0);p.cancel();assertEquals(-1,p.retry("[N02] dropped",100));
        p.start("5");p.connected("8",200);assertEquals(-1,p.retry("[N02] dropped",300));assertEquals("5",p.room());
    }
    @Test public void connectionAttemptErrorsConsumeSameBudget(){
        ReconnectPolicy p=new ReconnectPolicy();p.start("8");p.connected("8",0);
        assertEquals(1500,p.retry("[N02] dropped",100));assertEquals(4000,p.retry("[W21] search timeout",90000));
        assertEquals(9000,p.retry("[N12] refused",100000));assertEquals(-1,p.retry("[N10] no route",120000));
    }
}
