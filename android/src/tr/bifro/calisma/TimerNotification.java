package tr.bifro.calisma;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import org.json.*;

public final class TimerNotification {
  static final int ID=21;static final String CHANNEL="study-timer-v1";
  public static String courseName(JSONObject data,String start){
    JSONObject plan=data.optJSONObject("studyPlan");JSONArray courses=plan!=null?plan.optJSONArray("courses"):null;
    if(courses!=null)for(int i=0;i<courses.length();i++){JSONObject item=courses.optJSONObject(i);if(item!=null&&item.optString("start").equals(start))return item.optString("name");}
    return "Çalışma";
  }
  public static String duration(long seconds){return String.format(java.util.Locale.ROOT,"%02d:%02d:%02d",seconds/3600,(seconds%3600)/60,seconds%60);}
  public static void update(Context c){
    NotificationManager manager=c.getSystemService(NotificationManager.class);
    NotificationChannel channel=new NotificationChannel(CHANNEL,"Çalışma kronometresi",NotificationManager.IMPORTANCE_LOW);
    channel.setDescription("Kilit ekranında geçen süre ve Başlat / Kaydet kontrolleri");channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);manager.createNotificationChannel(channel);
    if(!Store.notifications(c)||!Store.ready(c)){manager.cancel(ID);return;}
    if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
    manager.notify(ID,build(c));
  }
  static Notification build(Context c){
    JSONObject data=Store.data(c);long start=TimerModel.running(data);boolean running=start>0;
    String course=courseName(data,running?data.optString("runningCourse"):Store.selectedCourse(c));
    Intent activity=new Intent(c,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent open=PendingIntent.getActivity(c,0,activity,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    PendingIntent action=PendingIntent.getBroadcast(c,running?2:1,new Intent(c,TimerReceiver.class).setAction(running?TimerReceiver.STOP:TimerReceiver.START),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    String status=Store.status(c),text=running?course+" · Çalışma sürüyor":course+" · 00:00:00 · Başlamaya hazır";
    if(!status.equals("Senkron"))text=course+" · "+status;
    Notification n=new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_timer).setContentTitle("Çalışma Takip")
      .setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text+"\n"+(data.optBoolean("runningPlan")?"Tamamlanan seansa sayılacak":"Süre kaydı")))
      .setContentIntent(open).setColor(Color.rgb(29,158,117)).setCategory(Notification.CATEGORY_STOPWATCH)
      .setVisibility(Notification.VISIBILITY_PUBLIC).setOnlyAlertOnce(true).setOngoing(true)
      .setWhen(running?start:0).setShowWhen(running).setUsesChronometer(running)
      .addAction(new Notification.Action.Builder(null,running?"■ Kaydet":"▶ Başlat",action).build()).build();
    return n;
  }
}
