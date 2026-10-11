// Desktop previews never alter the computer's network configuration.
export function desktopSettings(req,res,url) {
 if(!url.pathname.startsWith('/api/device-settings'))return false;
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/api/device-settings'&&req.method==='GET')res.end(JSON.stringify({wifiSettings:false}));
 else res.writeHead(503).end(JSON.stringify({error:'Wi-Fi settings are available on the Android frame.'}));
 return true;
}
