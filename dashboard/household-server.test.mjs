import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHouseholdBridge,validateHousehold } from './household-server.mjs';
test('desktop household API rejects untrusted writes, reads actual saved state, and excludes purchase history',async t=>{
 let checked=false;const calls=[];
 const bridge=createHouseholdBridge({rpc:async(tool,args)=>{calls.push(tool);if(tool==='shopping_list_update')checked=args.checked;return {items:[{id:'example',name:'Example',quantity:1,checked}],usualItems:[],orders:[{id:'private-order'}]};}});
 const server=http.createServer(async(req,res)=>{if(!await bridge.handle(req,res,new URL(req.url,'http://localhost')))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const origin='http://127.0.0.1:'+server.address().port;
 const listed=await (await fetch(origin+'/api/household/shopping')).json();assert.equal(listed.data.orders,undefined);
 const post=headers=>fetch(origin+'/api/household/shopping/update',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({id:'example',checked:true})});
 assert.equal((await post({Origin:'http://evil.example','X-Household-Control':listed.controlKey})).status,403);
 assert.equal((await post({Origin:origin,'X-Household-Control':'wrong'})).status,403);
 const result=await (await post({Origin:origin,'X-Household-Control':listed.controlKey})).json();assert.equal(result.data.items[0].checked,true);assert.deepEqual(calls,['shopping_list_get','shopping_list_update','shopping_list_get']);
});
test('household writes cannot select arbitrary tools or invent quantities, schedules or dates',()=>{
 for(const [action,value] of [['add',{name:'Example',tool:'unapproved'}],['add',{name:'Example',quantity:0}],['update',{id:'x',checked:null}],['complete',{choreId:'00000000-0000-4000-8000-000000000001',date:'2026-02-30',completed:true}]])assert.throws(()=>validateHousehold(action,value));
 assert.equal(validateHousehold('update',{id:'x',checked:false}).checked,false);
});
test('committed shopping mutations need one RPC, compact responses omit the unchanged catalog, and removal is confirmed',async t=>{
 let items=[];const calls=[],stamp='2026-10-11T00:00:00.000Z';
 const bridge=createHouseholdBridge({rpc:async(tool,args)=>{calls.push(tool);if(tool==='shopping_list_add')items.push({id:'example',name:args.name,quantity:args.quantity,checked:false,updatedAt:stamp});if(tool==='shopping_list_update')Object.assign(items[0],args,{updatedAt:stamp});if(tool==='shopping_list_remove')items=[];return {items:structuredClone(items),usualItems:[{id:'usual',name:'Example usual'}],orders:[{id:'private-order'}],updatedAt:stamp};}});
 const s=http.createServer((req,res)=>bridge.handle(req,res,new URL(req.url,'http://localhost')));await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(()=>s.close());const origin='http://127.0.0.1:'+s.address().port;
 const first=await (await fetch(origin+'/api/household/shopping')).json();
 async function post(action,body){const r=await fetch(origin+'/api/household/shopping/'+action,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Household-Control':first.controlKey,'X-Household-Compact':'1'},body:JSON.stringify(body)});assert.equal(r.status,200);assert.ok(r.headers.get('server-timing').includes('read;dur=0.0'));return r.json();}
 const added=await post('add',{name:'Example',quantity:1});assert.equal(added.partial,true);assert.equal(added.data.usualItems,undefined);assert.equal(added.data.orders,undefined);assert.equal(added.data.items.length,1);
 assert.equal((await post('update',{id:'example',quantity:2})).data.items[0].quantity,2);
 assert.equal((await post('remove',{id:'example'})).data.items.length,0);
 assert.deepEqual(calls,['shopping_list_get','shopping_list_add','shopping_list_update','shopping_list_remove']);
});
test('a mismatched saved snapshot triggers a fresh read, but uncertain writes are never replayed',async t=>{
 let fail=false;const calls=[],stamp='2026-10-11T00:00:00Z';
 const bridge=createHouseholdBridge({rpc:async(tool)=>{calls.push(tool);if(fail&&tool==='shopping_list_remove')throw Error('Uncertain response');return {updatedAt:stamp,items:tool==='shopping_list_remove'?[{id:'example',updatedAt:stamp}]:[],usualItems:[]};}});
 const s=http.createServer((req,res)=>bridge.handle(req,res,new URL(req.url,'http://localhost')));await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(()=>s.close());const origin='http://127.0.0.1:'+s.address().port,key=(await (await fetch(origin+'/api/household/shopping')).json()).controlKey;
 const remove=()=>fetch(origin+'/api/household/shopping/remove',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Household-Control':key},body:'{"id":"example"}'});
 assert.equal((await (await remove()).json()).data.items.length,0);assert.deepEqual(calls,['shopping_list_get','shopping_list_remove','shopping_list_get']);fail=true;assert.equal((await remove()).status,503);assert.equal(calls.length,4);
 assert.throws(()=>validateHousehold('remove',{id:'example',usualItemId:'usual'}));assert.throws(()=>validateHousehold('remove',{id:''}));
});
