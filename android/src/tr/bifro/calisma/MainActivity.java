package tr.bifro.calisma;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

public final class MainActivity extends Activity {
  static final int GREEN=Color.rgb(29,158,117),RED=Color.rgb(216,90,48),TEXT=Color.rgb(240,240,240),MUTED=Color.rgb(162,162,162);
  TextView clock,date,goal,tasks,status;Button start,stop,notifications;CheckBox count;Spinner courses;
  final ArrayList<String> courseIds=new ArrayList<>(),courseNames=new ArrayList<>();boolean rendering=false;
  final Handler handler=new Handler(Looper.getMainLooper());
  final Runnable tick=new Runnable(){public void run(){renderTime();handler.postDelayed(this,1000);}};
  final Runnable poll=new Runnable(){public void run(){Sync.request(MainActivity.this,null);handler.postDelayed(this,15000);}};
  final BroadcastReceiver updated=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){render();if(!Store.testMode)TimerService.ensure(c);}};
  int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
  GradientDrawable box(int color,int radius,boolean border){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));if(border)d.setStroke(dp(1),Color.rgb(50,50,50));return d;}
  TextView text(String value,int size,int color){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(color);return v;}
  LinearLayout.LayoutParams params(int width,int height,int bottom){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(width,height);p.bottomMargin=dp(bottom);return p;}
  Button button(String label,int color){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextColor(Color.WHITE);b.setTextSize(14);b.setMinHeight(dp(48));b.setBackground(box(color,8,false));return b;}
  @Override public void onCreate(Bundle state){
    super.onCreate(state);if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
    ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(15,15,15));
    LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(16),dp(20),dp(16),dp(20));
    scroll.addView(root,new ScrollView.LayoutParams(-1,-1));
    if(Build.VERSION.SDK_INT>=30)scroll.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
    LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(20),dp(22),dp(20),dp(18));card.setBackground(box(Color.rgb(26,26,26),12,true));
    root.addView(card,params(-1,-2,12));
    date=text("",12,MUTED);date.setGravity(Gravity.CENTER);card.addView(date,params(-1,-2,16));
    clock=text("00:00:00",44,TEXT);clock.setTypeface(Typeface.MONOSPACE);clock.setGravity(Gravity.CENTER);clock.setContentDescription("Geçen çalışma süresi");
    clock.setAutoSizeTextTypeUniformWithConfiguration(26,48,1,android.util.TypedValue.COMPLEX_UNIT_SP);card.addView(clock,params(-1,dp(76),16));
    LinearLayout buttons=new LinearLayout(this);start=button("▶ Başlat",GREEN);stop=button("■ Kaydet",RED);
    LinearLayout.LayoutParams left=new LinearLayout.LayoutParams(0,dp(48),1);left.rightMargin=dp(10);buttons.addView(start,left);buttons.addView(stop,new LinearLayout.LayoutParams(0,dp(48),1));card.addView(buttons,params(-1,-2,12));
    count=new CheckBox(this);count.setText("Bu çalışmayı tamamlanan seans olarak say");count.setTextColor(MUTED);count.setTextSize(12);count.setMinHeight(dp(48));card.addView(count,params(-1,-2,8));
    LinearLayout courseRow=new LinearLayout(this);courseRow.setGravity(Gravity.CENTER_VERTICAL);courseRow.addView(text("Ders",12,MUTED),new LinearLayout.LayoutParams(dp(40),-2));
    courses=new Spinner(this);courses.setContentDescription("Ders");courses.setBackground(box(Color.rgb(36,36,36),8,true));courseRow.addView(courses,new LinearLayout.LayoutParams(0,dp(48),1));card.addView(courseRow,params(-1,-2,16));
    View divider=new View(this);divider.setBackgroundColor(Color.rgb(48,48,48));card.addView(divider,params(-1,dp(1),16));
    card.addView(text("◎   HEDEF",11,MUTED),params(-1,-2,6));goal=text("Bağlanıyor…",14,GREEN);card.addView(goal,params(-1,-2,14));
    card.addView(text("✓   GÖREVLER",11,MUTED),params(-1,-2,6));tasks=text("",13,MUTED);tasks.setLineSpacing(dp(4),1);card.addView(tasks,params(-1,-2,0));
    status=text("Bağlanıyor…",12,MUTED);status.setPadding(dp(2),dp(6),dp(2),dp(10));root.addView(status,params(-1,-2,8));
    notifications=button("Kilit ekranı bildirimini aç",Color.rgb(40,40,40));root.addView(notifications,params(-1,-2,10));
    Button web=button("Web uygulamasını aç",Color.rgb(40,40,40));root.addView(web,params(-1,-2,0));
    web.setOnClickListener(v->startActivity(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse("https://bifro.github.io/calisma-takip-demo/"))));
    start.setOnClickListener(v->action(true));stop.setOnClickListener(v->action(false));status.setOnClickListener(v->Sync.request(this,null));
    notifications.setOnClickListener(v->{
      if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){Store.notifications(this,true);requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},1);}
      else{boolean enabled=!Store.notifications(this);Store.notifications(this,enabled);if(enabled)TimerService.ensure(this);else{stopService(new Intent(this,TimerService.class));getSystemService(NotificationManager.class).cancel(TimerNotification.ID);}render();}
    });
    count.setOnCheckedChangeListener((b,checked)->{if(!rendering)saveSelection();});
    courses.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> parent){}public void onItemSelected(AdapterView<?> p,View v,int pos,long id){if(!rendering)saveSelection();}});
    setContentView(scroll);render();if(!Store.testMode)SyncJob.schedulePeriodic(this);
  }
  void saveSelection(){int selected=courses.getSelectedItemPosition();if(selected>=0&&selected<courseIds.size()){Store.selection(this,courseIds.get(selected),count.isChecked());TimerNotification.update(this);}}
  void action(boolean begin){try{if(begin){saveSelection();Store.start(this,Store.selectedCourse(this),count.isChecked());}else Store.stop(this);
    render();TimerNotification.update(this);if(!Store.testMode){TimerService.ensure(this);SyncJob.scheduleRetry(this);}Sync.request(this,null);
  }catch(Exception e){Toast.makeText(this,e.getMessage(),Toast.LENGTH_LONG).show();}}
  void renderTime(){long start=TimerModel.running(Store.data(this));clock.setText(TimerNotification.duration(start>0?Math.max(0,(System.currentTimeMillis()-start)/1000):0));clock.setTextColor(TEXT);}
  void render(){
    rendering=true;JSONObject data=Store.data(this);long running=TimerModel.running(data);String today=TimerModel.day(System.currentTimeMillis());
    date.setText(new SimpleDateFormat("d MMMM yyyy EEEE",new Locale("tr","TR")).format(new Date()));
    JSONObject plan=data.optJSONObject("studyPlan");JSONArray list=plan!=null?plan.optJSONArray("courses"):null;
    ArrayList<String> names=new ArrayList<>(),ids=new ArrayList<>();String current="";
    if(list!=null)for(int i=0;i<list.length();i++){JSONObject c=list.optJSONObject(i);if(c==null)continue;ids.add(c.optString("start"));names.add(c.optString("name"));if(today.compareTo(c.optString("start"))>=0&&today.compareTo(c.optString("end"))<=0)current=c.optString("start");}
    String chosen=running>0?data.optString("runningCourse"):Store.selectedCourse(this);if(chosen.isEmpty())chosen=current;if(chosen.isEmpty()&&!ids.isEmpty())chosen=ids.get(0);
    if(!ids.equals(courseIds)||!names.equals(courseNames)){courseIds.clear();courseIds.addAll(ids);courseNames.clear();courseNames.addAll(names);ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,courseNames);courses.setAdapter(adapter);}
    int position=courseIds.indexOf(chosen);if(position>=0)courses.setSelection(position);
    count.setChecked(running>0?data.optBoolean("runningPlan"):Store.selectedCount(this));count.setEnabled(running==0);courses.setEnabled(running==0);
    start.setEnabled(running==0&&Store.ready(this));stop.setEnabled(running>0);start.setAlpha(start.isEnabled()?1f:.35f);stop.setAlpha(stop.isEnabled()?1f:.35f);
    JSONObject goals=data.optJSONObject("dayGoals");double hours=goals!=null?goals.optDouble(today,0):0;
    int minutes=(int)Math.round(hours*60);goal.setText(minutes>0?(minutes/60)+" sa "+(minutes%60)+" dk hedef":"Çalışma hedefi yok");
    ArrayList<String> lines=new ArrayList<>();JSONObject dayTasks=data.optJSONObject("dayTasks"),weekTasks=data.optJSONObject("weekTasks");
    appendTasks(lines,dayTasks!=null?dayTasks.optJSONArray(today):null);appendTasks(lines,weekTasks!=null?weekTasks.optJSONArray(TimerModel.monday(today)):null);
    tasks.setText(lines.isEmpty()?"Görev yok":android.text.TextUtils.join("\n",lines));status.setText(Store.status(this));
    boolean granted=Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;
    notifications.setText(granted&&Store.notifications(this)?"Kilit ekranı bildirimini kapat":"Kilit ekranı bildirimini aç");
    rendering=false;renderTime();
    if(running==0&&position>=0)Store.selection(this,courseIds.get(position),count.isChecked());
  }
  void appendTasks(ArrayList<String> lines,JSONArray list){if(list==null)return;for(int i=0;i<list.length();i++){JSONObject item=list.optJSONObject(i);if(item!=null)lines.add((item.optBoolean("done")?"✓ ":"• ")+item.optString("text"));}}
  @Override protected void onResume(){super.onResume();IntentFilter filter=new IntentFilter(Sync.UPDATED);if(Build.VERSION.SDK_INT>=33)registerReceiver(updated,filter,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(updated,filter);render();handler.post(tick);handler.post(poll);if(!Store.testMode)TimerService.ensure(this);}
  @Override protected void onPause(){handler.removeCallbacks(tick);handler.removeCallbacks(poll);unregisterReceiver(updated);super.onPause();}
  @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);TimerNotification.update(this);TimerService.ensure(this);render();}
}
