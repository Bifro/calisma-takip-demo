package tr.bifro.calisma;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.os.*;

/** Android renders the chronometer. The service only keeps user-enabled controls and sync alive. */
public final class TimerService extends Service {
  final Handler handler=new Handler(Looper.getMainLooper());
  final Runnable poll=new Runnable(){public void run(){Sync.request(TimerService.this,null);handler.postDelayed(this,15000);}};
  static void ensure(Context c){
    if(!Store.notifications(c)||!Store.ready(c))return;
    if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
    c.startForegroundService(new Intent(c,TimerService.class));
  }
  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(!Store.notifications(this)||!Store.ready(this)){stopSelf();return START_NOT_STICKY;}
    TimerNotification.update(this);
    if(Build.VERSION.SDK_INT>=34)startForeground(TimerNotification.ID,TimerNotification.build(this),ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    else startForeground(TimerNotification.ID,TimerNotification.build(this));
    handler.removeCallbacks(poll);handler.post(poll);return START_STICKY;
  }
  @Override public void onDestroy(){handler.removeCallbacks(poll);super.onDestroy();}
  @Override public IBinder onBind(Intent intent){return null;}
}
