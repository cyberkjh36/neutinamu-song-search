using System;
using System.Threading;
using System.Threading.Tasks;
using Windows.Devices.Enumeration;

namespace Neutinamu.RoomLink
{
    enum PairState { Unknown, NotReady, Available, Paired }

    sealed class PairRecovery
    {
        internal int Requests { get; private set; }
        internal int BusyChecks { get; private set; }
        internal bool Waiting { get; private set; }

        // Read only the selected Windows device ID. CanPair is a capability,
        // not proof that the system lock has cleared; permit at most one retry.
        internal async Task<DevicePairingResultStatus> Run(
            Func<CancellationToken,Task<PairState>> inspect,
            Func<CancellationToken,Task<DevicePairingResultStatus>> request,
            Func<CancellationToken,Task> pause,
            CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            var state=await inspect(token);
            token.ThrowIfCancellationRequested();
            if(state==PairState.Paired)return DevicePairingResultStatus.AlreadyPaired;
            Requests++;
            var status=await request(token);
            if(status!=DevicePairingResultStatus.OperationAlreadyInProgress)return status;
            Waiting=true;
            try{
                for(int i=0;i<10;i++){
                    await pause(token);
                    token.ThrowIfCancellationRequested();
                    BusyChecks++;
                    state=await inspect(token);
                    token.ThrowIfCancellationRequested();
                    if(state==PairState.Paired)return DevicePairingResultStatus.AlreadyPaired;
                }
            }finally{Waiting=false;}
            if(state!=PairState.Available)return status;
            token.ThrowIfCancellationRequested();
            Requests++;
            return await request(token);
        }

        internal static async Task<bool> Check()
        {
            var busy=DevicePairingResultStatus.OperationAlreadyInProgress;
            var done=DevicePairingResultStatus.Paired;
            var already=DevicePairingResultStatus.AlreadyPaired;
            Func<CancellationToken,Task> tick=t=>Task.CompletedTask;
            var run=new PairRecovery();
            var status=await run.Run(t=>Task.FromResult(PairState.Paired),
                t=>throw new Exception("unexpected pairing"),tick,CancellationToken.None);
            if(status!=already || run.Requests!=0)return false;
            run=new PairRecovery();
            status=await run.Run(t=>Task.FromResult(run.BusyChecks>=2?PairState.Paired:PairState.Available),
                t=>Task.FromResult(busy),tick,CancellationToken.None);
            if(status!=already || run.Requests!=1 || run.BusyChecks!=2)return false;
            foreach(var retry in new[]{done,busy}){
                run=new PairRecovery();
                status=await run.Run(t=>Task.FromResult(PairState.Available),
                    t=>Task.FromResult(run.Requests==1?busy:retry),tick,CancellationToken.None);
                if(status!=retry || run.Requests!=2 || run.BusyChecks!=10)return false;
            }
            run=new PairRecovery();
            status=await run.Run(t=>Task.FromResult(PairState.Unknown),t=>Task.FromResult(busy),tick,CancellationToken.None);
            if(status!=busy || run.Requests!=1)return false;
            run=new PairRecovery();
            status=await run.Run(t=>Task.FromResult(PairState.Available),t=>Task.FromResult(DevicePairingResultStatus.AccessDenied),tick,CancellationToken.None);
            if(status!=DevicePairingResultStatus.AccessDenied || run.Requests!=1 || run.BusyChecks!=0)return false;
            using(var cancel=new CancellationTokenSource()){
                run=new PairRecovery();
                try{
                    await run.Run(t=>Task.FromResult(PairState.Available),t=>Task.FromResult(busy),
                        t=>{cancel.Cancel();return Task.CompletedTask;},cancel.Token);
                    return false;
                }catch(OperationCanceledException){return run.Requests==1 && !run.Waiting;}
            }
        }
    }
}
