// The agreed course dates remain fixed. The early pediatrics goal is tracked separately.
var AGREED_COURSES=[
  {name:'Pediatri',start:'2026-10-27',end:'2026-11-09'},
  {name:'Genel Cerrahi + Kadın Doğum',start:'2026-11-10',end:'2026-11-30'},
  {name:'Mikrobiyoloji',start:'2026-12-01',end:'2026-12-07'},
  {name:'Patoloji tekrarı',start:'2026-12-08',end:'2026-12-21'},
  {name:'Farmakoloji',start:'2026-12-22',end:'2026-12-28'},
  {name:'Dahiliye tekrarı',start:'2026-12-29',end:'2027-01-11'}
];
var DAY_TYPES={normal:{name:'Normal mesai',min:2,max:2},free:{name:'Boş hafta içi',min:4,max:4},
  weekend:{name:'Hafta sonu',min:4,max:5},football:{name:'Halı saha',min:2,max:3}};
function defaultDayType(date){
  if(date==='2026-10-29')return 'free';
  var day=new Date(date+'T12:00:00').getDay();
  return day===0||day===6?'weekend':'normal';
}
function dayType(date){return store.studyPlan&&store.studyPlan.dayTypes[date]||defaultDayType(date);}
function goalRange(type){var t=DAY_TYPES[type];return t.min===t.max?t.min+' saat':t.min+'–'+t.max+' saat';}
function planDate(date){return new Date(date+'T12:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric'});}
function initializeStudyPlan(){
  if(store.studyPlan)return ensureSessionPlan();
  try{localStorage.setItem('ct_before_plan_v1',JSON.stringify(store));}catch(e){}
  store.studyPlan={version:1,exam:'Mart 2027 TUS',score:'65–70',courses:JSON.parse(JSON.stringify(AGREED_COURSES)),
    early:{title:'Pediatri',start:'2026-10-29',deadline:'2026-11-03',total:20,pagesPerSession:20},
    dayTypes:{},progress:[],courseDone:{}};
  // Only fill empty goals; any existing user-defined goal takes precedence.
  for(var date=new Date('2026-10-27T12:00:00');localStr(date)<='2027-01-11';date.setDate(date.getDate()+1)){
    var key=localStr(date);
    if(!Object.prototype.hasOwnProperty.call(store.dayGoals,key))store.dayGoals[key]=DAY_TYPES[defaultDayType(key)].min;
  }
  // The supplied totals are aggregate facts, not additional sessions.
  ['2026-10-27','2026-10-28'].forEach(function(date){
    var missing=Math.max(0,7200-secsForDay(date));
    if(missing>0)store.sessions.push({id:'reported-'+date,date:date,duration:missing,
      ts:new Date(date+'T23:59:00').getTime(),source:'reported-total'});
  });
  store.sessions.sort(function(a,b){return (a.ts||new Date(a.date+'T12:00:00').getTime())-(b.ts||new Date(b.date+'T12:00:00').getTime());});
  ensureSessionPlan();return true;
}
function courseForDay(date){return store.studyPlan?store.studyPlan.courses.find(function(c){return !c.archived&&date>=c.start&&date<=c.end;}):null;}
function renderPlanDaySummary(date){
  var course=courseForDay(date);
  document.getElementById('planDaySummary').innerHTML=(course?'<strong>'+esc(course.name)+'</strong><br>'+planDate(course.start)+' – '+planDate(course.end)+'<br>':'')+esc(DAY_TYPES[dayType(date)].name)+' · '+goalRange(dayType(date));
}
function isEarlyProgress(item){var first=store.studyPlan.courses[0];return (!item.courseStart||item.courseStart===courseKey(first))&&item.date>=store.studyPlan.early.start;}
function planCompleted(){var first=targets()[0];return first?targetCompleted(first):store.studyPlan.progress.filter(isEarlyProgress).reduce(function(n,p){return n+p.count;},0);}
function planProgressFor(start,end){var first=targets()[0];return first?targetCompleted(first,start,end):0;}
function renderStudyPlan(){
  var p=store.studyPlan,root=document.getElementById('planRoot');
  if(!p){root.innerHTML='<p class="empty">Planın yüklenmesi bekleniyor.</p>';return;}
  var today=todayStr(),active=courseForDay(today),current=targets().filter(function(t){return !t.archived&&active&&t.courseStart===courseKey(active);});
  document.getElementById('planToday').innerHTML='<div class="plan-card plan-mini"><strong>'+esc(active?active.name:p.exam)+'</strong><br>'+esc(DAY_TYPES[dayType(today)].name)+' · Bugünkü hedef: '+(store.dayGoals[today]!==undefined?fmtDur(store.dayGoals[today]*3600):goalRange(dayType(today)))
    +(current.length?'<br>'+current.map(function(t){var n=targetCompleted(t);return esc(t.title)+': '+n+(t.total!==null?' / '+esc(t.total)+' seans · '+Math.max(0,t.total-n)+' kaldı':' seans tamamlandı');}).join('<br>'):'')+'</div>';
  if(root.contains(document.activeElement))return;
  var courseHtml=p.courses.filter(function(c){return !c.archived;}).map(function(c){var key=courseKey(c),done=!!p.courseDone[key];return '<div class="plan-course'+(active&&courseKey(active)===key?' active':'')+'"><div class="work-head"><strong>'+esc(c.name)+'</strong><button type="button" class="work-edit" onclick="openCourseEditor('+jsArg(key)+')">Düzenle</button></div><p class="plan-muted">'+planDate(c.start)+' – '+planDate(c.end)+' · '+courseCompleted(key)+' seans tamamlandı</p><label class="plan-muted"><input type="checkbox" '+(done?'checked ':'')+'onchange="markCourseByKey('+jsArg(key)+',this.checked)"> Dersi tamamladım</label></div>';}).join('');
  root.innerHTML='<div class="plan-card"><div class="work-head"><h2>'+esc(p.exam)+'</h2><button class="work-edit" type="button" onclick="openExamEditor()">Düzenle</button></div><p class="plan-muted">Hedef '+esc(p.score)+' puan. Tarihler yalnızca sen düzenleyip kaydedince değişir.</p>'+courseHtml+'<div class="plan-actions"><button type="button" onclick="openCourseEditor()">Ders ekle</button></div><p class="plan-muted">Seans hedefleri ve günlere dağılım Seanslar sekmesinde düzenlenir.</p></div>'
    +'<div class="plan-card"><h2>Günlük saat hedefleri</h2>'+Object.keys(DAY_TYPES).map(function(type){return '<div class="plan-row"><span>'+DAY_TYPES[type].name+'</span><span>'+goalRange(type)+'</span></div>';}).join('')+'<p class="plan-muted">Eksik süre ertesi güne borç olarak aktarılmaz. Belirli bir günün saat hedefini Takvimden düzenleyebilirsin.</p><form class="plan-form" onsubmit="savePlanDay(event)"><label>Gün<input type="date" id="planDay" value="'+today+'" onchange="updateDayTypeForm()" required></label><label>Gün türü<select id="planDayType">'+Object.keys(DAY_TYPES).map(function(type){return '<option value="'+type+'"'+(dayType(today)===type?' selected':'')+'>'+DAY_TYPES[type].name+'</option>';}).join('')+'</select></label><button type="submit">Hedefi uygula</button></form><p id="dayTypeResult" class="plan-muted" role="status"></p></div>'
    +'<div class="plan-card"><h2>Arka plan</h2><div class="plan-form"><label>Görünüm<select id="spaceScene" onchange="window.setSpaceScene(this.value)"><option value="cosmic"'+(!window.spaceSceneMode||window.spaceSceneMode()==='cosmic'?' selected':'')+'>Kızıl uzay</option><option value="classic"'+(window.spaceSceneMode&&window.spaceSceneMode()==='classic'?' selected':'')+'>Klasik meteorlar</option></select></label></div><p class="plan-muted">Klasik meteorlar ile önceki görünüme dönebilirsin. Seçimin bu cihazda saklanır.</p></div>'
    +'<div class="plan-card"><h2>Kayıtlar ve yedek</h2><div class="plan-actions"><button type="button" onclick="downloadBackup()">Yedek indir</button><button type="button" class="secondary" onclick="refreshCloud()">Senkronu dene</button>'+(syncConflict?'<button type="button" onclick="useCloudCopy()">Bu cihazı yedekle ve güncel kayıtları yükle</button>':'')+'<button type="button" class="secondary" onclick="downloadRecoveryBackup()">Önceki cihaz yedeğini indir</button></div><p id="recoveryStatus" class="plan-muted" role="status"></p></div>';
  var archived=p.courses.filter(function(c){return c.archived;});if(archived.length)root.innerHTML+='<details class="workflow-details"><summary>Arşivlenen dersler</summary>'+archived.map(function(c){return '<div class="plan-row"><span>'+esc(c.name)+'</span><button class="work-edit" type="button" onclick="restoreCourse('+jsArg(courseKey(c))+')">Yeniden aç</button></div>';}).join('')+'</details>';
}
async function markCourseByKey(key,done){store.studyPlan.courseDone[key]=done;document.activeElement.blur();renderAll();await syncToCloud();}
function updateDayTypeForm(){document.getElementById('planDayType').value=dayType(document.getElementById('planDay').value);}
async function savePlanDay(event){
  event.preventDefault();var date=document.getElementById('planDay').value,type=document.getElementById('planDayType').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!DAY_TYPES[type])return;
  store.studyPlan.dayTypes[date]=type;store.dayGoals[date]=DAY_TYPES[type].min;
  document.activeElement.blur();renderAll();await syncToCloud();
}
async function markCourse(index,done){
  var c=store.studyPlan.courses[index];if(!c)return;
  store.studyPlan.courseDone[c.start]=done;document.activeElement.blur();renderAll();await syncToCloud();
}
async function addPlanProgress(event){
  event.preventDefault();var date=document.getElementById('progressDate').value,count=Number(document.getElementById('progressCount').value);
  var course=document.getElementById('progressCourse').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<store.studyPlan.courses[0].start||date>todayStr()||!store.studyPlan.courses.some(function(c){return c.start===course;})||!Number.isInteger(count)||count<1||count>100){
    document.getElementById('progressError').textContent='Geçerli bir geçmiş/bugün tarihi ve tam seans adedi gir.';return;
  }
  store.studyPlan.progress.push({id:'manual-'+Date.now()+'-'+Math.random().toString(36).slice(2,10),date:date,count:count,courseStart:course});
  document.activeElement.blur();renderAll();await syncToCloud();
}
async function removePlanProgress(id){
  store.studyPlan.progress=store.studyPlan.progress.filter(function(x){return x.id!==id;});
  document.activeElement.blur();renderAll();await syncToCloud();
}
function downloadBackup(){
  if(nativeApp()){nativeApp().exportFile(JSON.stringify({format:'calisma-takip-backup',version:1,exportedAt:new Date().toISOString(),store:store},null,2),'calisma-takip-'+todayStr()+'.json');return;}
  var blob=new Blob([JSON.stringify({format:'calisma-takip-backup',version:1,exportedAt:new Date().toISOString(),store:store},null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='calisma-takip-'+todayStr()+'.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
async function useCloudCopy(){
  if(syncBusy)return;
  var revision=editRevision;
  try{var remote;
    if(nativeApp()){
      var recovered=JSON.parse(nativeApp().recover());if(!recovered.ok)throw new Error(recovered.error);
      nativeCloudConflict=false;nativeCloudPending=false;remote={data:recovered.data,version:recovered.version};
    }else remote=await cloudRead();if(syncBusy||revision!==editRevision)return;
    var backups=JSON.parse(localStorage.getItem('ct_conflict_backups_v1')||'[]');
    backups.push({format:'calisma-takip-backup',version:1,exportedAt:new Date().toISOString(),store:syncClone(store),cloudVersion:cloudVersion,pending:pendingSync});
    // If storage is full, abort before replacing the pending local copy.
    localStorage.setItem('ct_conflict_backups_v1',JSON.stringify(backups));
    store=remote.data;cloudVersion=remote.version;cloudBase=syncClone(remote.data);pendingSync=false;syncConflict=false;syncReady=true;syncReadFailed=false;
    normalizeStore();var initialized=initializeStudyPlan();lcSave();restoreTimer();renderAll();setSyncState('ok');if(initialized)await syncToCloud();
    document.getElementById('recoveryStatus').textContent='Güncel kayıtlar yüklendi. Önceki cihaz kopyası saklandı; buradan indirebilirsin.';
  }catch(e){setSyncState('err');document.getElementById('syncNotice').hidden=false;
    document.getElementById('syncNotice').textContent='Güncel kayıtlar yüklenemedi. Bu cihazdaki kopya korundu. Bağlantıyı ve tarayıcının depolama alanını kontrol edip yeniden dene.';}
}
function downloadRecoveryBackup(){
  var backups=JSON.parse(localStorage.getItem('ct_conflict_backups_v1')||'[]');
  if(nativeApp())backups=backups.concat(JSON.parse(nativeApp().backups()));
  if(!backups.length){document.getElementById('recoveryStatus').textContent='Henüz saklanmış bir cihaz yedeği yok.';return;}
  if(nativeApp()){nativeApp().exportFile(JSON.stringify({format:'calisma-takip-recovery',version:1,backups:backups},null,2),'calisma-takip-cihaz-yedekleri-'+todayStr()+'.json');return;}
  var blob=new Blob([JSON.stringify({format:'calisma-takip-recovery',version:1,backups:backups},null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='calisma-takip-cihaz-yedekleri-'+todayStr()+'.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
