package tr.bifro.calisma;

import android.app.*;
import android.content.*;
import android.os.*;
import android.graphics.Bitmap;
import android.service.notification.StatusBarNotification;
import android.accessibilityservice.AccessibilityService;
import org.json.*;
import java.io.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

public final class TimerInstrumentation extends Instrumentation {
  int assertions=0;
  void check(boolean condition,String name){assertions++;if(!condition)throw new AssertionError(name);}
  JSONObject fixture() throws Exception {
    JSONObject d=TimerModel.empty();
    d.put("dayGoals",new JSONObject().put(TimerModel.day(System.currentTimeMillis()),4));
    d.put("studyPlan",new JSONObject("{\"courses\":[{\"name\":\"Pediatri\",\"start\":\"2026-10-27\",\"end\":\"2026-11-09\"},{\"name\":\"Mikrobiyoloji\",\"start\":\"2026-12-01\",\"end\":\"2026-12-07\"}],\"progress\":[],\"early\":{\"total\":20,\"start\":\"2026-10-29\"}}"));return d;
  }
  JSONObject start(long time) throws Exception{return new JSONObject().put("kind","start").put("start",time).put("course","2026-10-27").put("count",true).put("opId","start");}
  JSONObject stop(long time,long end) throws Exception{return new JSONObject().put("kind","stop").put("start",time).put("end",end).put("course","2026-10-27").put("count",true).put("id","test-session").put("opId","stop");}
  final class MemoryTransport implements Sync.Transport {
    JSONObject data;int version=1,commits=0;boolean offline=false,conflict=false;
    MemoryTransport(JSONObject data){this.data=data;}
    public synchronized JSONObject read() throws Exception {
      if(offline)throw new IOException("offline");JSONObject fields=new JSONObject();Iterator<String> keys=data.keys();
      while(keys.hasNext()){String k=keys.next();fields.put(k,new JSONObject().put("stringValue",Sync.json(data.get(k))));}
      return new JSONObject().put("fields",fields).put("updateTime","v"+version);
    }
    public synchronized void commit(JSONObject next,Set<String> fields,String expected) throws Exception {
      if(conflict){conflict=false;data.getJSONObject("dayGoals").put("2026-11-01",5);version++;throw new Sync.Conflict();}
      if(!expected.equals("v"+version))throw new Sync.Conflict();
      for(String key:fields)data.put(key,next.get(key));version++;commits++;
    }
  }
  @Override public void onCreate(Bundle args){super.onCreate(args);start();}
  void screenshot(String name) throws Exception {Bitmap bitmap=getUiAutomation().takeScreenshot();try(FileOutputStream out=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),name))){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();}
  @Override public void onStart(){
    Bundle result=new Bundle();Context c=getTargetContext();
    try{
      TimeZone.setDefault(TimeZone.getTimeZone("Europe/Istanbul"));
      long begin=ZonedDateTime.of(2026,10,29,23,30,0,0,ZoneId.systemDefault()).toInstant().toEpochMilli();
      JSONObject d=fixture();TimerModel.apply(d,start(begin),false);TimerModel.apply(d,stop(begin,begin+3600000),false);
      JSONObject encoded=Sync.fields(new JSONObject().put("runningCourse","2026-10-27"),new HashSet<>(Arrays.asList("runningCourse")));
      check(encoded.getJSONObject("runningCourse").getString("stringValue").equals("\"2026-10-27\""),"Firestore string uses JSON encoding compatible with web JSON.parse");
      check(d.getJSONArray("sessions").length()==2,"midnight split");check(d.getJSONArray("sessions").getJSONObject(0).getLong("duration")==1800,"first day seconds");
      check(d.getJSONObject("studyPlan").getJSONArray("progress").length()==1,"one completion across midnight");
      TimerModel.apply(d,stop(begin,begin+3600000),false);check(d.getJSONArray("sessions").length()==2,"idempotent stop");
      check(d.getJSONObject("studyPlan").getJSONArray("progress").length()==1,"idempotent progress");
      d.put("runningStart",begin+7200000);TimerModel.apply(d,stop(begin,begin+3600000),false);
      check(TimerModel.running(d)==begin+7200000,"old stop preserves newer timer");
      boolean rejected=false;try{TimerModel.apply(d,start(begin+100),false);}catch(IllegalStateException e){rejected=true;}
      check(rejected,"competing active start is retained as conflict");
      TimerModel.apply(d,start(begin+100),true);check(TimerModel.running(d)==begin+7200000,"completed offline start cannot replace another timer");
      Context target=getTargetContext();Store.resetTests(target,fixture());MemoryTransport memory=new MemoryTransport(fixture());Sync.transport=memory;
      Store.start(target,"2026-10-27",true);long nativeStart=TimerModel.running(Store.data(target));
      memory.offline=true;boolean failed=false;try{Sync.perform(target);}catch(IOException e){failed=true;}
      check(failed&&Store.ops(target).length()==1,"offline operation persists");memory.offline=false;memory.conflict=true;
      Sync.perform(target);check(Store.ops(target).length()==0,"retry consumes queue after commit");
      check(TimerModel.running(memory.data)==nativeStart,"native start appears in shared web data");
      check(memory.data.getJSONObject("dayGoals").getInt("2026-11-01")==5,"concurrent unrelated edit preserved");
      // Web saves this exact timer first; the native save must not add a second session.
      memory.data.getJSONArray("sessions").put(new JSONObject().put("date",TimerModel.day(nativeStart)).put("duration",5).put("timerStart",nativeStart));
      memory.data.put("runningStart",JSONObject.NULL);memory.version++;Store.stop(target);Sync.perform(target);
      check(memory.data.getJSONArray("sessions").length()==1,"web/native simultaneous stop deduplicates");
      memory.data.put("runningStart",System.currentTimeMillis()-65000);memory.data.put("runningPlan",true);memory.data.put("runningCourse","2026-10-27");memory.version++;
      Sync.perform(target);check(TimerModel.running(Store.data(target))>0,"web start adopted by native");
      try(InputStream grant=new android.os.ParcelFileDescriptor.AutoCloseInputStream(getUiAutomation().executeShellCommand("pm grant tr.bifro.calisma android.permission.POST_NOTIFICATIONS"))){byte[] buffer=new byte[1024];while(grant.read(buffer)!=-1){}}
      check(target.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED,"notification runtime permission");
      getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);SystemClock.sleep(300);
      Intent launch=new Intent(target,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      MainActivity activity=(MainActivity)startActivitySync(launch);waitForIdleSync();
      runOnMainSync(()->{activity.render();TimerNotification.update(target);});
      check(activity.clock.getText().toString().startsWith("00:01:"),"native UI shows elapsed shared timer");
      NotificationManager manager=target.getSystemService(NotificationManager.class);StatusBarNotification[] posted=manager.getActiveNotifications();
      for(int attempt=0;posted.length==0&&attempt<20;attempt++){SystemClock.sleep(100);posted=manager.getActiveNotifications();}
      check(posted.length==1,"one timer notification");Notification n=posted[0].getNotification();
      check(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER),"Android system chronometer enabled");
      check(n.visibility==Notification.VISIBILITY_PUBLIC,"lock screen visibility");check(n.actions.length==1&&n.actions[0].title.toString().contains("Kaydet"),"save action on running notification");
      SystemClock.sleep(500);
      screenshot("apk-kronometre.png");
      getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS);SystemClock.sleep(1500);screenshot("apk-bildirim.png");
      n.actions[0].actionIntent.send();
      for(int attempt=0;TimerModel.running(Store.data(target))>0&&attempt<50;attempt++)SystemClock.sleep(100);
      waitForIdleSync();Sync.executor.submit(()->{}).get(20,TimeUnit.SECONDS);waitForIdleSync();
      check(TimerModel.running(Store.data(target))==0,"notification action stops timer");
      check(TimerModel.running(memory.data)==0,"notification stop reaches shared database");
      check(memory.data.getJSONObject("studyPlan").getJSONArray("progress").length()==1,"notification completion reaches study plan");
      target.stopService(new Intent(target,TimerService.class));target.getSystemService(android.app.job.JobScheduler.class).cancelAll();
      String production="";try{JSONObject live=Sync.decode(new Sync.Firestore().read());check(live.optJSONObject("studyPlan")!=null,"production Firestore plan read");production="Production Firestore read: PASS.";}catch(IOException e){production="Production Firestore read unavailable: "+e.getClass().getSimpleName();}
      result.putString("stream","PASS: "+assertions+" assertions; model, offline queue, conflict retry, web/native deduplication, UI, system chronometer and notification action. No production Firestore writes. "+production+"\n");
      finish(Activity.RESULT_OK,result);
    }catch(Throwable e){result.putString("stream","FAIL after "+assertions+" assertions: "+android.util.Log.getStackTraceString(e));finish(Activity.RESULT_CANCELED,result);}
  }
}
