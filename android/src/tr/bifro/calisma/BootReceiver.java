package tr.bifro.calisma;
import android.content.*;
public final class BootReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context c,Intent intent){if(Store.ready(c)){TimerNotification.update(c);SyncJob.scheduleRetry(c);SyncJob.schedulePeriodic(c);}}
}
