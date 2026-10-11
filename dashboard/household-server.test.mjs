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
