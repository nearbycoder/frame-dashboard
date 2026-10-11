import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./js/views/shopping.js',import.meta.url),'utf8');
// Minimal DOM adapter for the view's public event handlers, not a second UI.
function element() {return {dataset:{},disabled:false,scrollTop:0,value:'',firstChild:null,html:'',handlers:{},nodes:{},tiles:[],classList:{toggle(){}},setAttribute(){},addEventListener(n,f){this.handlers[n]=f;},querySelector(s){return this.nodes[s] ||= element();},querySelectorAll(){return this.tiles.concat(Object.values(this.nodes).flatMap(n=>n.querySelectorAll()));},set innerHTML(value){this.html=value;this.firstChild={};this.tiles=Array.from(value.matchAll(/data-usual="([^"]+)"/g),m=>Object.assign(element(),{dataset:{usual:m[1]}}));},get innerHTML(){return this.html;},closest(){return this;},hasAttribute(n){return n==='data-open-usuals'&&this.open;}};}
function fixture(count=2) {
 const D={groceries:[],usuals:Array.from({length:count},(_,i)=>({id:'product-'+i,name:'Example '+i,category:'Pantry',defaultQuantity:1,imageUrl:'https://i5.walmartimages.com/seo/Example.jpeg'})),catOrder:{all:['Pantry']}};
 const events={},calls=[];let dialog,options;
 const H={states:{shopping:{data:{}}},pending:{shopping:{}},statusHTML:()=>'',write(domain,action,body,key){calls.push({body,key});H.pending.shopping[key]=true;events['household:shopping']();return Promise.resolve();}};
 const App={household:H,current:'shopping',views:{},icon:()=>'',esc:String,toast(){},register(n,v){this.views[n]=v;},on(n,f){events[n]=f;},sheet(html,opts){options=opts;dialog=element();dialog.innerHTML=html;opts.onMount(dialog);}};
 vm.runInNewContext(source,{App,window:{DATA:D},Promise});const root=element();App.views.shopping.show(root);
 const opener=Object.assign(element(),{open:true});root.handlers.click({target:opener});
 return {D,H,root,calls,get dialog(){return dialog;},emit:()=>events['household:shopping'](),close:()=>options.onClose()};
}
test('usual-item saves leave the picker and other products interactive, readback does not shift tiles, confirmed items cannot double-add',()=>{
 const f=fixture(),grid=f.dialog.querySelector('.usual-grid'),first=grid.tiles[0],second=grid.tiles[1],markup=grid.innerHTML;
 f.root.querySelector('input').value='Unsubmitted draft';
 f.dialog.handlers.click({target:first});assert.equal(first.disabled,true);assert.equal(second.disabled,false);assert.equal(f.calls.length,1);
 f.dialog.handlers.click({target:second});assert.equal(f.calls.length,2);assert.equal(f.calls[1].body.usualItemId,'product-1');
 // Ring may omit added products from usualItems in its fresh response.
 f.D.usuals=[];f.D.groceries=[{id:'list-item',usualItemId:'product-0',name:'Example 0',category:'Pantry',quantity:1,checked:false}];delete f.H.pending.shopping['usual:product-0'];f.emit();
 assert.equal(grid.innerHTML,markup);assert.equal(grid.tiles[0],first);assert.equal(first.querySelector('.usual-state').textContent,'In list · ×1');assert.equal(first.disabled,true);
 f.dialog.handlers.click({target:first});assert.equal(f.calls.length,2);assert.equal(f.root.querySelector('input').value,'Unsubmitted draft');
 f.close();f.emit(); // Completion after closing must not touch the destroyed modal.
});
test('the full-page picker bounds the photo grid and searches the whole catalog',()=>{
 const f=fixture(40),grid=f.dialog.querySelector('.usual-grid');assert.equal(grid.tiles.length,18);
 f.dialog.querySelector('.usual-search').oninput({target:{value:'Example 39'}});assert.equal(grid.tiles.length,1);assert.equal(grid.tiles[0].dataset.usual,'product-39');assert.ok(grid.innerHTML.includes('/product-image?url='));
 f.dialog.handlers.click({target:grid.tiles[0]});assert.equal(f.calls[0].body.usualItemId,'product-39');
});
