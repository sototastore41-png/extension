(function () {
console.log("[VibeXAcademyHook] Iniciando");

let capturedToken = null;
let capturedProjectId = null;
let capturedBrowserSessionId = null;

function decodePayload(token){
  try{
    var parts = String(token || "").replace(/^Bearer\s+/i, "").trim().split(".");
    if(parts.length !== 3) return null;
    var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(b64));
  }catch(e){ return null; }
}

function isLikelyLovableToken(token){
  var payload = decodePayload(token);
  if(!payload || !payload.sub) return false;
  var iss = String(payload.iss || "").toLowerCase();
  var role = String(payload.role || "").toLowerCase();
  if(role === "anon" || role === "service_role") return false;
  if(iss.indexOf("supabase") >= 0 || iss.indexOf("supabase.co") >= 0) return false;
  return true;
}

function getHeaderValue(headers, name){
  try{
    if(!headers) return null;
    var lower = String(name).toLowerCase();
    if(typeof headers.get === "function") return headers.get(name) || headers.get(lower);
    if(Array.isArray(headers)){
      for(var i = 0; i < headers.length; i++){
        var row = headers[i];
        if(row && String(row[0]).toLowerCase() === lower) return row[1];
      }
      return null;
    }
    if(typeof headers === "object"){
      for(var k in headers){
        if(Object.prototype.hasOwnProperty.call(headers, k) && String(k).toLowerCase() === lower) return headers[k];
      }
    }
  }catch(e){}
  return null;
}

function getProjectFromPage(){
  try{
    const m = window.location.pathname.match(/projects\/([0-9a-fA-F-]{36})/i);
    return m ? m[1] : null;
  }catch{ return null; }
}

function extractProjectIdFromUrl(url){
  try{
    const m = String(url).match(/projects\/([0-9a-fA-F-]{36})/i);
    return m ? m[1] : null;
  }catch{ return null; }
}

function notifyFound(token, projectId, browserSessionId, force = false){
  const newProject = projectId || getProjectFromPage();
  const normalizedToken = typeof token === "string" ? token.replace(/^Bearer\s+/i, "").trim() : null;
  const normalizedSession = typeof browserSessionId === "string" ? browserSessionId.trim() : null;
  let changed = false;
  if(normalizedToken && isLikelyLovableToken(normalizedToken) && normalizedToken !== capturedToken){ capturedToken = normalizedToken; changed = true; }
  if(newProject && newProject !== capturedProjectId){ capturedProjectId = newProject; changed = true; }
  if(normalizedSession && normalizedSession !== capturedBrowserSessionId){ capturedBrowserSessionId = normalizedSession; changed = true; }
  if(!changed && !force) return;
  console.log("[VibeXAcademyHook] ✅ Lovable session synced", capturedToken ? "token" : "no token", capturedBrowserSessionId ? "bsess" : "no bsess");
  console.log("[VibeXAcademyHook] ProjectId:", capturedProjectId);
  window.postMessage({ type:"lovableTokenFound", token:capturedToken, projectId:capturedProjectId, browserSessionId:capturedBrowserSessionId },"*");
}

window.addEventListener("message", (event)=>{
  if(event.source !== window) return;
  if(!event.data || event.data.type !== "lovableRequestToken") return;
  notifyFound(capturedToken, getProjectFromPage() || capturedProjectId, capturedBrowserSessionId, true);
});

(function wrapFetch(){
  try{
    const originalFetch = window.fetch;
    window.fetch = async function(...args){
      try{
        let reqUrl = typeof args[0] === "string" ? args[0] : ((args[0] && args[0].url) || "");
        let opts = args[1] || {};
        let auth = null;
        let bsess = null;
        if(args[0] instanceof Request){
          reqUrl = args[0].url || reqUrl;
          auth = getHeaderValue(args[0].headers, "Authorization");
          bsess = getHeaderValue(args[0].headers, "X-Browser-Session-ID");
        }
        if(opts.headers){
          auth = getHeaderValue(opts.headers, "Authorization") || auth;
          bsess = getHeaderValue(opts.headers, "X-Browser-Session-ID") || bsess;
        }
        const pid = extractProjectIdFromUrl(reqUrl);
        if(auth && auth.startsWith("Bearer ")){
          const rawToken = auth.slice(7);
          notifyFound(rawToken, pid, bsess);
        } else if(bsess) {
          notifyFound(null, pid, bsess);
        }
      }catch(e){}
      return originalFetch.apply(this,args);
    };
  }catch(e){ console.warn("[VibeXAcademyHook] fetch error",e); }
})();

(function wrapXHR(){
  try{
    const origOpen = XMLHttpRequest.prototype.open;
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function(method,url){
      this._lovable_url = url;
      return origOpen.apply(this,arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name,value){
      if(name && name.toLowerCase()==="x-browser-session-id" && value){
        this._lovable_bsess = value;
        notifyFound(null, extractProjectIdFromUrl(this._lovable_url), value);
      }
      if(name && name.toLowerCase()==="authorization" && value && value.startsWith("Bearer ")){
        const rawToken = value.slice(7);
        notifyFound(rawToken, extractProjectIdFromUrl(this._lovable_url), this._lovable_bsess);
      }
      return origSetHeader.apply(this,arguments);
    };
  }catch(e){ console.warn("[VibeXAcademyHook] xhr error",e); }
})();

setInterval(()=>{
  const p = getProjectFromPage();
  if(p && p !== capturedProjectId){
    capturedProjectId = p;
    window.postMessage({ type:"lovableTokenFound", token:capturedToken, projectId:p, browserSessionId:capturedBrowserSessionId },"*");
  }
},1500);

})();