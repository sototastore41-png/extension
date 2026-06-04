console.log("[Background] VibeX Academy service worker started");

async function enableActionSidePanel() {
  try {
    await chrome.sidePanel.setOptions({ path: "sidepanel.html", enabled: true });
  } catch(err) {
    console.warn("[Background] sidePanel.setOptions:", err && err.message ? err.message : err);
  }
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch(err) {
    console.warn("[Background] sidePanel.setPanelBehavior:", err && err.message ? err.message : err);
  }
}

async function openVibeXAcademyPanel(tab) {
  await enableActionSidePanel();
  if (!tab || !tab.id) throw new Error("Active tab not found.");
  await chrome.sidePanel.open({ tabId: tab.id });
  await chrome.storage.local.set({ ql_sidebar_mode: true });
  return { ok: true };
}

enableActionSidePanel();

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ ql_sidebar_mode: true });
  enableActionSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  enableActionSidePanel();
});

// Keep the extension icon wired to the side panel from the first install.
chrome.storage.local.get(["ql_sidebar_mode"], (res) => {
  if (res.ql_sidebar_mode !== true) chrome.storage.local.set({ ql_sidebar_mode: true });
  enableActionSidePanel();
});

// Listen for storage changes to update panel behavior
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ql_sidebar_mode) {
    enableActionSidePanel();
  }
});

// Handle extension icon clicks and open the side panel immediately.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await openVibeXAcademyPanel(tab);
  } catch(err) {
    console.error("[Background] action.onClicked sidePanel error:", err);
  }
});

function qlDecodeJwtPayload(token) {
  try {
    var raw = String(token || "").replace(/^Bearer\s+/i, "").trim();
    var parts = raw.split(".");
    if (parts.length !== 3) return null;
    var b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(b64));
  } catch(e) { return null; }
}

function qlIsUsableLovableToken(token) {
  var payload = qlDecodeJwtPayload(token);
  if (!payload || !payload.sub) return false;
  var exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp && exp * 1000 < Date.now() + 30000) return false;
  var iss = String(payload.iss || "").toLowerCase();
  if (iss.indexOf("supabase") >= 0 || iss.indexOf("supabase.co") >= 0) return false;
  var role = String(payload.role || "").toLowerCase();
  if (role === "anon" || role === "service_role") return false;
  return true;
}

function qlChooseBestToken(primary, fallback) {
  var a = String(primary || "").replace(/^Bearer\s+/i, "").trim();
  var b = String(fallback || "").replace(/^Bearer\s+/i, "").trim();
  if (qlIsUsableLovableToken(b)) {
    var pa = qlDecodeJwtPayload(a) || {};
    var pb = qlDecodeJwtPayload(b) || {};
    if (!qlIsUsableLovableToken(a)) return b;
    if ((pb.exp || 0) > (pa.exp || 0)) return b;
  }
  return a;
}

function qlGetStorage(keys) {
  return new Promise(function(resolve) { chrome.storage.local.get(keys, function(res) { resolve(res || {}); }); });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "lovableSync") {
    const updates = {};
    if (msg.token) updates.lovable_token = String(msg.token).replace(/^Bearer\s+/i, "").trim();
    if (msg.projectId) updates.lovable_projectId = msg.projectId;
    if (msg.browserSessionId) updates.lovable_browserSessionId = String(msg.browserSessionId).trim();
    if (Object.keys(updates).length) {
      chrome.storage.local.set(updates, () => {
        console.log("[Background] saved:", Object.keys(updates).join(", "));
      });
    }
  }

  if (msg && msg.action === "activateSidebar") {
    // Try to open the side panel from a user-triggered extension action.
    enableActionSidePanel();
    // Try to open if sender is a tab (content script click IS a user gesture propagated)
    if (sender.tab && sender.tab.id) {
      openVibeXAcademyPanel(sender.tab).then(() => {
        sendResponse({ ok: true });
      }).catch((err) => {
        console.warn("[Background] sidePanel.open deferred:", err.message);
        sendResponse({ ok: false, deferred: true, message: "Click the extension icon to open the side panel." });
      });
    } else {
      sendResponse({ ok: false, deferred: true, message: "Click the extension icon to open the side panel." });
    }
    return true;
  }

  if (msg && msg.action === "deactivateSidebar") {
    chrome.storage.local.set({ ql_sidebar_mode: false });
    enableActionSidePanel();
    sendResponse({ ok: true });
    return false;
  }

  if (msg && msg.action === "openSidePanel") {
    // This can only work if triggered from a user gesture context
    if (sender.tab && sender.tab.id) {
      openVibeXAcademyPanel(sender.tab).then(() => {
        sendResponse({ ok: true });
      }).catch((err) => {
        console.warn("[Background] openSidePanel deferred:", err.message);
        sendResponse({ ok: false, error: err.message });
      });
    } else {
      sendResponse({ ok: false, error: "No tab context" });
    }
    return true;
  }

  if (msg && msg.action === "proxyFetch") {
    (async () => {
      try {
        console.log("[Background] proxyFetch ->", msg.url);
        var opts = {
          method: msg.method || "POST",
          headers: msg.headers || {},
        };
        if (msg.body) opts.body = msg.body;
        var resp = await fetch(msg.url, opts);
        var text = await resp.text();
        var data;
        try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
        sendResponse({ ok: resp.ok, status: resp.status, data: data });
      } catch(err) {
        console.error("[Background] proxyFetch error:", err);
        sendResponse({ ok: false, status: 0, data: { error: err.message || "Fetch failed in background" } });
      }
    })();
    return true;
  }

  // --- LOVABLE_V2_UPLOAD: deprecated ---
  // V2 uploads are handled inside one proxy-command request now.
  if (msg && msg.action === "lovableV2Upload") {
    sendResponse({ ok: false, error: "Legacy V2 upload flow removed. Reinstall extension v6.0.13." });
    return false;
  }

  // --- READ_COOKIES: read HttpOnly cookies for JWT token ---
  if (msg && msg.action === "readCookies") {
    var cookieNames = [
      "lovable-session-id.id",
      "lovable-session-id.custom",
      "lovable-session-id.refresh",
      "lovable-session-id.sig"
    ];
    var foundTokens = [];
    var checkedCount = 0;
    cookieNames.forEach(function(name) {
      chrome.cookies.get({ url: "https://lovable.dev", name: name }, function(cookie) {
        checkedCount++;
        if (cookie && cookie.value) {
          var parts = cookie.value.split(".");
          if (parts.length === 3 && cookie.value.indexOf("eyJ") === 0) {
            foundTokens.push({
              token: cookie.value,
              cookieName: name,
              httpOnly: cookie.httpOnly
            });
          }
        }
        if (checkedCount === cookieNames.length) {
          sendResponse({ success: foundTokens.length > 0, tokens: foundTokens });
        }
      });
    });
    return true;
  }

  // --- GET_LOVABLE_COOKIES: returns all lovable.dev cookies as Cookie header string ---
  if (msg && msg.action === "getLovableCookies") {
    chrome.cookies.getAll({ domain: "lovable.dev" }, function(cookies) {
      var parts = [];
      if (cookies && cookies.length) {
        for (var i = 0; i < cookies.length; i++) {
          var c = cookies[i];
          if (c && c.name && typeof c.value === "string") {
            parts.push(c.name + "=" + c.value);
          }
        }
      }
      sendResponse({ ok: true, cookie: parts.join("; ") });
    });
    return true;
  }

  // --- DOWNLOAD_PROJECT: fetch project source code from Lovable API ---
  if (msg && msg.action === "downloadProject") {
    (async function() {
      try {
        var apiUrl = "https://lovable-api.com/projects/" + msg.projectId + "/source-code";
        var resp = await fetch(apiUrl, {
          method: "GET",
          headers: {
            "Authorization": "Bearer " + msg.token,
            "Accept": "application/json"
          }
        });
        if (!resp.ok) {
          sendResponse({ success: false, error: "API returned " + resp.status });
          return;
        }
        var data = await resp.json();
        sendResponse({ success: true, files: data.files || [] });
      } catch(err) {
        sendResponse({ success: false, error: err.message || "Download failed" });
      }
    })();
    return true;
  }

});

