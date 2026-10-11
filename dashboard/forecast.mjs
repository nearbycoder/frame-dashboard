// Fixed Tulsa 74134 forecast. No Ring credential is sent to the public NWS API.
const point = 'https://api.weather.gov/points/36.1162,-95.8225';
export const forecastURL = value => typeof value === 'string' && /^https:\/\/api\.weather\.gov\/gridpoints\/[A-Z]{3}\/\d+,\d+\/forecast$/.test(value);
export function parseForecast(raw, fetchedAt = new Date().toISOString()) {
 const p = raw?.properties;
 if (!p || !Number.isFinite(Date.parse(p.generatedAt)) || !Array.isArray(p.periods) || !p.periods.length || p.periods.length > 100) throw Error('Invalid forecast');
 const periods = p.periods.map(x => {
  const strings = ['name','windSpeed','windDirection','shortForecast','detailedForecast'];
  const chance = x.probabilityOfPrecipitation?.value ?? null;
  if (strings.some(k => typeof x[k] !== 'string' || x[k].length > 8000) || !Number.isFinite(Date.parse(x.startTime)) || !(Date.parse(x.endTime) > Date.parse(x.startTime)) || typeof x.isDaytime !== 'boolean' || !Number.isFinite(x.temperature) || x.temperatureUnit !== 'F' || chance !== null && (!Number.isFinite(chance) || chance < 0 || chance > 100)) throw Error('Invalid forecast period');
  return {name:x.name,start:x.startTime,end:x.endTime,isDaytime:x.isDaytime,temperature:x.temperature,temperatureUnit:'F',precipitationChance:chance,windSpeed:x.windSpeed,windDirection:x.windDirection,summary:x.shortForecast,detail:x.detailedForecast};
 });
 return {location:{name:'Tulsa, OK 74134'},provider:'National Weather Service',timeZone:'America/Chicago',temperatureUnit:'F',generatedAt:p.generatedAt,fetchedAt,status:'ready',periods};
}
export function createForecast({fetchImpl=fetch, now=Date.now}={}) {
 let cache, checked=0, inflight;
 async function json(url) {
  const response = await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'application/geo+json','User-Agent':'FrameDashboard/1.0 (https://github.com/nearbycoder/frame-dashboard)'}});
  if(response.status!==200)throw Error('Weather provider unavailable');
  let size=0,parts=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw Error('Forecast too large');parts.push(Buffer.from(chunk));}
  return JSON.parse(Buffer.concat(parts).toString());
 }
 async function read(force) {
  if(cache && now()-checked < (force?5000:900000))return cache;
  if(inflight)return inflight;
  inflight=(async()=>{checked=now();try{
   const location=await json(point),url=location?.properties?.forecast;
   if(!forecastURL(url))throw Error('Invalid forecast location');
   cache=parseForecast(await json(url+'?units=us'),new Date(now()).toISOString());return cache;
  }catch{
   if(cache)return {...cache,status:'stale',error:'Forecast refresh unavailable. Showing the last confirmed forecast.'};
   throw Error('Tulsa forecast is unavailable. Please refresh to try again.');
  }finally{inflight=null;}})();
  // Preserve stale status on subsequent cached reads after a failed refresh.
  return inflight.then(value=>{cache=value;return value;});
 }
 return {read,async handle(req,res,url){
  if(url.pathname!=='/api/household/forecast')return false;
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'}).end(JSON.stringify({error:'Read-only forecast'}));return true;}
  try{res.end(JSON.stringify({data:await read(url.searchParams.get('refresh')==='1')}));}catch(e){res.writeHead(502).end(JSON.stringify({error:e.message}));}return true;
 }};
}
