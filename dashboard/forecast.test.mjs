import test from 'node:test';
import assert from 'node:assert/strict';
import {createForecast,parseForecast,forecastURL} from './forecast.mjs';
import {forecastDays} from './js/forecast-days.mjs';
const period=(start,end,day=true,temp=80)=>({name:day?'Monday':'Monday Night',startTime:start,endTime:end,isDaytime:day,temperature:temp,temperatureUnit:'F',probabilityOfPrecipitation:{value:null},windSpeed:'5 mph',windDirection:'S',shortForecast:'Clear',detailedForecast:'Clear skies.'});
const payload={properties:{generatedAt:'2026-10-11T18:00:00Z',periods:[period('2026-10-12T06:00:00-05:00','2026-10-12T18:00:00-05:00')]}};
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/geo+json'}});
test('forecast rejects malformed temperatures, dates, chances and provider URLs',()=>{
 assert.equal(parseForecast(payload).periods[0].precipitationChance,null);
 for(const bad of [{temperatureUnit:'C'},{endTime:'invalid'},{isDaytime:null},{temperature:null},{probabilityOfPrecipitation:{value:101}}])assert.throws(()=>parseForecast({properties:{...payload.properties,periods:[{...payload.properties.periods[0],...bad}]}}));
 assert.equal(forecastURL('https://api.weather.gov/gridpoints/TSA/46,69/forecast'),true);
 for(const url of ['http://api.weather.gov/gridpoints/TSA/46,69/forecast','https://api.weather.gov.evil.test/gridpoints/TSA/46,69/forecast','https://api.weather.gov/gridpoints/TSA/46,69/forecast?secret=x','https://user@api.weather.gov/gridpoints/TSA/46,69/forecast'])assert.equal(forecastURL(url),false);
});
test('provider requests coalesce, cache, force refresh and mark previous forecast stale on failure',async()=>{
 let clock=Date.parse('2026-10-11T20:00:00Z'),calls=0,fail=false;
 const f=createForecast({now:()=>clock,fetchImpl:async(url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);if(fail)throw Error('offline');return response(url.includes('/points/')?{properties:{forecast:'https://api.weather.gov/gridpoints/TSA/46,69/forecast'}}:payload);}});
 await Promise.all([f.read(),f.read()]);assert.equal(calls,2);
 await f.read();assert.equal(calls,2);clock+=6000;await f.read(true);assert.equal(calls,4);
 fail=true;clock+=6000;const stale=await f.read(true);assert.equal(stale.status,'stale');assert.equal(stale.periods.length,1);assert.equal((await f.read()).status,'stale');assert.equal(calls,5);
 fail=false;clock+=900001;assert.equal((await f.read()).status,'ready');
});
test('untrusted point links are rejected before a second request',async()=>{
 let calls=0;const f=createForecast({fetchImpl:async()=>{calls++;return response({properties:{forecast:'https://example.com/forecast'}});}});
 await assert.rejects(f.read(),/unavailable/);assert.equal(calls,1);
});
test('seven Tulsa calendar dates cross DST correctly and nights attach to evening rather than morning',()=>{
 const raw={properties:{generatedAt:'2026-10-31T18:00:00Z',periods:[period('2026-10-31T18:00:00-05:00','2026-11-01T06:00:00-06:00',false,50),period('2026-11-01T06:00:00-06:00','2026-11-01T18:00:00-06:00',true,70),period('2026-11-01T18:00:00-06:00','2026-11-02T06:00:00-06:00',false,45)]}};
 const days=forecastDays(parseForecast(raw).periods,Date.parse('2026-10-31T22:00:00-05:00'));
 assert.equal(days.length,7);assert.deepEqual(days.map(d=>d.date),['2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06']);assert.equal(days[0].night.temperature,50);assert.equal(days[1].night.temperature,45);assert.equal(days[2].day,null);
 const overnight=parseForecast({properties:{...raw.properties,periods:[period('2026-11-01T01:00:00-06:00','2026-11-01T06:00:00-06:00',false,48),raw.properties.periods[1]]}});
 const afterMidnight=forecastDays(overnight.periods,Date.parse('2026-11-01T01:15:00-06:00'));assert.equal(afterMidnight[0].date,'2026-11-01');assert.equal(afterMidnight[0].day.temperature,70);assert.equal(afterMidnight[0].night,null);
});
