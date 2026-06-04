// ============================================
// VibeX Academy - Lovable Extension – Business Logic (content)
// HTML templates are in content-templates.js
// ============================================

console.log("[ContentScript] VibeX Academy started");

function isChromeExtensionContextReady() {
  try {
    return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id && !!chrome.storage && !!chrome.storage.local;
  } catch(e) {
    return false;
  }
}

function safeStorageSet(updates, callback) {
  if (!isChromeExtensionContextReady()) return false;
  try {
    chrome.storage.local.set(updates, function() {
      if (chrome.runtime.lastError) {
        const msg = String(chrome.runtime.lastError.message || "");
        if (!msg.includes("Extension context invalidated")) {
          console.warn("[QL] storage.set error:", msg);
        }
        return;
      }
      if (callback) callback();
    });
    return true;
  } catch(e) {
    if (!String(e && e.message || e).includes("Extension context invalidated")) {
      console.warn("[QL] storage.set exception:", e);
    }
    return false;
  }
}

const VALIDATE_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/validate-license";
const OPTIMIZE_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/optimize-prompt";
const NOTIFICATIONS_URL = "https://ynvrijkuampxpsmshftm.supabase.co/rest/v1/notifications?select=*&order=created_at.desc&limit=20";
const PACKAGES_URL = "https://ynvrijkuampxpsmshftm.supabase.co/rest/v1/packages?select=*&is_active=eq.true&order=sort_order.asc";
const EXT_PAYMENT_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/process-extension-payment";
const PROXY_COMMAND_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/proxy-command";
const REMOVE_WATERMARK_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/remove-watermark";
const PUBLISH_PROJECT_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/publish-project";
const ENABLE_CLOUD_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/enable-cloud";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InludnJpamt1YW1weHBzbXNoZnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDc1NjYsImV4cCI6MjA4OTc4MzU2Nn0.wFo3etz2hWmb8VCtadXRdqQAyCDaP2Li4Rs5kHLTdfM";

// Build per-device session headers (UA + sec-ch-ua + cookies de lovable.dev)
function buildSessionHeaders(projectId) {
  return new Promise(function(resolve) {
    var ua = navigator.userAgent || "";
    var hints = (navigator.userAgentData && navigator.userAgentData.brands) ? navigator.userAgentData.brands : [];
    var brandsStr = "";
    for (var i = 0; i < hints.length; i++) {
      if (i > 0) brandsStr += ", ";
      brandsStr += '"' + hints[i].brand + '";v="' + hints[i].version + '"';
    }
    var platform = (navigator.userAgentData && navigator.userAgentData.platform) ? navigator.userAgentData.platform : "Windows";
    var mobile = (navigator.userAgentData && navigator.userAgentData.mobile) ? "?1" : "?0";
    var langs = navigator.languages && navigator.languages.length ? navigator.languages.slice(0, 3).join(",") : (navigator.language || "en-US");
    var headers = {
      "user-agent": ua,
      "sec-ch-ua": brandsStr,
      "sec-ch-ua-mobile": mobile,
      "sec-ch-ua-platform": '"' + platform + '"',
      "accept-language": langs,
      "accept-encoding": "gzip, deflate, br, zstd",
      "origin": "https://lovable.dev",
      "referer": "https://lovable.dev/projects/" + (projectId || ""),
      "priority": "u=1, i",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site"
    };
    try {
      chrome.runtime.sendMessage({ action: "getLovableCookies" }, function(resp) {
        if (resp && resp.cookie) headers["cookie"] = resp.cookie;
        resolve(headers);
      });
    } catch (e) {
      resolve(headers);
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function sanitizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
    return '';
  } catch(e) { return ''; }
}

function decodeJwtPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '').trim();
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch(e) {
    return null;
  }
}

function bgFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime || !chrome.runtime.id) {
      return reject(new Error("Extension context invalidated"));
    }
    try {
      chrome.runtime.sendMessage({
        action: "proxyFetch",
        url,
        method: options.method || "POST",
        headers: options.headers || {},
        body: options.body || null,
      }, (resp) => {
        if (chrome.runtime.lastError) {
          if (!String(chrome.runtime.lastError.message || "").includes("Extension context invalidated")) {
            console.error("[bgFetch] runtime error:", chrome.runtime.lastError.message);
          }
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!resp) {
          return reject(new Error("No response from background"));
        }
        if (resp.data && typeof resp.data === "object") {
          resolve(resp.data);
        } else if (!resp.ok) {
          reject(new Error("Fetch failed via background (status " + resp.status + ")"));
        } else {
          resolve(resp.data);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

(function injectHook(){
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("pageHook.js");
    s.onload = () => s.remove();
    (document.documentElement || document.head || document.body).appendChild(s);
  } catch (e) {
    console.warn("[ContentScript] failed to inject pageHook", e);
  }
})();

let qlSessionId = null;
let qlHeartbeatInterval = null;
let qlUserName = null;
let qlExpiresAt = null;
let qlActivatedAt = null;
let qlLicenseStatus = null;
let qlOnlineCount = 0;
let qlMinimized = false;
let qlHeight = 520;
let qlSpeechRecognition = null;
let qlIsRecording = false;
let qlDeviceId = null;
let qlShieldActive = false;
let qlActiveTab = 'prompt';
let qlChatHistory = [];
const QL_HISTORY_KEY = 'ql_chat_history';
const QL_MAX_HISTORY = 200;

function getDeviceId(){
  return getHardwareFingerprint();
}

function createUI(){
  if(document.getElementById("ql-floating")) return;
  chrome.storage.local.get(["ql_sidebar_mode", "ql_native_chat"], (res) => {
    if(res.ql_sidebar_mode === true) {
      console.log("[ContentScript] Sidebar mode active, skipping floating UI");
      return;
    }
    if(res.ql_native_chat === true) {
      console.log("[ContentScript] Native chat mode active, skipping floating UI");
      return;
    }
    _buildFloatingUI();
  });
}

function _buildFloatingUI(){
  if(document.getElementById("ql-floating")) return;

  const box = document.createElement("div");
  box.id = "ql-floating";
  const initialLeft = Math.max(10, window.innerWidth - 400);
  box.style.left = initialLeft + "px";
  box.style.top = "80px";

  chrome.storage.local.get(["ql_license_valid","ql_license_key","ql_minimized","ql_height","ql_dark_mode","ql_light_mode","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status","ql_session_id"], async (res) => {
    qlMinimized = res.ql_minimized || false;
    qlHeight = res.ql_height || 520;
    qlDeviceId = await getDeviceId();

    if(res.ql_dark_mode === false) {
      box.classList.add("ql-light");
    }
    if(res.ql_light_mode === true) {
      box.classList.add("ql-lite-mode");
    }
    if(qlMinimized) {
      box.classList.add("ql-minimized");
    }

    document.body.appendChild(box);

    if(res.ql_license_valid){
      qlUserName = res.ql_user_name || null;
      qlExpiresAt = res.ql_expires_at || null;
      qlActivatedAt = res.ql_activated_at || null;
      qlLicenseStatus = res.ql_license_status || null;
      qlSessionId = res.ql_session_id || null;
      showMainUI(box);

      if(res.ql_license_key) {
        fetch(VALIDATE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ license_key: res.ql_license_key, session_id: res.ql_session_id, heartbeat: true, device_id: qlDeviceId })
        }).then(r => r.json()).then(data => {
          if(data.valid) {
            qlUserName = data.user_name || qlUserName;
            qlExpiresAt = data.expires_at || qlExpiresAt;
            qlActivatedAt = data.activated_at || qlActivatedAt;
            qlLicenseStatus = data.status || qlLicenseStatus;
            qlSessionId = data.session_id || qlSessionId;
            chrome.storage.local.set({ ql_user_name: qlUserName, ql_expires_at: qlExpiresAt, ql_activated_at: qlActivatedAt, ql_license_status: qlLicenseStatus, ql_session_id: qlSessionId, ql_method_version: data.method_version || "v1" });
            const nameEl = document.querySelector(".ql-profile-name");
            if(nameEl) nameEl.textContent = qlUserName || "User";
            updateTrialCountdown();
          } else if(data.reason === "device_conflict") {
            chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"]);
            const b = document.getElementById("ql-floating");
            if(b) showLicenseGate(b);
            setTimeout(() => showCustomAlert("Access Denied", data.message), 500);
          } else {
            chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"]);
            const b = document.getElementById("ql-floating");
            if(b) showLicenseGate(b);
          }
        }).catch(() => {});
      }
    } else {
      showLicenseGate(box);
    }

    setupDrag();
    setupResize();
  });
}

function showLicenseGate(box){
  box.innerHTML = templateLicenseGate(qlMinimized);

  setTimeout(() => {
    const btn = document.getElementById("ql-validate-btn");
    if(btn) btn.addEventListener("click", validateLicense);
    const buyBtn = document.getElementById("ql-buy-license-btn");
    if(buyBtn) buyBtn.addEventListener("click", () => window.open(QL_STORE_URL, "_blank", "noopener,noreferrer"));
    setupMinimize();
  }, 50);
}

async function validateLicense(){
  const input = document.getElementById("ql-license-input");
  const log = document.getElementById("ql-license-log");
  const key = input ? input.value.trim() : "";

  if(!key){
    if(log){ log.className = "ql-log-error"; log.innerText = "⚠ Enter a key"; }
    return;
  }

  if(log){ log.className = "ql-log-info"; log.innerText = "⏳ Validating..."; }

  try{
    if(!qlDeviceId) qlDeviceId = await getDeviceId();

    const data = await bgFetch(VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: key, device_id: qlDeviceId })
    });

    if(data.valid){
      qlSessionId = data.session_id;
      qlUserName = data.user_name;
      qlExpiresAt = data.expires_at;
      qlActivatedAt = data.activated_at;
      qlLicenseStatus = data.status;
      qlOnlineCount = data.online_count || 0;

      chrome.storage.local.set({ ql_license_valid: true, ql_license_key: key, ql_session_id: data.session_id, ql_user_name: data.user_name || null, ql_expires_at: data.expires_at || null, ql_activated_at: data.activated_at || null, ql_license_status: data.status || null, ql_method_version: data.method_version || "v1" }, () => {
        if(log){ log.className = "ql-log-success"; log.innerText = "✓ " + data.message; }
        try { if(typeof QLSounds!=="undefined") QLSounds.activation(); } catch(e){}
        setTimeout(() => {
          const box = document.getElementById("ql-floating");
          if(box) showMainUI(box);
          startHeartbeat(key);
        }, 800);
      });
    } else {
      if(log){ log.className = "ql-log-error"; log.innerText = "✗ " + data.message; }
    }
  }catch(err){
    if(log){ log.className = "ql-log-error"; log.innerText = "✗ Connection error"; }
  }
}

function showMainUI(box){
  const greeting = qlUserName || "User";
  const statusBadge = qlLicenseStatus === "trial" ? '<span class="ql-status-badge ql-badge-test">TEST</span>' : '<span class="ql-status-badge ql-badge-pro">PRO</span>';

  box.innerHTML = templateMainUI(greeting, statusBadge, qlMinimized);
  box.style.height = qlHeight + "px";

  setTimeout(() => {
    updateSyncStatus();
    setupSend();
    setupStorageWatch();
    setupMinimize();
    setupSuggestionChips();
    setupWatermarkButton();
    updateTrialCountdown();
    setupDrag();
    setupResize();
    setupDarkMode();
    setupLiteMode();
    setupOptimize();
    setupSpeech();
    setupNotifications();
    setupModoPlano();
    setupFileAttachment();
    setupShield();
    setupTabs();
    setupModelSelector();
    loadChatHistory();
    setupNativeChatButton();
    setupClipboardPaste();
    setupDownloadProject();
    setupCreateProject();
    setupPublishProject();
    setupEnableCloud();
    checkForUpdatePopup();
    checkResellerRolePopup();

    chrome.storage.local.get(["ql_license_key", "ql_session_id"], (res) => {
      if(res.ql_license_key) {
        qlSessionId = res.ql_session_id || qlSessionId;
        startHeartbeat(res.ql_license_key);
      }
    });

    const sidePanelBtn = document.getElementById("ql-sidepanel-btn");
    if(sidePanelBtn){
      sidePanelBtn.addEventListener("click", () => {
        const floatingBox = document.getElementById("ql-floating");
        if(floatingBox) {
          floatingBox.style.transition = "opacity 0.3s ease, transform 0.3s ease";
          floatingBox.style.opacity = "0";
          floatingBox.style.transform = "translateX(20px) scale(0.95)";
        }

        chrome.runtime.sendMessage({ action: "activateSidebar" }, (resp) => {
          if(chrome.runtime.lastError) {
            if(floatingBox) {
              floatingBox.style.opacity = "1";
              floatingBox.style.transform = "none";
            }
            showCustomAlert("Error", chrome.runtime.lastError.message || "Could not open the side panel.");
            return;
          }
          if(resp && resp.ok && !resp.deferred){
            setTimeout(() => {
              if(floatingBox) floatingBox.remove();
              if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);
              if(window.qlCountdownInterval) clearInterval(window.qlCountdownInterval);
            }, 350);
          } else if(resp && resp.deferred){
            if(floatingBox) {
              floatingBox.style.opacity = "1";
              floatingBox.style.transform = "none";
            }
            showCustomAlert("Almost there!", resp.message || "Click the extension icon in the top-right corner to open the side panel.");
          } else {
            if(floatingBox) {
              floatingBox.style.opacity = "1";
              floatingBox.style.transform = "none";
            }
            showCustomAlert("Error", "Could not open the side panel. Make sure your browser supports this feature.");
          }
        });
      });
    }

    const logoutBtn = document.getElementById("ql-logout-btn");
    if(logoutBtn){
      logoutBtn.addEventListener("click", () => {
        if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);
        chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => {
          qlUserName = null; qlExpiresAt = null; qlActivatedAt = null; qlLicenseStatus = null; qlSessionId = null;
          showLicenseGate(box);
        });
      });
    }
  }, 30);
}

function showCustomAlert(title, message){
  try {
    if (typeof QLSounds !== "undefined" && QLSounds.errorFromMessage) {
      var __ttl = (title || "") + " " + (message || "");
      if (/erro|falha|negad|inv[áa]lid|expir|limite|payment|rate|token|cr[eé]dito|sess/i.test(__ttl)) {
        QLSounds.errorFromMessage(__ttl);
      }
    }
  } catch(__e){}
  const toastType = /erro|falha|negad|inv[áa]lid|expir|limite|payment|rate|token|cr[eé]dito|sess/i.test((title || "") + " " + (message || "")) ? "error" : "success";
  if(showToast(title, message, toastType)) return;
  const alert = document.getElementById("ql-custom-alert");
  if(!alert) return;
  const titleEl = alert.querySelector(".ql-alert-title");
  const msgEl = alert.querySelector(".ql-alert-message");
  const okBtn = alert.querySelector(".ql-alert-ok-btn");
  if(titleEl) titleEl.textContent = title;
  if(msgEl) msgEl.textContent = message;
  alert.style.display = "flex";
  if(okBtn) {
    okBtn.onclick = () => { alert.style.display = "none"; };
  }
  setTimeout(() => { alert.style.display = "none"; }, 4000);
}

function ensureToastHost(rootId, className){
  const root = document.getElementById(rootId);
  if(!root) return null;
  let host = root.querySelector("." + className);
  if(!host){
    host = document.createElement("div");
    host.className = className;
    root.appendChild(host);
  }
  return host;
}

function showToast(title, message, type){
  const host = ensureToastHost("ql-floating", "ql-toast-stack");
  if(!host) return false;
  const toast = document.createElement("div");
  const kind = type === "error" ? "error" : (type === "info" ? "info" : "success");
  toast.className = "ql-toast ql-toast-" + kind;
  const icon = kind === "error" ? "!" : (kind === "info" ? "i" : "✓");
  toast.innerHTML =
    '<div class="ql-toast-icon">' + icon + '</div>' +
    '<div class="ql-toast-copy">' +
      '<div class="ql-toast-title"></div>' +
      '<div class="ql-toast-message"></div>' +
    '</div>' +
    '<button class="ql-toast-close" type="button" title="Close">×</button>';
  toast.querySelector(".ql-toast-title").textContent = title || "Notice";
  toast.querySelector(".ql-toast-message").textContent = message || "";
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("ql-toast-visible"));
  const close = () => {
    toast.classList.remove("ql-toast-visible");
    setTimeout(() => toast.remove(), 180);
  };
  toast.querySelector(".ql-toast-close").addEventListener("click", close);
  setTimeout(close, kind === "error" ? 5200 : 3600);
  return true;
}

function setupOptimize(){
  const btn = document.getElementById("ql-optimize-btn");
  if(!btn) return;
  btn.addEventListener("click", async () => {
    const textarea = document.getElementById("ql-msg");
    if(!textarea || !textarea.value.trim()) {
      showCustomAlert("Attention", "Type a prompt before optimizing.");
      return;
    }
    const original = textarea.value.trim();
    btn.classList.add("ql-tool-loading");
    btn.disabled = true;

    const storageData = await new Promise(r => chrome.storage.local.get(["ql_license_key"], r));
    const licenseKey = storageData.ql_license_key || "";

    try {
      const data = await bgFetch(OPTIMIZE_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "apikey": SUPABASE_ANON_KEY,
          "x-license-key": licenseKey
        },
        body: JSON.stringify({ prompt: original })
      });
      if(data.optimized_prompt) {
        textarea.value = data.optimized_prompt;
        showCustomAlert("Prompt Optimized! ✨", "Your prompt was improved with AI and is ready to send.");
      } else if(data.error) {
        showCustomAlert("Error", data.error);
      }
    } catch(err) {
      console.error("[Optimize] erro:", err);
      showCustomAlert("Error", "Failed to connect to the optimizer: " + (err.message || ""));
    } finally {
      btn.classList.remove("ql-tool-loading");
      btn.disabled = false;
    }
  });
}

function setupSpeech(){
  const btn = document.getElementById("ql-speech-btn");
  if(!btn) return;
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition) {
    btn.title = "Speech is not supported in this browser";
    btn.style.opacity = "0.4";
    btn.style.cursor = "not-allowed";
    return;
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if(qlIsRecording && qlSpeechRecognition) {
      qlSpeechRecognition.stop();
      return;
    }

    try {
      qlSpeechRecognition = new SpeechRecognition();
      qlSpeechRecognition.lang = "en-US";
      qlSpeechRecognition.continuous = true;
      qlSpeechRecognition.interimResults = true;
      qlSpeechRecognition.maxAlternatives = 1;

      let finalTranscript = "";
      const textarea = document.getElementById("ql-msg");

      qlSpeechRecognition.onstart = () => {
        qlIsRecording = true;
        btn.classList.add("ql-recording");
        finalTranscript = textarea ? textarea.value : "";
        console.log("[QL Speech] Recording started");
      };

      qlSpeechRecognition.onresult = (event) => {
        let interim = "";
        for(let i = event.resultIndex; i < event.results.length; i++){
          const transcript = event.results[i][0].transcript;
          if(event.results[i].isFinal){
            finalTranscript += transcript + " ";
          } else {
            interim += transcript;
          }
        }
        if(textarea) textarea.value = finalTranscript + interim;
      };

      qlSpeechRecognition.onerror = (event) => {
        console.warn("[QL Speech] Error:", event.error);
        qlIsRecording = false;
        btn.classList.remove("ql-recording");
        
        if(event.error === "not-allowed") {
          showCustomAlert("Permission Denied", "Allow microphone access in your browser settings.");
        } else if(event.error === "no-speech") {
          showCustomAlert("No Audio", "No speech detected. Try again.");
        } else if(event.error !== "aborted") {
          showCustomAlert("Voice Error", "Error: " + event.error);
        }
      };

      qlSpeechRecognition.onend = () => {
        qlIsRecording = false;
        btn.classList.remove("ql-recording");
        if(textarea) textarea.value = finalTranscript.trim();
        console.log("[QL Speech] Recording finished");
      };

      qlSpeechRecognition.start();
    } catch(err) {
      console.error("[QL Speech] Failed to start:", err);
      qlIsRecording = false;
      btn.classList.remove("ql-recording");
      showCustomAlert("Error", "Could not start voice recognition.");
    }
  });
}

function setupNotifications(){
  const bellBtn = document.querySelector(".ql-notif-btn");
  const panel = document.getElementById("ql-notif-panel");
  const closeBtn = document.getElementById("ql-notif-close");
  if(!bellBtn || !panel) return;

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "block";
    if(!isOpen) loadNotifications();
  });

  if(closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.style.display = "none";
    });
  }

  checkUnreadNotifications();
}

async function loadNotifications(){
  const list = document.getElementById("ql-notif-list");
  if(!list) return;
  list.innerHTML = '<p class="ql-notif-empty">Loading...</p>';

  try {
    const data = await bgFetch(NOTIFICATIONS_URL, {
      method: "GET",
      headers: { "apikey": SUPABASE_ANON_KEY }
    });
    
    if(!data || data.length === 0){
      list.innerHTML = '<p class="ql-notif-empty">No notifications.</p>';
      return;
    }

    const ids = data.map(n => n.id);
    chrome.storage.local.set({ ql_read_notifs: ids });
    const badge = document.querySelector(".ql-notif-badge");
    if(badge) badge.style.display = "none";

    list.innerHTML = data.map(n => {
      const date = new Date(n.created_at).toLocaleDateString("en-US");
      const safeLink = sanitizeUrl(n.link);
      const linkHtml = safeLink ? '<a href="' + escapeHtml(safeLink) + '" target="_blank" rel="noopener noreferrer" class="ql-notif-link">Open link →</a>' : '';
      return '<div class="ql-notif-item"><div class="ql-notif-item-title">' + escapeHtml(n.title) + '</div><div class="ql-notif-item-msg">' + escapeHtml(n.message) + '</div>' + linkHtml + '<div class="ql-notif-item-date">' + date + '</div></div>';
    }).join('');
  } catch(err) {
    list.innerHTML = '<p class="ql-notif-empty">Error loading.</p>';
  }
}

async function checkUnreadNotifications(){
  try {
    const data = await bgFetch(NOTIFICATIONS_URL, {
      method: "GET",
      headers: { "apikey": SUPABASE_ANON_KEY }
    });
    if(!data || data.length === 0) return;

    chrome.storage.local.get(["ql_read_notifs"], (res) => {
      const readIds = res.ql_read_notifs || [];
      const unread = data.filter(n => !readIds.includes(n.id)).length;
      const badge = document.querySelector(".ql-notif-badge");
      if(badge) {
        if(unread > 0) {
          badge.textContent = unread;
          badge.style.display = "flex";
        } else {
          badge.style.display = "none";
        }
      }
    });
  } catch(e) {}
}

function setupSuggestionChips(){
  const container = document.getElementById("ql-chips");
  if(!container) return;
  PROMPT_TEMPLATES.forEach((t) => {
    const chip = document.createElement("button");
    chip.className = "ql-chip";
    chip.innerHTML = t.icon + " " + t.label;
    chip.title = t.prompt;
    chip.addEventListener("click", () => {
      const textarea = document.getElementById("ql-msg");
      if(textarea) textarea.value = t.prompt;
    });
    container.appendChild(chip);
  });
}

function setupWatermarkButton(){
  var btn = document.getElementById("ql-remove-watermark");
  if(!btn) return;
  btn.addEventListener("click", async function(){
    var log = document.getElementById("ql-log");
    btn.disabled = true;
    btn.textContent = "\u23f3 Sending...";

    await requestLatestTokenFromHook();

    var storageData = await new Promise(function(resolve){
      chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key"], resolve);
    });
    var projectId = storageData.lovable_projectId || "";
    var token = storageData.lovable_token || "";
    var licenseKey = storageData.ql_license_key || "";

    if(!projectId || !token){
      if(log){ log.className = "ql-log-error"; log.innerText = "⚠ Project not synced."; }
      btn.disabled = false;
      btn.textContent = "\ud83d\udeab Remove Watermark";
      return;
    }

    if(token.startsWith("Bearer ")) token = token.slice(7);

    try {
      var payload = {
        license_key: licenseKey,
        token_lovable: token,
        project_id: projectId
      };

      var result = await bgFetch(REMOVE_WATERMARK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify(payload)
      });

      if(result && result.success === false){
        throw new Error(result.error_display || result.message || "Send error");
      }

      if(log){ log.className = "ql-log-success"; log.innerText = "\u2713 Watermark removed successfully!"; }
    } catch(err) {
      if(log){ log.className = "ql-log-error"; log.innerText = "\u2717 " + (err.message || err); }
    } finally {
      btn.disabled = false;
      btn.textContent = "\ud83d\udeab Remove Watermark";
    }
  });
}

function showPublishedUrlModal(url){
  var existing = document.getElementById("ql-publish-modal");
  if(existing) existing.remove();
  var overlay = document.createElement("div");
  overlay.id = "ql-publish-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);font-family:Inter,sans-serif";
  overlay.innerHTML =
    '<div style="background:#111113;border:1px solid rgba(236,72,153,0.35);border-radius:16px;padding:24px;max-width:420px;width:90%;box-shadow:0 24px 80px -12px rgba(0,0,0,0.8)">' +
      '<div style="font-size:32px;text-align:center;margin-bottom:8px">\ud83c\udf89</div>' +
      '<h3 style="margin:0 0 8px;color:#EC4899;font-size:18px;font-weight:700;text-align:center">Project Published!</h3>' +
      '<p style="margin:0 0 16px;color:#a1a1aa;font-size:13px;text-align:center">Your project is live. Access it using the link below:</p>' +
      '<div style="background:#0a0a0b;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;margin-bottom:16px;word-break:break-all"><a href="' + url + '" target="_blank" style="color:#22D3EE;text-decoration:none;font-size:13px">' + url + '</a></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button id="ql-publish-copy" style="flex:1;padding:10px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#f4f4f5;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600">\ud83d\udccb Copy</button>' +
        '<button id="ql-publish-open" style="flex:1;padding:10px;border:none;background:linear-gradient(135deg,#EC4899,#d97706);color:#fff;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700">\ud83d\udd17 Open</button>' +
      '</div>' +
      '<button id="ql-publish-close" style="width:100%;margin-top:8px;padding:8px;border:none;background:transparent;color:#71717a;cursor:pointer;font-size:12px">Close</button>' +
    '</div>';
  document.body.appendChild(overlay);
  document.getElementById("ql-publish-copy").addEventListener("click", function(){
    navigator.clipboard.writeText(url);
    this.textContent = "\u2713 Copied!";
  });
  document.getElementById("ql-publish-open").addEventListener("click", function(){ window.open(url, "_blank"); });
  document.getElementById("ql-publish-close").addEventListener("click", function(){ overlay.remove(); });
  overlay.addEventListener("click", function(e){ if(e.target === overlay) overlay.remove(); });
}

function setupPublishProject(){
  var btn = document.getElementById("ql-publish-project");
  if(!btn) return;
  btn.addEventListener("click", async function(){
    var log = document.getElementById("ql-log");
    btn.disabled = true;
    btn.textContent = "\u23f3 Publicando...";

    await requestLatestTokenFromHook();

    var storageData = await new Promise(function(resolve){
      chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key"], resolve);
    });
    var projectId = storageData.lovable_projectId || "";
    var token = storageData.lovable_token || "";
    var licenseKey = storageData.ql_license_key || "";

    if(!projectId || !token){
      if(log){ log.className = "ql-log-error"; log.innerText = "⚠ Project not synced."; }
      btn.disabled = false;
      btn.textContent = "\ud83c\udf10 Publish Project";
      return;
    }

    if(token.startsWith("Bearer ")) token = token.slice(7);

    try {
      var result = await bgFetch(PUBLISH_PROJECT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({ license_key: licenseKey, token_lovable: token, project_id: projectId })
      });

      if(result && result.success === false){
        throw new Error(result.error_display || result.message || "Publish error");
      }

      if(log){ log.className = "ql-log-success"; log.innerText = "✓ Project published!"; }
      if(result && result.url) showPublishedUrlModal(result.url);
    } catch(err) {
      if(log){ log.className = "ql-log-error"; log.innerText = "\u2717 " + (err.message || err); }
    } finally {
      btn.disabled = false;
      btn.textContent = "\ud83c\udf10 Publish Project";
    }
  });
}

function setupEnableCloud(){
  var btn = document.getElementById("ql-enable-cloud");
  if(!btn) return;
  btn.addEventListener("click", async function(){
    var log = document.getElementById("ql-log");
    btn.disabled = true;
    btn.textContent = "⏳ Enabling Cloud...";

    await requestLatestTokenFromHook();

    var storageData = await new Promise(function(resolve){
      chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key"], resolve);
    });
    var projectId = storageData.lovable_projectId || "";
    var token = storageData.lovable_token || "";
    var licenseKey = storageData.ql_license_key || "";

    if(!projectId || !token){
      if(log){ log.className = "ql-log-error"; log.innerText = "⚠ Project not synced."; }
      btn.disabled = false;
      btn.textContent = "\u2601\ufe0f Enable Lovable Cloud";
      return;
    }

    if(token.startsWith("Bearer ")) token = token.slice(7);

    try {
      var result = await bgFetch(ENABLE_CLOUD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({ license_key: licenseKey, token_lovable: token, project_id: projectId, region: "america" })
      });

      if(result && result.success === false){
        throw new Error(result.error_display || result.message || "Cloud activation error");
      }

      if(log){ log.className = "ql-log-success"; log.innerText = "\u2713 " + (result && result.message ? result.message : "Lovable Cloud enabled!"); }
    } catch(err) {
      if(log){ log.className = "ql-log-error"; log.innerText = "\u2717 " + (err.message || err); }
    } finally {
      btn.disabled = false;
      btn.textContent = "\u2601\ufe0f Enable Lovable Cloud";
    }
  });
}

function updateTrialCountdown(){
  if(!qlExpiresAt) return;
  const el = document.getElementById("ql-trial-countdown");
  if(!el) return;
  el.style.display = "block";

  const createdAt = Date.now();
  const expiresMs = new Date(qlExpiresAt).getTime();
  const totalDuration = Math.max(expiresMs - createdAt, 3600000);

  function update(){
    const remaining = expiresMs - Date.now();
    if(remaining <= 0){
      el.innerHTML = '<span class="ql-countdown-expired">⏰ License expired</span><div class="ql-trial-bar"><div class="ql-trial-bar-fill ql-bar-expired" style="width:0%"></div></div>';
      handleLicenseExpired();
      return;
    }
    const days = Math.floor(remaining / 86400000);
    const hrs = Math.floor((remaining % 86400000) / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const pct = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));

    let timeStr = '';
    if(days > 0) timeStr = days + 'd ' + hrs + 'h ' + mins + 'm';
    else if(hrs > 0) timeStr = hrs + 'h ' + mins + 'm ' + String(secs).padStart(2,'0') + 's';
    else timeStr = mins + ':' + String(secs).padStart(2,'0');

    const urgentClass = pct < 20 ? ' ql-bar-urgent' : '';
    const label = qlLicenseStatus === 'trial' ? 'Trial expires in' : 'Plan expires in';

    el.innerHTML = '<div class="ql-countdown-row"><span class="ql-countdown-icon">⏳</span><span class="ql-countdown-label">' + label + '</span><span class="ql-countdown-time">' + timeStr + '</span></div><div class="ql-trial-bar"><div class="ql-trial-bar-fill' + urgentClass + '" style="width:' + pct + '%"></div></div>';
  }
  update();
  if(window.qlCountdownInterval) clearInterval(window.qlCountdownInterval);
  window.qlCountdownInterval = setInterval(update, 1000);
}

function updateMinimizedLogo(box){
  if(!box) box = document.getElementById("ql-floating");
  if(!box) return;
  const img = box.querySelector("#ql-header .ql-header-left img");
  if(!img) return;
  if(!img.dataset.qlOriginalSrc) img.dataset.qlOriginalSrc = img.src;
  img.src = box.classList.contains("ql-minimized")
    ? chrome.runtime.getURL("images/logo_lc_tight.png")
    : img.dataset.qlOriginalSrc;
}

function minimizeFloatingPopup(box, persist = true){
  if(!box) box = document.getElementById("ql-floating");
  if(!box) return;
  qlMinimized = true;
  box.style.display = "";
  box.style.opacity = "";
  box.style.transform = "";
  box.style.animation = "none";
  void box.offsetWidth;
  box.style.animation = "";
  box.classList.add("ql-minimized");
  updateMinimizedLogo(box);
  const minimizeBtn = document.getElementById("ql-minimize");
  if(minimizeBtn) minimizeBtn.textContent = "\u25a1";
  if(persist) chrome.storage.local.set({ ql_minimized: true });
}

function restoreFloatingPopup(box, persist = true){
  if(!box) box = document.getElementById("ql-floating");
  if(!box) return;
  qlMinimized = false;
  box.classList.remove("ql-minimized");
  box.style.display = "";
  box.style.opacity = "";
  box.style.transform = "";
  updateMinimizedLogo(box);
  const minimizeBtn = document.getElementById("ql-minimize");
  if(minimizeBtn) minimizeBtn.textContent = "\u2212";
  if(persist) chrome.storage.local.set({ ql_minimized: false });
}

function setupMinimize(){
  const btn = document.getElementById("ql-minimize");
  if(!btn) return;
  updateMinimizedLogo();
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const box = document.getElementById("ql-floating");
    if(!box) return;
    qlMinimized = !qlMinimized;
    if(qlMinimized){
      box.style.animation = "none";
      void box.offsetWidth;
      box.style.animation = "";
      box.classList.add("ql-minimized");
      updateMinimizedLogo(box);
      btn.textContent = "\u25a1";
      chrome.storage.local.set({ ql_minimized: true });
    } else {
      restoreFloatingPopup(box);
    }
  });
}

function setupDarkMode(){
  const moonBtn = document.querySelector('.ql-icon-btn[title="Theme"]');
  if(!moonBtn) return;
  moonBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const box = document.getElementById("ql-floating");
    if(!box) return;
    const isLight = box.classList.toggle("ql-light");
    chrome.storage.local.set({ ql_dark_mode: !isLight });
  });
}

function setupLiteMode(){
  const btn = document.getElementById("ql-lite-mode-btn");
  if(!btn) return;
  const box = document.getElementById("ql-floating");
  if(!box) return;
  chrome.storage.local.get(["ql_light_mode"], (res) => {
    const enabled = res.ql_light_mode === true;
    box.classList.toggle("ql-lite-mode", enabled);
    btn.classList.toggle("ql-lite-active", enabled);
    btn.setAttribute("aria-pressed", enabled ? "true" : "false");
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const enabled = !box.classList.contains("ql-lite-mode");
    box.classList.toggle("ql-lite-mode", enabled);
    btn.classList.toggle("ql-lite-active", enabled);
    btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    chrome.storage.local.set({ ql_light_mode: enabled });
    showToast("Lite Mode", enabled ? "Animations reduced to make everything smoother." : "Animations restored.", "info");
  });
}

function setupModoPlano(){
  const toggle = document.getElementById("ql-modo-plano");
  if(!toggle) return;

  chrome.storage.local.get(["ql_modo_plano"], (res) => {
    if(res.ql_modo_plano === true) toggle.checked = true;
  });

  toggle.addEventListener("change", () => {
    chrome.storage.local.set({ ql_modo_plano: toggle.checked });

    if(toggle.checked){
      showModoPlanoAlert();
    }
  });
}

function showModoPlanoAlert(){
  const existing = document.querySelector('.ql-modo-plano-overlay');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'ql-modo-plano-overlay';
  overlay.innerHTML = '<div class="ql-modo-plano-modal">' +
    '<div class="ql-modo-plano-icon">\u26a0\ufe0f</div>' +
    '<div class="ql-modo-plano-title">Attention \u2014 Plan Mode</div>' +
    '<div class="ql-modo-plano-body">' +
      '<strong>Plan/Thinking Mode</strong> may consume credits, but it can be helpful. Use it in moderation!' +
    '</div>' +
    '<div class="ql-modo-plano-steps">' +
      '<div class="ql-modo-plano-step"><span class="ql-modo-plano-step-num">1</span><span class="ql-modo-plano-step-text">Enable <strong>Plan Mode</strong> to generate a plan.</span></div>' +
      '<div class="ql-modo-plano-step"><span class="ql-modo-plano-step-num">2</span><span class="ql-modo-plano-step-text">In Lovable, <strong>do not click the Approve button</strong>; just copy the new plan.</span></div>' +
      '<div class="ql-modo-plano-step"><span class="ql-modo-plano-step-num">3</span><span class="ql-modo-plano-step-text">Paste the copied plan into the extension prompt.</span></div>' +
      '<div class="ql-modo-plano-step"><span class="ql-modo-plano-step-num">4</span><span class="ql-modo-plano-step-text"><strong>Turn off Plan Mode</strong> and send through the extension so no extra credits are consumed.</span></div>' +
    '</div>' +
    '<div class="ql-modo-plano-check">' +
      '<input type="checkbox" id="ql-modo-plano-dismiss" />' +
      '<label for="ql-modo-plano-dismiss">Do not show again</label>' +
    '</div>' +
    '<button class="ql-modo-plano-btn" id="ql-modo-plano-ok">Got it!</button>' +
  '</div>';

  const box = document.getElementById('ql-floating');
  if(box) box.appendChild(overlay);
  else document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('ql-modo-plano-visible'));

  const close = () => {
    overlay.classList.remove('ql-modo-plano-visible');
    setTimeout(() => overlay.remove(), 180);
  };

  const okBtn = overlay.querySelector('#ql-modo-plano-ok');
  if(okBtn){
    okBtn.addEventListener('click', () => {
      const dismiss = overlay.querySelector('#ql-modo-plano-dismiss');
      if(dismiss && dismiss.checked){
        chrome.storage.local.set({ ql_modo_plano_alert_dismissed: true });
      }
      close();
    });
  }

  overlay.addEventListener('click', (e) => {
    if(e.target === overlay) close();
  });
}

function setupShield(){
  const btn = document.getElementById("ql-shield-btn");
  if(!btn) return;

  chrome.storage.local.get(["ql_shield_active"], (res) => {
    if(res.ql_shield_active === true) {
      qlShieldActive = true;
      btn.classList.add("ql-shield-active");
      const label = document.getElementById("ql-shield-label");
      if(label) label.textContent = "Disable Shield";
      injectShieldOverlay();
    }
  });

  btn.addEventListener("click", () => {
    qlShieldActive = !qlShieldActive;
    chrome.storage.local.set({ ql_shield_active: qlShieldActive });

    const label = document.getElementById("ql-shield-label");
    if(qlShieldActive) {
      btn.classList.add("ql-shield-active");
      if(label) label.textContent = "Disable Shield";
      injectShieldOverlay();
      showCustomAlert("Shield Enabled 🛡️", "The Lovable input is blocked. Use the extension to send prompts.");
    } else {
      btn.classList.remove("ql-shield-active");
      if(label) label.textContent = "Enable Shield";
      removeShieldOverlay();
      showCustomAlert("Shield Disabled", "The Lovable input is available again.");
    }
  });
}

function injectShieldOverlay(){
  if(document.getElementById("ql-shield-overlay")) return;

  const chatForm = document.querySelector('form#chat-input');
  if(!chatForm) {
    setTimeout(injectShieldOverlay, 1000);
    return;
  }

  const existingPos = getComputedStyle(chatForm).position;
  if(existingPos === 'static') {
    chatForm.style.position = 'relative';
  }

  const overlay = document.createElement('div');
  overlay.id = 'ql-shield-overlay';
  overlay.className = 'ql-shield-overlay';
  overlay.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
    '</svg>' +
    '<span class="ql-shield-overlay-text">\ud83d\udee1\ufe0f Protected by VibeX Academy</span>' +
    '<span class="ql-shield-overlay-sub">Use the extension to send prompts</span>';

  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);

  overlay.addEventListener('keydown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  chatForm.appendChild(overlay);

  const inputs = chatForm.querySelectorAll('input, button, textarea, [contenteditable]');
  inputs.forEach(el => {
    if(el.id !== 'ql-shield-overlay') {
      el.dataset.qlShieldDisabled = el.disabled || '';
      el.dataset.qlShieldTabindex = el.getAttribute('tabindex') || '';
      el.setAttribute('tabindex', '-1');
      if(el.tagName !== 'DIV') el.disabled = true;
      if(el.contentEditable === 'true') {
        el.contentEditable = 'false';
        el.dataset.qlShieldEditable = 'true';
      }
    }
  });
}

function removeShieldOverlay(){
  const overlay = document.getElementById('ql-shield-overlay');
  if(overlay) overlay.remove();

  const chatForm = document.querySelector('form#chat-input');
  if(!chatForm) return;

  const inputs = chatForm.querySelectorAll('[data-ql-shield-disabled]');
  inputs.forEach(el => {
    const wasDis = el.dataset.qlShieldDisabled;
    if(wasDis === 'true') el.disabled = true;
    else if(wasDis === '' || wasDis === 'false') el.disabled = false;
    delete el.dataset.qlShieldDisabled;

    const oldTab = el.dataset.qlShieldTabindex;
    if(oldTab) el.setAttribute('tabindex', oldTab);
    else el.removeAttribute('tabindex');
    delete el.dataset.qlShieldTabindex;

    if(el.dataset.qlShieldEditable === 'true') {
      el.contentEditable = 'true';
      delete el.dataset.qlShieldEditable;
    }
  });
}


function startHeartbeat(licenseKey){
  if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);

  qlHeartbeatInterval = setInterval(async () => {
    try {
      const data = await bgFetch(VALIDATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: licenseKey, session_id: qlSessionId, heartbeat: true, device_id: qlDeviceId })
      });

      if(!data.valid){
        clearInterval(qlHeartbeatInterval);
        const msg = data.reason === "device_conflict" ? data.message : null;
        chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => {
          const box = document.getElementById("ql-floating");
          if(box) showLicenseGate(box);
          if(msg) setTimeout(() => showCustomAlert("Access Denied", msg), 500);
        });
        return;
      }

      qlOnlineCount = data.online_count || 0;
      const countEl = document.getElementById("ql-online-count");
      if(countEl) countEl.textContent = qlOnlineCount;

      if(data.user_name) {
        qlUserName = data.user_name;
        qlLicenseStatus = data.status || qlLicenseStatus;
        qlExpiresAt = data.expires_at || qlExpiresAt;
        qlActivatedAt = data.activated_at || qlActivatedAt;
        chrome.storage.local.set({ ql_user_name: qlUserName, ql_license_status: qlLicenseStatus, ql_expires_at: qlExpiresAt, ql_activated_at: qlActivatedAt });
        const nameEl = document.querySelector(".ql-profile-name");
        if(nameEl) nameEl.textContent = data.user_name;
      }
      if (data.method_version) {
        chrome.storage.local.set({ ql_method_version: data.method_version });
      }

    } catch(err) {
      console.warn("[QL] Heartbeat error", err);
    }
  }, 60000);
}

let qlExpiredHandled = false;

function handleLicenseExpired(){
  if(qlExpiredHandled) return;
  qlExpiredHandled = true;
  if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);
  if(window.qlCountdownInterval) clearInterval(window.qlCountdownInterval);

  const overlay = document.createElement("div");
  overlay.className = "ql-sweetalert-overlay";
  overlay.innerHTML = templateExpiredOverlay();

  const box = document.getElementById("ql-floating");
  if(box) box.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("ql-sweetalert-visible"));

  const renewBtn = overlay.querySelector("#ql-sweetalert-renew");
  if(renewBtn){
    renewBtn.addEventListener("click", () => {
      overlay.remove();
      if(box) showPaymentUI(box);
    });
  }

  const closeBtn = overlay.querySelector("#ql-sweetalert-close");
  if(closeBtn){
    closeBtn.addEventListener("click", () => {
      overlay.classList.remove("ql-sweetalert-visible");
      setTimeout(() => {
        overlay.remove();
        chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_license_status"], () => {
          if(box) showLicenseGate(box);
        });
      }, 300);
    });
  }
}

async function showPaymentUI(box, preselectedPkg){
  if(preselectedPkg){
    showCheckoutScreen(box, preselectedPkg);
    return;
  }

  box.innerHTML = templatePaymentUI(qlMinimized);

  setupMinimize();
  setupDrag();
  setupResize();

  // BRL plans -> Discord redirect
  document.querySelectorAll(".ql-brl-buy").forEach(function(btn){
    btn.addEventListener("click", function(){
      var card = btn.closest(".ql-pkg-brl");
      if(!card) return;
      var idx = parseInt(card.getAttribute("data-brl-idx"), 10) || 0;
      var plan = QL_BRL_PLANS[idx];
      if(!plan) return;
      var msg = "Hello! 👋 I am interested in the *" + plan.name + "* plan from VibeX Academy - Lovable Extension (R$ " + plan.price + " - " + plan.period + ").\n\nI would like more information to complete the purchase. 🚀";
      var url = "https://wa.me/8801889067101";
      window.open(url, "_blank", "noopener,noreferrer");
    });
  });

  const backBtn = document.getElementById("ql-pay-back");
  if(backBtn){
    backBtn.addEventListener("click", () => {
      chrome.storage.local.get(["ql_license_valid"], (res) => {
        if(res.ql_license_valid) showMainUI(box);
        else showLicenseGate(box);
      });
    });
  }

  try {
    const packages = await bgFetch(PACKAGES_URL, {
      method: "GET",
      headers: { "apikey": SUPABASE_ANON_KEY }
    });

    const list = document.getElementById("ql-packages-list");
    if(!list) return;
    if(!packages || !Array.isArray(packages) || packages.length === 0){
      list.innerHTML = '<div class="ql-pay-loading">No plans available.</div>';
      return;
    }

    list.innerHTML = packages.map(pkg => templatePackageCard(pkg)).join('');

    list.querySelectorAll(".ql-pkg-card").forEach(card => {
      card.querySelector(".ql-pkg-select-btn").addEventListener("click", () => {
        const pkg = {
          id: card.getAttribute("data-pkg-id"),
          name: card.getAttribute("data-pkg-name"),
          price: card.getAttribute("data-pkg-price")
        };
        showCheckoutScreen(box, pkg);
      });
    });

  } catch(err) {
    console.error("[QL] Package load error:", err);
    const list = document.getElementById("ql-packages-list");
    if(list) list.innerHTML = '<div class="ql-pay-loading">Error loading plans. Try again.</div>';
  }
}

function showCheckoutScreen(box, pkg){
  box.innerHTML = templateCheckoutScreen(pkg, qlMinimized);

  setupMinimize();
  setupDrag();
  setupResize();

  let selectedMethod = "mpesa";

  const backBtn = document.getElementById("ql-checkout-back");
  if(backBtn){
    backBtn.addEventListener("click", () => showPaymentUI(box));
  }

  document.querySelectorAll(".ql-method-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ql-method-btn").forEach(b => b.classList.remove("ql-method-active"));
      btn.classList.add("ql-method-active");
      selectedMethod = btn.getAttribute("data-method");
      const hint = document.getElementById("ql-phone-hint");
      if(hint) hint.textContent = selectedMethod === "mpesa" ? "M-Pesa: 84 or 85" : "e-Mola: 86 or 87";
    });
  });

  const confirmBtn = document.getElementById("ql-confirm-pay");
  if(confirmBtn){
    confirmBtn.addEventListener("click", async () => {
      const phone = (document.getElementById("ql-pay-phone") || {}).value ? (document.getElementById("ql-pay-phone") || {}).value.replace(/\D/g,"") : "";
      const log = document.getElementById("ql-pay-log");

      if(phone.length !== 9){
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "Number must have 9 digits."; }
        return;
      }
      const prefix = phone.substring(0,2);
      if(selectedMethod === "mpesa" && !["84","85"].includes(prefix)){
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "M-Pesa: use 84 or 85."; }
        return;
      }
      if(selectedMethod === "emola" && !["86","87"].includes(prefix)){
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "e-Mola: use 86 or 87."; }
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = "⏳ Processing...";
      if(log){ log.className = "ql-pay-log ql-pay-info"; log.textContent = "Sending payment request..."; }

      try {
        const storageData = await new Promise(r => chrome.storage.local.get(["ql_license_key"], r));
        const licenseKey = storageData.ql_license_key || "";

        const result = await bgFetch(EXT_PAYMENT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
          body: JSON.stringify({
            packageId: pkg.id,
            numero: phone,
            metodo: selectedMethod,
            license_key: licenseKey || undefined
          })
        });

        if(result && result.status === "sucesso"){
          const bodyEl = document.getElementById("ql-body");
          if(bodyEl){
            bodyEl.innerHTML = templatePaymentSuccess(result.license_key);

            const copyBtn = document.getElementById("ql-copy-key");
            if(copyBtn){
              copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(result.license_key).then(() => {
                  copyBtn.textContent = "✅ Copied!";
                  setTimeout(() => { copyBtn.textContent = "📋 Copy Key"; }, 2000);
                }).catch(() => {
                  const keyEl = document.getElementById("ql-new-key");
                  if(keyEl){ const r = document.createRange(); r.selectNodeContents(keyEl); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); }
                  copyBtn.textContent = "Selected — Ctrl+C";
                });
              });
            }

            const activateBtn = document.getElementById("ql-activate-key");
            if(activateBtn){
              activateBtn.addEventListener("click", () => {
                chrome.storage.local.set({
                  ql_license_valid: true,
                  ql_license_key: result.license_key,
                  ql_expires_at: result.expires_at || null,
                  ql_license_status: "active",
                  ql_session_id: null
                }, () => {
                  qlExpiresAt = result.expires_at || null;
                  qlLicenseStatus = "active";
                  qlExpiredHandled = false;
                  showMainUI(box);
                  startHeartbeat(result.license_key);
                });
              });
            }
          }
        } else {
          const errMsg = (result && result.error) ? result.error : "Payment failed. Please try again.";
          if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "✗ " + errMsg; }
          confirmBtn.disabled = false;
          confirmBtn.textContent = "💰 Pay " + pkg.price + " MZN";
        }
      } catch(err) {
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "✗ " + (err.message || "Connection error."); }
        confirmBtn.disabled = false;
        confirmBtn.textContent = "💰 Pay " + pkg.price + " MZN";
      }
    });
  }
}

// Robust initialization: wait for document.body AND Lovable app shell
function qlBootstrap() {
  if (document.getElementById("ql-floating")) return;
  if (!document.body) {
    // Body not ready yet, wait
    var bodyWait = new MutationObserver(function() {
      if (document.body) {
        bodyWait.disconnect();
        qlBootstrap();
      }
    });
    bodyWait.observe(document.documentElement, { childList: true });
    return;
  }
  createUI();
}

// Primary init
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(qlBootstrap, 50);
} else {
  document.addEventListener("DOMContentLoaded", function() { setTimeout(qlBootstrap, 50); });
}

// Retry with increasing delays for SPA navigation / late renders
var qlRetryCount = 0;
var qlRetryDelays = [300, 600, 1000, 1500, 2000, 3000, 4000, 5000];
function qlRetryInit() {
  if (document.getElementById("ql-floating") || qlRetryCount >= qlRetryDelays.length) return;
  var delay = qlRetryDelays[qlRetryCount];
  qlRetryCount++;
  setTimeout(function() {
    if (!document.getElementById("ql-floating") && document.body) {
      createUI();
    }
    qlRetryInit();
  }, delay);
}
qlRetryInit();

chrome.storage.onChanged.addListener((changes, area) => {
  if(area !== "local") return;
  if(changes.ql_sidebar_mode) {
    if(changes.ql_sidebar_mode.newValue === true) {
      const floatingBox = document.getElementById("ql-floating");
      if(floatingBox) {
        floatingBox.style.transition = "opacity 0.3s ease, transform 0.3s ease";
        floatingBox.style.opacity = "0";
        floatingBox.style.transform = "scale(0.95)";
        setTimeout(() => floatingBox.remove(), 350);
      }
    } else if(changes.ql_sidebar_mode.newValue === false) {
      setTimeout(() => {
        _buildFloatingUI();
        setTimeout(() => {
          const floatingBox = document.getElementById("ql-floating");
          if(floatingBox) {
            floatingBox.style.opacity = "0";
            floatingBox.style.transform = "scale(0.95) translateX(20px)";
            requestAnimationFrame(() => {
              floatingBox.style.transition = "opacity 0.4s ease, transform 0.4s ease";
              floatingBox.style.opacity = "1";
              floatingBox.style.transform = "scale(1) translateX(0)";
            });
          }
        }, 50);
      }, 100);
    }
  }
});

function updateSyncStatus(){
  chrome.storage.local.get(["lovable_projectId","lovable_token"], (res)=>{
    const status = document.getElementById("ql-sync-status");
    if(!status) return;
    if(res.lovable_projectId && res.lovable_token){
      status.className = "ql-sync-status ql-sync-ok";
      const pid = res.lovable_projectId.substring(0, 6);
      status.innerHTML = '<span class="ql-sync-text">✅ Synced! Project: ' + pid + '...</span>';
    } else {
      status.className = "ql-sync-status ql-sync-waiting";
      status.innerHTML = '<span class="ql-sync-text">⏳ Waiting for sync...</span>';
    }
  });
}

function setupStorageWatch(){
  chrome.storage.onChanged.addListener((changes)=>{
    if(changes.lovable_projectId || changes.lovable_token){
      updateSyncStatus();
    }
  });
}

function requestLatestTokenFromHook(timeoutMs = 1200){
  return new Promise((resolve)=>{
    let finished = false;

    function finish(updated){
      if(finished) return;
      finished = true;
      clearTimeout(timer);
      chrome.storage.onChanged.removeListener(onStorageChange);
      resolve(updated);
    }

    function onStorageChange(changes, area){
      if(area !== "local") return;
      if((changes.lovable_token && changes.lovable_token.newValue) || (changes.lovable_browserSessionId && changes.lovable_browserSessionId.newValue)){
        finish(true);
      }
    }

    const timer = setTimeout(()=> finish(false), Math.max(300, timeoutMs));
    chrome.storage.onChanged.addListener(onStorageChange);

    try {
      window.postMessage({ type: "lovableRequestToken" }, "*");
      setTimeout(()=> window.postMessage({ type: "lovableRequestToken" }, "*"), 120);
    } catch(e) {
      finish(false);
    }
  });
}

try {
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (!msg || (msg.action !== "requestLovableSessionFromPage" && msg.action !== "lovconnectRequestSync")) return false;
    requestLatestTokenFromHook(msg.timeoutMs || 1800).then(function(updated) {
      chrome.storage.local.get(["lovable_projectId", "lovable_token", "lovable_browserSessionId"], function(res) {
        const hasSession = !!(res.lovable_projectId && res.lovable_token);
        sendResponse({ ok: hasSession, updated: updated, projectId: res.lovable_projectId || "", token: res.lovable_token || "", browserSessionId: res.lovable_browserSessionId || "", hasToken: !!res.lovable_token });
      });
    }).catch(function(err) {
      sendResponse({ ok: false, error: err && err.message ? err.message : "Failed to sync session" });
    });
    return true;
  });
} catch(e) {}

// ===== CHAT HISTORY SYSTEM (Floating Popup) =====
function loadChatHistory(cb) {
  chrome.storage.local.get([QL_HISTORY_KEY], (res) => {
    qlChatHistory = res[QL_HISTORY_KEY] || [];
    updateHistoryBadge();
    if(cb) cb();
  });
}

function saveChatHistory() {
  if(qlChatHistory.length > QL_MAX_HISTORY) qlChatHistory = qlChatHistory.slice(-QL_MAX_HISTORY);
  chrome.storage.local.set({ [QL_HISTORY_KEY]: qlChatHistory });
}

function addToChatHistory(text, status) {
  qlChatHistory.push({ text: text, timestamp: new Date().toISOString(), status: status || 'ok' });
  saveChatHistory();
  updateHistoryBadge();
}

function updateHistoryBadge() {
  const badge = document.getElementById('ql-history-badge');
  if(!badge) return;
  if(qlChatHistory.length > 0) {
    badge.textContent = qlChatHistory.length;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function formatChatDate(dateStr) {
  var d = new Date(dateStr);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diff = (today - msgDay) / 86400000;
  if(diff === 0) return 'Hoje';
  if(diff === 1) return 'Ontem';
  if(diff < 7) return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
  return d.toLocaleDateString('en-US');
}

function formatChatTime(dateStr) {
  var d = new Date(dateStr);
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function renderHistoryView() {
  const container = document.getElementById('ql-tab-content');
  if(!container) return;

  if(!qlChatHistory.length) {
    container.innerHTML = '<div class="ql-chat-empty"><div style="font-size:28px;margin-bottom:8px">💬</div><div style="font-size:13px;font-weight:600;color:var(--ql-text-primary,#f4f4f5)">No messages</div><div style="font-size:11px;color:var(--ql-text-muted,#71717a);margin-top:4px">Your sent prompts will appear here.</div></div>';
    return;
  }

  let html = '<div class="ql-chat-messages">';
  let lastDate = '';
  for(let i = 0; i < qlChatHistory.length; i++) {
    const m = qlChatHistory[i];
    const dateLabel = formatChatDate(m.timestamp);
    if(dateLabel !== lastDate) {
      html += '<div class="ql-chat-date-divider"><span class="ql-chat-date-label">' + dateLabel + '</span></div>';
      lastDate = dateLabel;
    }
    const statusClass = m.status === 'error' ? 'ql-chat-status-err' : 'ql-chat-status-ok';
    const statusText = m.status === 'error' ? '✗ Error' : '✓ Sent';
    const truncated = m.text.length > 300 ? escapeHtml(m.text.substring(0, 300)) + '…' : escapeHtml(m.text);
    html += '<div class="ql-chat-bubble" title="' + escapeHtml(m.text) + '">' + truncated +
      '<div class="ql-chat-meta"><span class="' + statusClass + '">' + statusText + '</span><span class="ql-chat-time">' + formatChatTime(m.timestamp) + '</span></div></div>';
  }
  html += '</div>';
  html += '<div class="ql-chat-actions"><span class="ql-chat-count">' + qlChatHistory.length + ' ' + (qlChatHistory.length === 1 ? 'message' : 'messages') + '</span><button class="ql-chat-clear" id="ql-chat-clear">🗑 Clear</button></div>';
  container.innerHTML = html;

  const msgs = container.querySelector('.ql-chat-messages');
  if(msgs) msgs.scrollTop = msgs.scrollHeight;

  const clearBtn = document.getElementById('ql-chat-clear');
  if(clearBtn) {
    clearBtn.addEventListener('click', () => {
      qlChatHistory = [];
      saveChatHistory();
      updateHistoryBadge();
      renderHistoryView();
    });
  }
}

function renderPromptView() {
  const container = document.getElementById('ql-tab-content');
  if(!container) return;
  container.innerHTML =
    '<textarea id="ql-msg" rows="3" placeholder="Type your command..." spellcheck="false"></textarea>' +
    '<div id="ql-attach-preview" class="ql-attach-preview" style="display:none"></div>' +
    '<div class="ql-action-bar">' +
      '<div class="ql-action-left">' +
        '<label class="ql-toggle"><input type="checkbox" id="ql-modo-plano"><span class="ql-toggle-slider"></span></label>' +
        '<span class="ql-toggle-label-inline">Plan Mode</span>' +
      '</div>' +
      '<div class="ql-action-center">' +
        '<button id="ql-attach-btn" class="ql-attach-btn" title="Attach file (max. 10)">\ud83d\udcce</button>' +
        '<button id="ql-optimize-btn" class="ql-tool-btn" title="Optimize with AI">' + SVG_ICONS.sparkles + '</button>' +
        '<button id="ql-speech-btn" class="ql-tool-btn" title="Voice to text">' + SVG_ICONS.mic + '</button>' +
      '</div>' +
      '<div class="ql-action-right-send">' +
        '<button id="ql-send" class="ql-send-btn">Send</button>' +
      '</div>' +
    '</div>' +
    '<input type="file" id="ql-file-input" multiple style="display:none" accept="*/*">' +
    '<div id="ql-log"></div>' +
    '<div class="ql-shortcuts-section">' +
      '<span class="ql-shortcuts-title">QUICK SHORTCUTS</span>' +
      '<div class="ql-shortcuts-grid" id="ql-chips"></div>' +
    '</div>' +
    '<button id="ql-remove-watermark" class="ql-watermark-btn">\ud83d\udeab Remove Watermark</button>' +
    '<button id="ql-shield-btn" class="ql-shield-btn">' +
      SVG_ICONS.shield + ' <span id="ql-shield-label">Enable Shield</span>' +
    '</button>' +
    '<button id="ql-native-chat-btn" class="ql-native-chat-btn">' +
      SVG_ICONS.msgSquare + ' Use Native Chat' +
    '</button>' +
    '<button id="ql-download-project" class="ql-watermark-btn" style="background:linear-gradient(135deg,rgba(34,211,238,0.12),rgba(124,58,237,0.08));border-color:rgba(34,211,238,0.30);color:#22D3EE;margin-top:6px">\ud83d\udce5 Download All Files</button>' +
    '<button id="ql-create-project" class="ql-watermark-btn" style="background:linear-gradient(135deg,rgba(168,85,247,0.14),rgba(34,211,238,0.08));border-color:rgba(168,85,247,0.35);color:#A855F7;margin-top:6px">\ud83d\ude80 Create Lovable Project</button>' +
    '<button id="ql-publish-project" class="ql-watermark-btn" style="background:linear-gradient(135deg,rgba(236,72,153,0.14),rgba(124,58,237,0.08));border-color:rgba(236,72,153,0.35);color:#EC4899;margin-top:6px">\ud83c\udf10 Publish Project</button>' +
    '<button id="ql-enable-cloud" class="ql-watermark-btn" style="background:linear-gradient(135deg,rgba(56,189,248,0.14),rgba(14,165,233,0.08));border-color:rgba(56,189,248,0.35);color:#38bdf8;margin-top:6px">\u2601\ufe0f Enable Lovable Cloud</button>' +
    '<div id="ql-download-status" style="display:none"></div>';
  // Re-setup all prompt tab features
  setupSend();
  setupSuggestionChips();
  setupWatermarkButton();
  setupOptimize();
  setupSpeech();
  setupModoPlano();
  setupFileAttachment();
  setupShield();
  setupNativeChatButton();
  setupClipboardPaste();
  setupDownloadProject();
  setupCreateProject();
  setupPublishProject();
  setupEnableCloud();
}

function setupTabs() {
  const tabs = document.querySelectorAll('.ql-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      qlActiveTab = target;
      document.querySelectorAll('.ql-tab').forEach(t => t.classList.toggle('ql-tab-active', t.getAttribute('data-tab') === target));
      if(target === 'history') {
        loadChatHistory(() => renderHistoryView());
      } else {
        renderPromptView();
      }
    });
  });
}


// ===== FILE ATTACHMENT SYSTEM =====
const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
let qlAttachedFiles = [];

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function isImageType(type) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(type);
}

async function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1280;
      let w = img.width, h = img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = file.type === 'image/png' ? undefined : 0.8;
      canvas.toBlob((blob) => {
        if (!blob) return resolve({ file, previewUrl: null });
        const compressed = new File([blob], file.name, { type: outputType });
        const previewUrl = URL.createObjectURL(blob);
        resolve({ file: compressed, previewUrl });
      }, outputType, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ file, previewUrl: null }); };
    img.src = url;
  });
}

function decodeJwtUserId(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') return null;
  return payload.sub || payload.user_id || null;
}

function blobToBase64(blob) {
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onload = function(){
      var res = reader.result || "";
      var comma = String(res).indexOf(",");
      resolve(comma >= 0 ? String(res).slice(comma + 1) : String(res));
    };
    reader.onerror = function(){ reject(new Error("Failed to read file")); };
    reader.readAsDataURL(blob);
  });
}

async function uploadFileV2Lovable(file, token, projectId) {
  var contentType = (file && file.type) ? file.type : "application/octet-stream";
  // V2 agora NAO chama generate-upload-url no navegador/background.
  // O arquivo fica pendente e vai em base64 dentro de UM proxy-command.
  return {
    file_id: 'pending_v2_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now()),
    file_name: file.name || 'file',
    mime_type: contentType,
    method: 'v2',
    deferred: true
  };
}

async function uploadFileDirect(file, token, opts) {
  opts = opts || {};
  // Sempre usa o fluxo V2 via proxy-command. O upload direto para Supabase Storage
  // retornava 400 em imagens para algumas contas/projetos.
  return await uploadFileV2Lovable(file, token, opts.projectId || "");
}

function renderAttachPreview() {
  const container = document.getElementById('ql-attach-preview');
  if (!container) return;
  if (qlAttachedFiles.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = qlAttachedFiles.map((f, i) => {
    const thumbHtml = f.previewUrl
      ? '<img class="ql-attach-thumb" src="' + f.previewUrl + '" alt="">'
      : '<div class="ql-attach-icon">📄</div>';
    const uploadingClass = f.uploading ? ' ql-attach-uploading' : '';
    return '<div class="ql-attach-item' + uploadingClass + '" data-idx="' + i + '">' +
      thumbHtml +
      '<div class="ql-attach-info"><span class="ql-attach-name" title="' + escapeHtml(f.file_name) + '">' + escapeHtml(f.file_name) + '</span><span class="ql-attach-size">' + escapeHtml(f.sizeLabel) + '</span></div>' +
      '<button class="ql-attach-remove" data-idx="' + i + '">✕</button>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.ql-attach-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'));
      if (qlAttachedFiles[idx] && qlAttachedFiles[idx].previewUrl) {
        URL.revokeObjectURL(qlAttachedFiles[idx].previewUrl);
      }
      qlAttachedFiles.splice(idx, 1);
      renderAttachPreview();
    });
  });
}

function setupFileAttachment() {
  const attachBtn = document.getElementById('ql-attach-btn');
  const fileInput = document.getElementById('ql-file-input');
  if (!attachBtn || !fileInput) return;

  attachBtn.addEventListener('click', () => {
    if (qlAttachedFiles.length >= MAX_FILES) {
      showCustomAlert('Limite', 'Maximum of ' + MAX_FILES + ' files.');
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    if (!files.length) return;

    await requestLatestTokenFromHook(1500);
    const storageData = await new Promise(r => chrome.storage.local.get(['lovable_token', 'lovable_projectId', 'ql_method_version'], r));
    let token = storageData.lovable_token || '';
    if (!token) {
      showCustomAlert('Error', 'Token not captured. Browse Lovable to sync.');
      return;
    }
    if (token.startsWith('Bearer ')) token = token.slice(7);
    const methodVersion = storageData.ql_method_version || 'v1';
    const projectIdForUpload = storageData.lovable_projectId || '';

    for (const file of files) {
      if (qlAttachedFiles.length >= MAX_FILES) {
        showCustomAlert('Limite', 'Maximum of ' + MAX_FILES + ' files reached.');
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        showCustomAlert('Large file', file.name + ' excede 20MB.');
        continue;
      }

      let processedFile = file;
      let previewUrl = null;

      if (isImageType(file.type)) {
        const result = await compressImage(file);
        processedFile = result.file;
        previewUrl = result.previewUrl;
      }

      const isImage = isImageType(processedFile.type);
      const placeholderIdx = qlAttachedFiles.length;
      qlAttachedFiles.push({
        file_id: null,
        file_name: file.name,
        previewUrl: previewUrl,
        file_type: processedFile.type,
        sizeLabel: formatFileSize(processedFile.size),
        uploading: true,
        rawFile: processedFile
      });
      renderAttachPreview();

      try {
        const result = await uploadFileDirect(processedFile, token, { method: methodVersion, projectId: projectIdForUpload });
        qlAttachedFiles[placeholderIdx].file_id = result.file_id;
        if (result.public_url) qlAttachedFiles[placeholderIdx].public_url = result.public_url;
        if (result.lovable_url) qlAttachedFiles[placeholderIdx].lovable_url = result.lovable_url;
        if (result.mime_type) qlAttachedFiles[placeholderIdx].mime_type = result.mime_type;
        qlAttachedFiles[placeholderIdx].method = result.method || 'v1';
        qlAttachedFiles[placeholderIdx].uploading = false;
        renderAttachPreview();
      } catch (err) {
        console.warn('[QL Upload] Failed to send to Supabase Storage:', err.message);
        qlAttachedFiles[placeholderIdx].uploading = false;
        qlAttachedFiles[placeholderIdx].uploadFailed = true;
        renderAttachPreview();
        showCustomAlert('Upload error', 'Could not upload the image: ' + (err.message || 'unknown error'));
      }
    }
  });
}

function setupSend(){
  const btn = document.getElementById("ql-send");
  if(!btn) return;
  const textarea = document.getElementById("ql-msg");
  if(textarea && !textarea.dataset.qlEnterSendBound) {
    textarea.dataset.qlEnterSendBound = "true";
    textarea.addEventListener("keydown", (e) => {
      if(e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
      e.preventDefault();
      const sendBtn = document.getElementById("ql-send");
      if(sendBtn && !sendBtn.disabled) sendBtn.click();
    });
  }
  btn.addEventListener("click", async ()=>{
    var msgEl = document.getElementById("ql-msg");
    const mensagem = msgEl ? (msgEl.value || "").trim() : "";
    var modoPlanoEl = document.getElementById("ql-modo-plano");
      const modoPlano = modoPlanoEl ? modoPlanoEl.checked : false;
      const activeModelEl = document.getElementById("ql-active-model-name");
      const activeModel = activeModelEl ? activeModelEl.textContent : "Gemini 3.1 Pro";
    const log = document.getElementById("ql-log");

    if(!mensagem){
      if(log){ log.className = "ql-log-error"; log.innerText = "⚠ Prompt is empty"; }
      return;
    }

    await requestLatestTokenFromHook();

    const storageData = await new Promise((resolve) => {
      chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key","ql_session_id","ql_method_version","lovable_browserSessionId"], resolve);
    });
    const projectId = storageData.lovable_projectId || "";
    let token = storageData.lovable_token || "";
    const licenseKey = storageData.ql_license_key || "";

    if(!projectId || !token){
      if(log){ log.className = "ql-log-error"; log.innerText = "⚠ Project not synced. Open Lovable to capture the token."; }
      return;
    }

    if (token.startsWith("Bearer ")) token = token.slice(7);

    const methodVersion = storageData.ql_method_version || 'v1';
    // V1: anexa links públicos ao texto. V2: envia bytes em upload_files
    // para o proxy-command fazer generate-upload-url + download-url server-side.
    const v1Uploaded = qlAttachedFiles.filter(function(f){
      return f.public_url && !f.uploading && !f.uploadFailed && (f.method || 'v1') === 'v1';
    });
    const v2Pending = qlAttachedFiles.filter(function(f){
      return f.method === 'v2' && !f.uploading && !f.uploadFailed && f.rawFile;
    });
    const hasImage = v1Uploaded.length > 0 || v2Pending.length > 0;

    var finalMensagem = mensagem;
    if (v1Uploaded.length > 0) {
      var linkLines = v1Uploaded.map(function(f){ return f.public_url; }).join('\n');
      var sep = v1Uploaded.length > 1 ? 'Analyze the files in the links:\n' : 'Analyze the file at this link: ';
      finalMensagem = mensagem + '\n\n' + sep + linkLines;
    }

    try{
      if(hasImage) {
        if(log){ log.className = "ql-log-info"; log.innerText = "📎 Attaching image link..."; }
      } else {
        if(log){ log.className = "ql-log-info"; log.innerText = "⏳ Sending prompt..."; }
      }
      btn.classList.add("ql-sending");
      btn.disabled = true;

      // Build payload for proxy-command (handles everything server-side)
      const payload = {
        license_key: licenseKey,
        session_id: qlSessionId,
        projeto_id: projectId,
        token_lovable: token,
        mensagem: finalMensagem,
        modo_pensar: modoPlano,
        modelo_ia: activeModel,
        device_id: qlDeviceId,
        browser_session_id: storageData.lovable_browserSessionId || ''
      };

      if (v2Pending.length > 0) {
        var uploadFiles = [];
        for (var ui = 0; ui < v2Pending.length; ui++) {
          var pending = v2Pending[ui];
          var base64Data = await blobToBase64(pending.rawFile);
          uploadFiles.push({
            file_data: base64Data,
            file_name: pending.file_name || ('file_' + ui),
            file_type: pending.mime_type || pending.file_type || 'application/octet-stream'
          });
        }
        if (uploadFiles.length > 0) payload.upload_files = uploadFiles;
      }

      // Per-device fingerprint headers
      payload.session_headers = await buildSessionHeaders(projectId);

      var result = await bgFetch(PROXY_COMMAND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify(payload)
      });

      if(result && result.success === false){
        throw new Error(result.error_display || result.message || "Send error");
      }

      var apiData = result.data || result;
      var msgId = apiData.ai_message_id_usado || '';
      if(log){
        if (hasImage) {
          log.className = "ql-log-success";
          log.innerText = "✓ Prompt sent! valid image 😁";
        } else {
          log.className = "ql-log-success";
          log.innerText = "✓ Prompt sent!";
        }
      }
      try { if(typeof QLSounds!=="undefined") QLSounds.promptSent(); } catch(e){}
      if (msgId) console.log('[QL] API message ID:', msgId);

      // Save to chat history
      addToChatHistory(mensagem, 'ok');

      var msgEl = document.getElementById("ql-msg");
      if(msgEl) msgEl.value = "";

      qlAttachedFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      qlAttachedFiles = [];
      renderAttachPreview();
    }catch(err){
      if(log){ log.className = "ql-log-error"; log.innerText = "✗ " + (err.message || err); }
      addToChatHistory(mensagem, 'error');
    } finally {
      btn.classList.remove("ql-sending");
      btn.disabled = false;
    }
  });
}

// Store references to avoid stacking listeners
let _dragCleanup = null;
let _resizeCleanup = null;

function setupDrag(){
  if(_dragCleanup) { _dragCleanup(); _dragCleanup = null; }

  const box = document.getElementById("ql-floating");
  const header = document.getElementById("ql-header");
  if(!box || !header) return;

  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

  function onPointerDown(e){
    if(e.target.closest(".ql-minimize-btn") || e.target.closest(".ql-icon-btn") || e.target.closest("button")) return;
    if(e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startLeft = rect.left; startTop = rect.top;
    dragging = true;
    try { header.setPointerCapture(e.pointerId); } catch(ex){}
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.body.style.userSelect = "none";
  }

  function onPointerMove(e){
    if(!dragging) return;
    let newLeft = startLeft + (e.clientX - startX);
    let newTop = startTop + (e.clientY - startY);
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - box.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - box.offsetHeight));
    box.style.left = newLeft + "px";
    box.style.top = newTop + "px";
  }

  function onPointerUp(e){
    if(!dragging) return;
    dragging = false;
    try { header.releasePointerCapture(e.pointerId); } catch(ex){}
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.body.style.userSelect = "";

    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if(dx < 5 && dy < 5 && box.classList.contains("ql-minimized")){
      restoreFloatingPopup(box);
    }
  }

  header.addEventListener("pointerdown", onPointerDown, {passive:false});

  if(!box.dataset.qlRestoreClickBound){
    box.dataset.qlRestoreClickBound = "true";
    box.addEventListener("click", (e) => {
      if(!box.classList.contains("ql-minimized")) return;
      e.preventDefault();
      e.stopPropagation();
      restoreFloatingPopup(box);
    });
  }

  _dragCleanup = function(){
    header.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  };
}

function setupResize(){
  if(_resizeCleanup) { _resizeCleanup(); _resizeCleanup = null; }

  const box = document.getElementById("ql-floating");
  const handle = document.getElementById("ql-resize-handle");
  if(!box || !handle) return;

  let resizing = false, startY = 0, startH = 0;

  function onDown(e){
    e.preventDefault();
    e.stopPropagation();
    resizing = true;
    startY = e.clientY;
    startH = box.offsetHeight;
    try { handle.setPointerCapture(e.pointerId); } catch(ex){}
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.style.userSelect = "none";
  }

  function onMove(e){
    if(!resizing) return;
    let newH = startH + (e.clientY - startY);
    newH = Math.max(200, Math.min(newH, window.innerHeight * 0.8));
    box.style.height = newH + "px";
  }

  function onUp(e){
    if(!resizing) return;
    resizing = false;
    qlHeight = box.offsetHeight;
    chrome.storage.local.set({ ql_height: qlHeight });
    try { handle.releasePointerCapture(e.pointerId); } catch(ex){}
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.body.style.userSelect = "";
  }

  handle.addEventListener("pointerdown", onDown, {passive:false});

  _resizeCleanup = function(){
    handle.removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  };
}

// ===== CLIPBOARD PASTE (Ctrl+V) for ANY Files =====
function setupClipboardPaste() {
  var textarea = document.getElementById('ql-msg');
  if (!textarea) return;

  // --- Drag and Drop ---
  var dropZone = document.getElementById('ql-floating') || textarea;
  var dragOverlay = null;

  function showDragOverlay() {
    if (dragOverlay) return;
    dragOverlay = document.createElement('div');
    dragOverlay.className = 'ql-drag-overlay';
    dragOverlay.innerHTML = '<div class="ql-drag-overlay-inner">📂 Drop files here</div>';
    var parent = document.getElementById('ql-floating');
    if (parent) parent.appendChild(dragOverlay);
  }

  function hideDragOverlay() {
    if (dragOverlay) { dragOverlay.remove(); dragOverlay = null; }
  }

  dropZone.addEventListener('dragover', function(e) { e.preventDefault(); e.stopPropagation(); showDragOverlay(); });
  dropZone.addEventListener('dragleave', function(e) { e.preventDefault(); e.stopPropagation(); if (!dropZone.contains(e.relatedTarget)) hideDragOverlay(); });
  dropZone.addEventListener('drop', async function(e) {
    e.preventDefault(); e.stopPropagation(); hideDragOverlay();
    var files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    await handleFilesAttach(files);
  });

  // --- Paste (images + non-image files) ---
  textarea.addEventListener('paste', async function(e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var filesToAttach = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.kind === 'file') {
        e.preventDefault();
        var file = item.getAsFile();
        if (file) filesToAttach.push(file);
      }
    }
    if (filesToAttach.length > 0) await handleFilesAttach(filesToAttach);
  });
}

async function handleFilesAttach(files) {
  if (qlAttachedFiles.length >= MAX_FILES) {
    showCustomAlert('Limite', 'Maximo ' + MAX_FILES + ' files.');
    return;
  }
  await requestLatestTokenFromHook(1500);
  var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'lovable_projectId', 'ql_method_version'], r); });
  var token = sd.lovable_token || '';
  if (!token) { showCustomAlert('Error', 'Token not captured.'); return; }
  if (token.indexOf('Bearer ') === 0) token = token.slice(7);
  var methodVersion = sd.ql_method_version || 'v1';
  var pidForUpload = sd.lovable_projectId || '';

  for (var fi = 0; fi < files.length; fi++) {
    var file = files[fi];
    if (qlAttachedFiles.length >= MAX_FILES) break;
    if (file.size > MAX_FILE_SIZE) { showCustomAlert('Grande', file.name + ' excede 20MB.'); continue; }

    var processedFile = file;
    var previewUrl = null;
    if (isImageType(file.type)) {
      var compressed = await compressImage(file);
      processedFile = compressed.file;
      previewUrl = compressed.previewUrl;
    }

    var idx = qlAttachedFiles.length;
    qlAttachedFiles.push({
      file_id: null,
      file_name: file.name || ('file_' + Date.now()),
      previewUrl: previewUrl,
      file_type: processedFile.type,
      sizeLabel: formatFileSize(processedFile.size),
      uploading: true,
      rawFile: processedFile
    });
    renderAttachPreview();

    try {
      var res = await uploadFileDirect(processedFile, token, { method: methodVersion, projectId: pidForUpload });
      qlAttachedFiles[idx].file_id = res.file_id;
      if (res.public_url) qlAttachedFiles[idx].public_url = res.public_url;
      if (res.lovable_url) qlAttachedFiles[idx].lovable_url = res.lovable_url;
      if (res.mime_type) qlAttachedFiles[idx].mime_type = res.mime_type;
      qlAttachedFiles[idx].method = res.method || 'v1';
      qlAttachedFiles[idx].uploading = false;
      renderAttachPreview();
    } catch(err) {
      qlAttachedFiles[idx].uploading = false;
      qlAttachedFiles[idx].file_id = 'local_direct_' + crypto.randomUUID();
      qlAttachedFiles[idx].uploadFailed = true;
      renderAttachPreview();
    }
  }
  showCustomAlert('Attached 📎', files.length + ' file(s) added!');
}

// ===== DOWNLOAD ALL PROJECT FILES (Popup) =====
var VERSIONS_URL_POPUP = "https://ynvrijkuampxpsmshftm.supabase.co/rest/v1/extension_versions?select=version,changelog,file_path,is_alert_active&order=created_at.desc&limit=1&is_alert_active=eq.true";
var USER_ROLES_URL_POPUP = "https://ynvrijkuampxpsmshftm.supabase.co/rest/v1/user_roles?select=role";
var CURRENT_EXT_VERSION_POPUP = "6.0.13";

function setupDownloadProject() {
  var btn = document.getElementById('ql-download-project');
  if (!btn) return;
  btn.addEventListener('click', async function() {
    var statusEl = document.getElementById('ql-download-status');
    btn.disabled = true;
    btn.textContent = 'Preparando...';
    if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'ql-log-info'; statusEl.textContent = 'Checking token and project...'; }

    try {
      // ---- Feature flag gate ----
      try {
        var flagUrl = "https://ynvrijkuampxpsmshftm.supabase.co/rest/v1/feature_flags?select=enabled&flag_key=eq.download_files";
        var flagRows = await bgFetch(flagUrl, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
        if (flagRows && flagRows.length > 0 && flagRows[0].enabled === false) {
          throw new Error('Error using extension features.');
        }
      } catch (flagErr) {
        if (flagErr && flagErr.message === 'Error using extension features.') throw flagErr;
      }

      var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'lovable_projectId'], r); });
      var authToken = sd.lovable_token || '';
      var storedProjectId = sd.lovable_projectId || '';
      if (authToken.indexOf('Bearer ') === 0) authToken = authToken.slice(7);

      var projectId = storedProjectId;
      if (!projectId) throw new Error('Open a Lovable project page first.');
      if (!authToken) {
        var cookieResponse = await new Promise(function(resolve) {
          chrome.runtime.sendMessage({ action: "readCookies" }, function(resp) { resolve(resp); });
        });
        if (cookieResponse && cookieResponse.success && cookieResponse.tokens && cookieResponse.tokens.length > 0) {
          authToken = cookieResponse.tokens[0].token;
        }
      }
      if (!authToken) throw new Error('Token not found. Open a Lovable project and wait for sync.');

      btn.textContent = 'Baixando...';
      if (statusEl) statusEl.textContent = 'Downloading project files...';

      var dlResponse = await new Promise(function(resolve) {
        chrome.runtime.sendMessage({ action: "downloadProject", projectId: projectId, token: authToken }, function(resp) { resolve(resp); });
      });

      if (!dlResponse || !dlResponse.success) throw new Error(dlResponse && dlResponse.error ? dlResponse.error : 'Download failed');
      var files = dlResponse.files;
      if (!files || files.length === 0) throw new Error('No files found in the project.');

      if (statusEl) statusEl.textContent = 'Criando ZIP com ' + files.length + ' files...';
      btn.textContent = 'Empacotando...';
      if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded. Use the Side Panel.');

      var zip = new JSZip();
      var imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff'];
      var addedFiles = 0;
      for (var fi = 0; fi < files.length; fi++) {
        var f = files[fi];
        if (!f.name || f.sizeExceeded) continue;
        if (f.contents && f.binary) { zip.file(f.name, f.contents, { base64: true, binary: true }); addedFiles++; }
        else if (!f.contents && imageExts.some(function(ext) { return f.name.toLowerCase().endsWith(ext); })) {
          try {
            var imgResp = await fetch('https://api.lovable.dev/projects/' + projectId + '/files/raw?path=' + encodeURIComponent(f.name), { method: 'GET', headers: { 'Authorization': 'Bearer ' + authToken }, credentials: 'omit', mode: 'cors' });
            if (imgResp.ok) { zip.file(f.name, await imgResp.arrayBuffer(), { binary: true }); addedFiles++; }
            else if (f.contents) { zip.file(f.name, f.contents); addedFiles++; }
          } catch(imgErr) { if (f.contents) { zip.file(f.name, f.contents); addedFiles++; } }
        } else if (f.contents) { zip.file(f.name, f.contents); addedFiles++; }
      }

      var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = 'lovable-' + projectId.substring(0, 8) + '-' + new Date().toISOString().split('T')[0] + '.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);

      if (statusEl) { statusEl.className = 'ql-log-success'; statusEl.textContent = addedFiles + ' files downloaded!'; }
      btn.textContent = 'Download Complete!';
      setTimeout(function() { btn.textContent = 'Download All Files'; btn.disabled = false; if (statusEl) statusEl.style.display = 'none'; }, 4000);
    } catch(err) {
      if (statusEl) { statusEl.className = 'ql-log-error'; statusEl.textContent = (err.message || err); statusEl.style.display = 'block'; }
      btn.textContent = 'Failed';
      setTimeout(function() { btn.textContent = 'Download All Files'; btn.disabled = false; }, 3000);
    }
  });
}

// ===== UPDATE CHECK (Popup) =====
async function checkForUpdatePopup() {
  try {
    var data = await bgFetch(VERSIONS_URL_POPUP, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
    if (!data || !data.length) return;
    var latest = data[0];
    if (latest.version !== CURRENT_EXT_VERSION_POPUP && latest.is_alert_active) {
      var banner = document.getElementById('ql-update-banner');
      if (banner) {
        var dlUrl = latest.file_path ? "https://ynvrijkuampxpsmshftm.supabase.co/storage/v1/object/public/extension-releases/" + latest.file_path : null;
        banner.innerHTML = '<div style="padding:10px 12px;background:linear-gradient(135deg,rgba(236,72,153,0.12),rgba(124,58,237,0.08));border:1px solid rgba(236,72,153,0.30);border-radius:10px;margin:8px 0"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:14px">&#128276;</span><strong style="font-size:11px;color:#EC4899">New update v' + latest.version + '!</strong></div><p style="font-size:10px;color:#a1a1aa;margin:0 0 6px;white-space:pre-line">' + (latest.changelog || '') + '</p>' + (dlUrl ? '<a href="' + dlUrl + '" target="_blank" style="display:inline-block;padding:4px 12px;background:#EC4899;color:#000;border-radius:6px;text-decoration:none;font-size:10px;font-weight:700">Download v' + latest.version + '</a>' : '') + '</div>';
        banner.style.display = 'block';
      }
    }
  } catch(e) {}
}

// ===== RESELLER ROLE CHECK (Popup) =====
async function checkResellerRolePopup() {
  try {
    var storageData = await new Promise(function(r) { chrome.storage.local.get(["ql_license_key"], r); });
    if (!storageData.ql_license_key) return;
    var licData = await bgFetch("https://ynvrijkuampxpsmshftm.supabase.co/rest/v1/licenses?select=user_id&license_key=eq." + encodeURIComponent(storageData.ql_license_key) + "&limit=1", { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
    if (!licData || !licData.length || !licData[0].user_id) return;
    var userId = licData[0].user_id;
    var roleData = await bgFetch(USER_ROLES_URL_POPUP + "&user_id=eq." + userId, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
    if (roleData && Array.isArray(roleData) && roleData.some(function(r) { return r.role === 'reseller' || r.role === 'admin'; })) {
      var btn = document.getElementById('ql-reseller-btn');
      if (btn) btn.style.display = 'block';
    }
  } catch(e) {}
}

// ===== NATIVE CHAT MODE =====
let qlNativeChatActive = false;
let qlNativeChatCleanup = null;

function activateNativeChat() {
  qlNativeChatActive = true;
  chrome.storage.local.set({ ql_native_chat: true, ql_minimized: true });

  // Hide the extension
  const floatingBox = document.getElementById("ql-floating");
  if (floatingBox) {
    floatingBox.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    floatingBox.style.opacity = "0";
    floatingBox.style.transform = "scale(0.95) translateX(20px)";
    setTimeout(() => { floatingBox.style.display = "none"; }, 350);
  }

  injectNativeChatOverlay();
}

function deactivateNativeChat(keepFloatingHidden) {
  qlNativeChatActive = false;
  chrome.storage.local.set({ ql_native_chat: false, ql_minimized: !!keepFloatingHidden });

  // Clean up injected elements
  if (qlNativeChatCleanup) { qlNativeChatCleanup(); qlNativeChatCleanup = null; }

  const badge = document.getElementById("ql-native-badge");
  if (badge) badge.remove();
  const returnBtn = document.getElementById("ql-native-return-btn");
  if (returnBtn) returnBtn.remove();

  // Restore send button
  const sendBtn = document.getElementById("chatinput-send-message-button");
  if (sendBtn) {
    sendBtn.classList.remove("ql-native-send-active");
    sendBtn.style.animation = "";
  }

  // Show the extension again
  const floatingBox = document.getElementById("ql-floating");
  if (keepFloatingHidden) {
    if (floatingBox) floatingBox.style.display = "none";
  } else if (floatingBox) {
    floatingBox.style.display = "";
    floatingBox.style.opacity = "0";
    floatingBox.style.transform = "scale(0.95)";
    floatingBox.classList.remove("ql-minimized");
    updateMinimizedLogo(floatingBox);
    requestAnimationFrame(() => {
      floatingBox.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      floatingBox.style.opacity = "1";
      floatingBox.style.transform = "scale(1) translateX(0)";
    });
  } else {
    // Rebuild if removed
    _buildFloatingUI();
  }
}

function injectNativeChatOverlay() {
  // Wait for chat form to exist
  const chatForm = document.querySelector("form#chat-input");
  if (!chatForm) {
    setTimeout(injectNativeChatOverlay, 500);
    return;
  }

  const existingPos = getComputedStyle(chatForm).position;
  if (existingPos === "static") chatForm.style.position = "relative";

  // Keep the badge anchored to the real Lovable chat form, even when the SPA rerenders.
  let badge = document.getElementById("ql-native-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "ql-native-badge";
    badge.className = "ql-native-badge";
    badge.innerHTML = "\u26a1 <span>VibeX Academy - Lovable Extension</span>";
  }
  if (badge.parentElement !== chatForm) chatForm.appendChild(badge);

  // Add return button below chat form
  let returnBtn = document.getElementById("ql-native-return-btn");
  if (!returnBtn) {
    returnBtn = document.createElement("button");
    returnBtn.id = "ql-native-return-btn";
    returnBtn.className = "ql-native-return-btn";
    returnBtn.innerHTML = "\u2190 Back to Extension";
    returnBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deactivateNativeChat();
    });
  }
  if (chatForm.parentElement && returnBtn.previousElementSibling !== chatForm) {
    chatForm.parentElement.insertBefore(returnBtn, chatForm.nextSibling);
  }

  // Style the send button with blink animation
  const sendBtn = document.getElementById("chatinput-send-message-button");
  if (sendBtn) {
    sendBtn.classList.add("ql-native-send-active");
  }

  // Intercept send button click
  function interceptSend(e) {
    if (!qlNativeChatActive) return;

    // Get text from contenteditable
    const editor = chatForm.querySelector('[contenteditable="true"]');
    const text = editor ? (editor.innerText || editor.textContent || "").trim() : "";

    if (!text) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    sendViaNativeChat(text, editor);
  }

  // Intercept form submit
  function interceptSubmit(e) {
    if (!qlNativeChatActive) return;

    const editor = chatForm.querySelector('[contenteditable="true"]');
    const text = editor ? (editor.innerText || editor.textContent || "").trim() : "";

    if (!text) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    sendViaNativeChat(text, editor);
  }

  // Intercept Enter key
  function interceptKeydown(e) {
    if (!qlNativeChatActive) return;
    if (e.key === "Enter" && !e.shiftKey) {
      const editor = chatForm.querySelector('[contenteditable="true"]');
      const text = editor ? (editor.innerText || editor.textContent || "").trim() : "";
      if (!text) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      sendViaNativeChat(text, editor);
    }
  }

  if (sendBtn) sendBtn.addEventListener("click", interceptSend, true);
  chatForm.addEventListener("submit", interceptSubmit, true);
  chatForm.addEventListener("keydown", interceptKeydown, true);

  if (window.qlNativeAnchorInterval) clearInterval(window.qlNativeAnchorInterval);
  window.qlNativeAnchorInterval = setInterval(() => {
    if (!qlNativeChatActive) {
      clearInterval(window.qlNativeAnchorInterval);
      window.qlNativeAnchorInterval = null;
      return;
    }
    const currentForm = document.querySelector("form#chat-input");
    const currentBadge = document.getElementById("ql-native-badge");
    if (currentForm && currentBadge && currentBadge.parentElement !== currentForm) {
      injectNativeChatOverlay();
    }
  }, 900);

  qlNativeChatCleanup = function() {
    if (sendBtn) sendBtn.removeEventListener("click", interceptSend, true);
    chatForm.removeEventListener("submit", interceptSubmit, true);
    chatForm.removeEventListener("keydown", interceptKeydown, true);
    if (window.qlNativeAnchorInterval) {
      clearInterval(window.qlNativeAnchorInterval);
      window.qlNativeAnchorInterval = null;
    }
  };
}

async function sendViaNativeChat(text, editor) {
  const sendBtn = document.getElementById("chatinput-send-message-button");

  // Show sending overlay
  showNativeSendingOverlay(true);

  // Visual feedback
  if (sendBtn) {
    sendBtn.style.animation = "none";
    sendBtn.classList.add("ql-native-sending");
    sendBtn.disabled = true;
  }

  await requestLatestTokenFromHook();

  const storageData = await new Promise((resolve) => {
    chrome.storage.local.get(["lovable_projectId", "lovable_token", "ql_license_key", "ql_session_id"], resolve);
  });
  const projectId = storageData.lovable_projectId || "";
  let token = storageData.lovable_token || "";
  const licenseKey = storageData.ql_license_key || "";

  if (!projectId || !token) {
    showNativeChatToast("⚠ Project not synced. Open Lovable first.", "error");
    if (sendBtn) {
      sendBtn.classList.remove("ql-native-sending");
      sendBtn.classList.add("ql-native-send-active");
    }
    return;
  }

  if (token.startsWith("Bearer ")) token = token.slice(7);

  try {
    // Detecta automaticamente: (1) se o usuário clicou no botão "Plan" nativo
    // do Lovable e (2) se há imagens anexadas pelo botão "Attach" nativo.
    const planActive = detectLovableNativePlan();
    const nativeImages = await collectNativeChatImages();

    const payload = {
      license_key: licenseKey,
      session_id: qlSessionId,
      projeto_id: projectId,
      token_lovable: token,
      mensagem: text,
      modo_pensar: planActive,
      device_id: (typeof qlDeviceId !== 'undefined' ? qlDeviceId : undefined)
    };
    if (nativeImages.length > 0) {
      payload.upload_files = nativeImages;
    }

    var result = await bgFetch(PROXY_COMMAND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify(payload)
    });

    if (result && result.success === false) {
      throw new Error(result.error_display || result.message || "Send error");
    }

    // Clear the editor
    if (editor) {
      editor.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // Limpa também anexos nativos clicando nos botões de remover, se existirem
    try { clearNativeChatAttachments(); } catch(e) {}

    addToChatHistory(text, "ok");
    var okMsg = "\u2713 Prompt sent successfully!";
    if (planActive) okMsg += " (Plan Mode)";
    if (nativeImages.length > 0) okMsg += " \u00b7 " + nativeImages.length + " image(s)";
    showNativeChatToast(okMsg, "success");

  } catch (err) {
    addToChatHistory(text, "error");
    showNativeChatToast("\u2717 " + (err.message || "Send error"), "error");
  } finally {
    showNativeSendingOverlay(false);
    if (sendBtn) {
      sendBtn.classList.remove("ql-native-sending");
      sendBtn.classList.add("ql-native-send-active");
      sendBtn.disabled = false;
      // Re-apply blink animation since it may have been cleared
      sendBtn.style.animation = "";
      requestAnimationFrame(() => {
        sendBtn.style.animation = "ql-send-blink 1.5s infinite";
      });
    }
  }
}

function showNativeSendingOverlay(show) {
  const id = "ql-native-sending-overlay";
  const existing = document.getElementById(id);
  if (!show) { if (existing) existing.remove(); return; }
  if (existing) return;
  const el = document.createElement("div");
  el.id = id;
  el.className = "ql-native-sending-overlay";
  el.innerHTML = '<div class="ql-spinner"></div> Sending prompt...';
  document.body.appendChild(el);
}

function showNativeChatToast(msg, type) {
  const existing = document.getElementById("ql-native-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "ql-native-toast";
  toast.className = "ql-native-toast ql-native-toast-" + type;
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("ql-native-toast-visible"));
  setTimeout(() => {
    toast.classList.remove("ql-native-toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function setupNativeChatButton() {
  const btn = document.getElementById("ql-native-chat-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    activateNativeChat();
  });
}

// ===== DETECÇÕES NATIVAS DO LOVABLE (Plan toggle + imagens) =====

// Rastreia em tempo real qual modo o usuário escolheu no dropdown Build/Plan
// do Lovable. O dropdown só existe no DOM quando aberto, então observamos o
// body via MutationObserver e persistimos a última escolha vista.
let qlLovablePlanLastKnown = false;
function observeLovablePlanToggle(){
  try {
    var apply = function(){
      var items = document.querySelectorAll('[role="menuitemradio"]');
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var txt = (it.textContent || "").trim();
        if (/^Plan(\s|$)/i.test(txt) || /Discuss before building/i.test(txt)) {
          if (it.getAttribute('data-state') === 'checked' || it.getAttribute('aria-checked') === 'true') {
            qlLovablePlanLastKnown = true;
          } else if (it.getAttribute('data-state') === 'unchecked' || it.getAttribute('aria-checked') === 'false') {
            // Só vira false se vermos explicitamente Build marcado
            var build = null;
            for (var j = 0; j < items.length; j++) {
              var bt = (items[j].textContent || "").trim();
              if (/^Build(\s|$)/i.test(bt) || /Make changes directly/i.test(bt)) { build = items[j]; break; }
            }
            if (build && (build.getAttribute('data-state') === 'checked' || build.getAttribute('aria-checked') === 'true')) {
              qlLovablePlanLastKnown = false;
            }
          }
        }
      }
    };
    apply();
    var obs = new MutationObserver(function(){ apply(); });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state','aria-checked'] });
  } catch(e) { /* noop */ }
}
try { observeLovablePlanToggle(); } catch(e) {}

function detectLovableNativePlan(){
  // Tenta uma releitura final imediata antes do envio
  try {
    var items = document.querySelectorAll('[role="menuitemradio"]');
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var txt = (it.textContent || "").trim();
      if (/^Plan(\s|$)/i.test(txt) || /Discuss before building/i.test(txt)) {
        var st = it.getAttribute('data-state') || it.getAttribute('aria-checked');
        if (st === 'checked' || st === 'true') return true;
        if (st === 'unchecked' || st === 'false') return false;
      }
    }
  } catch(e) {}
  return qlLovablePlanLastKnown === true;
}

// Coleta imagens anexadas pelo botão Attach nativo do Lovable e devolve no
// formato esperado pelo proxy-command (upload_files: base64).
async function collectNativeChatImages(){
  var out = [];
  try {
    var chatForm = document.querySelector("form#chat-input");
    if (!chatForm) return out;
    // Seleciona <img> dentro do form (previews de anexo). Filtra ícones SVG.
    var imgs = chatForm.querySelectorAll('img');
    var seen = {};
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var src = img.getAttribute('src') || img.src || '';
      if (!src) continue;
      if (seen[src]) continue;
      seen[src] = true;
      // Apenas blob:, data:, https://storage.googleapis.com ou api.lovable.dev
      var ok = /^blob:/.test(src) || /^data:image\//.test(src) || /storage\.googleapis\.com/.test(src) || /lovable\.dev\/.+files/.test(src);
      if (!ok) continue;
      try {
        var resp = await fetch(src);
        if (!resp.ok) continue;
        var blob = await resp.blob();
        if (!blob || !blob.size) continue;
        if (blob.size > 20 * 1024 * 1024) continue; // 20MB
        var b64 = await blobToBase64(blob);
        var type = blob.type || 'image/png';
        var ext = (type.split('/')[1] || 'png').split(';')[0];
        out.push({
          file_data: b64,
          file_name: 'native_' + Date.now() + '_' + i + '.' + ext,
          file_type: type
        });
      } catch(e) { /* skip */ }
    }
  } catch(e) {}
  return out;
}

function clearNativeChatAttachments(){
  var chatForm = document.querySelector("form#chat-input");
  if (!chatForm) return;
  // Lovable usa botões com aria-label "Remove" próximos do preview
  var removeBtns = chatForm.querySelectorAll('button[aria-label*="Remove" i], button[aria-label*="Excluir" i]');
  for (var i = 0; i < removeBtns.length; i++) {
    try { removeBtns[i].click(); } catch(e) {}
  }
}

// ===== LISTENER PARA COMANDOS DO SIDEPANEL =====
try {
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse){
    if (!msg || !msg.type) return;
    if (msg.type === 'ql_native_chat_activate') {
      try { activateNativeChat(); } catch(e) {}
      sendResponse && sendResponse({ ok: true });
    } else if (msg.type === 'ql_native_chat_deactivate') {
      try { deactivateNativeChat(); } catch(e) {}
      sendResponse && sendResponse({ ok: true });
    }
  });
} catch(e) {}

// Check if native chat was active on page load
chrome.storage.local.get(["ql_native_chat"], (res) => {
  if (res.ql_native_chat === true) {
    qlNativeChatActive = true;
    setTimeout(() => {
      const floatingBox = document.getElementById("ql-floating");
      if (floatingBox) floatingBox.style.display = "none";
      injectNativeChatOverlay();
    }, 500);
  }
});

window.addEventListener("message", (event)=>{
  if(!event.data || event.data.type !== "lovableTokenFound") return;
  const updates = {};
  if(event.data.token && typeof event.data.token === "string"){
    updates.lovable_token = event.data.token.replace(/^Bearer\s+/i, "").trim();
  }
  if(event.data.projectId && typeof event.data.projectId === "string"){
    updates.lovable_projectId = event.data.projectId;
  }
  if(event.data.browserSessionId && typeof event.data.browserSessionId === "string"){
    updates.lovable_browserSessionId = event.data.browserSessionId.trim();
  }
  if(!Object.keys(updates).length) return;
  safeStorageSet(updates, ()=>{
    updateSyncStatus();
  });
});

function setupCreateProject() {
  var btn = document.getElementById('ql-create-project');
  if (!btn) return;
  btn.addEventListener('click', async function() {
    var statusEl = document.getElementById('ql-download-status');
    var originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Creating project...';
    if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'ql-log-info'; statusEl.textContent = 'Preparing creation...'; }
    try {
      var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'ql_license_key'], r); });
      var authToken = sd.lovable_token || '';
      var licenseKey = sd.ql_license_key || '';
      if (authToken.indexOf('Bearer ') === 0) authToken = authToken.slice(7);
      if (!licenseKey) throw new Error('License not found.');
      if (!authToken) {
        try { window.postMessage({ type: 'lovableRequestToken' }, '*'); } catch(e) {}
        await new Promise(function(r){ setTimeout(r, 600); });
        sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token'], r); });
        authToken = (sd.lovable_token || '').replace(/^Bearer\s+/i, '');
      }
      if (!authToken) throw new Error('Open lovable.dev and wait for sync.');

      if (statusEl) statusEl.textContent = 'Requesting creation on the server...';
      var resp = await fetch(PROXY_COMMAND_URL.replace('proxy-command', 'create-lovable-project'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ license_key: licenseKey, token_lovable: authToken })
      });
      var data = await resp.json();
      if (!data || !data.success || !data.link) {
        throw new Error((data && data.error_display) || 'Failed to create project');
      }
      if (statusEl) { statusEl.className = 'ql-log-success'; statusEl.textContent = '✅ Project created! Redirecting...'; }
      btn.textContent = '✅ Success!';
      setTimeout(function(){
        try { window.location.href = data.link; }
        catch(e) { window.open(data.link, '_blank'); }
      }, 400);
    } catch(err) {
      console.error('[CreateProject]', err);
      if (statusEl) { statusEl.className = 'ql-log-error'; statusEl.textContent = '❌ ' + (err.message || 'Error'); }
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
}

function setupModelSelector() {
  const btn = document.getElementById("ql-model-selector-btn");
  const options = document.getElementById("ql-model-options");
  const modelItems = document.querySelectorAll(".ql-model-option");
  const activeIcon = document.getElementById("ql-active-model-icon");
  const activeName = document.getElementById("ql-active-model-name");
  const container = document.querySelector(".ql-model-selector-container");

  if (!btn || !options) return;

  // Load saved model or default to Gemini
  chrome.storage.local.get(["ql_active_model", "ql_active_model_name", "ql_active_model_icon"], (res) => {
    const savedModel = res.ql_active_model || "gemini-1.5-pro";
    const savedName = res.ql_active_model_name || "Gemini 3.1 Pro";
    const savedIcon = res.ql_active_model_icon || "\u2728";

    activeName.textContent = savedName;
    activeIcon.textContent = savedIcon;

    modelItems.forEach(item => {
      if (item.getAttribute("data-model") === savedModel) {
        item.classList.add("ql-active");
      } else {
        item.classList.remove("ql-active");
      }
    });
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = options.style.display === "block";
    options.style.display = isOpen ? "none" : "block";
    container.classList.toggle("ql-active", !isOpen);
  });

  modelItems.forEach(item => {
    item.addEventListener("click", () => {
      const model = item.getAttribute("data-model");
      const name = item.querySelector(".ql-model-opt-title").textContent;
      const icon = item.getAttribute("data-icon");

      activeName.textContent = name;
      activeIcon.textContent = icon;
      options.style.display = "none";
      container.classList.remove("ql-active");

      modelItems.forEach(i => i.classList.remove("ql-active"));
      item.classList.add("ql-active");

      chrome.storage.local.set({
        ql_active_model: model,
        ql_active_model_name: name,
        ql_active_model_icon: icon
      });

      showCustomAlert("\u2705 Modelo Alterado", "Agora usando: " + name);
    });
  });

  document.addEventListener("click", () => {
    options.style.display = "none";
    container.classList.remove("ql-active");
  });
}
