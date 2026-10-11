// Group each evening's low with that day's high in Tulsa's time zone, including DST.
const central = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
function local(instant) { const p={};central.formatToParts(new Date(instant)).forEach(x=>{p[x.type]=x.value;});return {date:p.year+'-'+p.month+'-'+p.day,hour:+p.hour%24}; }
function advance(key,n){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function forecastDays(periods,now) {
 const today=local(now).date;
 const days=Array.from({length:7},(_,i)=>({date:advance(today,i),day:null,night:null}));
 periods.forEach(p=>{
  if(Date.parse(p.end)<=now)return;
  const start=local(p.start),key=!p.isDaytime&&start.hour<12?advance(start.date,-1):start.date;
  const d=days.find(d=>d.date===key);if(d)d[p.isDaytime?'day':'night']=p;
 });
 return days;
}
