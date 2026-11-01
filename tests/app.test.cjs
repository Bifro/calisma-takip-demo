const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const app=main.slice(0,main.search(/\(async function\(\)\{\r?\n  var now=new Date\(\);/));
function harness(){
  const nodes=new Map(),storage=new Map();
  function element(id){if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,innerHTML:'',textContent:'',style:{},hidden:false,
    classList:{add(){},remove(){},toggle(){}},contains(){return false;},blur(){},addEventListener(){},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);}
  const context={console,Date,Math,JSON,AbortSignal,setTimeout,clearTimeout,setInterval(){return 1;},clearInterval(){},
    window:{addEventListener(){}},document:{getElementById:element,activeElement:{blur(){}},querySelectorAll(){return [];}},
    localStorage:{setItem(k,v){storage.set(k,v);},getItem(k){return storage.get(k)||null;}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('plan.js','utf8'),context);vm.runInContext(fs.readFileSync('workflow.js','utf8'),context);vm.runInContext(app,context);
  context.normalizeStore();context.renderAll=()=>{};
  return {c:context,element,storage};
}
test('agreed schedule, goals and historical totals migrate once without duplicating work',()=>{
  const {c}=harness();c.store.sessions=[{date:'2026-10-27',duration:3600},{date:'2026-10-28',duration:9000}];
  c.store.dayGoals['2026-10-30']=3;
  assert.equal(c.initializeStudyPlan(),true);
  assert.equal(c.store.studyPlan.courses.length,6);
  assert.equal(c.store.studyPlan.courses[0].end,'2026-11-09');
  assert.equal(c.store.studyPlan.courses[5].end,'2027-01-11');
  assert.equal(c.store.studyPlan.early.deadline,'2026-11-03');
  assert.equal(c.secsForDay('2026-10-27'),7200);assert.equal(c.secsForDay('2026-10-28'),9000);
  assert.equal(c.store.dayGoals['2026-10-29'],4);assert.equal(c.store.dayGoals['2026-10-31'],4);
  assert.equal(c.store.dayGoals['2026-10-30'],3);
  assert.equal(c.initializeStudyPlan(),false);assert.equal(c.store.sessions.length,3);assert.equal(c.planCompleted(),0);
  assert.equal(c.weekGoalHours('2026-10-26'),19);
});
test('stopping an opted-in timer splits midnight totals, counts one session and reverses it on final deletion',async()=>{
  const {c,element}=harness();c.initializeStudyPlan();c.syncToCloud=async()=>{};
  c.running=true;c.startMs=new Date('2026-10-29T23:30:00').getTime();
  c.Date=class extends Date{static now(){return new Date('2026-10-30T00:30:00').getTime();}};
  element('countPlanSession').checked=true;
  c.store.runningPlan=true;
  await c.stopTimer();
  assert.equal(c.secsForDay('2026-10-29'),1800);assert.equal(c.secsForDay('2026-10-30'),1800);
  assert.equal(c.planCompleted(),1);
  await c.deleteSession(2);assert.equal(c.planCompleted(),1);
  await c.deleteSession(2);assert.equal(c.planCompleted(),0);
});
test('failed cloud write keeps edits pending and does not report success',async()=>{
  const {c,element,storage}=harness();c.initializeStudyPlan();c.syncReady=true;c.cloudVersion='v1';
  c.fetch=async()=>({ok:false,status:503});await c.syncToCloud();
  assert.equal(c.pendingSync,true);assert.match(element('syncText').textContent,/bekliyor/);
  assert.equal(JSON.parse(storage.get('ct_sync_v1')).pending,true);
});
test('concurrent edits are serialized and persist the latest revision using updateTime',async()=>{
  const {c}=harness();c.initializeStudyPlan();c.syncReady=true;c.cloudVersion='v1';
  const calls=[];let release;
  c.fetch=async(url,options)=>{calls.push({url,data:JSON.parse(options.body)});if(calls.length===1)await new Promise(r=>release=r);
    return {ok:true,json:async()=>({updateTime:'v'+(calls.length+1)})};};
  const first=c.syncToCloud();c.store.tasks.daily.push({text:'latest',done:false});const second=c.syncToCloud();
  release();await Promise.all([first,second]);
  assert.equal(calls.length,2);assert.match(calls[1].url,/currentDocument.updateTime=v2/);
  assert.match(calls[0].url,/updateMask.fieldPaths=studyPlan/);
  assert.equal(JSON.parse(calls[1].data.fields.tasks.stringValue).daily[0].text,'latest');assert.equal(c.pendingSync,false);
});
test('competing device conflict retains local work and blocks further automatic writes',async()=>{
  const {c}=harness();c.initializeStudyPlan();c.syncReady=true;c.cloudVersion='v1';let calls=0;
  c.fetch=async()=>{calls++;return {ok:false,status:412};};await c.syncToCloud();await c.syncToCloud();
  assert.equal(c.syncConflict,true);assert.equal(c.pendingSync,true);assert.equal(calls,1);
});
test('reload with pending edits refuses a newer remote copy',async()=>{
  const {c,storage}=harness();c.initializeStudyPlan();c.store.tasks.daily.push({text:'local',done:false});
  storage.set('ct_v5',JSON.stringify(c.store));storage.set('ct_sync_v1',JSON.stringify({pending:true,version:'v1'}));
  c.fetch=async()=>({ok:true,json:async()=>({fields:{sessions:{stringValue:'[]'}},updateTime:'v2'})});
  await c.loadStore();assert.equal(c.store.tasks.daily[0].text,'local');assert.equal(c.syncConflict,true);
});
test('other course sessions do not inflate the early pediatrics goal or shift course dates',()=>{
  const {c}=harness();c.initializeStudyPlan();
  c.store.studyPlan.progress.push({date:'2026-10-29',count:2,courseStart:'2026-11-10'},
    {date:'2026-10-28',count:3,courseStart:'2026-10-27'},
    {date:'2026-10-29',count:1,courseStart:'2026-10-27'});
  assert.equal(c.planCompleted(),1);assert.equal(c.planProgressFor('2026-10-29','2026-10-29'),1);
  assert.equal(c.store.studyPlan.courses[0].end,'2026-11-09');
  assert.equal(c.store.dayGoals['2026-10-30'],2);
});
test('an in-flight legacy timer retains its metadata while the new timer screen has no selectors',()=>{
  const {c,element}=harness();c.initializeStudyPlan();c.store.runningStart=Date.now()-5000;
  c.store.runningCourse='2026-10-27';c.store.runningPlan=true;c.restoreTimer();
  assert.equal(c.store.runningPlan,true);assert.equal(c.store.runningCourse,'2026-10-27');assert.equal(element('btnStop').disabled,false);
  assert.equal(c.running,true);assert.ok(c.currentElapsed()>=5);
});
test('a native stop replaces the running web timer and exposes the saved session',async()=>{
  const {c}=harness();c.initializeStudyPlan();c.store.runningStart=Date.now()-65000;c.store.runningPlan=true;c.restoreTimer();
  const remote=JSON.parse(JSON.stringify(c.store));remote.sessions.push({date:'2026-10-29',duration:65,timerStart:remote.runningStart});remote.runningStart=null;remote.runningPlan=false;
  const fields=Object.fromEntries(Object.entries(remote).map(([k,v])=>[k,{stringValue:JSON.stringify(v)}]));
  c.fetch=async()=>({ok:true,json:async()=>({fields,updateTime:'native-stop'})});
  await c.refreshCloud();assert.equal(c.running,false);assert.equal(c.store.sessions.at(-1).duration,65);
});
test('web save recognizes a native save before adding another copy',async()=>{
  const {c}=harness();c.initializeStudyPlan();c.store.runningStart=Date.now()-65000;c.restoreTimer();
  const remote=JSON.parse(JSON.stringify(c.store));remote.sessions.push({date:'2026-10-29',duration:65,timerStart:remote.runningStart});remote.runningStart=null;
  const fields=Object.fromEntries(Object.entries(remote).map(([k,v])=>[k,{stringValue:JSON.stringify(v)}]));
  c.fetch=async()=>({ok:true,json:async()=>({fields,updateTime:'native-save'})});
  await c.stopTimer();assert.equal(c.running,false);assert.equal(c.store.sessions.length,3);assert.equal(c.pendingSync,false);
});
function cloudResponse(data,version){
  const fields=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,{stringValue:JSON.stringify(v)}]));
  return {ok:true,json:async()=>({fields,updateTime:version})};
}
test('returning browser with a stale pending flag adopts newer native records without writing',async()=>{
  const {c,storage}=harness();c.initializeStudyPlan();const base=JSON.parse(JSON.stringify(c.store));
  const remote=JSON.parse(JSON.stringify(base));remote.sessions.push({id:'native-new',date:'2026-11-01',duration:1800});
  storage.set('ct_v5',JSON.stringify(base));storage.set('ct_sync_v1',JSON.stringify({pending:true,version:'v1',base}));
  let writes=0;c.fetch=async(u,o)=>{if(o&&o.method==='PATCH')writes++;return cloudResponse(remote,'v2');};
  await c.loadStore();assert.equal(c.syncConflict,false);assert.equal(c.pendingSync,false);assert.equal(writes,0);
  assert.equal(c.store.sessions.at(-1).id,'native-new');
});
test('independent day-goal and native-session changes reconcile using the current cloud version',async()=>{
  const {c,storage}=harness();c.initializeStudyPlan();const base=JSON.parse(JSON.stringify(c.store));
  c.store.dayGoals['2026-11-01']=3;const remote=JSON.parse(JSON.stringify(base));
  remote.sessions.push({id:'native-new',date:'2026-11-01',duration:1800});
  storage.set('ct_v5',JSON.stringify(c.store));storage.set('ct_sync_v1',JSON.stringify({pending:true,version:'v1',base}));
  let saved;c.fetch=async(u,o)=>{if(o&&o.method==='PATCH'){saved=JSON.parse(o.body);assert.match(u,/updateTime=v2/);return {ok:true,json:async()=>({updateTime:'v3'})};}return cloudResponse(remote,'v2');};
  await c.loadStore();assert.equal(c.syncConflict,false);assert.equal(c.pendingSync,false);
  assert.equal(JSON.parse(saved.fields.sessions.stringValue).at(-1).id,'native-new');
  assert.equal(JSON.parse(saved.fields.dayGoals.stringValue)['2026-11-01'],3);
});
test('real overlapping edits are retained and show recovery directly in the notice',async()=>{
  const {c,storage,element}=harness();c.initializeStudyPlan();const base=JSON.parse(JSON.stringify(c.store));
  c.store.dayGoals['2026-11-01']=3;const remote=JSON.parse(JSON.stringify(base));remote.dayGoals['2026-11-01']=5;
  storage.set('ct_v5',JSON.stringify(c.store));storage.set('ct_sync_v1',JSON.stringify({pending:true,version:'v1',base}));
  c.fetch=async()=>cloudResponse(remote,'v2');await c.loadStore();assert.equal(c.syncConflict,true);
  assert.equal(c.store.dayGoals['2026-11-01'],3);assert.match(element('syncNotice').innerHTML,/useCloudCopy/);
});
test('legacy conflict recovery archives all pending local work before showing current cloud data',async()=>{
  const {c,storage}=harness();c.initializeStudyPlan();c.store.tasks.daily.push({id:'local',text:'preserve me'});
  const remote=JSON.parse(JSON.stringify(c.store));remote.tasks.daily=[];remote.sessions.push({id:'latest',duration:60,date:'2026-11-01'});
  c.pendingSync=true;c.syncConflict=true;c.cloudVersion='v1';c.fetch=async()=>cloudResponse(remote,'v2');
  await c.useCloudCopy();assert.equal(c.syncConflict,false);assert.equal(c.pendingSync,false);assert.equal(c.syncReady,true);
  assert.equal(c.store.sessions.at(-1).id,'latest');
  const backups=JSON.parse(storage.get('ct_conflict_backups_v1'));assert.equal(backups[0].store.tasks.daily[0].text,'preserve me');
  assert.equal(backups[0].pending,true);assert.equal(c.cloudVersion,'v2');
});
test('recovery refuses to replace pending work when the backup cannot be stored',async()=>{
  const {c}=harness();c.initializeStudyPlan();c.store.tasks.daily.push({text:'local'});c.syncConflict=true;c.pendingSync=true;
  const remote=JSON.parse(JSON.stringify(c.store));remote.tasks.daily=[];c.fetch=async()=>cloudResponse(remote,'v2');
  const save=c.localStorage.setItem;c.localStorage.setItem=(k,v)=>{if(k==='ct_conflict_backups_v1')throw Error('quota');save(k,v);};
  await c.useCloudCopy();assert.equal(c.store.tasks.daily[0].text,'local');assert.equal(c.syncConflict,true);assert.equal(c.pendingSync,true);
});
test('simultaneous timer edits do not mix the start time with another devices course',()=>{
  const {c}=harness();c.initializeStudyPlan();c.cloudBase=JSON.parse(JSON.stringify(c.store));
  c.store.runningStart=100;c.store.runningCourse='2026-10-27';
  const remote=JSON.parse(JSON.stringify(c.cloudBase));remote.runningStart=200;remote.runningCourse='2026-11-10';
  assert.equal(c.reconcileCloud({data:remote,version:'v2'}),false);assert.equal(c.store.runningStart,100);
});
test('workflow migration preserves all old tasks, fixed course dates and completed counts',()=>{
  const {c}=harness();c.initializeStudyPlan();delete c.store.studyPlan.sessionTargets;delete c.store.studyPlan.workflowVersion;
  c.store.tasks.daily=[{text:'Ancien görev',done:true}];c.store.dayTasks['2026-10-30']=[{text:'Gün görevi',done:false}];
  c.store.studyPlan.progress=[{id:'old-count',date:'2026-10-30',count:7,courseStart:'2026-10-27'}];
  const tasks=JSON.stringify(c.store.tasks),days=JSON.stringify(c.store.dayGoals),dates=c.store.studyPlan.courses.map(x=>x.start+'/'+x.end).join();
  assert.equal(c.ensureSessionPlan(),true);assert.equal(c.targetCompleted(c.targets()[0]),7);assert.equal(c.targets()[0].total,20);
  assert.equal(c.targets()[0].schedule.reduce((n,s)=>n+s.count,0),19);
  assert.equal(JSON.stringify(c.store.tasks),tasks);assert.equal(JSON.stringify(c.store.dayGoals),days);assert.equal(c.store.studyPlan.courses.map(x=>x.start+'/'+x.end).join(),dates);
  assert.equal(c.ensureSessionPlan(),false);
});
test('new stopwatch writes duration only, with completion selected afterwards',async()=>{
  const {c}=harness();c.initializeStudyPlan();c.syncToCloud=async()=>{};c.refreshCloud=async()=>{};
  let now=new Date('2026-10-30T12:00:00').getTime();c.Date=class extends Date{static now(){return now;}};
  await c.startTimer();assert.equal(c.store.runningPlan,false);assert.equal(c.store.runningCourse,null);now+=65000;await c.stopTimer();
  assert.equal(c.secsForDay('2026-10-30'),65);assert.equal(c.planCompleted(),0);
  const work=c.workGroups()[0];c.recordWorkCompletion(work.key,c.targets()[0].id,1);assert.equal(c.planCompleted(),1);assert.equal(c.secsForDay('2026-10-30'),65);
});
test('marking a saved work twice replaces completion instead of subtracting two sessions',()=>{
  const {c}=harness();c.initializeStudyPlan();const key=c.saveWorkParts(null,[{date:'2026-10-30',duration:3600}],'');
  c.recordWorkCompletion(key,c.targets()[0].id,1);c.recordWorkCompletion(key,c.targets()[0].id,1);
  assert.equal(c.planCompleted(),1);assert.equal(c.store.studyPlan.progress.length,1);
  c.recordWorkCompletion(key,c.targets()[0].id,2);assert.equal(c.planCompleted(),2);assert.equal(c.store.studyPlan.progress.length,1);
});
test('undo completion leaves the recorded work duration unchanged',async()=>{
  const {c}=harness();c.initializeStudyPlan();c.syncToCloud=async()=>{};
  const key=c.saveWorkParts(null,[{date:'2026-10-30',duration:1234}],'');c.recordWorkCompletion(key,c.targets()[0].id,1);
  c.workflowState={kind:'complete',key};await c.undoWorkCompletion();assert.equal(c.planCompleted(),0);assert.equal(c.secsForDay('2026-10-30'),1234);
});
test('manual duration edits preserve seconds and move attached completion with the study date',()=>{
  const {c}=harness();c.initializeStudyPlan();const key=c.saveWorkParts(null,[{date:'2026-10-30',duration:3665}],'Not');
  c.recordWorkCompletion(key,c.targets()[0].id,1);c.saveWorkParts(key,[{date:'2026-10-31',duration:3727}],'Yeni not');
  assert.equal(c.secsForDay('2026-10-30'),0);assert.equal(c.secsForDay('2026-10-31'),3727);assert.equal(c.store.studyPlan.progress[0].date,'2026-10-31');assert.equal(c.planCompleted(),1);assert.equal(c.findWork(key).parts[0].note,'Yeni not');
});
test('midnight fragments form one work with one completion and retain separate daily totals',()=>{
  const {c}=harness();c.initializeStudyPlan();c.store.sessions.push({id:'split-a',groupId:'split',date:'2026-10-30',duration:1800},{id:'split-b',groupId:'split',date:'2026-10-31',duration:1800});
  assert.equal(c.findWork('split').parts.length,2);c.recordWorkCompletion('split',c.targets()[0].id,1);assert.equal(c.planCompleted(),1);
  c.saveWorkParts('split',[{date:'2026-10-30',duration:1200},{date:'2026-10-31',duration:1801}],'');
  assert.equal(c.findWork('split').duration,3001);assert.equal(c.secsForDay('2026-10-30'),1200);assert.equal(c.secsForDay('2026-10-31'),1801);assert.equal(c.planCompleted(),1);
});
test('course date edits retain stable progress and target links and never shift other courses',()=>{
  const {c}=harness();c.initializeStudyPlan();const course=c.store.studyPlan.courses[0],key=c.courseKey(course),target=c.targets()[0];
  c.store.studyPlan.progress.push({id:'old',courseStart:key,date:'2026-10-30',count:2});
  const next=c.store.studyPlan.courses[1].start;
  c.saveCourse({name:'Çocuk Sağlığı',start:'2026-10-26',end:'2026-11-08'},key);
  assert.equal(c.courseKey(course),key);assert.equal(c.courseCompleted(key),2);assert.equal(c.targetCompleted(target),2);assert.equal(c.store.studyPlan.courses[1].start,next);
});
test('completion can move to another course target without retaining the old count',()=>{
  const {c}=harness();c.initializeStudyPlan();const key=c.saveWorkParts(null,[{date:'2026-10-30',duration:3600}],'');
  c.recordWorkCompletion(key,c.targets()[0].id,1);c.recordWorkCompletion(key,c.targets()[1].id,1);
  assert.equal(c.targetCompleted(c.targets()[0]),0);assert.equal(c.targetCompleted(c.targets()[1]),1);assert.equal(c.store.studyPlan.progress.length,1);
});
test('invalid manual dates and durations are rejected without touching existing records',()=>{
  const {c}=harness();c.initializeStudyPlan();const before=JSON.stringify(c.store.sessions);
  assert.throws(()=>c.saveWorkParts(null,[{date:'2026-02-30',duration:60}],''));
  assert.throws(()=>c.saveWorkParts(null,[{date:'2099-01-01',duration:60}],''));
  assert.throws(()=>c.saveWorkParts(null,[{date:'2026-10-30',duration:0}],''));
  assert.throws(()=>c.saveWorkParts(null,[{date:'2026-10-30',duration:60.2}],''));assert.equal(JSON.stringify(c.store.sessions),before);
});
test('target schedules reject overlapping dates and do not alter stored targets on invalid input',()=>{
  const {c}=harness();c.initializeStudyPlan();const original=JSON.stringify(c.targets()[0]);
  const value=JSON.parse(original);value.schedule=[{start:'2026-10-30',end:'2026-11-01',count:2},{start:'2026-11-01',end:'2026-11-02',count:3}];
  assert.throws(()=>c.saveTarget(value,value.id),/çakışmamalı/);assert.equal(JSON.stringify(c.targets()[0]),original);
});
test('legacy linked completion is detected and replaced rather than counted again',()=>{
  const {c}=harness();c.initializeStudyPlan();c.store.sessions.push({id:'native-old-0',groupId:'native-old',date:'2026-10-30',duration:600});
  c.store.studyPlan.progress.push({id:'native-old',sessionGroup:'native-old',courseStart:'2026-10-27',date:'2026-10-30',count:1});
  assert.equal(c.linkedProgress(c.findWork('native-old')).length,1);c.recordWorkCompletion('native-old',c.targets()[0].id,1);assert.equal(c.planCompleted(),1);assert.equal(c.store.studyPlan.progress.length,1);
});
test('rendered work actions escape malformed legacy identifiers and user notes',()=>{
  const {c,element}=harness();c.initializeStudyPlan();c.store.sessions.push({id:"bad'\"><img onerror=alert(1)>",date:'2026-10-30',duration:60,note:'<img src=x onerror=alert(1)>'});
  c.renderWorkList('testWork',c.workGroups());assert.doesNotMatch(element('testWork').innerHTML,/<img/);assert.match(element('testWork').innerHTML,/&lt;img/);
});
test('migrated completions stay assigned when goal dates change, without absorbing pre-goal historical counts',()=>{
  const {c}=harness();c.initializeStudyPlan();delete c.store.studyPlan.workflowVersion;
  c.store.studyPlan.progress=[{id:'before-goal',date:'2026-10-28',courseStart:'2026-10-27',count:3},{id:'counted',date:'2026-10-30',courseStart:'2026-10-27',count:4}];
  c.ensureSessionPlan();const t=c.targets()[0];assert.equal(c.targetCompleted(t),4);
  const changed=JSON.parse(JSON.stringify(t));changed.from='2026-11-01';changed.schedule=[];c.saveTarget(changed,t.id);assert.equal(c.targetCompleted(t),4);
  changed.from='2026-10-27';c.saveTarget(changed,t.id);assert.equal(c.targetCompleted(t),4);assert.equal(c.store.studyPlan.progress.length,2);
});
test('a slow cloud connection does not lock the next work editor after the local save',async()=>{
  const {c}=harness();c.initializeStudyPlan();let release;c.syncToCloud=()=>new Promise(resolve=>release=resolve);
  c.workflowState={kind:'work'};const saving=c.finishWorkflow();assert.equal(c.workflowSaving,false);assert.equal(c.workflowState,null);release();await saving;
});
test('dated session targets without a daily distribution appear on both dates as one shared goal',()=>{
  const {c}=harness();c.initializeStudyPlan();const t=c.saveTarget({title:'4–5 Kasım ek seanslar',courseStart:'2026-10-27',total:3,from:'2026-11-04',deadline:'2026-11-05',pagesPerSession:null,schedule:[]});
  c.store.studyPlan.progress.push({id:'future-example',targetId:t.id,courseStart:t.courseStart,date:'2026-11-04',count:1});
  const first=c.sessionPlansForDay('2026-11-04').find(p=>p.target.id===t.id),second=c.sessionPlansForDay('2026-11-05').find(p=>p.target.id===t.id);
  assert.equal(first.count,3);assert.equal(first.completed,1);assert.equal(first.shared,true);assert.equal(second.count,3);assert.equal(second.completed,1);
  assert.match(c.plannedSessionText('2026-11-05'),/ortak hedef/);assert.match(c.calendarSessionHtml('2026-11-04',null),/4–5 Kasım ek seanslar/);
  assert.equal(c.sessionPlansForDay('2026-11-06').filter(p=>p.target.id===t.id).length,0);assert.equal(t.total,3);
});
test('explicit day distributions take precedence over target ranges without inventing extra daily sessions',()=>{
  const {c}=harness();c.initializeStudyPlan();const t=c.saveTarget({title:'Dağıtılmış hedef',courseStart:'2026-10-27',total:3,from:'2026-11-04',deadline:'2026-11-05',pagesPerSession:null,schedule:[{start:'2026-11-04',end:'2026-11-04',count:2}]});
  assert.equal(c.sessionPlansForDay('2026-11-04').find(p=>p.target.id===t.id).count,2);
  assert.equal(c.sessionPlansForDay('2026-11-05').filter(p=>p.target.id===t.id).length,0);
  t.archived=true;assert.equal(c.sessionPlansForDay('2026-11-04').filter(p=>p.target.id===t.id).length,0);
});
test('target lists and course-selection options sort by deadline without changing saved insertion order',()=>{
  const {c}=harness();c.initializeStudyPlan();const added=c.saveTarget({title:'Geç eklenen yakın hedef',courseStart:'2026-10-27',total:2,from:'2026-11-04',deadline:'2026-11-05',pagesPerSession:null,schedule:[]});
  const order=c.targets().map(t=>t.id).join(',');const sorted=c.sortSessionTargets(c.targets());
  assert.equal(sorted[0].deadline,'2026-11-03');assert.equal(sorted[1].id,added.id);assert.equal(c.targets().map(t=>t.id).join(','),order);
  const options=c.targetOptions(added.id);assert.ok(options.indexOf(added.title)<options.indexOf('Genel Cerrahi'));
});
test('daily goal ratio combines saved work and the running stopwatch',()=>{
  const {c}=harness();c.initializeStudyPlan();c.store.sessions=[{id:'saved',date:'2026-11-01',duration:7200}];c.store.dayGoals['2026-11-01']=4;
  c.running=true;c.startMs=new Date('2026-11-01T12:00:00').getTime();const p=c.dailyGoalProgress(new Date('2026-11-01T12:30:00').getTime());
  assert.equal(p.saved,7200);assert.equal(p.live,1800);assert.equal(p.worked,9000);assert.equal(p.goal,14400);assert.equal(c.fmtGoalTime(p.worked),'2s 30d');
});
test('a running study spanning midnight contributes only todays portion to todays ratio',()=>{
  const {c}=harness();c.initializeStudyPlan();c.store.sessions=[{id:'saved',date:'2026-11-01',duration:600}];c.store.dayGoals['2026-11-01']=4;
  c.running=true;c.startMs=new Date('2026-10-31T23:30:00').getTime();const p=c.dailyGoalProgress(new Date('2026-11-01T00:30:00').getTime());
  assert.equal(p.live,1800);assert.equal(p.worked,2400);assert.equal(p.goal,14400);
});
test('already saved timer records are not counted twice and missing daily goals do not fabricate a target',()=>{
  const {c}=harness();c.initializeStudyPlan();c.running=true;c.startMs=new Date('2026-11-01T12:00:00').getTime();
  c.store.sessions=[{id:'saved',timerStart:c.startMs,date:'2026-11-01',duration:3600}];delete c.store.dayGoals['2026-11-01'];
  const p=c.dailyGoalProgress(new Date('2026-11-01T13:00:00').getTime());assert.equal(p.live,0);assert.equal(p.worked,3600);assert.equal(p.goal,0);assert.equal(c.store.dayGoals['2026-11-01'],undefined);
});
