import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./js/household.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const id='00000000-0000-4000-8000-000000000001';
const chores=completed=>({people:[{id,name:'Example'}],occurrences:[{choreId:id,personId:id,title:'Example chore',date:'2026-10-11',repeat:'once',completed}],overdue:[],weekStart:'2026-10-05',weekEnd:'2026-10-11'});
function fixture(){const requests=[],handlers={},timers=[],listeners={},document={hidden:false,addEventListener:(name,fn)=>listeners[name]=fn},DATA={};let elapsed=0;
 class XHR{open(method,url){this.method=method;this.url=url;}setRequestHeader(){}send(body){this.body=body&&JSON.parse(body);requests.push(this);}reply(data,status=200){this.status=status;this.responseText=JSON.stringify({data,controlKey:'test-control'});this.onload();}fail(){this.onerror();}}
 const App={on:(n,fn)=>handlers[n]=fn,emit(){},esc:String};
 vm.runInNewContext(source,{window:{DATA},App,XMLHttpRequest:XHR,Intl,Date,Promise,Object,performance:{now:()=>elapsed},document,setInterval:(fn,ms)=>timers.push({fn,ms})});
 return {H:App.household,App,DATA,requests,handlers,timers,listeners,document,advance:n=>elapsed+=n};
}
test('background household reads run every five minutes, weather every fifteen, with immediate startup and foreground reads',()=>{
 const f=fixture(),reads=[];let todayReads=0;
 const all=['calendar','chores','shopping','weather','time','forecast','photos'];
 const routine=['time','chores','shopping','photos','calendar'];
 f.H.refresh=name=>reads.push(name);f.H.refreshTodayChores=()=>todayReads++;
 f.handlers.ready();assert.deepEqual(reads,all);reads.length=0;
 assert.equal(f.timers.length,1);assert.equal(f.timers[0].ms,300000);
 f.timers[0].fn();assert.deepEqual(reads,routine);reads.length=0;
 f.document.hidden=true;f.timers[0].fn();assert.equal(reads.length,0);
 f.document.hidden=false;f.timers[0].fn();assert.deepEqual(reads,routine);reads.length=0;
 f.timers[0].fn();assert.deepEqual(reads,routine.concat(['weather','forecast']));assert.equal(todayReads,3);reads.length=0;
 f.listeners.visibilitychange();assert.deepEqual(reads,all);
});
test('delayed polling cannot overwrite a confirmed checkoff; failed writes never fabricate completion or retry',async()=>{
 const f=fixture();await (async()=>{const p=f.H.refresh('chores');f.requests[0].reply(chores(false));await p;})();
 const poll=f.H.refresh('chores');const write=f.H.write('chores','complete',{choreId:id,date:'2026-10-11',completed:true},id);await tick();
 f.requests[2].reply(chores(true));await write;f.requests[1].reply(chores(false));await poll;assert.equal(f.DATA.chores[0].completed,true);
 // Completion refresh starts after the write, while the earlier read is obsolete.
 f.requests[3].reply(chores(true));await tick();
 const failed=f.H.write('chores','complete',{choreId:id,date:'2026-10-11',completed:false},id);await tick();f.requests[4].fail();await assert.rejects(failed);assert.equal(f.DATA.chores[0].completed,true);assert.equal(f.requests.length,5);assert.equal(f.H.hasPending(),false);
});
test('calendar all-day boundaries stay Central dates, including DST; time advances monotonically from Ring sample',async()=>{
 const f=fixture();const p=f.H.refresh('calendar');f.requests[0].reply({sources:[],events:[{id:'event',sourceId:'source',title:'Example',allDay:true,start:'2026-11-01',end:'2026-11-02'}]});await p;
 assert.equal(f.H.dateKey(f.DATA.events[0].start),'2026-11-01');assert.equal(f.H.dateKey(f.DATA.events[0].end),'2026-11-02');
 const time=f.H.refresh('time');f.requests[1].reply({unixMs:Date.parse('2026-11-01T06:30:00Z'),timeZone:'America/Chicago'});await time;
 assert.equal(f.App.now().getHours(),1);assert.equal(f.App.now().getMinutes(),30);f.advance(3600000);assert.equal(f.App.now().getHours(),1);assert.equal(f.App.now().getMinutes(),30); // DST fallback, not a fabricated offset.
});
test('shopping writes and chores can run concurrently without blocking the page, input quantities remain authoritative',async()=>{
 const f=fixture();f.H.key='test-control';const a=f.H.write('shopping','add',{name:'Example',quantity:1},'add'),b=f.H.write('chores','complete',{choreId:id,date:'2026-10-11',completed:true},id);await tick();assert.equal(f.requests.length,2);
 f.requests[0].reply({items:[{id:'item',name:'Example',quantity:1,checked:false,category:'Other'}],usualItems:[]});f.requests[1].reply(chores(true));await Promise.all([a,b]);assert.equal(f.DATA.groceries[0].quantity,1);assert.equal(f.DATA.chores[0].completed,true);f.requests[2].reply(chores(true));
});


test('changing the viewed chore week during a save cannot replace it with an old response or lose today’s snapshot',async()=>{
 const f=fixture();f.H.key='test-control';const tm=f.H.refresh('time');f.requests[0].reply({unixMs:Date.parse('2026-10-11T18:00:00Z'),timeZone:'America/Chicago'});await tm;
 const initial=f.H.refresh('chores');f.requests[1].reply({...chores(false),today:'2026-10-11'});await initial;assert.equal(f.H.todayChores.occurrences.length,1);
 const save=f.H.write('chores','complete',{choreId:id,date:'2026-10-11',completed:true},id);await tick();f.H.refresh('chores','2026-10-12');f.requests[2].reply(chores(true));await save;
 assert.ok(f.requests[3].url.includes('weekStart=2026-10-12'));assert.equal(f.requests[4].url,'/api/household/chores');
 f.requests[3].reply({...chores(false),weekStart:'2026-10-12',weekEnd:'2026-10-18',occurrences:[],today:'2026-10-11'});f.requests[4].reply({...chores(true),today:'2026-10-11'});await tick();
 assert.equal(f.H.states.chores.data.weekStart,'2026-10-12');assert.equal(f.H.todayChores.occurrences[0].completed,true);
});
test('an edit aborts stale polls and a compact confirmed removal retains the usual catalog',async()=>{
 const f=fixture();const initial=f.H.refresh('shopping'),catalog=[{id:'usual',name:'Example'}];f.requests[0].reply({items:[{id:'item',name:'Example',quantity:1,checked:false,category:'Other'}],usualItems:catalog});await initial;
 const poll=f.H.refresh('shopping'),old=f.requests[1];let aborted=false;old.abort=()=>{aborted=true;old.onabort();};
 const removal=f.H.write('shopping','remove',{id:'item'},'item');assert.equal(aborted,true);await tick();assert.equal(f.requests[2].url,'/api/household/shopping/remove');
 f.requests[2].status=200;f.requests[2].responseText=JSON.stringify({data:{items:[],updatedAt:'2026-10-11T00:00:00Z'},partial:true,controlKey:'test-control'});f.requests[2].onload();await Promise.all([poll,removal]);assert.equal(f.DATA.groceries.length,0);assert.equal(f.DATA.usuals.length,1);assert.equal(f.H.states.shopping.error,null);assert.equal(f.H.hasPending(),false);
});
test('manual refresh replaces an in-flight poll and only the newest snapshot updates Shopping',async()=>{
 const f=fixture();const old=f.H.refresh('shopping');let aborted=false;f.requests[0].abort=()=>{aborted=true;f.requests[0].onabort();};const fresh=f.H.refresh('shopping',undefined,true);assert.equal(aborted,true);assert.equal(f.requests.length,2);
 f.requests[1].reply({items:[{id:'fresh',name:'New item',quantity:1,checked:false,category:'Other'}],usualItems:[]});await Promise.all([old,fresh]);assert.equal(f.DATA.groceries[0].id,'fresh');assert.equal(f.H.states.shopping.error,null);
 // Even a late callback from the discarded request cannot restore the old list.
 f.requests[0].reply({items:[],usualItems:[]});await tick();assert.equal(f.DATA.groceries[0].id,'fresh');
});

test('forecast refresh requests fresh provider data and rejects a late obsolete response',async()=>{
 const f=fixture();const old=f.H.refresh('forecast');f.requests[0].abort=()=>f.requests[0].onabort();const fresh=f.H.refresh('forecast',undefined,true);
 assert.equal(f.requests[1].url,'/api/household/forecast?refresh=1');const data={temperatureUnit:'F',periods:[],status:'ready',fetchedAt:'2026-10-11T20:00:00Z'};f.requests[1].reply(data);await Promise.all([old,fresh]);assert.equal(f.DATA.forecast.fetchedAt,data.fetchedAt);
 f.requests[0].reply({...data,fetchedAt:'2026-10-10T20:00:00Z'});await tick();assert.equal(f.DATA.forecast.fetchedAt,data.fetchedAt);assert.equal(f.H.states.forecast.error,null);
});

test('photo polling applies new arrivals and a failed read retains the last confirmed gallery',async()=>{
 const f=fixture(),photo={id,imagePath:'/api/photos/items/'+id+'/image',title:'Example',fileName:'image.jpg'};let task=f.H.refresh('photos');f.requests[0].reply({photos:[photo],sources:[],total:1});await task;assert.equal(f.DATA.photos.length,1);
 task=f.H.refresh('photos');f.requests[1].reply({photos:[{...photo,id:'00000000-0000-4000-8000-000000000002',imagePath:'/api/photos/items/00000000-0000-4000-8000-000000000002/image'},photo],sources:[],total:2});await task;assert.equal(f.DATA.photos.length,2);
 task=f.H.refresh('photos');f.requests[2].fail();await task;assert.equal(f.DATA.photos.length,2);assert.ok(f.H.states.photos.error);
});
