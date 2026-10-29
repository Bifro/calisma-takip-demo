package tr.bifro.calisma;
import android.app.job.*;
import android.content.*;

public final class SyncJob extends JobService {
  static final int RETRY=411,PERIODIC=412;
  private static JobScheduler scheduler(Context c){return c.getSystemService(JobScheduler.class);}
  static void scheduleRetry(Context c){
    scheduler(c).schedule(new JobInfo.Builder(RETRY,new ComponentName(c,SyncJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
      .setPersisted(true).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());
  }
  static void schedulePeriodic(Context c){
    scheduler(c).schedule(new JobInfo.Builder(PERIODIC,new ComponentName(c,SyncJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
      .setPeriodic(15*60*1000).setPersisted(true).build());
  }
  @Override public boolean onStartJob(JobParameters params){Sync.request(this,()->{boolean pending;try{pending=Store.ops(this).length()>0;}catch(Exception e){pending=true;}jobFinished(params,pending);});return true;}
  @Override public boolean onStopJob(JobParameters params){return true;}
}
