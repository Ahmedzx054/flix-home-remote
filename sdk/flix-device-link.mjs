/** Small opt-in bridge for applications owned by FLIX. Never accepts shell or remote-control commands. */
export function createDeviceLink({serviceUrl,appId,platform,version,installationId,deviceName='',getSession,hasConsent,fetch:fetcher=globalThis.fetch}){
 const url=new URL(serviceUrl);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('HTTPS service origin required');
 if(!/^[a-f0-9-]{36}$/i.test(installationId)||!['webos','tizen','android'].includes(platform)||typeof getSession!=='function'||typeof hasConsent!=='function')throw Error('App identity, authenticated session and consent callback required');
 let last=0;
 async function request(route,data){const token=await getSession();if(!token)throw Error('FLIX login required');const r=await fetcher(url.origin+'/api/home-remote/'+route,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok)throw Error(result.error||'FLIX link failed');return result;}
 return {
  async latest(){return (await request('catalog')).releases.find(r=>r.appId===appId&&r.platform===platform);},
  async report({state='error',code='',message=''}){
   if(!await hasConsent())throw Error('Diagnostics sharing is disabled');
   if(last&&Date.now()-last<15000)throw Error('Wait 15 seconds between reports');
   // Pass structured error codes and a short description; never pass logs, credentials or viewing history.
   const result=await request('app-health',{appId,platform,version,installationId,deviceName,state,code:String(code).slice(0,80),message:String(message).slice(0,500)});last=Date.now();return result;
  }
 };
}
