// Optional desktop bridge mirrors the on-device household endpoints.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
const tools={calendar:'calendar_events_list',chores:'chores_list',shopping:'shopping_list_get',weather:'weather_forecast_get',time:'date_time_get'};
const writes={'chores/complete':'chores_complete','chores/create':'chores_create','shopping/add':'shopping_list_add','shopping/update':'shopping_list_update','shopping/remove':'shopping_list_remove'};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const date=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function validateHousehold(action,a){
 const object=a&&typeof a==='object'&&!Array.isArray(a);if(!object)throw Error('Choose valid household settings.');
 const only=(obj,keys)=>Object.keys(obj).every(k=>keys.includes(k));
 const text=(key,max,required=false)=>a[key]===undefined?!required:typeof a[key]==='string'&&a[key].length<=max&&(!required||a[key].trim().length>0);
 const quantity=()=>a.quantity===undefined||Number.isFinite(a.quantity)&&a.quantity>0&&a.quantity<=999;
 let valid=false;
 if(action==='complete')valid=only(a,['choreId','date','completed'])&&uuid(a.choreId)&&date(a.date)&&typeof a.completed==='boolean';
 if(action==='create'){
  const s=a.schedule;valid=only(a,['personId','title','notes','schedule'])&&uuid(a.personId)&&text('title',160,true)&&text('notes',1000)&&s&&typeof s==='object'&&!Array.isArray(s)&&only(s,['repeat','startDate','endDate','weekdays'])&&['once','daily','weekly'].includes(s.repeat)&&date(s.startDate)&&(!('endDate'in s)||s.repeat!=='once'&&date(s.endDate)&&s.endDate>=s.startDate);
  if(valid)valid=s.repeat==='weekly'?Array.isArray(s.weekdays)&&s.weekdays.length>0&&s.weekdays.length<=7&&new Set(s.weekdays).size===s.weekdays.length&&s.weekdays.every(d=>Number.isInteger(d)&&d>=1&&d<=7):!('weekdays'in s);
 }
 if(action==='add')valid=only(a,['name','usualItemId','quantity','note'])&&('name'in a)!==('usualItemId'in a)&&text('name',240,'name'in a)&&text('usualItemId',100,'usualItemId'in a)&&quantity()&&text('note',500);
 if(action==='update')valid=only(a,['id','quantity','checked','note'])&&text('id',100,true)&&['quantity','checked','note'].some(k=>k in a)&&quantity()&&(!('checked'in a)||typeof a.checked==='boolean')&&text('note',500);
 if(action==='remove')valid=only(a,['id'])&&text('id',100,true);
 if(!valid)throw Error('Choose valid household settings.');return a;
}
function valid(domain,data){if(!data||Array.isArray(data)||typeof data!=='object')return false;const arr=k=>Array.isArray(data[k]);return {calendar:()=>arr('sources')&&arr('events'),chores:()=>arr('people')&&arr('occurrences')&&arr('overdue'),shopping:()=>arr('items')&&arr('usualItems'),weather:()=>arr('periods')&&['ready','stale','unavailable'].includes(data.status)&&data.temperatureUnit==='F',time:()=>Number.isFinite(data.unixMs)&&data.unixMs>0&&data.timeZone==='America/Chicago'}[domain]();}
// Ring commits shopping and returns the resulting snapshot in one transaction.
// Accept it only when the requested edit is present; older acknowledgments use a read.
export function confirmedShopping(action, input, data) {
 if (!valid('shopping', data) || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt)) || !data.items.every(i=>i&&typeof i.id==='string')) return false;
 if (action === 'remove') return !data.items.some(i => i?.id === input.id);
 if (action === 'update') {
  const item = data.items.find(i => i?.id === input.id);
  return !!item && item.updatedAt === data.updatedAt && ['quantity','checked','note'].every(k => !(k in input) || item[k] === input[k]);
 }
 if (action === 'add') return data.items.some(i => i && i.checked === false && typeof i.quantity === 'number' && i.updatedAt === data.updatedAt
  && (input.usualItemId ? i.usualItemId === input.usualItemId : i.name === input.name.trim())
  && i.quantity >= (input.quantity || 1) && i.note === input.note);
 return false;
}
export function createHouseholdBridge({rpc}){
 const key=randomBytes(32).toString('hex'),hosts=new Set(['localhost','127.0.0.1','[::1]']),queues=new Map();
 for(const list of Object.values(networkInterfaces()))for(const address of list||[])if(address.family==='IPv4')hosts.add(address.address);
 const serialize=(domain,fn)=>{const result=(queues.get(domain)||Promise.resolve()).then(fn),tail=result.catch(()=>{});queues.set(domain,tail);tail.then(()=>{if(queues.get(domain)===tail)queues.delete(domain);});return result;};
 return {async handle(request,response,url){
  if(!url.pathname.startsWith('/api/household/'))return false;
  const send=(status,value)=>response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(value));
  const [domain,action,...extra]=url.pathname.slice('/api/household/'.length).split('/');
  try{
   const own=new URL('http://'+request.headers.host);if(!hosts.has(own.hostname)){send(403,{error:'Host not allowed.'});return true;}
   if(!Object.hasOwn(tools,domain)){send(404,{error:'Unknown household page.'});return true;}
   const args={},week=url.searchParams.get('weekStart');if(week){if(domain!=='chores'||!date(week)){send(400,{error:'Choose a valid chore week.'});return true;}args.weekStart=week;}
   if(request.method==='GET'&&!action&&!extra.length){const data=await serialize(domain,()=>rpc(tools[domain],args));if(!valid(domain,data))throw Error();delete data.orders;send(200,{data,controlKey:key});return true;}
   if(request.method!=='POST'||!writes[domain+'/'+action]||extra.length){send(405,{error:'This operation is not supported.'});return true;}
   const supplied=Buffer.from(String(request.headers['x-household-control']||''));if(request.headers.origin!==own.origin||supplied.length!==key.length||!timingSafeEqual(supplied,Buffer.from(key))){send(403,{error:'Refresh before making changes.'});return true;}
   if(request.headers['content-type']?.split(';')[0]!=='application/json'){send(415,{error:'Expected JSON.'});return true;}
   let raw='';for await(const chunk of request){raw+=chunk.toString();if(Buffer.byteLength(raw)>8192){send(413,{error:'Request too large.'});return true;}}
   let body;try{body=validateHousehold(action,JSON.parse(raw));}catch{send(400,{error:'Choose valid household settings.'});return true;}
   let waitMs=0,writeMs=0,readMs=0;const queued=performance.now();
   let data=await serialize(domain,async()=>{waitMs=performance.now()-queued;const start=performance.now();const ack=await rpc(writes[domain+'/'+action],body);writeMs=performance.now()-start;if(domain==='shopping'&&confirmedShopping(action,body,ack))return ack;const readStart=performance.now();const value=await rpc(tools[domain],args);readMs=performance.now()-readStart;return value;});
   if(!valid(domain,data))throw Error();delete data.orders;
   response.setHeader('Server-Timing',`queue;dur=${waitMs.toFixed(1)}, write;dur=${writeMs.toFixed(1)}, read;dur=${readMs.toFixed(1)}`);
   const partial=domain==='shopping'&&request.headers['x-household-compact']==='1';if(partial)data={items:data.items,updatedAt:data.updatedAt};send(200,{data,controlKey:key,...(partial?{partial:true}:{})});
  }catch{send(503,{error:request.method==='POST'?'The change was not confirmed. Refresh to check before trying again.':'Live '+domain+' data is unavailable. Check Wi-Fi and Ring MCP permissions.'});}
  return true;
 }};
}
