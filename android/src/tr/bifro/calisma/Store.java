package tr.bifro.calisma;

import android.content.*;
import org.json.*;
import java.util.UUID;

/** One atomic preferences value contains cached data and the durable operation queue. */
public final class Store {
  static boolean testMode=false;
  private static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences(testMode?"timer-tests":"timer-v1",Context.MODE_PRIVATE);}
  static JSONObject state(Context c) throws JSONException {
    String saved=prefs(c).getString("state",null);
    return saved!=null?new JSONObject(saved):new JSONObject().put("data",TimerModel.empty()).put("ops",new JSONArray()).put("ready",false).put("notifications",true);
  }
  static void persist(Context c,JSONObject state) throws Exception {
    if(!prefs(c).edit().putString("state",state.toString()).commit())throw new IllegalStateException("Telefon kaydı yapılamadı");
  }
  public static synchronized JSONObject data(Context c){try{return state(c).getJSONObject("data");}catch(Exception e){throw new IllegalStateException(e);}}
  static synchronized JSONArray ops(Context c) throws Exception {return state(c).getJSONArray("ops");}
  public static synchronized boolean ready(Context c){try{return state(c).optBoolean("ready");}catch(Exception e){return false;}}
  public static synchronized String status(Context c){try{JSONObject s=state(c);String message=s.optString("error");return !message.isEmpty()?message:s.getJSONArray("ops").length()>0?"Telefonda kayıtlı · bulut bekliyor":s.optBoolean("ready")?"Senkron":"Bağlanıyor…";}catch(Exception e){return "Kayıt okunamadı";}}
  static synchronized void error(Context c,String message){try{JSONObject s=state(c);s.put("error",message);persist(c,s);}catch(Exception ignored){}}
  static synchronized void acceptRemote(Context c,JSONObject remote) throws Exception {
    JSONObject s=state(c);if(s.getJSONArray("ops").length()==0){s.put("data",remote);s.put("ready",true);s.remove("error");persist(c,s);}
  }
  static synchronized void acknowledge(Context c,JSONArray sent,JSONObject remote) throws Exception {
    JSONObject s=state(c);JSONArray current=s.getJSONArray("ops"),remaining=new JSONArray();
    for(int i=0;i<current.length();i++){
      JSONObject op=current.getJSONObject(i);boolean matched=false;
      for(int j=0;j<sent.length();j++)if(op.getString("opId").equals(sent.getJSONObject(j).getString("opId")))matched=true;
      if(!matched)remaining.put(op);
    }
    JSONObject displayed=TimerModel.copy(remote);
    for(int i=0;i<remaining.length();i++)TimerModel.apply(displayed,remaining.getJSONObject(i),true);
    s.put("ops",remaining);s.put("data",displayed);s.put("ready",true);s.remove("error");persist(c,s);
  }
  public static synchronized void start(Context c,String course,boolean count) throws Exception {
    JSONObject s=state(c),data=s.getJSONObject("data");if(!s.optBoolean("ready"))throw new IllegalStateException("İlk kullanım için internet bağlantısı gerekiyor");
    if(TimerModel.running(data)>0)return;
    JSONObject op=new JSONObject().put("kind","start").put("start",System.currentTimeMillis()).put("course",course).put("count",count).put("opId",UUID.randomUUID().toString());
    TimerModel.apply(data,op,false);s.getJSONArray("ops").put(op);s.remove("error");persist(c,s);
  }
  public static synchronized void stop(Context c) throws Exception {
    JSONObject s=state(c),data=s.getJSONObject("data");long start=TimerModel.running(data);if(start==0)return;
    JSONObject op=new JSONObject().put("kind","stop").put("start",start).put("end",System.currentTimeMillis()).put("course",data.optString("runningCourse",""))
      .put("count",data.optBoolean("runningPlan")).put("id","android-"+UUID.randomUUID()).put("opId",UUID.randomUUID().toString());
    TimerModel.apply(data,op,false);s.getJSONArray("ops").put(op);s.remove("error");persist(c,s);
  }
  static synchronized void selection(Context c,String course,boolean count){try{JSONObject s=state(c);s.put("selectedCourse",course);s.put("selectedCount",count);persist(c,s);}catch(Exception e){error(c,e.getMessage());}}
  static synchronized String selectedCourse(Context c){try{return state(c).optString("selectedCourse");}catch(Exception e){return "";}}
  static synchronized boolean selectedCount(Context c){try{return state(c).optBoolean("selectedCount");}catch(Exception e){return false;}}
  static synchronized void notifications(Context c,boolean enabled){try{JSONObject s=state(c);s.put("notifications",enabled);persist(c,s);}catch(Exception ignored){}}
  static synchronized boolean notifications(Context c){try{return state(c).optBoolean("notifications",true);}catch(Exception e){return true;}}
  static synchronized void resetTests(Context c,JSONObject data) throws Exception {testMode=true;prefs(c).edit().clear().commit();JSONObject s=state(c);s.put("data",data);s.put("ready",true);persist(c,s);}
}
