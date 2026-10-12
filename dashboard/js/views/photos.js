(function(){
 'use strict';
 var H=App.household,V={el:null,refreshing:false};
 function paint(){
  if(!V.el)return;
  var photos=DATA.photos,p=App.photos.current(),s=H.states.photos,gallery=DATA.photoGallery;
  V.el.querySelector('.photo-count').textContent=photos.length?(photos.findIndex(function(x){return p&&x.id===p.id;})+1)+' / '+photos.length+(gallery.total>photos.length?' · Latest '+photos.length+' of '+gallery.total:''):'';
  V.el.querySelector('.photo-caption').textContent=p?(p.title||p.fileName||'')+(p.capturedDate?' · '+p.capturedDate:''):'';
  V.el.querySelector('.photo-status').textContent=H.status('photos');
  var refresh=V.el.querySelector('[data-photo-refresh]');refresh.disabled=V.refreshing||s.loading;refresh.textContent=refresh.disabled?'Refreshing…':'Refresh';
  V.el.querySelector('[data-photo-pause]').innerHTML=App.icon(App.photos.paused?'play':'pause',22);V.el.querySelector('[data-photo-pause]').setAttribute('aria-label',App.photos.paused?'Play slideshow':'Pause slideshow');
  ['[data-photo-prev]','[data-photo-next]','[data-photo-pause]'].forEach(function(q){V.el.querySelector(q).disabled=photos.length<2;});
  V.el.querySelector('.photo-empty').hidden=!!photos.length;V.el.querySelector('.photo-empty').textContent=s.loading&&!s.data?'Connecting to your photos…':s.data?'No photos in the enabled Ring gallery yet.':'Photo gallery unavailable. Enable photos_list and photos_read for the frame token, then refresh.';
  App.photos.mount(V.el.querySelector('.photo-display'));
 }
 App.register('photos',{show:function(el){V.el=el;if(!el.firstChild){el.innerHTML='<div class="photo-page"><div class="photo-display"></div><p class="photo-empty serif"></p><header class="photo-controls"><h1 class="serif">Photos</h1><span class="photo-count"></span><button class="btn" data-photo-refresh>Refresh</button><button class="photo-nav" data-photo-prev aria-label="Previous photo">'+App.icon('left',26)+'</button><button class="photo-nav" data-photo-pause aria-label="Pause slideshow"></button><button class="photo-nav" data-photo-next aria-label="Next photo">'+App.icon('right',26)+'</button></header><footer class="photo-footer"><p class="photo-caption"></p><p class="photo-status" role="status"></p></footer></div>';el.addEventListener('click',function(e){if(e.target.closest('[data-photo-prev]'))App.photos.step(-1);if(e.target.closest('[data-photo-next]'))App.photos.step(1);if(e.target.closest('[data-photo-pause]')){App.photos.paused=!App.photos.paused;paint();}if(e.target.closest('[data-photo-refresh]')){V.refreshing=true;App.photos.revision++;paint();H.refresh('photos',undefined,true).then(function(){V.refreshing=false;paint();});}});}paint();if(!H.states.photos.loading)H.refresh('photos');},resume:function(){paint();H.refresh('photos');}});
 App.on('photo',function(){if(App.current==='photos'&&App.mode==='day')paint();else App.views.photos._dirty=true;});
 App.on('household',function(d){if(d==='photos'&&App.current==='photos'&&App.mode==='day')paint();});
})();
