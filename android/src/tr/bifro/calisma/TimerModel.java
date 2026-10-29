package tr.bifro.calisma;

import org.json.*;
import java.time.*;
import java.util.*;

/** Pure transformations; all remote writes are guarded by Firestore updateTime. */
public final class TimerModel {
  public static JSONObject empty() throws JSONException {
    return new JSONObject("{\"sessions\":[],\"tasks\":{\"daily\":[],\"weekly\":[]},\"dayTasks\":{},\"weekTasks\":{},\"dayGoals\":{},\"runningStart\":null,\"runningPlan\":false,\"runningCourse\":null,\"studyPlan\":null}");
  }
  public static String day(long time) { return Instant.ofEpochMilli(time).atZone(ZoneId.systemDefault()).toLocalDate().toString(); }
  public static String monday(String day) { LocalDate d=LocalDate.parse(day);return d.minusDays(d.getDayOfWeek().getValue()-1).toString(); }
  public static long running(JSONObject data) { return data.optLong("runningStart",0); }
  public static JSONObject copy(JSONObject data) throws JSONException { return new JSONObject(data.toString()); }
  public static JSONArray array(JSONObject data,String key) throws JSONException {
    JSONArray result=data.optJSONArray(key);if(result==null){result=new JSONArray();data.put(key,result);}return result;
  }
  public static boolean recorded(JSONObject data,long start) {
    JSONArray sessions=data.optJSONArray("sessions");if(sessions==null)return false;
    for(int i=0;i<sessions.length();i++)if(sessions.optJSONObject(i)!=null&&sessions.optJSONObject(i).optLong("timerStart",-1)==start)return true;
    return false;
  }
  public static boolean willStop(JSONArray ops,long start) {
    for(int i=0;i<ops.length();i++){JSONObject op=ops.optJSONObject(i);if(op!=null&&op.optString("kind").equals("stop")&&op.optLong("start")==start)return true;}return false;
  }
  public static Set<String> apply(JSONObject data,JSONObject op,boolean completedLocally) throws Exception {
    Set<String> changed=new LinkedHashSet<>();long start=op.getLong("start");String kind=op.getString("kind");
    if(kind.equals("start")){
      if(recorded(data,start))return changed;
      long remote=running(data);
      if(remote!=0&&remote!=start){
        if(completedLocally)return changed;
        throw new IllegalStateException("Başka cihazda farklı bir kronometre çalışıyor. Bu çalışmayı Kaydet ile bitirince kayıtlar birleştirilecek.");
      }
      data.put("runningStart",start);data.put("runningPlan",op.optBoolean("count"));data.put("runningCourse",op.optString("course"));
      changed.addAll(Arrays.asList("runningStart","runningPlan","runningCourse"));return changed;
    }
    if(!kind.equals("stop"))throw new IllegalArgumentException("Bilinmeyen işlem");
    if(!recorded(data,start)){
      long end=op.getLong("end"),seconds=Math.max(0,(end-start)/1000);
      long cursor=start,remaining=seconds;int part=0;
      JSONArray sessions=array(data,"sessions");
      while(cursor<end&&remaining>0){
        long midnight=Instant.ofEpochMilli(cursor).atZone(ZoneId.systemDefault()).toLocalDate().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
        long cut=Math.min(midnight,end),duration=cut==end?remaining:Math.min(remaining,(cut-cursor)/1000);
        if(duration>0)sessions.put(new JSONObject().put("id",op.getString("id")+"-"+part++).put("groupId",op.getString("id"))
          .put("date",day(cursor)).put("duration",duration).put("ts",cut).put("timerStart",start));
        remaining-=duration;cursor=cut;
      }
      if(seconds>0){
        changed.add("sessions");JSONObject plan=data.optJSONObject("studyPlan");
        if(op.optBoolean("count")&&plan!=null){
          JSONArray progress=array(plan,"progress");boolean exists=false;
          for(int i=0;i<progress.length();i++)if(progress.optJSONObject(i)!=null&&op.getString("id").equals(progress.optJSONObject(i).optString("id")))exists=true;
          if(!exists)progress.put(new JSONObject().put("id",op.getString("id")).put("sessionGroup",op.getString("id"))
            .put("date",day(end)).put("count",1).put("courseStart",op.optString("course")));
          changed.add("studyPlan");
        }
      }
    }
    if(running(data)==start){data.put("runningStart",JSONObject.NULL);data.put("runningPlan",false);data.put("runningCourse",JSONObject.NULL);
      changed.addAll(Arrays.asList("runningStart","runningPlan","runningCourse"));}
    return changed;
  }
}
