import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoImages,validPhotos} from './photos.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const id='00000000-0000-4000-8000-000000000001';
const photo={id,title:'Example',fileName:'example.jpg',contentType:'image/jpeg',imagePath:'/api/photos/items/'+id+'/image'};
test('photo metadata rejects foreign or altered image paths',()=>{
 assert.equal(validPhotos({sources:[],photos:[photo],total:1}),true);
 for(const p of [{...photo,id:'bad'},{...photo,imagePath:'https://evil.test/image'},{...photo,contentType:'text/html'}])assert.equal(validPhotos({sources:[],photos:[p],total:1}),false);
});
function response(){return {headers:{},status:200,setHeader(k,v){this.headers[k]=v;},writeHead(code,headers={}){this.status=code;Object.assign(this.headers,headers);return this;},end(body){this.body=body;return this;}};}
test('photo proxy keeps credentials at the fixed Ring origin, rejects unsafe IDs, redirects and permission errors',async()=>{
 let calls=0,status=200;const proxy=createPhotoImages({authorization:'private-test-credential',fetchImpl:async(url,opts)=>{calls++;assert.equal(url,'https://ring-mcp.nearbycoder.workers.dev/api/photos/items/'+id+'/image');assert.equal(opts.headers.Authorization,'private-test-credential');assert.equal(opts.redirect,'manual');return new Response('bytes',{status,headers:{'Content-Type':'image/jpeg'}});}});
 let res=response();await proxy({method:'GET',headers:{host:'127.0.0.1:4174'}},res,new URL('http://localhost/photo-image/'+id));assert.equal(res.status,200);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.body.toString(),'bytes');
 for(const path of ['../../secret','https://evil.test/image',id+'/extra']){res=response();await proxy({method:'GET',headers:{host:'localhost'}},res,new URL('http://localhost/photo-image/'+encodeURIComponent(path)));assert.notEqual(res.status,200);}assert.equal(calls,1);
 status=302;res=response();await proxy({method:'GET',headers:{host:'localhost'}},res,new URL('http://localhost/photo-image/'+id));assert.equal(res.status,502);
 status=403;res=response();await proxy({method:'GET',headers:{host:'localhost'}},res,new URL('http://localhost/photo-image/'+id));assert.equal(res.status,403);assert.match(res.body,/photos_read/);
});
test('slideshow selects new arrivals, removes deleted selections and never reloads unchanged images',()=>{
 const handlers={},DATA={photos:[photo]},App={on:(e,fn)=>handlers[e]=fn,emit(){}};
 vm.runInNewContext(readFileSync(new URL('./js/photos.js',import.meta.url),'utf8'),{App,DATA,Date,document:{hidden:false},setInterval(){}});
 handlers.household('photos');assert.equal(App.photos.current().id,id);
 const img={},label={},container={dataset:{},htmlWrites:0,set innerHTML(v){this.htmlWrites++;},querySelector(q){return q==='img'?img:label;}};
 App.photos.mount(container);img.onload();App.photos.mount(container);assert.equal(container.htmlWrites,1);
 const next={...photo,id:'00000000-0000-4000-8000-000000000002'};DATA.photos.unshift(next);handlers.household('photos');assert.equal(App.photos.id,next.id);App.photos.mount(container);assert.equal(container.htmlWrites,2);
 DATA.photos=[photo];handlers.household('photos');assert.equal(App.photos.id,id);DATA.photos=[];handlers.household('photos');assert.equal(App.photos.current(),null);
});
test('automatic photo rotation waits five minutes, skips inactive views, and preserves immediate next/previous controls',()=>{
 const handlers={},timers=[],DATA={photos:[photo,{...photo,id:'00000000-0000-4000-8000-000000000002'}]},document={hidden:false};
 const App={mode:'day',current:'photos',on:(e,fn)=>handlers[e]=fn,emit(){}};
 vm.runInNewContext(readFileSync(new URL('./js/photos.js',import.meta.url),'utf8'),{App,DATA,Date,document,setInterval:(fn,ms)=>timers.push({fn,ms})});
 handlers.household('photos');handlers.ready();assert.equal(timers.length,1);assert.equal(timers[0].ms,300000);
 timers[0].fn();assert.equal(App.photos.id,DATA.photos[1].id);
 App.photos.paused=true;timers[0].fn();assert.equal(App.photos.id,DATA.photos[1].id);
 App.photos.step(-1);assert.equal(App.photos.id,photo.id);App.photos.paused=false;
 document.hidden=true;timers[0].fn();assert.equal(App.photos.id,photo.id);document.hidden=false;
 App.current='home';timers[0].fn();assert.equal(App.photos.id,photo.id);
 App.mode='ambient';timers[0].fn();assert.equal(App.photos.id,DATA.photos[1].id);
});
