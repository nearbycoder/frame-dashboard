// One visible image at a time. Polling unchanged metadata never reloads it.
(function(){
 'use strict';
 var P=App.photos={id:null,paused:false,revision:0},head=null;
 P.current=function(){return DATA.photos.find(function(p){return p.id===P.id;})||DATA.photos[0]||null;};
 P.step=function(direction){var index=DATA.photos.findIndex(function(p){return p.id===P.id;});if(!DATA.photos.length)return;P.id=DATA.photos[(Math.max(0,index)+direction+DATA.photos.length)%DATA.photos.length].id;App.emit('photo');};
 P.source=function(p){return '/photo-image/'+p.id+(P.revision?'?retry='+P.revision:'');};
 P.mount=function(container){
  var p=P.current();
  if(!p){container.innerHTML='';delete container.dataset.photo;return;}
  var src=P.source(p);if(container.dataset.photo===src&&(!container.dataset.failedAt||Date.now()-Number(container.dataset.failedAt)<60000))return;container.dataset.photo=src;delete container.dataset.failedAt;
  container.innerHTML='<img class="frame-photo" alt=""><span class="frame-photo-message" role="status">Loading photo…</span>';
  var img=container.querySelector('img'),status=container.querySelector('.frame-photo-message');img.alt=p.title||p.fileName||'Photo';
  img.onload=function(){if(container.dataset.photo===src){ status.textContent=''; delete container.dataset.failedAt; }};img.onerror=function(){if(container.dataset.photo===src){container.dataset.failedAt=String(Date.now());status.textContent='Photo unavailable. Check Wi-Fi and the token’s photos_read permission, then refresh.';}};img.src=src;
 };
 App.on('household',function(domain){if(domain!=='photos')return;var latest=DATA.photos[0];if(latest&&latest.id!==head){head=latest.id;P.id=latest.id;}else if(!DATA.photos.some(function(p){return p.id===P.id;}))P.id=latest?latest.id:null;App.emit('photo');});
 App.on('ready',function(){setInterval(function(){if(document.hidden||P.paused||DATA.photos.length<2)return;if(App.mode==='ambient'||App.current==='photos'&&App.mode==='day')P.step(1);},20000);});
})();
