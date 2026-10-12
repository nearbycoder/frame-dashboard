// Authenticated Ring images stay behind the local bridge; never expose its token.
import {networkInterfaces} from 'node:os';
export const photoID = value => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function validPhotos(data) {
 return data && Array.isArray(data.sources) && Array.isArray(data.photos) && data.photos.length<=100 && Number.isInteger(data.total) && data.total>=data.photos.length && data.photos.every(p=>p&&photoID(p.id)&&p.imagePath==='/api/photos/items/'+p.id+'/image'&&typeof p.title==='string'&&typeof p.fileName==='string'&&['image/jpeg','image/png','image/webp'].includes(p.contentType));
}
export function createPhotoImages({authorization,fetchImpl=fetch}={}) {
 const hosts=new Set(['localhost','127.0.0.1','[::1]']);for(const list of Object.values(networkInterfaces()))for(const a of list||[])if(a.family==='IPv4')hosts.add(a.address);
 let active=0;
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/photo-image/'))return false;
  const id=url.pathname.slice('/photo-image/'.length);res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(!hosts.has(new URL('http://'+req.headers.host).hostname)){res.writeHead(403).end();return true;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return true;}
  if(!photoID(id)){res.writeHead(400).end();return true;}
  if(active>=2){res.writeHead(503).end('Photo loading is busy.');return true;}
  active++;
  try{
   const r=await fetchImpl('https://ring-mcp.nearbycoder.workers.dev/api/photos/items/'+id+'/image',{method:req.method,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:authorization,Accept:'image/jpeg,image/png,image/webp'}});
   const type=r.headers.get('content-type')?.split(';')[0].trim();
   if(r.status!==200){res.writeHead([401,403,404].includes(r.status)?r.status:502).end(r.status===403?'Enable photos_read for the frame token.':'Photo unavailable.');return true;}
   if(!['image/jpeg','image/png','image/webp'].includes(type))throw Error();
   let size=0,parts=[];if(req.method!=='HEAD')for await(const chunk of r.body){size+=chunk.length;if(size>8*1024*1024)throw Error();parts.push(Buffer.from(chunk));}
   res.writeHead(200,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:Buffer.concat(parts));
  }catch{res.writeHead(502).end('Photo unavailable. Check Wi-Fi and photo permissions.');}finally{active--;}
  return true;
 };
}
