// Shared work log, post-study completion and editable session targets.
var workflowState=null,workflowSaving=false;
function courseKey(c){return c.id||c.start;}
function courseByKey(key){var p=store.studyPlan;return p&&(p.courses.find(function(c){return courseKey(c)===key;})||p.courses.find(function(c){return c.start===key;}));}
function makeId(prefix){return prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);}
function jsArg(value){return esc(JSON.stringify(String(value)));}
function validStudyDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;var d=new Date(value+'T12:00:00');return !isNaN(d)&&localStr(d)===value;}
function ensureSessionPlan(){
  var p=store.studyPlan;if(!p)return false;var changed=false;
  p.courses.forEach(function(c){if(!c.id){c.id=c.start;changed=true;}});
  if(!p.sessionTargets){
    p.sessionTargets=p.courses.map(function(c,i){var early=i===0&&p.early;
      return {id:'target-'+courseKey(c),courseStart:courseKey(c),title:c.name,total:early?early.total:null,from:early?early.start:c.start,legacyFrom:early?early.start:null,
        deadline:early?early.deadline:c.end,pagesPerSession:early?early.pagesPerSession:null,
        schedule:early?[{start:'2026-10-29',end:'2026-10-29',count:2},{start:'2026-10-30',end:'2026-10-30',count:2},{start:'2026-10-31',end:'2026-10-31',count:5},{start:'2026-11-01',end:'2026-11-01',count:5},{start:'2026-11-02',end:'2026-11-03',count:5}]:[]};
    });changed=true;
  }
  var duplicates={};
  store.sessions.forEach(function(s){if(!s.id){var signature=s.date+'-'+(s.ts||0)+'-'+s.duration;duplicates[signature]=(duplicates[signature]||0)+1;s.id='legacy-'+signature+'-'+duplicates[signature];changed=true;}});
  if(p.workflowVersion!==1){
    (p.progress||[]).forEach(function(item){if(!item.targetId&&!item.legacyUnassigned){var target=targetForProgress(item);if(target)item.targetId=target.id;else item.legacyUnassigned=true;}});
    p.workflowVersion=1;changed=true;
  }return changed;
}
function targets(){return store.studyPlan&&store.studyPlan.sessionTargets||[];}
function sortSessionTargets(list){return list.slice().sort(function(a,b){return String(a.deadline||'9999-12-31').localeCompare(String(b.deadline||'9999-12-31'))||String(a.from||'').localeCompare(String(b.from||''))||String(a.title||'').localeCompare(String(b.title||''),'tr');});}
function targetById(id){return targets().find(function(t){return t.id===id;});}
function targetForProgress(item){
  if(item.targetId)return targetById(item.targetId);
  if(item.legacyUnassigned)return null;
  var p=store.studyPlan,key=item.courseStart||(p.courses[0]&&courseKey(p.courses[0])),course=courseByKey(key);if(course)key=courseKey(course);
  return targets().find(function(t){var from=Object.prototype.hasOwnProperty.call(t,'legacyFrom')?t.legacyFrom:t.from;return t.id==='target-'+key&&(!from||item.date>=from);});
}
function targetCompleted(target,start,end){return (store.studyPlan.progress||[]).reduce(function(sum,item){var assigned=targetForProgress(item);return sum+(assigned&&assigned.id===target.id&&(!start||item.date>=start)&&(!end||item.date<=end)?Number(item.count)||0:0);},0);}
function courseCompleted(key){return (store.studyPlan.progress||[]).filter(function(p){return (p.courseStart||courseKey(store.studyPlan.courses[0]))===key;}).reduce(function(n,p){return n+(Number(p.count)||0);},0);}
function workKey(item){return item.groupId||(item.timerStart?'timer-'+item.timerStart:item.id);}
function workGroups(){
  var groups=new Map();store.sessions.forEach(function(s){var key=workKey(s);if(!groups.has(key))groups.set(key,{key:key,parts:[]});groups.get(key).parts.push(s);});
  return Array.from(groups.values()).map(function(g){g.parts.sort(function(a,b){return a.date.localeCompare(b.date)||(a.ts||0)-(b.ts||0);});g.duration=g.parts.reduce(function(n,s){return n+Number(s.duration||0);},0);g.first=g.parts[0].date;g.last=g.parts[g.parts.length-1].date;return g;}).sort(function(a,b){return b.last.localeCompare(a.last)||Math.max.apply(null,b.parts.map(function(s){return s.ts||0;}))-Math.max.apply(null,a.parts.map(function(s){return s.ts||0;}));});
}
function findWork(key){return workGroups().find(function(g){return g.key===key;});}
function linkedProgress(work){return (store.studyPlan&&store.studyPlan.progress||[]).filter(function(p){return p.sessionGroup===work.key||work.parts.some(function(s){return s.groupId&&s.groupId===p.sessionGroup;});});}
function renderWorkList(container,groups){
  var node=document.getElementById(container);if(!node)return;
  if(!groups.length){node.innerHTML='<p class="empty">Henüz çalışma kaydı yok.</p>';return;}
  node.innerHTML=groups.map(function(g){var completed=linkedProgress(g),count=completed.reduce(function(n,p){return n+(Number(p.count)||0);},0),c=completed[0]&&courseByKey(completed[0].courseStart||courseKey(store.studyPlan.courses[0]));
    return '<article class="work-card"><div class="work-head"><span>'+esc(fmtDateShort(g.first))+(g.last!==g.first?' – '+esc(fmtDateShort(g.last)):'')+'</span><strong class="work-duration">'+esc(fmtDur(g.duration))+'</strong></div>'
      +(g.parts[0].note?'<p class="plan-muted">'+esc(g.parts[0].note)+'</p>':'')
      +'<div class="work-actions"><button class="'+(count?'work-done':'work-complete')+'" type="button" onclick="openCompletion('+jsArg(g.key)+')">'+(count?'✓ '+count+' seans · '+esc(c?c.name:'Tamamlandı'):'Seans tamamlandı')+'</button><button class="work-edit" type="button" onclick="openWorkEditor('+jsArg(g.key)+')">Düzenle</button></div></article>';
  }).join('');
}
function renderLegacyTasks(){
  var items=[];['daily','weekly'].forEach(function(period){(store.tasks[period]||[]).forEach(function(t){items.push({label:period==='daily'?'Günlük':'Haftalık',text:t.text,done:t.done});});});
  ['dayTasks','weekTasks'].forEach(function(field){Object.keys(store[field]||{}).sort().forEach(function(date){store[field][date].forEach(function(t){items.push({label:fmtDateShort(date),text:t.text,done:t.done});});});});
  if(!items.length)return '';
  return '<details class="workflow-details"><summary>Önceki görevler ('+items.length+')</summary><p class="plan-muted">Eski görevlerin burada korundu. Yeni hedef seanslara otomatik eklenmedi.</p>'+items.map(function(t){return '<p class="legacy-task">'+(t.done?'✓ ':'○ ')+esc(t.text)+' <small>'+esc(t.label)+'</small></p>';}).join('')+'</details>';
}
function scheduleSummary(target){var slots=target.schedule||[],allocated=slots.reduce(function(n,s){return n+(Number(s.count)||0);},0);return slots.length?'<p class="plan-muted">Günlere dağıtılan: '+allocated+(target.total!==null&&target.total!==undefined?' / '+esc(target.total)+' seans'+(allocated<target.total?' · '+(target.total-allocated)+' seans henüz atanmadı':allocated>target.total?' · dağılım hedefi aşıyor':''):' seans')+'</p>':'';}
function renderSessionTargets(){
  var node=document.getElementById('sessionTargets');if(!node)return;
  if(!store.studyPlan){node.innerHTML='<p class="empty">Planın yüklenmesi bekleniyor.</p>';return;}
  var active=sortSessionTargets(targets().filter(function(t){return !t.archived;}));
  node.innerHTML=active.map(function(t){var c=courseByKey(t.courseStart),done=targetCompleted(t),has=t.total!==null&&t.total!==undefined,left=has?Math.max(0,t.total-done):null;
    return '<article class="plan-card target-card"><div class="work-head"><h2>'+esc(t.title)+'</h2><button class="work-edit" type="button" onclick="openTargetEditor('+jsArg(t.id)+')">Düzenle</button></div><p class="plan-muted">'+esc(c?c.name:'Ders')+' · '+planDate(t.from)+' – '+planDate(t.deadline)+'</p>'
      +'<div class="plan-large">'+done+(has?' / '+esc(t.total):'')+' <small>seans</small></div><p class="plan-muted">'+(has?(left+' seans kaldı'):'Hedef adedi henüz belirlenmedi.')+'</p>'
      +(has&&t.total>0?'<progress class="plan-progress" max="'+t.total+'" value="'+Math.min(done,t.total)+'" aria-label="'+esc(t.title)+' ilerlemesi"></progress>':'')
      +(t.pagesPerSession?'<p class="plan-muted">1 seans ≈ '+esc(t.pagesPerSession)+' sayfa'+(has?' · yaklaşık '+left*t.pagesPerSession+' sayfa kaldı':'')+'</p>':'')+scheduleSummary(t)
      +((t.schedule||[]).length?'<details class="workflow-details"><summary>Günlere dağılım</summary>'+t.schedule.map(function(s){return '<div class="plan-row"><span>'+planDate(s.start)+(s.end!==s.start?' – '+planDate(s.end):'')+'</span><span>'+targetCompleted(t,s.start,s.end)+' / '+esc(s.count)+' seans</span></div>';}).join('')+'</details>':'')+'</article>';
  }).join('')||'<p class="empty">Henüz seans hedefi yok.</p>';
  var progress=store.studyPlan.progress||[];
  node.innerHTML+='<details class="workflow-details"><summary>Seans geçmişi ('+progress.reduce(function(n,p){return n+(Number(p.count)||0);},0)+')</summary>'+progress.slice().sort(function(a,b){return b.date.localeCompare(a.date);}).map(function(p){var t=targetForProgress(p),c=courseByKey(p.courseStart||courseKey(store.studyPlan.courses[0]));return '<div class="plan-row"><span>'+planDate(p.date)+' · '+esc(t?t.title:c?c.name:'Ders')+' · '+esc(p.count)+' seans'+(!p.sessionGroup?' · süreye bağlı değil':'')+'</span><button class="work-edit" type="button" onclick="openProgressEditor('+jsArg(p.id)+')">Düzenle</button></div>';}).join('')+'</details>'+renderLegacyTasks();
  var archived=targets().filter(function(t){return t.archived;});if(archived.length)node.innerHTML+='<details class="workflow-details"><summary>Arşivlenen hedefler</summary>'+archived.map(function(t){return '<div class="plan-row"><span>'+esc(t.title)+'</span><button type="button" class="work-edit" onclick="restoreTarget('+jsArg(t.id)+')">Yeniden aç</button></div>';}).join('')+'</details>';
}
function sessionPlansForDay(date){
  var rows=[];sortSessionTargets(targets().filter(function(t){return !t.archived;})).forEach(function(t){
    var schedule=t.schedule||[];
    if(schedule.length){schedule.forEach(function(s){if(date>=s.start&&date<=s.end)rows.push({target:t,start:s.start,end:s.end,count:Number(s.count),completed:targetCompleted(t,s.start,s.end),shared:s.start!==s.end});});}
    else if(Number(t.total)>0&&date>=t.from&&date<=t.deadline)rows.push({target:t,start:t.from,end:t.deadline,count:Number(t.total),completed:targetCompleted(t),shared:t.from!==t.deadline});
  });return rows;
}
function plannedSessionText(date){
  var rows=sessionPlansForDay(date);return rows.length?rows.map(function(p){return esc(p.target.title)+': '+p.completed+' / '+p.count+' seans'+(p.shared?' · '+planDate(p.start)+' – '+planDate(p.end)+' ortak hedef':'');}).join('<br>'):'Bu güne seans hedefi atanmadı.';
}
function calendarSessionHtml(date,course){
  var plans=sessionPlansForDay(date);
  if(!plans.length)return '<span class="cal-session-summary" aria-hidden="true"></span>';
  var completed=plans.reduce(function(n,p){return n+p.completed;},0),total=plans.reduce(function(n,p){return n+p.count;},0);
  var description=plans.map(function(p){return p.target.title+': '+p.completed+'/'+p.count+' seans';}).join(' · ');
  return '<span class="cal-session-summary" title="'+esc(description)+'">'+completed+'/'+total+'</span>';
}

function showWorkflow(kind,title,body,state,extra){
  workflowState=Object.assign({kind:kind},state||{});var dialog=document.getElementById('workflowDialog');
  document.getElementById('workflowTitle').textContent=title;document.getElementById('workflowBody').innerHTML=body;
  document.getElementById('workflowExtra').innerHTML=extra||'';document.getElementById('workflowError').textContent='';
  document.getElementById('workflowSave').disabled=false;if(!dialog.open)dialog.showModal();
}
function closeWorkflow(){if(workflowSaving)return;document.getElementById('workflowDialog').close();workflowState=null;}
function targetOptions(selected){return sortSessionTargets(targets().filter(function(t){return !t.archived||t.id===selected;})).map(function(t){var c=courseByKey(t.courseStart);return '<option value="'+esc(t.id)+'"'+(t.id===selected?' selected':'')+'>'+esc(c&&c.name!==t.title?c.name+' · '+t.title:t.title)+(t.total!==null?' · '+Math.max(0,t.total-targetCompleted(t))+' kaldı':' · hedef belirlenmedi')+'</option>';}).join('');}
function defaultTargetFor(work){var c=courseForDay(work.last),t=targets().find(function(t){return !t.archived&&c&&t.courseStart===courseKey(c);});return t||targets().find(function(t){return !t.archived;});}
function completionBody(targetId,count,date,standalone){return '<p class="plan-muted">Seansın tamamlandıysa hedefinden düş. Süre kaydın değişmez.</p><label>Ders / hedef<select id="completionTarget" required>'+targetOptions(targetId)+'</select></label><label>Seans adedi<input id="completionCount" type="number" min="1" max="1000" step="1" value="'+esc(count)+'" required></label>'+(standalone?'<label>Tarih<input id="completionDate" type="date" value="'+esc(date)+'" max="'+todayStr()+'" required></label>':'');}
function openCompletion(key){var work=findWork(key);if(!work)return;var linked=linkedProgress(work),assigned=linked[0]&&targetForProgress(linked[0]),target=assigned||defaultTargetFor(work);if(!target)return;
  showWorkflow('complete',linked.length?'Tamamlanan seansı düzenle':'Seans tamamlandı',completionBody(target.id,linked.reduce(function(n,p){return n+(Number(p.count)||0);},0)||1,work.last,false),{key:key},linked.length?'<button type="button" class="workflow-danger" onclick="undoWorkCompletion()">Seans sayımını geri al</button>':'');
}
function openProgressEditor(id){var item=store.studyPlan.progress.find(function(p){return p.id===id;});if(!item)return;
  if(item.sessionGroup&&findWork(item.sessionGroup)){openCompletion(item.sessionGroup);return;}
  var t=targetForProgress(item)||targets().find(function(t){return t.courseStart===item.courseStart;})||targets()[0];if(!t)return;
  showWorkflow('progress','Seans kaydını düzenle',completionBody(t.id,item.count,item.date,true),{id:id},'<button type="button" class="workflow-danger" onclick="removeStandaloneProgress()">Seans sayımını geri al</button>');
}
function recordWorkCompletion(key,targetId,count){
  var work=findWork(key),target=targetById(targetId);if(!work||!target)throw Error('Çalışma veya hedef bulunamadı.');
  if(!Number.isInteger(count)||count<1||count>1000)throw Error('Geçerli bir seans adedi gir.');
  var linked=linkedProgress(work),ids=new Set(linked.map(function(p){return p.id;}));
  store.studyPlan.progress=store.studyPlan.progress.filter(function(p){return !ids.has(p.id);});
  store.studyPlan.progress.push({id:'completion-'+key,date:work.last,count:count,courseStart:target.courseStart,targetId:target.id,sessionGroup:key});
}
function validateWorkParts(parts){
  var total=0;parts.forEach(function(p){if(!validStudyDate(p.date)||p.date>todayStr())throw Error('Bugün veya geçmişten geçerli bir tarih seç.');
    if(!Number.isInteger(p.duration)||p.duration<0||p.duration>86400)throw Error('Her gün için 0–24 saat arasında geçerli bir süre gir.');total+=p.duration;});
  if(total<=0)throw Error('Sıfırdan büyük bir çalışma süresi gir.');
}
function saveWorkParts(key,parts,note){
  validateWorkParts(parts);var work=key&&findWork(key);if(key&&!work)throw Error('Çalışma bulunamadı.');
  var group=work?work.key:makeId('manual'),newParts=[];parts.forEach(function(p,i){if(p.duration<=0)return;var previous=work&&work.parts[i];
    newParts.push(Object.assign({},previous||{id:group+'-'+i,groupId:group,source:'manual',ts:Date.now()},{date:p.date,duration:p.duration,note:note||''}));});
  if(work){var oldIds=new Set(work.parts.map(function(p){return p.id;}));store.sessions=store.sessions.filter(function(p){return !oldIds.has(p.id);});}
  store.sessions=store.sessions.concat(newParts).sort(function(a,b){return a.date.localeCompare(b.date)||(a.ts||0)-(b.ts||0);});
  if(work){var last=newParts.map(function(p){return p.date;}).sort().pop();linkedProgress(work).forEach(function(p){p.date=last;});}
  return group;
}
function workPartFields(part,i){var duration=part.duration||0;return '<fieldset class="work-part"><legend>'+(i?'Devam eden gün':'Çalışma')+'</legend><label>Tarih<input id="workDate'+i+'" type="date" value="'+esc(part.date)+'" max="'+todayStr()+'" required></label><div class="duration-fields"><label>Saat<input id="workHours'+i+'" type="number" min="0" max="24" value="'+Math.floor(duration/3600)+'" step="1"></label><label>Dakika<input id="workMinutes'+i+'" type="number" min="0" max="59" value="'+Math.floor(duration%3600/60)+'" step="1"></label></div><details><summary>Saniye</summary><label>Saniye<input id="workSeconds'+i+'" type="number" min="0" max="59" value="'+(duration%60)+'" step="1"></label></details></fieldset>';}
function openWorkEditor(key,date){var work=key&&findWork(key);if(key&&!work)return;var parts=work?work.parts:[{date:date||todayStr(),duration:0}];
  showWorkflow('work',work?'Çalışmayı düzenle':'Elle çalışma ekle',(parts.length>1?'<p class="plan-muted">Gece yarısını geçen çalışmanın günleri ayrı tutulur; seans bir kez sayılır.</p>':'')+parts.map(workPartFields).join('')+'<label>Not <span class="plan-muted">(isteğe bağlı)</span><input id="workNote" type="text" maxlength="500" value="'+esc(work&&work.parts[0].note||'')+'"></label><p class="plan-muted">Süreyi kaydettikten sonra istersen “Seans tamamlandı” ile hedefine işleyebilirsin.</p>',{key:key||null,partCount:parts.length},work?'<button type="button" class="workflow-danger" onclick="deleteWorkFromEditor()">Çalışmayı sil</button>':'');
}
function courseOptions(selected){return store.studyPlan.courses.map(function(c){return '<option value="'+esc(courseKey(c))+'"'+(courseKey(c)===selected?' selected':'')+'>'+esc(c.name)+(c.archived?' (arşiv)':'')+'</option>';}).join('');}
function scheduleRow(slot,i){return '<div class="schedule-edit-row" id="scheduleRow'+i+'"><label>Başlangıç<input type="date" id="slotStart'+i+'" value="'+esc(slot.start)+'"></label><label>Bitiş<input type="date" id="slotEnd'+i+'" value="'+esc(slot.end)+'"></label><label>Seans<input type="number" min="1" max="10000" step="1" id="slotCount'+i+'" value="'+esc(slot.count)+'"></label><button type="button" class="work-edit" onclick="removeScheduleRow('+i+')">Kaldır</button></div>';}
function openTargetEditor(id){var t=id&&targetById(id),active=courseForDay(todayStr())||store.studyPlan.courses.find(function(c){return !c.archived;});if(!active)return;
  var value=t||{courseStart:courseKey(active),title:'',total:null,from:todayStr(),deadline:active.end,schedule:[]};
  showWorkflow('target',t?'Seans hedefini düzenle':'Yeni seans hedefi','<label>Ders<select id="targetCourse">'+courseOptions(value.courseStart)+'</select></label><label>Hedef adı<input id="targetTitle" type="text" maxlength="120" value="'+esc(value.title)+'" placeholder="Örn. Pediatri soru çözümü" required></label><label>Toplam seans<input id="targetTotal" type="number" min="0" max="100000" step="1" value="'+esc(value.total===null?'':value.total)+'" placeholder="Henüz belirlenmediyse boş bırak"></label><div class="duration-fields"><label>Başlangıç<input id="targetFrom" type="date" value="'+esc(value.from)+'" required></label><label>Hedef bitiş<input id="targetDeadline" type="date" value="'+esc(value.deadline)+'" required></label></div><details class="workflow-details"><summary>Günlere dağılım ve diğer ayrıntılar</summary><label>Bir seansta yaklaşık sayfa<input type="number" id="targetPages" min="1" max="100000" step="1" value="'+esc(value.pagesPerSession||'')+'" placeholder="İsteğe bağlı"></label><div id="scheduleRows">'+(value.schedule||[]).map(scheduleRow).join('')+'</div><button type="button" class="work-edit" onclick="addScheduleRow()">Gün / tarih aralığı ekle</button><p class="plan-muted">Günlere dağılım boşsa hedef, seçtiğin tarih aralığının ortak seansı olarak takvimde görünür. Günlere dağıttığında yalnızca bu günlerde gösterilir. Eksikler başka güne aktarılmaz.</p></details>',{id:id||null,slotCount:(value.schedule||[]).length,removedSlots:[]},t?'<button type="button" class="workflow-danger" onclick="archiveTarget()">Hedefi arşivle</button>':'');
}
function addScheduleRow(){var i=workflowState.slotCount++;document.getElementById('scheduleRows').insertAdjacentHTML('beforeend',scheduleRow({start:document.getElementById('targetFrom').value,end:document.getElementById('targetFrom').value,count:1},i));}
function removeScheduleRow(i){workflowState.removedSlots.push(i);document.getElementById('scheduleRow'+i).remove();}
function validateTarget(input,id){
  if(!courseByKey(input.courseStart)||!input.title.trim())throw Error('Ders ve hedef adı gerekli.');
  if(!validStudyDate(input.from)||!validStudyDate(input.deadline)||input.deadline<input.from)throw Error('Geçerli bir başlangıç ve bitiş tarihi seç.');
  if(input.total!==null&&(!Number.isInteger(input.total)||input.total<0||input.total>100000))throw Error('Geçerli bir toplam seans adedi gir.');
  input.schedule.forEach(function(s){if(!validStudyDate(s.start)||!validStudyDate(s.end)||s.end<s.start||s.start<input.from||s.end>input.deadline||!Number.isInteger(s.count)||s.count<1)throw Error('Günlere dağılımı kontrol et. Tarihler hedef aralığında, adetler pozitif olmalı.');});
  var sorted=input.schedule.slice().sort(function(a,b){return a.start.localeCompare(b.start);});for(var i=1;i<sorted.length;i++)if(sorted[i].start<=sorted[i-1].end)throw Error('Aynı hedefin gün dağılımları çakışmamalı.');
  if(id){var existing=targetById(id);if(existing&&existing.courseStart!==input.courseStart&&targetCompleted(existing)>0)throw Error('Tamamlanmış seansı olan hedefin dersini değiştirmek için önce seans kayıtlarını düzenle.');}
}
function saveTarget(input,id){validateTarget(input,id);var t=id&&targetById(id);if(t)Object.assign(t,input);else{t=Object.assign({id:makeId('target')},input);targets().push(t);}
  var first=store.studyPlan.courses[0];if(first&&t.id==='target-'+courseKey(first)&&store.studyPlan.early)Object.assign(store.studyPlan.early,{start:t.from,deadline:t.deadline,total:t.total===null?store.studyPlan.early.total:t.total,pagesPerSession:t.pagesPerSession||store.studyPlan.early.pagesPerSession});return t;
}
function openCourseEditor(key){var c=key&&courseByKey(key);showWorkflow('course',c?'Dersi düzenle':'Ders ekle','<label>Ders adı<input id="courseName" maxlength="120" value="'+esc(c?c.name:'')+'" required></label><label>Başlangıç<input type="date" id="courseStart" value="'+esc(c?c.start:todayStr())+'" required></label><label>Bitiş<input type="date" id="courseEnd" value="'+esc(c?c.end:todayStr())+'" required></label><p class="plan-muted">Bu tarihler yalnızca sen kaydedince değişir. Seans hedefinin bitişi ayrıca Seanslar sekmesinden düzenlenir.</p>',{key:key||null},c?'<button type="button" class="workflow-danger" onclick="archiveCourse()">Dersi arşivle</button>':'');}
function saveCourse(input,key){if(!input.name.trim()||!validStudyDate(input.start)||!validStudyDate(input.end)||input.end<input.start)throw Error('Ders adı ve geçerli bir tarih aralığı gerekli.');
  var overlap=store.studyPlan.courses.find(function(c){return !c.archived&&courseKey(c)!==key&&input.start<=c.end&&input.end>=c.start;});if(overlap)throw Error('Bu tarih aralığı '+overlap.name+' ile çakışıyor. Tarihleri kontrol et.');
  var c=key&&courseByKey(key);if(c)Object.assign(c,input);else{c=Object.assign({id:makeId('course')},input);store.studyPlan.courses.push(c);}return c;
}
function openExamEditor(){showWorkflow('exam','Plan başlığını düzenle','<label>Plan / sınav adı<input id="examTitle" maxlength="120" value="'+esc(store.studyPlan.exam)+'" required></label><label>Puan hedefi<input id="examScore" maxlength="40" value="'+esc(store.studyPlan.score)+'" required></label>');}
function field(id){return document.getElementById(id).value;}
async function saveWorkflow(event){
  event.preventDefault();if(workflowSaving||!workflowState)return;var state=workflowState;
  try{
    if(state.kind==='work'){
      var parts=[];for(var i=0;i<state.partCount;i++){var h=Number(field('workHours'+i)),m=Number(field('workMinutes'+i)),s=Number(field('workSeconds'+i));if(!Number.isInteger(h)||!Number.isInteger(m)||!Number.isInteger(s)||h<0||h>24||m<0||m>59||s<0||s>59)throw Error('Saat, dakika ve saniyeyi kontrol et.');parts.push({date:field('workDate'+i),duration:h*3600+m*60+s});}
      saveWorkParts(state.key,parts,field('workNote').trim());
    }else if(state.kind==='complete')recordWorkCompletion(state.key,field('completionTarget'),Number(field('completionCount')));
    else if(state.kind==='progress'){
      var t=targetById(field('completionTarget')),date=field('completionDate'),count=Number(field('completionCount'));
      if(!t||!validStudyDate(date)||date>todayStr()||!Number.isInteger(count)||count<1||count>1000)throw Error('Tarih ve seans adedini kontrol et.');
      var p=store.studyPlan.progress.find(function(p){return p.id===state.id;});if(!p)throw Error('Seans kaydı bulunamadı.');Object.assign(p,{date:date,count:count,targetId:t.id,courseStart:t.courseStart});
    }else if(state.kind==='target'){
      var schedule=[];for(var i=0;i<state.slotCount;i++)if(!state.removedSlots.includes(i))schedule.push({start:field('slotStart'+i),end:field('slotEnd'+i),count:Number(field('slotCount'+i))});
      var pages=field('targetPages');if(pages!==''&&(!Number.isInteger(Number(pages))||Number(pages)<1))throw Error('Sayfa adedini kontrol et.');
      saveTarget({title:field('targetTitle').trim(),courseStart:field('targetCourse'),total:field('targetTotal')===''?null:Number(field('targetTotal')),from:field('targetFrom'),deadline:field('targetDeadline'),pagesPerSession:pages===''?null:Number(pages),schedule:schedule},state.id);
    }else if(state.kind==='course')saveCourse({name:field('courseName').trim(),start:field('courseStart'),end:field('courseEnd')},state.key);
    else if(state.kind==='exam'){if(!field('examTitle').trim()||!field('examScore').trim())throw Error('Plan adı ve puan hedefini gir.');store.studyPlan.exam=field('examTitle').trim();store.studyPlan.score=field('examScore').trim();}
    await finishWorkflow();
  }catch(e){document.getElementById('workflowError').textContent=e.message;}
}
async function finishWorkflow(){workflowSaving=true;document.getElementById('workflowSave').disabled=true;document.activeElement.blur();
  var saving=syncToCloud();try{document.getElementById('workflowDialog').close();workflowState=null;renderAll();}finally{workflowSaving=false;document.getElementById('workflowSave').disabled=false;}
  await saving;
}
async function undoWorkCompletion(){if(workflowSaving||!workflowState)return;var w=findWork(workflowState.key);if(!w)return;var ids=new Set(linkedProgress(w).map(function(p){return p.id;}));store.studyPlan.progress=store.studyPlan.progress.filter(function(p){return !ids.has(p.id);});await finishWorkflow();}
async function removeStandaloneProgress(){if(workflowSaving||!workflowState)return;store.studyPlan.progress=store.studyPlan.progress.filter(function(p){return p.id!==workflowState.id;});await finishWorkflow();}
async function deleteWorkFromEditor(){if(workflowSaving||!workflowState||!confirm('Bu çalışmanın süresi ve bağlı seans sayımı silinsin mi?'))return;var w=findWork(workflowState.key);if(!w)return;var parts=new Set(w.parts.map(function(p){return p.id;})),ids=new Set(linkedProgress(w).map(function(p){return p.id;}));store.sessions=store.sessions.filter(function(p){return !parts.has(p.id);});store.studyPlan.progress=store.studyPlan.progress.filter(function(p){return !ids.has(p.id);});await finishWorkflow();}
async function archiveTarget(){if(workflowSaving||!workflowState)return;var t=targetById(workflowState.id);if(t)t.archived=true;await finishWorkflow();}
async function restoreTarget(id){var t=targetById(id);if(!t)return;t.archived=false;renderAll();await syncToCloud();}
async function archiveCourse(){if(workflowSaving||!workflowState)return;var active=store.studyPlan.courses.filter(function(c){return !c.archived;});if(active.length<=1){document.getElementById('workflowError').textContent='En az bir ders açık kalmalı.';return;}var c=courseByKey(workflowState.key);if(c)c.archived=true;await finishWorkflow();}
async function restoreCourse(key){var c=courseByKey(key);if(!c)return;c.archived=false;renderAll();await syncToCloud();}
