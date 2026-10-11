import { forecastDays } from '../forecast-days.mjs';
(function () {
 'use strict';
 var H=App.household,V={el:null,selected:null,refreshing:false},days=[];
 function dateName(key,short) { var d=App.toCentralDate(key);return (key===H.dateKey(App.now())?'Today':short?App.fmt.dayShort(d):App.fmt.day(d)); }
 function card(d) {
  var p=d.day||d.night,selected=d.date===V.selected,chances=[d.day,d.night].filter(function(p){return p&&p.precipitationChance!=null;}).map(function(p){return p.precipitationChance;}),rain=chances.length?Math.max.apply(null,chances):null;
  return '<button class="forecast-day'+(selected?' is-selected':'')+'" data-day="'+d.date+'" aria-pressed="'+selected+'"><b>'+dateName(d.date,true)+'</b><small>'+App.fmt.monthShort(App.toCentralDate(d.date))+' '+App.toCentralDate(d.date).getDate()+'</small>'+App.icon(H.weatherIcon(p&&p.summary,!!d.day),40)+'<div class="forecast-temps"><strong>'+(d.day?d.day.temperature+'°':'—')+'</strong><span>'+(d.night?d.night.temperature+'°':'—')+'</span></div><span class="forecast-summary">'+App.esc(p?p.summary:'Not available yet')+'</span><small>'+(rain!=null?'Rain '+rain+'%':'Rain —')+'</small><small class="forecast-wind">'+(p?App.esc(p.windSpeed+' '+p.windDirection):'')+'</small></button>';
 }
 function period(p,label) {return '<section><h3>'+label+(p?' · '+p.temperature+'°F':'')+'</h3><p>'+App.esc(p?p.detail:'This period is not available in the latest forecast.')+'</p>'+(p?'<small>Wind '+App.esc(p.windSpeed+' '+p.windDirection)+(p.precipitationChance==null?'':' · Rain '+p.precipitationChance+'%')+'</small>':'')+'</section>';}
 function paint() {
  if(!V.el)return;
  var w=DATA.forecast,state=H.states.forecast;
  days=forecastDays(w?w.periods:[],H.instant());
  if(!days.some(d=>d.date===V.selected))V.selected=days[0].date;
  var selected=days.find(d=>d.date===V.selected),stamp=w&&App.toCentralDate(w.fetchedAt);
  V.el.innerHTML='<div class="live-page weather-page"><header class="live-head"><div><div class="label">Tulsa, Oklahoma · 74134</div><h1 class="serif">Weather</h1></div><span class="live-count">Seven-day forecast · °F</span><button class="btn" data-weather-refresh'+(V.refreshing||state.loading?' disabled':'')+' aria-busy="'+(V.refreshing||state.loading)+'">'+App.icon('refresh',20)+(V.refreshing||state.loading?' Refreshing…':' Refresh')+'</button></header>'+H.statusHTML('forecast',false)+(w&&w.status==='stale'?'<p class="live-warning" role="status">'+App.esc(w.error)+'</p>':'')+(w?'<div class="forecast-week">'+days.map(card).join('')+'</div><div class="forecast-detail"><header><h2 class="serif">'+dateName(selected.date,false)+'</h2><span>High / evening low</span></header><div class="forecast-detail-periods">'+period(selected.day,'Day')+period(selected.night,'Night')+'</div></div><p class="live-note">National Weather Service · Updated '+App.fmt.time(stamp)+' · '+App.fmt.monthShort(stamp)+' '+stamp.getDate()+'</p>':'<p class="live-empty serif">'+(state.loading?'Loading Tulsa’s forecast…':'Forecast unavailable. Tap Refresh to try again.')+'</p>')+'</div>';
 }
 function refresh() {if(V.refreshing)return;V.refreshing=true;paint();H.refresh('forecast',undefined,true).then(function(){V.refreshing=false;paint();});}
 App.register('weather',{show:function(el){V.el=el;if(!el.dataset.weatherBound){el.dataset.weatherBound='1';el.addEventListener('click',function(e){var day=e.target.closest('[data-day]');if(day){V.selected=day.dataset.day;paint();}if(e.target.closest('[data-weather-refresh]'))refresh();});}paint();},resume:paint});
 App.on('household',function(domain){if(domain!=='forecast'&&domain!=='time')return;if(App.current==='weather')paint();else App.views.weather._dirty=true;});
})();
