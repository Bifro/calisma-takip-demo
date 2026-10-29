package tr.bifro.calisma;

import android.content.*;
import android.os.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public final class Sync {
  static final String DOCUMENT="projects/calisma-takip-74fd5/databases/(default)/documents/data/shared";
  static final String ROOT="https://firestore.googleapis.com/v1/";
  static final String UPDATED="tr.bifro.calisma.UPDATED";
  static final ExecutorService executor=Executors.newSingleThreadExecutor();
  interface Transport {JSONObject read() throws Exception;void commit(JSONObject data,Set<String> fields,String version) throws Exception;}
  static Transport transport=new Firestore();
  static String json(Object value){return value instanceof String?JSONObject.quote((String)value):String.valueOf(value);}
  static JSONObject fields(JSONObject data,Set<String> keys) throws JSONException {
    JSONObject fields=new JSONObject();for(String key:keys)fields.put(key,new JSONObject().put("stringValue",json(data.get(key))));return fields;
  }
  static class Conflict extends IOException {}
  static class Firestore implements Transport {
    private JSONObject request(String url,JSONObject body) throws Exception {
      HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();
      connection.setConnectTimeout(6000);connection.setReadTimeout(6000);
      try{
        if(body!=null){connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json; charset=utf-8");
          try(OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
        int status=connection.getResponseCode();InputStream input=status>=200&&status<300?connection.getInputStream():connection.getErrorStream();
        ByteArrayOutputStream out=new ByteArrayOutputStream();if(input!=null)try(InputStream in=input){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
        JSONObject response=new JSONObject(out.toString("UTF-8"));
        if(status<200||status>=300){String code=response.optJSONObject("error")!=null?response.getJSONObject("error").optString("status"):"";
          if(status==409||status==412||code.equals("FAILED_PRECONDITION")||code.equals("ABORTED"))throw new Conflict();
          throw new IOException("Bulut bağlantısı kurulamadı ("+status+")");}
        return response;
      }finally{connection.disconnect();}
    }
    public JSONObject read() throws Exception{return request(ROOT+DOCUMENT,null);}
    public void commit(JSONObject data,Set<String> changed,String version) throws Exception {
      JSONObject fields=fields(data,changed);JSONArray mask=new JSONArray();
      for(String key:changed)mask.put(key);
      JSONObject write=new JSONObject().put("update",new JSONObject().put("name",DOCUMENT).put("fields",fields))
        .put("updateMask",new JSONObject().put("fieldPaths",mask)).put("currentDocument",new JSONObject().put("updateTime",version));
      request(ROOT+"projects/calisma-takip-74fd5/databases/(default)/documents:commit",new JSONObject().put("writes",new JSONArray().put(write)));
    }
  }
  static JSONObject decode(JSONObject document) throws Exception {
    JSONObject data=TimerModel.empty(),fields=document.getJSONObject("fields");
    Iterator<String> keys=fields.keys();while(keys.hasNext()){
      String key=keys.next();JSONObject field=fields.getJSONObject(key);
      if(field.has("stringValue"))data.put(key,new JSONTokener(field.getString("stringValue")).nextValue());
    }
    return data;
  }
  static void perform(Context c) throws Exception {
    for(int round=0;round<6;round++){
      JSONArray ops=Store.ops(c);JSONObject document=transport.read(),data=decode(document);
      if(ops.length()==0){Store.acceptRemote(c,data);return;}
      Set<String> changed=new LinkedHashSet<>();
      for(int i=0;i<ops.length();i++){JSONObject op=ops.getJSONObject(i);changed.addAll(TimerModel.apply(data,op,TimerModel.willStop(ops,op.optLong("start"))));}
      try{if(!changed.isEmpty())transport.commit(data,changed,document.getString("updateTime"));}
      catch(Conflict e){if(round==5)throw new IOException("Başka cihazdaki kayıt güncelleniyor; yeniden denenecek");continue;}
      Store.acknowledge(c,ops,data);if(Store.ops(c).length()==0)return;
    }
  }
  public static void request(Context context,Runnable done){
    Context c=context.getApplicationContext();executor.execute(()->{
      try{perform(c);}catch(Exception e){Store.error(c,e instanceof IllegalStateException?e.getMessage():"Telefonda kayıtlı · internet gelince eşitlenecek");SyncJob.scheduleRetry(c);}
      TimerNotification.update(c);c.sendBroadcast(new Intent(UPDATED).setPackage(c.getPackageName()));
      if(done!=null)done.run();
    });
  }
}
