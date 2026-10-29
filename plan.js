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
  if(store.studyPlan)return false;
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
  return true;
}
function courseForDay(date){return store.studyPlan?store.studyPlan.courses.find(function(c){return date>=c.start&&date<=c.end;}):null;}
function renderPlanDaySummary(date){
  var course=courseForDay(date),p=store.studyPlan;
  document.getElementById('planDaySummary').innerHTML=p?(course?'<strong>'+esc(course.name)+'</strong><br>'+planDate(course.start)+' – '+planDate(course.end)+'<br>':'')
    +esc(DAY_TYPES[dayType(date)].name)+' · '+goalRange(dayType(date))
    +(date>=p.early.start&&date<=p.early.deadline?'<br>Tamamlanan pediatri: '+planProgressFor(date,date)+' seans':''):'';
}
function isEarlyProgress(item){return (!item.courseStart||item.courseStart===store.studyPlan.courses[0].start)&&item.date>=store.studyPlan.early.start;}
function planCompleted(){return store.studyPlan.progress.filter(isEarlyProgress).reduce(function(sum,item){return sum+item.count;},0);}
function planProgressFor(start,end){return store.studyPlan.progress.filter(function(x){return isEarlyProgress(x)&&x.date>=start&&x.date<=end;}).reduce(function(s,x){return s+x.count;},0);}
function renderStudyPlan(){
  var p=store.studyPlan;
  if(!p){document.getElementById('planRoot').innerHTML='<p class="plan-muted">Plan yüklenemedi. Bağlantı kurulunca yeniden denenecek.</p>';return;}
  var today=todayStr(),completed=planCompleted(),early=p.early,remaining=Math.max(0,early.total-completed);
  var active=p.courses.find(function(c){return today>=c.start&&today<=c.end;});
  var timerCourse=document.getElementById('timerCourse'),selection=store.runningCourse||timerCourse.value||(active?active.start:p.courses[0].start);
  timerCourse.innerHTML=p.courses.map(function(c){return '<option value="'+c.start+'">'+esc(c.name)+'</option>';}).join('');
  timerCourse.value=selection;
  document.getElementById('planToday').innerHTML='<div class="plan-card plan-mini"><strong>'+(active?esc(active.name):esc(p.exam))+'</strong><br>'
    +esc(DAY_TYPES[dayType(today)].name)+' · Bugünkü hedef: '+(store.dayGoals[today]!==undefined?fmtDur(store.dayGoals[today]*3600):goalRange(dayType(today)))
    +'<br>Pediatri: '+completed+' / '+early.total+' seans · '+remaining+' seans kaldı</div>';
  var root=document.getElementById('planRoot');
  // Do not rebuild a form while the user is typing during background refresh.
  if(root.contains(document.activeElement))return;
  var blocks=[['2026-10-29','2026-10-29',2,'29 Ekim · ek hedef'],['2026-10-30','2026-10-30',2,'30 Ekim'],
    ['2026-10-31','2026-10-31',5,'31 Ekim'],['2026-11-01','2026-11-01',5,'1 Kasım'],['2026-11-02','2026-11-03',5,'2–3 Kasım · toplam']];
  var courseHtml=p.courses.map(function(c,i){
    var isActive=today>=c.start&&today<=c.end,done=!!p.courseDone[c.start];
    return '<div class="plan-course'+(isActive?' active':'')+'"><strong>'+esc(c.name)+'</strong><div class="plan-row"><span class="plan-muted">'+planDate(c.start)+' – '+planDate(c.end)+'</span><span class="plan-pill'+(isActive?' active':'')+'">'+(done?'Tamamlandı':isActive?'Bu dönem':today>c.end?'Tarihi geçti':'Sırada')+'</span></div>'
      +'<div class="plan-muted">Tamamlanan seans: '+p.progress.filter(function(x){return (x.courseStart||p.courses[0].start)===c.start;}).reduce(function(s,x){return s+x.count;},0)+'</div>'
      +'<label class="plan-muted"><input type="checkbox" '+(done?'checked ':'')+'onchange="markCourse('+i+',this.checked)"/> Dersi tamamladım</label></div>';
  }).join('');
  root.innerHTML='<div class="plan-card"><div class="sec-label">'+esc(p.exam)+' · Hedef '+esc(p.score)+' puan</div><h2>Ders takvimim</h2><p class="plan-muted">Ders tarihleri sabittir. Erken bitirme hedefi takvimi kendiliğinden değiştirmez.</p>'+courseHtml
    +'<p class="plan-muted" style="margin-top:14px">Ocak sonrasında tüm dersleri kapsayan ayrı bir tekrar programı hazırlanacak.</p></div>'
    +'<div class="plan-card"><div class="sec-label">Erken bitirme hedefi · '+planDate(early.deadline)+'</div><h2>Pediatri · kalan 20 seanslık hedef</h2>'
    +'<div class="plan-large">'+completed+' / '+early.total+' seans</div><progress class="plan-progress" max="'+early.total+'" value="'+Math.min(completed,early.total)+'" aria-label="Tamamlanan pediatri seansları"></progress>'
    +'<p class="plan-muted">'+remaining+' seans kaldı · Yaklaşık '+remaining*early.pagesPerSession+' sayfa<br>1 seans ≈ '+early.pagesPerSession+' sayfa. Sayfa sayısı tahmindir; süreyle otomatik hesaplanmaz.</p>'
    +(today>early.deadline&&remaining>0?'<p class="plan-notice">Erken bitirme tarihi geçti; kalan hedef korunuyor. Genel takvim değişmedi.</p>':'')
    +blocks.map(function(b){return '<div class="plan-row"><span>'+b[3]+'</span><span>'+planProgressFor(b[0],b[1])+' / '+b[2]+' seans</span></div>';}).join('')
    +'<p class="plan-notice">Bu dağılım 19 seans ediyor. Kalan 1 seans henüz bir güne atanmadı; 2–3 Kasım hedefi ortak tutuluyor.</p>'
    +'<h3>Tamamlanan seans ekle</h3><form class="plan-form" onsubmit="addPlanProgress(event)"><label>Ders<select id="progressCourse">'+p.courses.map(function(c){return '<option value="'+c.start+'"'+(active&&c.start===active.start?' selected':'')+'>'+esc(c.name)+'</option>';}).join('')+'</select></label><label>Tarih<input id="progressDate" type="date" min="'+p.courses[0].start+'" max="'+today+'" value="'+today+'" required/></label>'
    +'<label>Seans adedi<input id="progressCount" type="number" min="1" max="100" step="1" value="1" required/></label><button type="submit">Kaydet</button></form>'
    +'<p id="progressError" class="plan-error" role="status"></p><p class="plan-muted">Kronometrede seans sayımı seçiliyken kaydedilen çalışma da buraya eklenir. Aynı seansı yeniden elle ekleme. Erken pediatri hedefi 29 Ekim ve sonrasındaki pediatri seanslarını sayar.</p>'
    +'<div class="plan-log">'+p.progress.slice().reverse().map(function(item){var c=p.courses.find(function(c){return c.start===item.courseStart;})||p.courses[0];return '<div class="plan-row"><span>'+planDate(item.date)+' · '+esc(c.name)+' · '+item.count+' seans'+(item.sessionGroup?' · kronometre':' · elle')+'</span><button onclick="removePlanProgress(\''+item.id+'\')">Geri al</button></div>';}).join('')+'</div></div>'
    +'<div class="plan-card"><h2>Günlük çalışma hedefleri</h2>'+Object.keys(DAY_TYPES).map(function(type){return '<div class="plan-row"><span>'+DAY_TYPES[type].name+'</span><span>'+goalRange(type)+'</span></div>';}).join('')
    +'<p class="plan-muted" style="margin-top:10px">Aralık verilen günlerde başlangıç hedefi alt sınırdır. Eksik süre ertesi güne borç olarak aktarılmaz. Takvimde günlük hedef ayrıca değiştirilebilir.</p>'
    +'<form class="plan-form" onsubmit="savePlanDay(event)"><label>Gün<input type="date" id="planDay" value="'+today+'" onchange="updateDayTypeForm()" required/></label><label>Gün türü<select id="planDayType">'
    +Object.keys(DAY_TYPES).map(function(type){return '<option value="'+type+'"'+(dayType(today)===type?' selected':'')+'>'+DAY_TYPES[type].name+'</option>';}).join('')
    +'</select></label><button type="submit">Hedefi uygula</button></form><p id="dayTypeResult" class="plan-muted" role="status"></p></div>'
    +'<div class="plan-card"><h2>Kayıtlar ve yedek</h2><p class="plan-muted">27 ve 28 Ekim için bildirilen toplamlar: günde 2 saat. Var olan seansların üzerine yalnızca eksik süre eklenir. Saat kayıtları pediatri seans hedefine kendiliğinden sayılmaz.</p>'
    +'<div class="plan-actions"><button type="button" onclick="downloadBackup()">Yedek indir</button><button type="button" class="secondary" onclick="refreshCloud()">Senkronu dene</button>'
    +(syncConflict?'<button type="button" class="secondary" onclick="useCloudCopy()">Bulut kaydını yükle</button>':'')+'</div></div>';
}
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
  var blob=new Blob([JSON.stringify({format:'calisma-takip-backup',version:1,exportedAt:new Date().toISOString(),store:store},null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='calisma-takip-'+todayStr()+'.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
async function useCloudCopy(){
  if(!confirm('Önce bu cihazın yedeğini indir. Bulut kaydı yüklenirse bu cihazdaki bekleyen değişiklikler silinir. Devam edilsin mi?'))return;
  try{var remote=await cloudRead();store=remote.data;cloudVersion=remote.version;pendingSync=false;syncConflict=false;
    normalizeStore();var initialized=initializeStudyPlan();lcSave();restoreTimer();renderAll();setSyncState('ok');if(initialized)await syncToCloud();
  }catch(e){setSyncState('err');}
}
