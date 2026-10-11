import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./js/device-settings.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function boot(){
 const requests=[],button={},status={},handlers={};let mounts=0,pending=false;
 const sheet={setAttribute(){},querySelector(s){return s==='.device-wifi'?button:status;}};
 const App={on:(n,fn)=>handlers[n]=fn,$:()=>({}),sheet(html,opts){mounts++;opts.onMount(sheet,()=>{});},household:{hasPending:()=>pending},lights:{pending:{}}};
 class XHR{constructor(){this.headers={};requests.push(this);}open(method,url){this.method=method;this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}send(body){this.body=body;}reply(data,status=200){this.status=status;this.responseText=JSON.stringify(data);this.onload();}}
 vm.runInNewContext(source,{App,XMLHttpRequest:XHR,Promise,Error,Object});return {App,requests,button,status,block:()=>pending=true,mounts:()=>mounts};
}
test('Wi-Fi settings launch works with only the local service, without Ring authorization',async()=>{
 const f=boot();f.App.openDeviceSettings();assert.equal(f.requests[0].url,'/api/device-settings');f.requests[0].reply({wifiSettings:true,controlKey:'local-key'});await tick();assert.equal(f.button.disabled,false);
 f.button.onclick();assert.equal(f.requests[1].url,'/api/device-settings/wifi');assert.equal(f.requests[1].headers['X-Device-Control'],'local-key');assert.equal(f.requests[1].body,'{}');assert.equal(f.button.disabled,true);f.requests[1].reply({opened:true});await tick();assert.equal(f.button.disabled,false);
});
test('pending edits prevent leaving; launch failures show a retry; desktop stays unavailable',async()=>{
 const f=boot();f.App.openDeviceSettings();f.requests[0].reply({wifiSettings:true,controlKey:'local-key'});await tick();f.App.lights.pending.light={};f.button.onclick();assert.equal(f.requests.length,1);assert.match(f.status.textContent,/finish saving/);delete f.App.lights.pending.light;
 f.button.onclick();f.requests[1].reply({error:'Could not open Wi-Fi'},503);await tick();assert.match(f.status.textContent,/Could not open/);assert.equal(f.button.disabled,false);
 const desktop=boot();desktop.App.openDeviceSettings();desktop.requests[0].reply({wifiSettings:false});await tick();assert.equal(desktop.button.disabled,true);assert.match(desktop.status.textContent,/Android frame/);
});
