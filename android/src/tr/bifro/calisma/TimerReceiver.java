package tr.bifro.calisma;
import android.content.*;

public final class TimerReceiver extends BroadcastReceiver {
  public static final String START="tr.bifro.calisma.START",STOP="tr.bifro.calisma.STOP";
  @Override public void onReceive(Context context,Intent intent){
    try{
      if(START.equals(intent.getAction()))Store.start(context,Store.selectedCourse(context),Store.selectedCount(context));
      else if(STOP.equals(intent.getAction()))Store.stop(context);
      else return;
      TimerNotification.update(context);TimerService.ensure(context);PendingResult pending=goAsync();
      // Keep the receiver short. A persisted JobScheduler job owns eventual network work.
      SyncJob.scheduleRetry(context);
      context.sendBroadcast(new Intent(Sync.UPDATED).setPackage(context.getPackageName()));
      Sync.request(context,null);pending.finish();
    }catch(Exception e){Store.error(context,e.getMessage());TimerNotification.update(context);}
  }
}
