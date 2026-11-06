package tr.bifro.calisma;

import android.app.*;
import android.content.*;
import android.os.*;
import android.graphics.Bitmap;
import android.service.notification.StatusBarNotification;
import android.accessibilityservice.AccessibilityService;
import android.view.*;
import android.widget.*;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.*;
import java.io.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

public final class TimerInstrumentation extends Instrumentation {
  int assertions=0;
  void check(boolean condition,String name){assertions++;android.util.Log.i("StudyTest",assertions+": "+name);if(!condition)throw new AssertionError(name);}
  JSONObject fixture() throws Exception {
    JSONObject d=TimerModel.empty();
    d.put("dayGoals",new JSONObject().put(TimerModel.day(System.currentTimeMillis()),4));
    d.put("studyPlan",new JSONObject("{\"exam\":\"Mart 2027 TUS\",\"score\":\"65–70\",\"dayTypes\":{},\"courseDone\":{},\"courses\":[{\"name\":\"Pediatri\",\"start\":\"2026-10-27\",\"end\":\"2026-11-09\"},{\"name\":\"Mikrobiyoloji\",\"start\":\"2026-12-01\",\"end\":\"2026-12-07\"}],\"progress\":[],\"early\":{\"total\":20,\"start\":\"2026-10-29\",\"deadline\":\"2026-11-03\",\"pagesPerSession\":20}}"));return d;
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
  void screenshot(String name) throws Exception {SystemClock.sleep(200);SystemClock.sleep(500);Bitmap bitmap=getUiAutomation().takeScreenshot();try(FileOutputStream out=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),name))){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();}
  Object js(MainActivity activity,String expression) throws Exception {
    android.util.Log.i("StudyTest","JS "+expression);
    CountDownLatch latch=new CountDownLatch(1);String[] answer=new String[1];
    runOnMainSync(()->activity.web.evaluateJavascript(expression,value->{answer[0]=value;latch.countDown();}));
    if(!latch.await(12,TimeUnit.SECONDS))throw new AssertionError("Web UI callback timeout");
    return new JSONTokener(answer[0]).nextValue();
  }
  void waitJs(MainActivity activity,String expression) throws Exception {
    for(int attempt=0;attempt<100;attempt++){if(Boolean.TRUE.equals(js(activity,expression)))return;SystemClock.sleep(100);}
    throw new AssertionError("Web UI did not reach expected state: "+expression+"; page="+js(activity,"JSON.stringify({url:location.href,ready:document.readyState,text:document.body?document.body.innerText.slice(0,800):'',bridge:typeof StudyAndroid})"));
  }
  boolean collapseNotification(AccessibilityNodeInfo node){
    if(node==null)return false;CharSequence description=node.getContentDescription();
    if(description!=null&&description.toString().equals("Collapse")){return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);}
    for(int i=0;i<node.getChildCount();i++)if(collapseNotification(node.getChild(i)))return true;
    return false;
  }
  boolean clickLabel(AccessibilityNodeInfo node,String label){
    if(node==null)return false;CharSequence text=node.getText();
    if(text!=null&&text.toString().equalsIgnoreCase(label)){
      AccessibilityNodeInfo target=node;for(int i=0;i<4&&target!=null;i++,target=target.getParent())if(target.isClickable()&&target.performAction(AccessibilityNodeInfo.ACTION_CLICK))return true;
    }
    for(int i=0;i<node.getChildCount();i++)if(clickLabel(node.getChild(i),label))return true;return false;
  }
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
      JSONObject editBase=fixture(),editAfter=TimerModel.copy(editBase),editRemote=TimerModel.copy(editBase);
      editAfter.getJSONObject("dayGoals").put("2026-11-01",3);
      editRemote.getJSONArray("sessions").put(new JSONObject().put("id","remote-study").put("date","2026-11-01").put("duration",1800));
      JSONObject edit=new JSONObject().put("kind","edit").put("before",editBase).put("after",editAfter);
      TimerModel.apply(editRemote,edit,false);check(editRemote.getJSONArray("sessions").length()==1&&editRemote.getJSONObject("dayGoals").getInt("2026-11-01")==3,"web field edit preserves remote session");
      JSONObject ambiguous=TimerModel.copy(editBase);ambiguous.getJSONObject("dayGoals").put("2026-11-01",5);
      boolean editConflict=false;try{TimerModel.apply(ambiguous,edit,false);}catch(WebEdits.Conflict expected){editConflict=true;}
      check(editConflict&&ambiguous.getJSONObject("dayGoals").getInt("2026-11-01")==5,"overlapping web edit rejected atomically");
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
      Intent launch=new Intent(target,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK);
      ActivityMonitor launchMonitor=addMonitor(MainActivity.class.getName(),null,false);
      runOnMainSync(()->target.startActivity(launch));
      MainActivity activity=(MainActivity)waitForMonitorWithTimeout(launchMonitor,15000);removeMonitor(launchMonitor);
      check(activity!=null,"full app activity launched without waiting for animated page to become idle");SystemClock.sleep(200);
      waitJs(activity,"!!document.getElementById('timerDisplay')&&document.getElementById('loadingOverlay').classList.contains('hidden')");
      runOnMainSync(()->TimerNotification.update(target));
      check(js(activity,"document.getElementById('timerDisplay').textContent").toString().startsWith("00:01:"),"shared web UI shows elapsed native timer");
      check(((Number)js(activity,"document.querySelectorAll('.tabs .tab').length")).intValue()==5,"all five website tabs packaged in APK");
      check(js(activity,"document.querySelector('.header-logo').naturalWidth>0").equals(true),"bundled logo loads offline");
      NotificationManager manager=target.getSystemService(NotificationManager.class);StatusBarNotification[] posted=manager.getActiveNotifications();
      for(int attempt=0;posted.length==0&&attempt<60;attempt++){SystemClock.sleep(100);posted=manager.getActiveNotifications();}
      check(posted.length==1,"one timer notification");Notification n=posted[0].getNotification();
      check(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER),"Android system chronometer enabled");
      check(n.visibility==Notification.VISIBILITY_PUBLIC,"lock screen visibility");
      check(n.contentView!=null&&n.bigContentView!=null,"compact and expanded custom layouts exist");
      final View[] compact=new View[1],expanded=new View[1];final Notification runningNotification=n;
      runOnMainSync(()->{compact[0]=runningNotification.contentView.apply(target,new FrameLayout(target));expanded[0]=runningNotification.bigContentView.apply(target,new FrameLayout(target));});
      check(((Button)compact[0].findViewById(R.id.notif_action)).getText().toString().contains("Kaydet"),"compact save button exists without expanding");
      check(compact[0].findViewById(R.id.notif_action).isEnabled(),"compact save button enabled");
      check(compact[0].findViewById(R.id.notif_clock).getVisibility()==View.VISIBLE,"compact live chronometer visible");
      check(!expanded[0].findViewById(R.id.notif_start).isEnabled()&&expanded[0].findViewById(R.id.notif_stop).isEnabled(),"expanded buttons match running state");
      runOnMainSync(()->{int width=(int)(240*target.getResources().getDisplayMetrics().density);expanded[0].measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec((int)(148*target.getResources().getDisplayMetrics().density),View.MeasureSpec.EXACTLY));expanded[0].layout(0,0,width,expanded[0].getMeasuredHeight());});
      View narrowStop=expanded[0].findViewById(R.id.notif_stop);
      check(narrowStop.getWidth()>0&&narrowStop.getRight()<=((View)narrowStop.getParent()).getWidth(),"expanded controls fit narrow notification without clipping");
      SystemClock.sleep(500);
      screenshot("apk-kronometre.png");
      getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS);SystemClock.sleep(1500);screenshot("apk-bildirim.png");
      collapseNotification(getUiAutomation().getRootInActiveWindow());SystemClock.sleep(500);screenshot("apk-bildirim-kapali.png");
      runOnMainSync(()->compact[0].findViewById(R.id.notif_action).performClick());
      for(int attempt=0;TimerModel.running(Store.data(target))>0&&attempt<50;attempt++)SystemClock.sleep(100);
      SystemClock.sleep(200);Sync.executor.submit(()->{}).get(20,TimeUnit.SECONDS);SystemClock.sleep(200);
      check(TimerModel.running(Store.data(target))==0,"notification action stops timer");
      check(TimerModel.running(memory.data)==0,"notification stop reaches shared database");
      check(memory.data.getJSONObject("studyPlan").getJSONArray("progress").length()==1,"legacy in-flight notification completion preserved");
      TimerNotification.update(target);SystemClock.sleep(250);
      StatusBarNotification[] idlePosted=manager.getActiveNotifications();
      for(int attempt=0;idlePosted.length==0&&attempt<30;attempt++){SystemClock.sleep(100);idlePosted=manager.getActiveNotifications();}
      check(idlePosted.length==1,"idle custom notification stays available");
      Notification idle=idlePosted[0].getNotification();final View[] idleCompact=new View[1];
      runOnMainSync(()->idleCompact[0]=idle.contentView.apply(target,new FrameLayout(target)));
      check(((Button)idleCompact[0].findViewById(R.id.notif_action)).getText().toString().contains("Başlat"),"compact idle notification has start");
      check(idleCompact[0].findViewById(R.id.notif_idle).getVisibility()==View.VISIBLE,"idle clock visible");
      runOnMainSync(()->idleCompact[0].findViewById(R.id.notif_action).performClick());
      for(int attempt=0;TimerModel.running(Store.data(target))==0&&attempt<50;attempt++)SystemClock.sleep(100);
      Sync.executor.submit(()->{}).get(20,TimeUnit.SECONDS);
      check(TimerModel.running(Store.data(target))>0,"compact notification starts without expanding");
      for(int attempt=0;TimerModel.running(memory.data)==0&&attempt<50;attempt++)SystemClock.sleep(100);
      check(TimerModel.running(memory.data)>0,"compact start reaches shared database");
      getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE);SystemClock.sleep(500);
      waitJs(activity,"running===true&&store.runningStart>0");
      js(activity,"document.getElementById('btnStop').click();true");
      for(int attempt=0;TimerModel.running(Store.data(target))>0&&attempt<100;attempt++)SystemClock.sleep(100);
      Sync.executor.submit(()->{}).get(20,TimeUnit.SECONDS);
      check(TimerModel.running(Store.data(target))==0&&TimerModel.running(memory.data)==0,"web UI save stops notification and shared timer");
      check(js(activity,"document.getElementById('countPlanSession')===null&&document.getElementById('timerCourse')===null").equals(true),"pre-study course and count controls removed");
      check(!memory.data.optBoolean("runningPlan"),"new notification start does not auto-count completion");
      memory.offline=true;
      js(activity,"document.querySelectorAll('.tab')[2].click();openTargetEditor(targets()[0].id);document.getElementById('targetTotal').value='25';saveWorkflow({preventDefault:function(){}});true");
      for(int attempt=0;Store.ops(target).length()==0&&attempt<100;attempt++)SystemClock.sleep(100);
      Sync.executor.submit(()->{}).get(20,TimeUnit.SECONDS);
      check(Store.ops(target).length()>0&&Store.data(target).getJSONObject("studyPlan").getJSONArray("sessionTargets").getJSONObject(0).getInt("total")==25,"target edit persists offline in native queue");
      check(memory.data.getJSONObject("studyPlan").getJSONArray("sessionTargets").getJSONObject(0).getInt("total")==20,"offline target edit not falsely cloud saved");
      memory.offline=false;memory.data.getJSONObject("dayGoals").put(TimerModel.day(System.currentTimeMillis()),5);memory.version++;
      Sync.perform(target);target.sendBroadcast(new Intent(Sync.UPDATED).setPackage(target.getPackageName()));
      check(memory.data.getJSONObject("studyPlan").getJSONArray("sessionTargets").getJSONObject(0).getInt("total")==25,"offline session target reaches shared database");
      check(memory.data.getJSONObject("dayGoals").getInt(TimerModel.day(System.currentTimeMillis()))==5,"web queue preserves another devices goal update");
      waitJs(activity,"!pendingSync&&!syncBusy&&store.dayGoals[todayStr()]===5");
      js(activity,"document.querySelectorAll('.tab')[4].click();true");
      check(js(activity,"document.getElementById('nativeNotifications')!==null").equals(true),"notification toggle in timer tab");
      js(activity,"document.querySelectorAll('.tab')[0].click();openWorkEditor();document.getElementById('workMinutes0').value='30';document.getElementById('workSeconds0').value='15';document.getElementById('workNote').value='Manual work test';saveWorkflow({preventDefault:function(){}});true");
      waitJs(activity,"!pendingSync&&!syncBusy&&!workflowSaving");Sync.executor.submit(()->{}).get(20,TimeUnit.SECONDS);
      check(js(activity,"secsForDay(todayStr())>=1815").equals(true),"manual duration entered inside APK");
      js(activity,"window.testWork=workGroups().find(function(g){return g.parts[0].note==='Manual work test';}).key;openCompletion(window.testWork);document.getElementById('completionCount').value='2';saveWorkflow({preventDefault:function(){}});true");
      waitJs(activity,"!pendingSync&&!syncBusy&&!workflowSaving");Sync.executor.submit(()->{}).get(20,TimeUnit.SECONDS);
      boolean manualProgress=false;JSONArray savedProgress=memory.data.getJSONObject("studyPlan").getJSONArray("progress");for(int i=0;i<savedProgress.length();i++)if(savedProgress.getJSONObject(i).optInt("count")==2)manualProgress=true;
      check(manualProgress,"post-study completion in APK reaches shared session target");
      js(activity,"openWorkEditor(window.testWork);document.getElementById('workMinutes0').value='20';document.getElementById('workSeconds0').value='7';saveWorkflow({preventDefault:function(){}});true");
      waitJs(activity,"!pendingSync&&!syncBusy&&!workflowSaving");Sync.executor.submit(()->{}).get(20,TimeUnit.SECONDS);
      check(js(activity,"findWork(window.testWork).duration===1207&&linkedProgress(findWork(window.testWork))[0].count===2").equals(true),"duration edit preserves linked completion and seconds");
      js(activity,"openCompletion(window.testWork);undoWorkCompletion();true");waitJs(activity,"!pendingSync&&!syncBusy&&!workflowSaving");Sync.executor.submit(()->{}).get(20,TimeUnit.SECONDS);
      check(js(activity,"linkedProgress(findWork(window.testWork)).length===0&&findWork(window.testWork).duration===1207").equals(true),"undo completion preserves work duration");
      js(activity,"document.querySelectorAll('.tab')[3].click();true");
      check(js(activity,"document.getElementById('tab-calendar').classList.contains('active')").equals(true),"calendar screen inside APK");
      screenshot("apk-takvim-2.png");
      js(activity,"document.querySelectorAll('.tab')[1].click();true");screenshot("apk-istatistik-2.png");
      js(activity,"document.querySelectorAll('.tab')[0].click();true");screenshot("apk-tam-uygulama-2.png");
      js(activity,"downloadBackup();true");
      boolean saved=false;for(int attempt=0;attempt<100;attempt++){if(clickLabel(getUiAutomation().getRootInActiveWindow(),"Save")){saved=true;break;}SystemClock.sleep(100);}
      for(int attempt=0;activity.savedExport==null&&attempt<100;attempt++){clickLabel(getUiAutomation().getRootInActiveWindow(),"Replace");SystemClock.sleep(100);}
      check(saved&&activity.savedExport!=null,"APK backup saved through real Android document picker");
      ByteArrayOutputStream backupBytes=new ByteArrayOutputStream();try(InputStream input=target.getContentResolver().openInputStream(activity.savedExport)){byte[] buffer=new byte[4096];int bytesRead;while((bytesRead=input.read(buffer))!=-1)backupBytes.write(buffer,0,bytesRead);}
      JSONObject exportedJson=new JSONObject(backupBytes.toString("UTF-8"));
      check(exportedJson.getJSONObject("store").getJSONArray("sessions").length()==Store.data(target).getJSONArray("sessions").length(),"exported JSON includes current app work records");
      target.stopService(new Intent(target,TimerService.class));target.getSystemService(android.app.job.JobScheduler.class).cancelAll();
      String production="";try{JSONObject live=Sync.decode(new Sync.Firestore().read());check(live.optJSONObject("studyPlan")!=null,"production Firestore plan read");production="Production Firestore read: PASS.";}catch(IOException e){production="Production Firestore read unavailable: "+e.getClass().getSimpleName();}
      result.putString("stream","PASS: "+assertions+" assertions; model, offline queue, conflict retry, web/native deduplication, UI, system chronometer and notification action. No production Firestore writes. "+production+"\n");
      finish(Activity.RESULT_OK,result);
    }catch(Throwable e){result.putString("stream","FAIL after "+assertions+" assertions: "+android.util.Log.getStackTraceString(e));finish(Activity.RESULT_CANCELED,result);}
  }
}
