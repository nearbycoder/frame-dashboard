import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createProductImages, productImageURL } from './product-images.mjs';
const source = 'https://i5.walmartimages.com/seo/Example-product_abcd.jpeg?odnWidth=9999';
async function server(t, fetchImpl) {
 const handle = createProductImages({fetchImpl});
 const s = http.createServer((req,res) => handle(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(()=>s.close());
 return 'http://127.0.0.1:'+s.address().port+'/product-image?url='+encodeURIComponent(source);
}
test('product photos accept only the public shopping CDN and normalize size',()=>{
 assert.equal(productImageURL(source),'https://i5.walmartimages.com/seo/Example-product_abcd.jpeg?odnHeight=240&odnWidth=240&odnBg=FFFFFF');
 for(const u of ['http://i5.walmartimages.com/seo/a.jpg','https://localhost/seo/a.jpg','https://i5.walmartimages.com.evil/seo/a.jpg','https://secret@i5.walmartimages.com/seo/a.jpg','https://i5.walmartimages.com:444/seo/a.jpg','https://i5.walmartimages.com/api/a.jpg','https://i5.walmartimages.com/seo/a.svg','https://i5.walmartimages.com/seo/a.jpg#secret']) assert.equal(productImageURL(u),null,u);
});
test('image fetches verify content, cache privately, and never forward credentials or follow redirects',async t=>{
 const base=await server(t,async(url,opts)=>{assert.equal(url,productImageURL(source));assert.equal(opts.redirect,'manual');assert.equal(opts.headers,undefined);return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/jpeg'}});});
 const res=await fetch(base,{headers:{Authorization:'Bearer local-test-only'}});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, max-age=21600');assert.equal((await res.arrayBuffer()).byteLength,3);
 const redirect=await server(t,async()=>new Response(null,{status:302,headers:{location:'https://localhost/private'}}));assert.equal((await fetch(redirect)).status,502);
 const html=await server(t,async()=>new Response('<html>',{headers:{'Content-Type':'text/html'}}));assert.equal((await fetch(html)).status,502);
 const huge=await server(t,async()=>new Response(new Uint8Array(1024*1024+1),{headers:{'Content-Type':'image/png'}}));assert.equal((await fetch(huge)).status,502);
});
test('a burst of thumbnails is queued with at most three simultaneous downloads',async t=>{
 let active=0,max=0,calls=0;
 const base=await server(t,async()=>{calls++;active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,15));active--;return new Response('image',{headers:{'Content-Type':'image/webp'}});});
 const replies=await Promise.all(Array.from({length:8},()=>fetch(base)));assert.ok(replies.every(r=>r.status===200));assert.equal(calls,8);assert.equal(max,3);
});
