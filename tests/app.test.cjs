const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const main=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const app=main.slice(0,main.indexOf('(async function(){\n  var now=new Date();'));
function harness(){
  const nodes=new Map(),storage=new Map();
  function element(id){if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,innerHTML:'',textContent:'',style:{},hidden:false,
    classList:{add(){},remove(){},toggle(){}},contains(){return false;},blur(){},addEventListener(){}});return nodes.get(id);}
  const context={console,Date,Math,JSON,AbortSignal,setTimeout,clearTimeout,setInterval(){return 1;},clearInterval(){},
    window:{addEventListener(){}},document:{getElementById:element,activeElement:{blur(){}},querySelectorAll(){return [];}},
    localStorage:{setItem(k,v){storage.set(k,v);},getItem(k){return storage.get(k)||null;}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('plan.js','utf8'),context);vm.runInContext(app,context);
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
test('running timer restores its selected course and session-count choice',()=>{
  const {c,element}=harness();c.initializeStudyPlan();c.store.runningStart=Date.now()-5000;
  c.store.runningCourse='2026-10-27';c.store.runningPlan=true;c.restoreTimer();
  assert.equal(element('countPlanSession').checked,true);assert.equal(element('timerCourse').disabled,true);
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
