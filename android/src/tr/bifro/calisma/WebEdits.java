package tr.bifro.calisma;

import org.json.*;
import java.util.*;

/** Conservative three-way merge for edits made by the shared web interface. */
final class WebEdits {
  static final List<String> KEYS=Arrays.asList("sessions","tasks","dayTasks","weekTasks","dayGoals","runningStart","runningPlan","runningCourse","studyPlan");
  static final List<String> TIMER=Arrays.asList("runningStart","runningPlan","runningCourse");
  static final class Conflict extends IllegalStateException {Conflict(){super("Aynı kayıt başka cihazda da değişti. Bu cihazdaki değişiklikler korundu.");}}
  static boolean equal(Object a,Object b) throws JSONException {
    if(a==b)return true;if(a==null||b==null)return false;
    if(a instanceof JSONObject&&b instanceof JSONObject){JSONObject x=(JSONObject)a,y=(JSONObject)b;if(x.length()!=y.length())return false;
      Iterator<String> keys=x.keys();while(keys.hasNext()){String k=keys.next();if(!y.has(k)||!equal(x.get(k),y.get(k)))return false;}return true;}
    if(a instanceof JSONArray&&b instanceof JSONArray){JSONArray x=(JSONArray)a,y=(JSONArray)b;if(x.length()!=y.length())return false;for(int i=0;i<x.length();i++)if(!equal(x.get(i),y.get(i)))return false;return true;}
    return a.equals(b);
  }
  static Object merge(Object base,Object local,Object remote) throws Exception {
    if(equal(local,base)||equal(local,remote))return remote;if(equal(remote,base))return local;
    if(base instanceof JSONObject&&local instanceof JSONObject&&remote instanceof JSONObject){
      JSONObject b=(JSONObject)base,l=(JSONObject)local,r=(JSONObject)remote,out=new JSONObject();Set<String> keys=new LinkedHashSet<>();
      for(JSONObject item:Arrays.asList(b,l,r)){Iterator<String> it=item.keys();while(it.hasNext())keys.add(it.next());}
      for(String key:keys){Object value=merge(b.opt(key),l.opt(key),r.opt(key));if(value!=null)out.put(key,value);}return out;
    }
    throw new Conflict();
  }
  static Set<String> apply(JSONObject data,JSONObject op) throws Exception {
    JSONObject before=op.getJSONObject("before"),after=op.getJSONObject("after"),merged=TimerModel.copy(data);Set<String> changed=new LinkedHashSet<>();
    // The timer is an atomic tuple; never attach another device's course to a start.
    JSONArray b=new JSONArray(),l=new JSONArray(),r=new JSONArray();
    for(String key:TIMER){b.put(before.opt(key));l.put(after.opt(key));r.put(data.opt(key));}
    JSONArray timer=(JSONArray)merge(b,l,r);for(int i=0;i<TIMER.size();i++)merged.put(TIMER.get(i),timer.get(i));
    for(String key:KEYS)if(!TIMER.contains(key)){Object value=merge(before.opt(key),after.opt(key),data.opt(key));merged.put(key,value);}
    for(String key:KEYS)if(!equal(data.opt(key),merged.opt(key)))changed.add(key);
    for(String key:changed)data.put(key,merged.get(key));return changed;
  }
}
