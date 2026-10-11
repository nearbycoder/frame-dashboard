// This loopback action works without Ring, GitHub, or an internet connection.
(function () {
 'use strict';
 function request(method,key) {
  return new Promise(function(resolve,reject){
   var xhr=new XMLHttpRequest();xhr.open(method,'/api/device-settings'+(method==='POST'?'/wifi':''));xhr.timeout=15000;
   if(method==='POST'){xhr.setRequestHeader('Content-Type','application/json');xhr.setRequestHeader('X-Device-Control',key);}
   xhr.onload=function(){var result;try{result=JSON.parse(xhr.responseText);}catch(_){return reject(new Error('Device settings are unavailable. Update the frame runtime to enable Wi-Fi settings.'));}if(xhr.status!==200)return reject(new Error(result.error||'Device settings are unavailable.'));resolve(result);};
   xhr.onerror=xhr.ontimeout=function(){reject(new Error('The local settings service is unavailable. Please try again.'));};
   xhr.send(method==='POST'?'{}':null);
  });
 }
 App.openDeviceSettings=function(){
  var key=null,available=false;
  App.sheet('<div class="sheet-pad"><div class="label">Device</div><h2 class="serif sheet-h">Settings</h2><h3 class="device-setting-title">Wi-Fi</h3><p class="device-setting-copy">Choose a network or enter its password in Android’s Wi-Fi settings. This works even when the frame is offline.</p><button class="btn btn--solid device-wifi" disabled>Loading settings…</button><p class="device-setting-copy">Tap “Return to dashboard” when you’re done.</p><p class="live-warning device-setting-status" role="status"></p></div>',{
   cls:'sheet--display',onMount:function(sheet){
    sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','Device settings');
    var button=sheet.querySelector('.device-wifi'),status=sheet.querySelector('.device-setting-status');
    request('GET').then(function(result){key=result.controlKey;available=result.wifiSettings===true&&typeof key==='string';button.disabled=!available;button.textContent='Choose Wi-Fi network';if(!available)status.textContent='Wi-Fi settings are available on the Android frame.';}).catch(function(e){button.textContent='Try again';button.disabled=false;status.textContent=e.message;});
    button.onclick=function(){
     if(!available)return App.openDeviceSettings();
     if(App.household&&App.household.hasPending()||App.lights&&Object.keys(App.lights.pending).length){status.textContent='Wait for your changes to finish saving, then try again.';return;}
     button.disabled=true;button.textContent='Opening Wi-Fi…';status.textContent='';
     request('POST',key).then(function(result){if(result.opened!==true)throw new Error('Wi-Fi settings did not open.');button.textContent='Choose Wi-Fi network';button.disabled=false;}).catch(function(e){status.textContent=e.message;button.textContent='Try again';button.disabled=false;});
    };
   }
  });
 };
 App.on('ready',function(){App.$('#deviceSettings').onclick=App.openDeviceSettings;});
})();
