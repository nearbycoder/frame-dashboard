import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const tick = () => new Promise(resolve => setImmediate(resolve));
const old = 'aaaaaaaaaaaaaaaa', newer = 'bbbbbbbbbbbbbbbb';
const release = version => ({ version, assets: ['/assets/app.js','/assets/app.css'] });
function fixture(commit = null) {
 const requests=[], timers=[], handlers={}, notices=[], destinations=[];
 const parts={}; const part=name=>parts[name] ||= {hidden:false,disabled:false,textContent:'',addEventListener(){}};
 const sheet={setAttribute(){},querySelector:part};
 const button={onclick:null,querySelector:()=>part('dot')};
 const App={lights:{pending:{}},on:(name,fn)=>{handlers[name]=fn;},banner:opts=>{notices.push(opts);return()=>{};},sheet:(_html,opts)=>opts.onMount(sheet)};
 class XHR { open(method,url){this.url=url;} send(){requests.push(this);} reply(value,status=200){this.status=status;if(this.responseType==='arraybuffer')this.response=value;else this.responseText=JSON.stringify(value);this.onload();} }
 const doc={hidden:false,querySelector:selector=>selector==='meta[name="dashboard-build"]'?{content:old}:selector==='meta[name="dashboard-commit"]'&&commit?{content:commit}:selector==='#dashboardUpdates'?button:selector==='#banners'?{lastElementChild:{querySelector:()=>part('dismiss')}}:null,addEventListener(){}};
 const context={App,document:doc,window:{addEventListener(){}},XMLHttpRequest:XHR,Promise,URL,Date,Object,location:{href:'http://frame.test/?lite=1#control',replace:url=>destinations.push(url)},setInterval(){},setTimeout:fn=>timers.push(fn)};
 vm.runInNewContext(readFileSync(new URL('./js/updates.js',import.meta.url),'utf8'),context);
 return {U:App.updates,App,requests,timers,notices,destinations,parts,ready:handlers.ready};
}
test('installed commit comes from the loaded page and stays fixed when a newer release is offered', async()=>{
 const commit='0123456789abcdef0123456789abcdef01234567';
 const f=fixture(commit);f.U.open();f.ready();
 f.requests[0].reply({...release(old),tag:'v1.0.8'});await tick();
 assert.equal(f.parts['[data-update-version]'].textContent,'Installed dashboard: v1.0.8 · commit 0123456');
 assert.equal(f.parts['[data-update-version]'].title,commit);
 f.U.check();f.requests[1].reply({...release(newer),tag:'v1.0.9',commit:'f'.repeat(40)});await tick();
 assert.equal(f.U.currentCommit,commit);
 assert.equal(f.parts['[data-update-version]'].textContent,'Installed dashboard: v1.0.8 · commit 0123456');
});
test('older or invalid commit metadata is labeled as a build hash, never as a Git commit',()=>{
 for (const commit of [null,'not-a-commit']) {
  const f=fixture(commit);f.U.open();
  assert.equal(f.parts['[data-update-version]'].textContent,'Installed dashboard: build aaaaaaaa');
  assert.equal(f.U.currentCommit,null);
 }
});
test('new releases prompt; failed downloads leave current page usable without navigating', async()=>{
 const f=fixture();f.ready();f.requests[0].reply(release(newer));await tick();assert.equal(f.notices.length,1);assert.equal(f.U.available.version,newer);
 f.U.apply();assert.equal(f.requests.length,3);f.requests[1].reply(null,503);f.requests[2].reply(new ArrayBuffer(10));await tick();
 assert.equal(f.destinations.length,0);assert.equal(f.U.applying,false);assert.ok(f.U.error);
});
test('downloads finish before navigation and outstanding light commands delay applying; section is retained',async()=>{
 const f=fixture();f.ready();f.requests[0].reply(release(newer));await tick();f.App.lights.pending={a:{}};f.U.apply();
 f.requests[1].reply(new ArrayBuffer(10));f.requests[2].reply(new ArrayBuffer(10));await tick();assert.equal(f.requests.length,3);assert.equal(f.destinations.length,0);
 f.App.lights.pending={};f.timers.shift()();await tick();f.requests[3].reply(release(newer));await tick();
 assert.equal(f.destinations.length,1);assert.ok(f.destinations[0].includes('build='+newer));assert.ok(f.destinations[0].endsWith('#control'));
});
test('a release replaced while downloading requires another check instead of navigating to unprepared assets',async()=>{
 const f=fixture();f.ready();f.requests[0].reply(release(newer));await tick();f.U.apply();f.requests[1].reply(new ArrayBuffer(10));f.requests[2].reply(new ArrayBuffer(10));await tick();f.requests[3].reply(release('cccccccccccccccc'));await tick();assert.equal(f.destinations.length,0);assert.equal(f.U.applying,false);
});


test('household writes delay update navigation while the rest of the interface stays open',async()=>{
 const f=fixture();let pending=true;f.App.household={hasPending:()=>pending};f.ready();f.requests[0].reply(release(newer));await tick();f.U.apply();f.requests[1].reply(new ArrayBuffer(10));f.requests[2].reply(new ArrayBuffer(10));await tick();assert.equal(f.destinations.length,0);
 pending=false;f.timers.shift()();await tick();f.requests[3].reply(release(newer));await tick();assert.equal(f.destinations.length,1);
});
