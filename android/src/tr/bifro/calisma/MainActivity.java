package tr.bifro.calisma;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** The website's complete interface, packaged offline and backed by one native queue. */
public final class MainActivity extends Activity {
  static final String ORIGIN="https://appassets.androidplatform.net";
  static final String HOME=ORIGIN+"/web/index.html";
  static final Set<String> FILES=new HashSet<>(Arrays.asList("index.html","plan.js","workflow.js","plan.css","mobile.css","favicon.ico","site.webmanifest","assets/logo.png","assets/icon-192.png","assets/icon-512.png","assets/apple-touch-icon.png"));
  WebView web; final Handler handler=new Handler(Looper.getMainLooper()); boolean receiverRegistered=false;
  volatile String exportContent;String exportName;volatile Uri savedExport;
  final Runnable poll=new Runnable(){public void run(){if(!Store.testMode)Sync.request(MainActivity.this,null);handler.postDelayed(this,15000);}};
  final BroadcastReceiver updated=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){refreshWeb();if(!Store.testMode)TimerService.ensure(c);}};
  @Override public void onCreate(Bundle state){
    super.onCreate(state);if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
    FrameLayout root=new FrameLayout(this);root.setBackgroundColor(android.graphics.Color.rgb(15,15,15));
    web=new WebView(this);web.setBackgroundColor(android.graphics.Color.rgb(15,15,15));root.addView(web,new FrameLayout.LayoutParams(-1,-1));
    if(Build.VERSION.SDK_INT>=30)root.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
    WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setAllowFileAccessFromFileURLs(false);settings.setAllowUniversalAccessFromFileURLs(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);
    web.addJavascriptInterface(new Bridge(),"StudyAndroid");
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
        // Keep the bridge confined to the signed, bundled page. External HTTPS links use the browser.
        if(r.getUrl().toString().equals(HOME))return false;
        if(r.isForMainFrame()&&"https".equals(r.getUrl().getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,r.getUrl()));}catch(ActivityNotFoundException ignored){}
        return true;
      }
      @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
        Uri uri=r.getUrl();String path=uri.getPath();
        if("https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&path!=null&&path.startsWith("/web/")){
          String file=path.substring(5);if(FILES.contains(file))try{
            InputStream input=getAssets().open("web/"+file);String mime=file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":file.endsWith(".png")?"image/png":file.endsWith(".ico")?"image/x-icon":file.endsWith(".webmanifest")?"application/manifest+json":"text/html";
            Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");
            if(file.equals("index.html"))headers.put("Content-Security-Policy","default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'");
            return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,input);
          }catch(IOException error){if(Store.testMode)android.util.Log.e("StudyWebTest","Bundled asset unavailable: "+file,error);}
        }
        // Fonts are the only remote subresources. Data always passes through the native queue.
        if("https".equals(uri.getScheme())&&(uri.getHost().equals("fonts.googleapis.com")||uri.getHost().equals("fonts.gstatic.com")))return null;
        return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Devam",(d,w)->result.confirm()).setNegativeButton("Vazgeç",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
      @Override public boolean onJsAlert(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Tamam",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
    });
    setContentView(root);if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::onBackPressed);
    web.loadUrl(HOME);if(!Store.testMode)SyncJob.schedulePeriodic(this);
  }
  void refreshWeb(){if(web!=null)web.evaluateJavascript("if(window.onNativeUpdate)window.onNativeUpdate();",null);}
  void requestSync(){if(!Store.testMode){TimerService.ensure(this);SyncJob.scheduleRetry(this);}Sync.request(this,null);}
  String failure(Exception e){try{return new JSONObject().put("ok",false).put("conflict",e instanceof WebEdits.Conflict).put("error",e.getMessage()==null?"İşlem tamamlanamadı":e.getMessage()).toString();}catch(Exception ignored){return "{\"ok\":false}";}}
  public final class Bridge {
    @JavascriptInterface public String read(){try{return Store.webRead(MainActivity.this).toString();}catch(Exception e){return failure(e);}}
    @JavascriptInterface public String patch(String json,String version){try{String next=Store.webPatch(MainActivity.this,new JSONObject(json),version);requestSync();return new JSONObject().put("ok",true).put("version",next).toString();}catch(Exception e){return failure(e);}}
    @JavascriptInterface public String timer(boolean begin,String course,boolean count){try{Store.selection(MainActivity.this,"",false);if(begin)Store.start(MainActivity.this,"",false);else Store.stop(MainActivity.this);requestSync();return Store.webRead(MainActivity.this).toString();}catch(Exception e){return failure(e);}}
    @JavascriptInterface public void selection(String course,boolean count){Store.selection(MainActivity.this,course,count);TimerNotification.update(MainActivity.this);}
    @JavascriptInterface public String recover(){try{
      return Sync.executor.submit(()->{String expected=Store.version(Store.data(MainActivity.this));JSONObject latest=Sync.decode(Sync.transport.read());Store.recover(MainActivity.this,latest,expected);TimerNotification.update(MainActivity.this);return Store.webRead(MainActivity.this).toString();}).get(25,TimeUnit.SECONDS);
    }catch(Exception e){return failure(e);}}
    @JavascriptInterface public String backups(){try{return Store.backups(MainActivity.this).toString();}catch(Exception e){return "[]";}}
    @JavascriptInterface public void sync(){requestSync();}
    @JavascriptInterface public String notifications(){boolean granted=Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;return String.valueOf(Store.notifications(MainActivity.this)&&granted);}
    @JavascriptInterface public void toggleNotifications(){handler.post(()->{
      if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){Store.notifications(MainActivity.this,true);requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},1);}
      else{boolean enabled=!Store.notifications(MainActivity.this);Store.notifications(MainActivity.this,enabled);if(enabled&&!Store.testMode)TimerService.ensure(MainActivity.this);else{stopService(new Intent(MainActivity.this,TimerService.class));getSystemService(NotificationManager.class).cancel(TimerNotification.ID);}refreshWeb();}
    });}
    @JavascriptInterface public void exportFile(String content,String filename){if(content.length()>20000000)return;handler.post(()->{
      if(exportContent!=null){Toast.makeText(MainActivity.this,"Önce açık dosya kaydetme işlemini tamamla",Toast.LENGTH_SHORT).show();return;}
      exportContent=content;exportName=filename.replaceAll("[^a-zA-Z0-9._-]","_");
      try{startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,exportName),7);}catch(ActivityNotFoundException e){exportContent=null;Toast.makeText(MainActivity.this,"Dosya kaydedici açılamadı",Toast.LENGTH_LONG).show();}
    });}
  }
  @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request!=7)return;
    String content=exportContent;exportContent=null;if(result!=RESULT_OK||data==null||data.getData()==null||content==null)return;
    final Uri uri=data.getData();Sync.executor.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(uri)){if(out==null)throw new IOException();out.write(content.getBytes(StandardCharsets.UTF_8));out.flush();savedExport=uri;handler.post(()->Toast.makeText(this,"Yedek kaydedildi",Toast.LENGTH_SHORT).show());}catch(Exception e){handler.post(()->Toast.makeText(this,"Yedek kaydedilemedi. Yeniden dene.",Toast.LENGTH_LONG).show());}});
  }
  @Override protected void onResume(){super.onResume();IntentFilter filter=new IntentFilter(Sync.UPDATED);if(Build.VERSION.SDK_INT>=33)registerReceiver(updated,filter,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(updated,filter);receiverRegistered=true;web.onResume();refreshWeb();handler.post(poll);if(!Store.testMode)TimerService.ensure(this);}
  @Override protected void onPause(){handler.removeCallbacks(poll);if(receiverRegistered){unregisterReceiver(updated);receiverRegistered=false;}web.onPause();super.onPause();}
  @Override public void onBackPressed(){web.evaluateJavascript("(function(){var dialog=document.getElementById('workflowDialog');if(dialog&&dialog.open){closeWorkflow();return true;}var panel=document.getElementById('dayPanel');if(panel&&panel.classList.contains('visible')){closePanel();return true;}var active=document.querySelector('.tab.active');if(active&&active.textContent.trim()!=='Kronometre'){document.querySelector('.tab').click();return true;}return false;})()",result->{if(!"true".equals(result))moveTaskToBack(true);});}
  @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);TimerNotification.update(this);if(!Store.testMode)TimerService.ensure(this);refreshWeb();}
  @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("StudyAndroid");web.destroy();web=null;}super.onDestroy();}
}
