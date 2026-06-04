// ============================================================
// VibeX Academy - Lovable Extension - Side Panel Logic (Business Logic Only)
// Templates/HTML estao em sidepanel-templates.js
// ============================================================

(function(){
  const SUPABASE_URL = "https://ynvrijkuampxpsmshftm.supabase.co";
  const VALIDATE_URL = SUPABASE_URL + "/functions/v1/validate-license";
  const OPTIMIZE_URL = SUPABASE_URL + "/functions/v1/optimize-prompt";
  const NOTIFICATIONS_URL = SUPABASE_URL + "/rest/v1/notifications?select=*&order=created_at.desc&limit=20";
  const VERSIONS_URL = SUPABASE_URL + "/rest/v1/extension_versions?select=version,changelog,file_path,is_alert_active&order=created_at.desc&limit=1&is_alert_active=eq.true";
  const USER_ROLES_URL = SUPABASE_URL + "/rest/v1/user_roles?select=role";
  const PROXY_COMMAND_URL = SUPABASE_URL + "/functions/v1/proxy-command";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InludnJpamt1YW1weHBzbXNoZnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDc1NjYsImV4cCI6MjA4OTc4MzU2Nn0.wFo3etz2hWmb8VCtadXRdqQAyCDaP2Li4Rs5kHLTdfM";

  let sessionId = null, userName = null, expiresAt = null, licenseStatus = null, heartbeatInterval = null, deviceId = null, isResellerUser = false;
  let spSpeechRecognition = null, spIsRecording = false;
  let spAttachedFiles = [];
  let spActiveTab = 'prompt';
  let spChatHistory = [];
  let spSyncRequestInFlight = false;
  let spLastSyncRequestAt = 0;
  let spCountdownInterval = null;
  const SP_MAX_FILES = 15;
  const SP_MAX_FILE_SIZE = 20 * 1024 * 1024;
  const SP_HISTORY_KEY = 'ql_chat_history';
  const SP_MAX_HISTORY = 200;
   const CURRENT_EXT_VERSION = "6.0.13";

  try { chrome.storage.local.set({ ql_sidebar_mode: true }); } catch(e) {}

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

  // --- Utilities ---
  function safeSendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return reject(new Error("Extension context invalidated"));
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        });
      } catch(e) { reject(new Error("Extension context invalidated")); }
    });
  }

  function bgFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return reject(new Error("Extension context invalidated"));
        chrome.runtime.sendMessage({ action: "proxyFetch", url, method: opts.method || "POST", headers: opts.headers || {}, body: opts.body || null }, (resp) => {
          if(chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if(!resp) return reject(new Error("No response"));
          if(resp.data && typeof resp.data === "object") resolve(resp.data);
          else if(!resp.ok) reject(new Error("Fetch failed (" + resp.status + ")"));
          else resolve(resp.data);
        });
      } catch(e) { reject(new Error("Extension context invalidated")); }
    });
  }

  function spRefreshLovableSession(timeoutMs) {
    return new Promise(function(resolve) {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          var tab = tabs && tabs[0];
          if (!tab || !tab.id || !tab.url || tab.url.indexOf('lovable.dev') < 0) return resolve(false);
          chrome.tabs.sendMessage(tab.id, { action: 'requestLovableSessionFromPage', timeoutMs: timeoutMs || 1500 }, function(resp) {
            resolve(!!(resp && resp.ok));
          });
        });
      } catch(e) { resolve(false); }
    });
  }

  function getDeviceId() {
    return getHardwareFingerprint();
  }

  function showAlert(title, message) {
    const toastType = /erro|falha|negad|inval|expir|limite|payment|rate|token|credito|sess/i.test((title || "") + " " + (message || "")) ? "error" : "success";
    if(showToast(title, message, toastType)) return;
    const existing = document.querySelector('.sp-alert-overlay');
    if(existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'sp-alert-overlay';
    overlay.innerHTML = spTemplateAlert(title, message);
    document.body.appendChild(overlay);
    overlay.querySelector('.sp-alert-ok').addEventListener('click', () => overlay.remove());
    setTimeout(() => overlay.remove(), 4000);
  }

  function ensureToastHost() {
    let host = document.querySelector('.sp-toast-stack');
    if(!host) {
      host = document.createElement('div');
      host.className = 'sp-toast-stack';
      document.body.appendChild(host);
    }
    return host;
  }

  function showToast(title, message, type) {
    const host = ensureToastHost();
    if(!host) return false;
    const kind = type === 'error' ? 'error' : (type === 'info' ? 'info' : 'success');
    const toast = document.createElement('div');
    toast.className = 'sp-toast sp-toast-' + kind;
    const icon = kind === 'error' ? '!' : (kind === 'info' ? 'i' : '\u2713');
    toast.innerHTML =
      '<div class="sp-toast-icon">' + icon + '</div>' +
      '<div class="sp-toast-copy">' +
        '<div class="sp-toast-title"></div>' +
        '<div class="sp-toast-message"></div>' +
      '</div>' +
      '<button class="sp-toast-close" type="button" title="Close">x</button>';
    toast.querySelector('.sp-toast-title').textContent = title || 'Notice';
    toast.querySelector('.sp-toast-message').textContent = message || '';
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('sp-toast-visible'));
    const close = () => {
      toast.classList.remove('sp-toast-visible');
      setTimeout(() => toast.remove(), 180);
    };
    toast.querySelector('.sp-toast-close').addEventListener('click', close);
    setTimeout(close, kind === 'error' ? 5200 : 3600);
    return true;
  }

  // --- Header Event Listeners ---
  document.getElementById('sp-back-to-popup').addEventListener('click', () => {
    try { chrome.storage.local.set({ ql_sidebar_mode: false }); } catch(e) {}
    try { chrome.runtime.sendMessage({ action: "deactivateSidebar" }); } catch(e) {}
    try { window.close(); } catch(e) {}
  });

  document.querySelector('.sp-theme-btn').addEventListener('click', () => {
    const isLight = document.body.classList.toggle('sp-light');
    chrome.storage.local.set({ ql_dark_mode: !isLight });
  });

  function applyLiteMode(enabled) {
    document.body.classList.toggle('sp-lite-mode', enabled);
    const btn = document.querySelector('.sp-lite-btn');
    if(btn) {
      btn.classList.toggle('sp-lite-active', enabled);
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
  }

  chrome.storage.local.get(['ql_light_mode'], (res) => applyLiteMode(res.ql_light_mode === true));

  const spLiteBtn = document.querySelector('.sp-lite-btn');
  if(spLiteBtn) {
    spLiteBtn.addEventListener('click', () => {
      const enabled = !document.body.classList.contains('sp-lite-mode');
      applyLiteMode(enabled);
      chrome.storage.local.set({ ql_light_mode: enabled });
      showToast('Lite Mode', enabled ? 'Animations reduced to make everything smoother.' : 'Animations restored.', 'info');
    });
  }

  document.querySelector('.sp-logout-btn').addEventListener('click', () => {
    if(heartbeatInterval) clearInterval(heartbeatInterval);
    chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => {
      userName = null; expiresAt = null; licenseStatus = null; sessionId = null;
      showLicenseGate();
    });
  });

  // --- Notifications ---
  const notifPanel = document.getElementById('sp-notif-panel');
  document.querySelector('.sp-notif-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = notifPanel.style.display !== 'none';
    notifPanel.style.display = isOpen ? 'none' : 'block';
    if(!isOpen) loadNotifications();
  });
  document.getElementById('sp-notif-close').addEventListener('click', () => { notifPanel.style.display = 'none'; });

  async function loadNotifications() {
    const list = document.getElementById('sp-notif-list');
    list.innerHTML = '<p class="sp-notif-empty">Loading...</p>';
    try {
      const data = await bgFetch(NOTIFICATIONS_URL, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
      if(!data || !data.length) { list.innerHTML = '<p class="sp-notif-empty">No notifications.</p>'; return; }
      const ids = data.map(n => n.id);
      chrome.storage.local.set({ ql_read_notifs: ids });
      const badge = document.querySelector('.sp-notif-badge');
      if(badge) badge.style.display = 'none';
      list.innerHTML = data.map(n => spTemplateNotifItem(n)).join('');
    } catch(e) { list.innerHTML = '<p class="sp-notif-empty">Error loading.</p>'; }
  }

  async function checkUnread() {
    try {
      const data = await bgFetch(NOTIFICATIONS_URL, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
      if(!data || !data.length) return;
      chrome.storage.local.get(["ql_read_notifs"], res => {
        const readIds = res.ql_read_notifs || [];
        const unread = data.filter(n => !readIds.includes(n.id)).length;
        const badge = document.querySelector('.sp-notif-badge');
        if(badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'flex' : 'none'; }
      });
    } catch(e) {}
  }

  // --- Update Check ---
  async function checkForUpdate() {
    try {
      const data = await bgFetch(VERSIONS_URL, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
      if (!data || !data.length) return;
      const latest = data[0];
      if (latest.version !== CURRENT_EXT_VERSION && latest.is_alert_active) {
        const banner = document.getElementById('sp-update-banner');
        if (banner) {
          const dlUrl = latest.file_path ? SUPABASE_URL + "/storage/v1/object/public/extension-releases/" + latest.file_path : null;
          banner.innerHTML = spTemplateUpdateBanner(latest.version, latest.changelog, dlUrl);
          banner.style.display = 'block';
        }
      }
    } catch(e) {}
  }

  // --- Reseller Role Check ---
  async function checkResellerRole() {
    try {
      const data = await bgFetch(USER_ROLES_URL + "&user_id=eq." + (await getUserId()), { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
      if (data && Array.isArray(data) && data.some(r => r.role === 'reseller' || r.role === 'admin')) {
        isResellerUser = true;
        const btn = document.getElementById('sp-reseller-btn');
        if (btn) btn.style.display = 'block';
      }
    } catch(e) {}
  }

  async function getUserId() {
    return new Promise(r => chrome.storage.local.get(["ql_license_key"], async res => {
      if (!res.ql_license_key) return r('');
      try {
        const data = await bgFetch(SUPABASE_URL + "/rest/v1/licenses?select=user_id&license_key=eq." + encodeURIComponent(res.ql_license_key) + "&limit=1", { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
        if (data && data.length && data[0].user_id) r(data[0].user_id);
        else r('');
      } catch(e) { r(''); }
    }));
  }

  // --- License Gate ---
  function showLicenseGate() {
    const body = document.getElementById('sp-body');
    body.innerHTML = spTemplateLicenseGate();
    document.getElementById('sp-validate-btn').addEventListener('click', validateLicense);
  }

  async function validateLicense() {
    const input = document.getElementById('sp-license-input');
    const log = document.getElementById('sp-license-log');
    const key = input ? input.value.trim() : '';
    if(!key) { log.className = 'sp-log sp-log-error'; log.textContent = '⚠ Enter a key'; return; }
    log.className = 'sp-log sp-log-info'; log.textContent = '⏳ Validating...';
    try {
      if(!deviceId) deviceId = await getDeviceId();
      const data = await bgFetch(VALIDATE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ license_key: key, device_id: deviceId }) });
      if(data.valid) {
        sessionId = data.session_id; userName = data.user_name; expiresAt = data.expires_at; licenseStatus = data.status;
        chrome.storage.local.set({ ql_license_valid: true, ql_license_key: key, ql_session_id: data.session_id, ql_user_name: data.user_name || null, ql_expires_at: data.expires_at || null, ql_activated_at: data.activated_at || null, ql_license_status: data.status || null, ql_method_version: data.method_version || 'v1' }, () => {
          log.className = 'sp-log sp-log-success'; log.textContent = '\u2713 ' + data.message;
          setTimeout(() => { showMainUI(); startHeartbeat(key); }, 800);
        });
      } else {
        log.className = 'sp-log sp-log-error'; log.textContent = '\u2717 ' + data.message;
      }
    } catch(err) { log.className = 'sp-log sp-log-error'; log.textContent = '✗ Connection error'; }
  }

  // --- Chat History ---
  function loadChatHistory(cb) {
    chrome.storage.local.get([SP_HISTORY_KEY], function(r) {
      spChatHistory = r[SP_HISTORY_KEY] || [];
      if (cb) cb();
    });
  }

  function saveChatHistory() {
    if (spChatHistory.length > SP_MAX_HISTORY) spChatHistory = spChatHistory.slice(-SP_MAX_HISTORY);
    chrome.storage.local.set({ [SP_HISTORY_KEY]: spChatHistory });
  }

  function addToHistory(text, status) {
    spChatHistory.push({ text: text, timestamp: new Date().toISOString(), status: status || 'ok' });
    saveChatHistory();
    updateHistoryBadge();
  }

  function updateHistoryBadge() {
    var badge = document.querySelector('.sp-tab[data-tab="history"] .sp-tab-badge');
    if (badge) badge.textContent = spChatHistory.length;
  }

  function renderHistoryTab() {
    var container = document.getElementById('sp-tab-content');
    if (!container) return;
    container.innerHTML = spTemplateChatHistory(spChatHistory);
    // Scroll to bottom
    var msgs = container.querySelector('.sp-chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    // Clear button
    var clearBtn = document.getElementById('sp-chat-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        spChatHistory = [];
        saveChatHistory();
        renderHistoryTab();
      });
    }
  }

  function renderPromptTab() {
    var container = document.getElementById('sp-tab-content');
    if (!container) return;
    container.innerHTML = spTemplatePromptContent();
  }

  function switchTab(tab) {
    spActiveTab = tab;
    document.querySelectorAll('.sp-tab').forEach(function(t) {
      t.classList.toggle('sp-tab-active', t.getAttribute('data-tab') === tab);
    });
    if (tab === 'history') {
      loadChatHistory(function() { renderHistoryTab(); });
    } else {
      showMainUIContent();
    }
  }

  // --- Main UI ---
  function showMainUI() {
    const greeting = spEscapeHtml(userName || 'User');
    const statusBadge = spTemplateStatusBadge(licenseStatus);
    const body = document.getElementById('sp-body');
    loadChatHistory(function() {
      body.innerHTML = '<div id="sp-update-banner" style="display:none"></div>' +
        '<div class="sp-profile-card">' +
          '<div class="sp-profile-top"><span class="sp-profile-name" id="sp-name">' + greeting + '</span>' + statusBadge + '</div>' +
          '<div class="sp-sync-status" id="sp-sync">⏳ Waiting for sync...</div>' +
          '<div class="sp-trial-countdown" id="sp-countdown" style="display:none"></div>' +
        '</div>' +
        '<div id="sp-reseller-btn" style="display:none;margin-bottom:14px">' +
          '<a href="https://wa.me/8801889067101" target="_blank" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;border:1px solid rgba(168,85,247,0.3);background:rgba(168,85,247,0.06);color:var(--ql-accent);text-decoration:none;font-size:12px;font-weight:700;transition:all 0.2s">' +
            '\ud83d\udcbc Painel do Revendedor<span style="margin-left:auto;font-size:10px;opacity:0.6">\u2192</span>' +
          '</a>' +
        '</div>' +
        spTemplateTabs(spActiveTab, spChatHistory.length) +
        '<div id="sp-tab-content"></div>';

      // Tab click handlers
      document.querySelectorAll('.sp-tab').forEach(function(t) {
        t.addEventListener('click', function() { switchTab(t.getAttribute('data-tab')); });
      });

      // Show active content
      if (spActiveTab === 'history') {
        renderHistoryTab();
      } else {
        showMainUIContent();
      }

      // Sync status
      updateSync();
      requestActiveTabSync(true).then(function(ok) {
        if(ok) setTimeout(updateSync, 150);
      });
      chrome.storage.onChanged.addListener((ch) => { if(ch.lovable_projectId || ch.lovable_token) updateSync(); });

      // Countdown
      updateCountdown();

      // Heartbeat
      chrome.storage.local.get(["ql_license_key","ql_session_id"], r => {
        if(r.ql_license_key) { sessionId = r.ql_session_id || sessionId; startHeartbeat(r.ql_license_key); }
      });

      checkUnread();
      checkForUpdate();
      checkResellerRole();
    });
  }

  function showMainUIContent() {
    var container = document.getElementById('sp-tab-content');
    if (!container) return;
    container.innerHTML =
      '<textarea class="sp-textarea" id="sp-msg" rows="3" placeholder="Type your command..." spellcheck="false"></textarea>' +
      '<div id="sp-attach-preview" class="sp-attach-preview" style="display:none"></div>' +
      '<div class="sp-action-bar">' +
        '<div class="sp-action-left"><label class="sp-toggle"><input type="checkbox" id="sp-modo-plano"><span class="sp-toggle-slider"></span></label><span class="sp-toggle-label">Plan</span></div>' +
        '<div class="sp-action-center">' +
          '<button class="sp-attach-btn" id="sp-attach-btn" title="Attach file">\ud83d\udcce</button>' +
          '<button class="sp-tool-btn" id="sp-optimize" title="Optimize with AI">' + SP_SVG.sparkles + '</button>' +
          '<button class="sp-tool-btn" id="sp-speech" title="Voice">' + SP_SVG.mic + '</button>' +
        '</div>' +
        '<button class="sp-send-btn" id="sp-send">Send</button>' +
      '</div>' +
      '<input type="file" id="sp-file-input" multiple style="display:none" accept="*/*">' +
      '<div class="sp-log" id="sp-log"></div>' +
      '<span class="sp-shortcuts-title">QUICK SHORTCUTS</span>' +
      '<div class="sp-shortcuts-grid" id="sp-chips"></div>' +
      '<button id="sp-remove-watermark" class="sp-watermark-btn">\ud83d\udeab Remove Watermark</button>' +
      '<button id="sp-shield-btn" class="sp-shield-btn">' + SP_SVG.shield + ' <span id="sp-shield-label">Enable Shield</span></button>' +
      '<button id="sp-native-chat-btn" class="sp-shield-btn" style="background:linear-gradient(135deg,rgba(168,85,247,0.12),rgba(124,58,237,0.08));border-color:rgba(168,85,247,0.3);color:var(--ql-accent,#A855F7);margin-top:6px">' + SP_SVG.msgSq + ' <span id="sp-native-chat-label">Use Native Chat</span></button>' +
      '<button id="sp-download-project" class="sp-watermark-btn" style="background:linear-gradient(135deg,rgba(34,211,238,0.12),rgba(124,58,237,0.08));border-color:rgba(34,211,238,0.30);color:#22D3EE;margin-top:6px">\ud83d\udce5 Download All Files</button>' +
      '<button id="sp-create-project" class="sp-watermark-btn" style="background:linear-gradient(135deg,rgba(168,85,247,0.14),rgba(34,211,238,0.08));border-color:rgba(168,85,247,0.35);color:#A855F7;margin-top:6px">\ud83d\ude80 Create Lovable Project</button>' +
      '<button id="sp-publish-project" class="sp-watermark-btn" style="background:linear-gradient(135deg,rgba(236,72,153,0.14),rgba(124,58,237,0.08));border-color:rgba(236,72,153,0.35);color:#EC4899;margin-top:6px">\ud83c\udf10 Publish Project</button>' +
      '<button id="sp-enable-cloud" class="sp-watermark-btn" style="background:linear-gradient(135deg,rgba(56,189,248,0.14),rgba(14,165,233,0.08));border-color:rgba(56,189,248,0.35);color:#38bdf8;margin-top:6px">\u2601\ufe0f Enable Lovable Cloud</button>' +
      '<div id="sp-download-status" class="sp-log" style="display:none"></div>';

    // Setup chips
    const chips = document.getElementById('sp-chips');
    SP_TEMPLATES.forEach(t => {
      const chip = document.createElement('button');
      chip.className = 'sp-chip';
      chip.innerHTML = t.icon + ' ' + t.label;
      chip.title = t.prompt;
      chip.addEventListener('click', () => { document.getElementById('sp-msg').value = t.prompt; });
      chips.appendChild(chip);
    });

    // Plan Mode
    chrome.storage.local.get(["ql_modo_plano"], r => { if(r.ql_modo_plano) document.getElementById('sp-modo-plano').checked = true; });
    document.getElementById('sp-modo-plano').addEventListener('change', function() {
      const checkbox = this;
      chrome.storage.local.set({ ql_modo_plano: checkbox.checked });
    });

    // File attachment
    setupSpFileAttachment();

    // Clipboard paste (Ctrl+V) for images
    setupSpClipboardPaste();

    // Event listeners
    document.getElementById('sp-send').addEventListener('click', handleSend);
    document.getElementById('sp-msg').addEventListener('keydown', function(e) {
      if(e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
      e.preventDefault();
      const sendBtn = document.getElementById('sp-send');
      if(sendBtn && !sendBtn.disabled) sendBtn.click();
    });
    document.getElementById('sp-optimize').addEventListener('click', handleOptimize);
    setupSpSpeech();
    setupSpWatermarkButton();
    setupSpShield();
    setupSpNativeChat();
    setupSpDownloadProject();
    setupSpCreateProject();
    setupSpPublishProject();
    setupSpEnableCloud();
  }

  // --- Speech Recognition (Web Speech API) ---
  function setupSpSpeech() {
    var btn = document.getElementById('sp-speech');
    if (!btn) return;

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      btn.title = "Speech nao suportado neste navegador";
      btn.style.opacity = "0.4";
      btn.style.cursor = "not-allowed";
      return;
    }

    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      if (spIsRecording && spSpeechRecognition) {
        spSpeechRecognition.stop();
        return;
      }

      try {
        spSpeechRecognition = new SpeechRecognition();
        spSpeechRecognition.lang = "en-US";
        spSpeechRecognition.continuous = true;
        spSpeechRecognition.interimResults = true;
        spSpeechRecognition.maxAlternatives = 1;

        var finalTranscript = "";
        var textarea = document.getElementById('sp-msg');

        spSpeechRecognition.onstart = function() {
          spIsRecording = true;
          btn.classList.add('sp-recording');
          btn.style.color = '#A855F7';
          btn.style.animation = 'pulse 1s infinite';
          finalTranscript = textarea ? textarea.value : "";
          console.log("[SP Speech] Gravacao iniciada");
        };

        spSpeechRecognition.onresult = function(event) {
          var interim = "";
          for (var i = event.resultIndex; i < event.results.length; i++) {
            var transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + " ";
            } else {
              interim += transcript;
            }
          }
          if (textarea) textarea.value = finalTranscript + interim;
        };

        spSpeechRecognition.onerror = function(event) {
          console.warn("[SP Speech] Error:", event.error);
          spIsRecording = false;
          btn.classList.remove('sp-recording');
          btn.style.color = '';
          btn.style.animation = '';

          if (event.error === "not-allowed") {
            showAlert("Permission Denied", "Allow microphone access in your browser settings.");
          } else if (event.error === "no-speech") {
            showAlert("No Audio", "No speech detected. Try again.");
          } else if (event.error !== "aborted") {
            showAlert("Voice Error", "Error: " + event.error);
          }
        };

        spSpeechRecognition.onend = function() {
          spIsRecording = false;
          btn.classList.remove('sp-recording');
          btn.style.color = '';
          btn.style.animation = '';
          if (textarea) textarea.value = finalTranscript.trim();
          console.log("[SP Speech] Gravacao finalizada");
        };

        spSpeechRecognition.start();
      } catch(err) {
        console.error("[SP Speech] Failed to start:", err);
        spIsRecording = false;
        btn.classList.remove('sp-recording');
        btn.style.color = '';
        btn.style.animation = '';
        showAlert("Error", "Could not start voice recognition.");
      }
    });
  }

  function updateSync() {
    chrome.storage.local.get(["lovable_projectId","lovable_token"], r => {
      const el = document.getElementById('sp-sync');
      if(!el) return;
      if(r.lovable_projectId && r.lovable_token) {
        el.className = 'sp-sync-status sp-sync-ok';
        el.textContent = '✅ Synced! Project: ' + r.lovable_projectId.substring(0,6) + '...';
      } else {
        el.className = 'sp-sync-status sp-sync-waiting';
        el.textContent = '\u23f3 Waiting for sync...';
        requestActiveTabSync(false).then(function(ok) {
          if(ok) setTimeout(updateSync, 150);
        });
      }
    });
  }

  function requestActiveTabSync(force) {
    if(spSyncRequestInFlight) return Promise.resolve(false);
    const now = Date.now();
    if(!force && now - spLastSyncRequestAt < 2500) return Promise.resolve(false);
    spSyncRequestInFlight = true;
    spLastSyncRequestAt = now;

    return new Promise(function(resolve) {
      function finish(ok) {
        spSyncRequestInFlight = false;
        resolve(!!ok);
      }

      try {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if(chrome.runtime.lastError) return finish(false);
          const tab = tabs && tabs[0];
          const url = tab && tab.url ? tab.url : "";
          if(!tab || !tab.id || !/^https:\/\/([^/]+\.)?lovable\.dev\//i.test(url)) return finish(false);

          chrome.tabs.sendMessage(tab.id, { action: "lovconnectRequestSync" }, function(resp) {
            if(chrome.runtime.lastError) {
              injectContentScriptsForSync(tab.id, function(injected) {
                if(!injected) return finish(false);
                setTimeout(function() {
                  chrome.tabs.sendMessage(tab.id, { action: "lovconnectRequestSync" }, function(retryResp) {
                    if(chrome.runtime.lastError) return finish(false);
                    finish(retryResp && retryResp.ok);
                  });
                }, 500);
              });
              return;
            }
            finish(resp && resp.ok);
          });
        });
      } catch(e) {
        finish(false);
      }
    });
  }

  function injectContentScriptsForSync(tabId, done) {
    try {
      chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ["floating.css"]
      }).catch(function() {}).finally(function() {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["jszip.min.js", "hwFingerprint.js", "sounds.js", "content-templates.js", "content.js"]
        }).then(function() {
          done(true);
        }).catch(function(err) {
          console.warn("[SP] Failed to inject scripts for sync:", err && err.message ? err.message : err);
          done(false);
        });
      });
    } catch(e) {
      done(false);
    }
  }

  // --- Countdown ---
  function updateCountdown() {
    if(!expiresAt) return;
    const el = document.getElementById('sp-countdown');
    if(!el) return;
    el.style.display = 'flex';
    const expiresMs = new Date(expiresAt).getTime();
    const totalDuration = Math.max(expiresMs - Date.now(), 3600000);
    function tick() {
      const remaining = expiresMs - Date.now();
      if(remaining <= 0) { el.innerHTML = '<span style="color:var(--ql-danger);font-weight:600;font-size:12px">\u23f0 License expired</span>'; return; }
      const days = Math.floor(remaining / 86400000);
      const hrs = Math.floor((remaining % 86400000) / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const pct = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));
      let timeStr = days > 0 ? days + 'd ' + hrs + 'h ' + mins + 'm' : hrs > 0 ? hrs + 'h ' + mins + 'm ' + String(secs).padStart(2,'0') + 's' : mins + ':' + String(secs).padStart(2,'0');
      const label = licenseStatus === 'trial' ? 'Trial expires in' : 'Plan expires in';
      const urgentClass = pct < 20 ? ' sp-bar-urgent' : '';
      el.innerHTML = spTemplateCountdown(label, timeStr, pct, urgentClass);
    }
    tick();
    setInterval(tick, 1000);
  }

  // --- JWT Decode ---
  function spDecodeJwtUserId(token) {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      return payload.sub || payload.user_id || null;
    } catch(e) { return null; }
  }

  // --- Image Compression ---
  async function spCompressImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_DIM = 1280;
        let w = img.width, h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob((blob) => {
          if (!blob) return resolve({ file, previewUrl: null });
          resolve({ file: new File([blob], file.name, { type: outputType }), previewUrl: URL.createObjectURL(blob) });
        }, outputType, file.type === 'image/png' ? undefined : 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ file, previewUrl: null }); };
      img.src = url;
    });
  }

  // --- File Upload ---
  function spInferContentType(file) {
    if (file && typeof file.type === 'string' && file.type.trim()) return file.type;
    const name = (file && file.name ? file.name : '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    const map = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
      zip: 'application/zip',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      webm: 'video/webm'
    };
    return map[ext] || 'application/octet-stream';
  }

  function spBuildUploadFileName(fileId, file) {
    const rawName = file && file.name ? String(file.name) : '';
    const ext = rawName.includes('.') ? rawName.split('.').pop().toLowerCase() : '';
    const safeExt = ext && /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
    return fileId + '.' + safeExt;
  }

  function spBlobToBase64(blob) {
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

  async function spUploadFileV2(file, token, projectId) {
    // V2 agora e 100% server-side via proxy-command. Nao fazemos upload aqui;
    // so marcamos o arquivo como "pendente" e enviamos o base64 no send.
    return {
      file_id: "pending_v2_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()),
      file_name: file.name || "file",
      mime_type: (file && file.type) ? file.type : spInferContentType(file),
      method: "v2",
      deferred: true
    };
  }

    async function spUploadFileDirect(file, token, opts) {
    opts = opts || {};
    // Sempre usa o fluxo V2 via proxy-command. O upload direto para Supabase Storage
    // retornava 400 em imagens para algumas contas/projetos.
    return await spUploadFileV2(file, token, opts.projectId || "");
  }

  // --- Attachment Preview ---
  function spRenderAttachPreview() {
    const container = document.getElementById('sp-attach-preview');
    if (!container) return;
    if (spAttachedFiles.length === 0) { container.style.display = 'none'; container.innerHTML = ''; return; }
    container.style.display = 'flex';
    container.innerHTML = spAttachedFiles.map((f, i) => spTemplateAttachItem(f, i)).join('');
    container.querySelectorAll('.sp-attach-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        if (spAttachedFiles[idx] && spAttachedFiles[idx].previewUrl) URL.revokeObjectURL(spAttachedFiles[idx].previewUrl);
        spAttachedFiles.splice(idx, 1);
        spRenderAttachPreview();
      });
    });
  }

  // --- File Attachment Setup ---
  function setupSpFileAttachment() {
    const attachBtn = document.getElementById('sp-attach-btn');
    const fileInput = document.getElementById('sp-file-input');
    if (!attachBtn || !fileInput) return;
    attachBtn.addEventListener('click', () => {
      if (spAttachedFiles.length >= SP_MAX_FILES) { showAlert('Limite', 'M\u00e1ximo ' + SP_MAX_FILES + ' files.'); return; }
      fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      fileInput.value = '';
      if (!files.length) return;
      await spRefreshLovableSession(1500);
      const sd = await new Promise(r => chrome.storage.local.get(['lovable_token','lovable_projectId','ql_method_version'], r));
      let token = sd.lovable_token || '';
      if (!token) { showAlert('Error', 'Token not captured.'); return; }
      if (token.startsWith('Bearer ')) token = token.slice(7);
      const methodVersion = sd.ql_method_version || 'v1';
      const pidForUpload = sd.lovable_projectId || '';
      for (const file of files) {
        if (spAttachedFiles.length >= SP_MAX_FILES) break;
        if (file.size > SP_MAX_FILE_SIZE) { showAlert('Grande', file.name + ' excede 20MB.'); continue; }
        let processedFile = file, previewUrl = null;
        if (['image/png','image/jpeg','image/webp'].includes(file.type)) {
          const r = await spCompressImage(file);
          processedFile = r.file; previewUrl = r.previewUrl;
        }
        const isImage = ['image/png','image/jpeg','image/webp'].includes(processedFile.type);
        const idx = spAttachedFiles.length;
        spAttachedFiles.push({ file_id: null, file_name: file.name, previewUrl, file_type: processedFile.type, sizeLabel: spFormatFileSize(processedFile.size), uploading: true, rawFile: processedFile });
        spRenderAttachPreview();
        try {
          const res = await spUploadFileDirect(processedFile, token, { method: methodVersion, projectId: pidForUpload });
          spAttachedFiles[idx].file_id = res.file_id;
          if (res.public_url) spAttachedFiles[idx].public_url = res.public_url;
          if (res.lovable_url) spAttachedFiles[idx].lovable_url = res.lovable_url;
          if (res.mime_type) spAttachedFiles[idx].mime_type = res.mime_type;
          spAttachedFiles[idx].method = res.method || 'v1';
          spAttachedFiles[idx].uploading = false;
          spRenderAttachPreview();
        } catch(err) {
          console.warn('[QL] Supabase Storage upload failed:', err.message);
          spAttachedFiles[idx].uploading = false;
          spAttachedFiles[idx].uploadFailed = true;
          spRenderAttachPreview();
          showAlert('Upload error', 'Could not upload the image: ' + (err.message || 'unknown error'));
        }
      }
    });
  }

  // --- Plan Mode Alert ---
  function showModoPlanoAlert() {
    const overlay = document.createElement('div');
    overlay.className = 'sp-modal-overlay';
    overlay.innerHTML = '<div class="sp-modal">' +
      '<div class="sp-modal-icon">\u26a0\ufe0f</div>' +
      '<div class="sp-modal-title">Attention \u2014 Plan Mode</div>' +
      '<div class="sp-modal-body">' +
        '<strong>Plan Mode</strong> may consume credits, but it can be very helpful. Use it carefully!' +
      '</div>' +
      '<div style="margin-bottom:14px;">' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">1</span><span class="sp-modal-step-text">Enable <strong>Plan Mode</strong> and send your prompt through the extension.</span></div>' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">2</span><span class="sp-modal-step-text">Lovable will generate a plan. <strong>Do NOT click the "Approve" button</strong> inside Lovable.</span></div>' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">3</span><span class="sp-modal-step-text"><strong>Copy the generated plan</strong> and paste it into the extension prompt field.</span></div>' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">4</span><span class="sp-modal-step-text"><strong>Turn off Plan Mode</strong> and send the prompt through the extension. No extra credits will be consumed!</span></div>' +
      '</div>' +
      '<div class="sp-modal-check">' +
        '<input type="checkbox" id="sp-modal-dismiss" />' +
        '<label for="sp-modal-dismiss">Do not show again</label>' +
      '</div>' +
      '<button class="sp-modal-btn" id="sp-modal-ok">Got it!</button>' +
    '</div>';
    document.body.appendChild(overlay);
    document.getElementById('sp-modal-ok').addEventListener('click', function() {
      var dismiss = document.getElementById('sp-modal-dismiss').checked;
      if (dismiss) chrome.storage.local.set({ ql_modo_plano_alert_dismissed: true });
      overlay.remove();
    });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  }

  var REMOVE_WATERMARK_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/remove-watermark";
  var PUBLISH_PROJECT_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/publish-project";
  var ENABLE_CLOUD_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/enable-cloud";

  function showSpPublishedUrlModal(url){
    var existing = document.getElementById("sp-publish-modal");
    if(existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "sp-publish-modal";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)";
    overlay.innerHTML =
      '<div style="background:#111113;border:1px solid rgba(236,72,153,0.35);border-radius:16px;padding:20px;max-width:340px;width:90%;box-shadow:0 24px 80px -12px rgba(0,0,0,0.8)">' +
        '<div style="font-size:28px;text-align:center;margin-bottom:6px">\ud83c\udf89</div>' +
        '<h3 style="margin:0 0 6px;color:#EC4899;font-size:16px;font-weight:700;text-align:center">Project Published!</h3>' +
        '<p style="margin:0 0 14px;color:#a1a1aa;font-size:12px;text-align:center">Acesse seu projeto pelo link abaixo:</p>' +
        '<div style="background:#0a0a0b;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px;margin-bottom:14px;word-break:break-all"><a href="' + url + '" target="_blank" style="color:#22D3EE;text-decoration:none;font-size:12px">' + url + '</a></div>' +
        '<div style="display:flex;gap:6px">' +
          '<button id="sp-publish-copy" style="flex:1;padding:8px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#f4f4f5;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600">\ud83d\udccb Copy</button>' +
          '<button id="sp-publish-open" style="flex:1;padding:8px;border:none;background:linear-gradient(135deg,#EC4899,#d97706);color:#fff;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700">\ud83d\udd17 Open</button>' +
        '</div>' +
        '<button id="sp-publish-close" style="width:100%;margin-top:6px;padding:6px;border:none;background:transparent;color:#71717a;cursor:pointer;font-size:11px">Close</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("sp-publish-copy").addEventListener("click", function(){
      navigator.clipboard.writeText(url);
      this.textContent = "\u2713 Copied!";
    });
    document.getElementById("sp-publish-open").addEventListener("click", function(){ window.open(url, "_blank"); });
    document.getElementById("sp-publish-close").addEventListener("click", function(){ overlay.remove(); });
    overlay.addEventListener("click", function(e){ if(e.target === overlay) overlay.remove(); });
  }

  function setupSpPublishProject(){
    var btn = document.getElementById("sp-publish-project");
    if(!btn) return;
    btn.addEventListener("click", async function(){
      var log = document.getElementById("sp-log");
      btn.disabled = true;
      btn.textContent = "\u23f3 Publicando...";

      try {
        var sd = await new Promise(function(r){ chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key"], r); });
        var token = sd.lovable_token || "";
        var pid = sd.lovable_projectId || "";
        var licKey = sd.ql_license_key || "";

        if(!pid || !token){
          log.className = "sp-log sp-log-error";
          log.textContent = "⚠ Project not synced.";
          btn.disabled = false;
          btn.textContent = "\ud83c\udf10 Publish Project";
          return;
        }

        if(token.startsWith("Bearer ")) token = token.slice(7);

        var result = await bgFetch(PUBLISH_PROJECT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ license_key: licKey, token_lovable: token, project_id: pid })
        });

        if(result && result.success === false){
          throw new Error(result.error_display || result.message || "Publish error");
        }

        log.className = "sp-log sp-log-success";
        log.textContent = "✓ Project published!";
        if(result && result.url) showSpPublishedUrlModal(result.url);
      } catch(err) {
        log.className = "sp-log sp-log-error";
        log.textContent = "\u2717 " + (err.message || err);
      } finally {
        btn.disabled = false;
        btn.textContent = "\ud83c\udf10 Publish Project";
      }
    });
  }

  function setupSpEnableCloud(){
    var btn = document.getElementById("sp-enable-cloud");
    if(!btn) return;
    btn.addEventListener("click", async function(){
      var log = document.getElementById("sp-log");
      btn.disabled = true;
      btn.textContent = "⏳ Enabling Cloud...";

      try {
        var sd = await new Promise(function(r){ chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key"], r); });
        var token = sd.lovable_token || "";
        var pid = sd.lovable_projectId || "";
        var licKey = sd.ql_license_key || "";

        if(!pid || !token){
          log.className = "sp-log sp-log-error";
          log.textContent = "⚠ Project not synced.";
          btn.disabled = false;
          btn.textContent = "\u2601\ufe0f Enable Lovable Cloud";
          return;
        }

        if(token.startsWith("Bearer ")) token = token.slice(7);

        var result = await bgFetch(ENABLE_CLOUD_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ license_key: licKey, token_lovable: token, project_id: pid, region: "america" })
        });

        if(result && result.success === false){
          throw new Error(result.error_display || result.message || "Cloud activation error");
        }

        log.className = "sp-log sp-log-success";
        log.textContent = "\u2713 " + (result && result.message ? result.message : "Lovable Cloud enabled!");
      } catch(err) {
        log.className = "sp-log sp-log-error";
        log.textContent = "\u2717 " + (err.message || err);
      } finally {
        btn.disabled = false;
        btn.textContent = "\u2601\ufe0f Enable Lovable Cloud";
      }
    });
  }

  function setupSpWatermarkButton(){
    var btn = document.getElementById("sp-remove-watermark");
    if(!btn) return;
    btn.addEventListener("click", async function(){
      var log = document.getElementById("sp-log");
      btn.disabled = true;
      log.className = 'sp-log sp-log-info'; log.textContent = '\u23f3 Sending...';

      try {
        var sd = await new Promise(function(r){ chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key"], r); });
        var token = sd.lovable_token || "";
        var pid = sd.lovable_projectId || "";
        var licKey = sd.ql_license_key || "";

        if(!pid || !token){
          log.className = "sp-log sp-log-error";
          log.textContent = "⚠ Project not synced.";
          btn.disabled = false;
          btn.textContent = "\ud83d\udeab Remove Watermark";
          return;
        }

        if(token.startsWith("Bearer ")) token = token.slice(7);

        var payload = {
          license_key: licKey,
          token_lovable: token,
          project_id: pid
        };

        var result = await bgFetch(REMOVE_WATERMARK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify(payload)
        });

        if(result && result.success === false){
          throw new Error(result.error_display || result.message || "Send error");
        }

        log.className = "sp-log sp-log-success";
        log.textContent = "✓ Watermark removed successfully!";
      } catch(err) {
        log.className = "sp-log sp-log-error";
        log.textContent = "\u2717 " + (err.message || err);
      } finally {
        btn.disabled = false;
          btn.textContent = "\ud83d\udeab Remove Watermark";
      }
    });
  }

  // --- Send Message ---
  async function handleSend() {
    const msg = document.getElementById('sp-msg').value.trim();
    const modoPlano = document.getElementById('sp-modo-plano').checked;
    const log = document.getElementById('sp-log');
    const btn = document.getElementById('sp-send');
    if(!msg) { log.className = 'sp-log sp-log-error'; log.textContent = '\u26a0 Prompt is empty'; return; }
    btn.disabled = true; btn.textContent = '\u23f3';

    const v1UploadedSp = spAttachedFiles.filter(function(f) { return f.public_url && !f.uploading && !f.uploadFailed && (f.method || 'v1') === 'v1'; });
    const v2PendingSp = spAttachedFiles.filter(function(f) { return f.method === 'v2' && !f.uploading && !f.uploadFailed && f.rawFile; });
    const hasImage = v1UploadedSp.length > 0 || v2PendingSp.length > 0;
    var finalMsg = msg;
    if (v1UploadedSp.length > 0) {
      var linkLines = v1UploadedSp.map(function(f) { return f.public_url; }).join('\n');
      var sep = v1UploadedSp.length > 1 ? 'Analyze the files in the links:\n' : 'Analyze the file at this link: ';
      finalMsg = msg + '\n\n' + sep + linkLines;
    }

    if (hasImage) {
      log.className = 'sp-log sp-log-info'; log.textContent = '\ud83d\udcce Attaching image link...';
    } else {
      log.className = 'sp-log sp-log-info'; log.textContent = '\u23f3 Sending...';
    }

    try {
      const sd = await new Promise(r => chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key","ql_session_id","lovable_browserSessionId"], r));
      let token = sd.lovable_token || ''; const pid = sd.lovable_projectId || ''; const licKey = sd.ql_license_key || '';
      const bsess = sd.lovable_browserSessionId || '';
      if(!pid || !token) { log.className = 'sp-log sp-log-error'; log.textContent = '\u26a0 Project not synced'; btn.disabled = false; btn.textContent = 'Send'; return; }
      if(token.startsWith('Bearer ')) token = token.slice(7);

      // Build payload for proxy-command (handles everything server-side)
      const payload = {
        license_key: licKey,
        session_id: sessionId,
        projeto_id: pid,
        token_lovable: token,
        mensagem: finalMsg,
        modo_pensar: modoPlano,
        device_id: deviceId,
        browser_session_id: bsess
      };

      if (v2PendingSp.length > 0) {
        // Forward the bytes as base64; proxy-command handles the full V2 upload.
        const ufs = [];
        for (let i = 0; i < v2PendingSp.length; i++) {
          const f = v2PendingSp[i];
          try {
            const b64 = await spBlobToBase64(f.rawFile);
            ufs.push({
              file_data: b64,
              file_name: f.file_name || ('file_' + i),
              file_type: f.mime_type || f.file_type || 'application/octet-stream'
            });
          } catch(e) { console.warn('[QL] base64 failed:', e); }
        }
        if (ufs.length > 0) payload.upload_files = ufs;
      }

      // Per-device fingerprint headers (UA + sec-ch-ua + cookies)
      payload.session_headers = await buildSessionHeaders(pid);

      const result = await bgFetch(PROXY_COMMAND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify(payload)
      });

      if (result && result.success === false) {
        throw new Error(result.error_display || result.message || "Send error");
      }

      const apiData = result.data || result;
      const msgId = apiData.ai_message_id_usado || '';
      log.className = 'sp-log sp-log-success';
      if (hasImage) {
        log.textContent = '✓ Prompt sent! valid image 😁';
      } else {
        log.textContent = '\u2713 Prompt sent!';
      }
      if (msgId) console.log('[QL] API message ID:', msgId);

      // Save to chat history
      addToHistory(msg, 'ok');

      document.getElementById('sp-msg').value = '';
      spAttachedFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      spAttachedFiles = [];
      spRenderAttachPreview();
    } catch(err) { log.className = 'sp-log sp-log-error'; log.textContent = '\u2717 ' + (err.message || err); addToHistory(msg, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Send'; }
  }

  // --- Optimize Prompt ---
  async function handleOptimize() {
    const textarea = document.getElementById('sp-msg');
    const btn = document.getElementById('sp-optimize');
    if(!textarea || !textarea.value.trim()) { showAlert('Attention', 'Type a prompt before optimizing.'); return; }
    btn.classList.add('sp-tool-loading'); btn.disabled = true;
    try {
      const sd = await new Promise(r => chrome.storage.local.get(["ql_license_key"], r));
      const data = await bgFetch(OPTIMIZE_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, "x-license-key": sd.ql_license_key || "" }, body: JSON.stringify({ prompt: textarea.value.trim() }) });
      if(data.optimized_prompt) { textarea.value = data.optimized_prompt; showAlert('Prompt Optimized! ✨', 'Seu prompt foi aprimorado com IA.'); }
      else if(data.error) showAlert('Error', data.error);
    } catch(err) { showAlert('Error', 'Failed to optimize: ' + (err.message || '')); }
    finally { btn.classList.remove('sp-tool-loading'); btn.disabled = false; }
  }

  // --- Heartbeat ---
  function startHeartbeat(key) {
    if(heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          clearInterval(heartbeatInterval);
          console.warn("[SP] Heartbeat stopped: extension context invalidated");
          return;
        }
        const data = await bgFetch(VALIDATE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ license_key: key, session_id: sessionId, heartbeat: true, device_id: deviceId }) });
        if(!data.valid) {
          clearInterval(heartbeatInterval);
          chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => showLicenseGate());
          if(data.reason === 'device_conflict') setTimeout(() => showAlert('Access Denied', data.message), 500);
          return;
        }
        if(data.user_name) { userName = data.user_name; const el = document.getElementById('sp-name'); if(el) el.textContent = data.user_name; }
        if(data.expires_at) expiresAt = data.expires_at;
        if(data.status) licenseStatus = data.status;
        if(data.method_version) chrome.storage.local.set({ ql_method_version: data.method_version });
      } catch(e) {
        if (e.message && e.message.includes("Extension context invalidated")) {
          clearInterval(heartbeatInterval);
          console.warn("[SP] Heartbeat stopped: extension context invalidated");
        }
      }
    }, 60000);
  }

  // --- Clipboard Paste (Ctrl+V) & Drag-and-Drop for ANY Files ---
  function setupSpClipboardPaste() {
    var textarea = document.getElementById('sp-msg');
    if (!textarea) return;

    // --- Drag and Drop ---
    var dropZone = document.getElementById('sp-body') || textarea;
    var dragOverlay = null;

    function showDragOverlay() {
      if (dragOverlay) return;
      dragOverlay = document.createElement('div');
      dragOverlay.className = 'sp-drag-overlay';
      dragOverlay.innerHTML = '<div class="sp-drag-overlay-inner">\ud83d\udcc2 Drop files here</div>';
      document.body.appendChild(dragOverlay);
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
      await spHandleFilesAttach(files);
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
      if (filesToAttach.length > 0) await spHandleFilesAttach(filesToAttach);
    });
  }

  async function spHandleFilesAttach(files) {
    if (spAttachedFiles.length >= SP_MAX_FILES) {
      if (spAttachedFiles.length >= SP_MAX_FILES) { showAlert('Limite', 'M\u00e1ximo ' + SP_MAX_FILES + ' files.'); return; }
      return;
    }
    await spRefreshLovableSession(1500);
    var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token','lovable_projectId','ql_method_version'], r); });
    var token = sd.lovable_token || '';
      if (!token) { showAlert('Error', 'Token not captured.'); return; }
    if (token.indexOf('Bearer ') === 0) token = token.slice(7);
    var methodVersion = sd.ql_method_version || 'v1';
    var pidForUpload = sd.lovable_projectId || '';

    for (var fi = 0; fi < files.length; fi++) {
      var file = files[fi];
      if (spAttachedFiles.length >= SP_MAX_FILES) break;
      if (file.size > SP_MAX_FILE_SIZE) { showAlert('Grande', file.name + ' excede 20MB.'); continue; }

      var processedFile = file;
      var previewUrl = null;
      if (['image/png','image/jpeg','image/webp'].indexOf(file.type) >= 0) {
        var compressed = await spCompressImage(file);
        processedFile = compressed.file;
        previewUrl = compressed.previewUrl;
      }

      var idx = spAttachedFiles.length;
      spAttachedFiles.push({
        file_id: null,
        file_name: file.name || ('file_' + Date.now()),
        previewUrl: previewUrl,
        file_type: processedFile.type,
        sizeLabel: spFormatFileSize(processedFile.size),
        uploading: true,
        rawFile: processedFile
      });
      spRenderAttachPreview();

      try {
        var res = await spUploadFileDirect(processedFile, token, { method: methodVersion, projectId: pidForUpload });
        spAttachedFiles[idx].file_id = res.file_id;
        if (res.public_url) spAttachedFiles[idx].public_url = res.public_url;
        if (res.lovable_url) spAttachedFiles[idx].lovable_url = res.lovable_url;
        if (res.mime_type) spAttachedFiles[idx].mime_type = res.mime_type;
        spAttachedFiles[idx].method = res.method || 'v1';
        spAttachedFiles[idx].uploading = false;
        spRenderAttachPreview();
      } catch(err) {
        spAttachedFiles[idx].uploading = false;
        spAttachedFiles[idx].uploadFailed = true;
        spRenderAttachPreview();
          showAlert('Upload error', 'Could not upload the image: ' + (err.message || 'unknown error'));
      }
    }
    showAlert('Attached 📎', files.length + ' file(s) added!');
  }

  // --- Download All Project Files ---
  function setupSpDownloadProject() {
    var btn = document.getElementById('sp-download-project');
    if (!btn) return;
    btn.addEventListener('click', async function() {
      var statusEl = document.getElementById('sp-download-status');
      btn.disabled = true;
      btn.textContent = '\ud83d\udd04 Preparando...';
      if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'sp-log sp-log-info'; statusEl.textContent = '\ud83d\udd0d Checking token and project...'; }

      try {
        // ---- Feature flag gate ----
        try {
          var flagUrl = SUPABASE_URL + "/rest/v1/feature_flags?select=enabled&flag_key=eq.download_files";
          var flagResp = await fetch(flagUrl, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
          if (flagResp.ok) {
            var flagRows = await flagResp.json();
            if (flagRows && flagRows.length > 0 && flagRows[0].enabled === false) {
              throw new Error('Error using extension features.');
            }
          }
        } catch (flagErr) {
          if (flagErr && flagErr.message === 'Error using extension features.') throw flagErr;
        }

        // Get synced token and project ID from storage (already captured by content script)
        var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'lovable_projectId'], r); });
        var authToken = sd.lovable_token || '';
        var storedProjectId = sd.lovable_projectId || '';

        if (authToken.indexOf('Bearer ') === 0) authToken = authToken.slice(7);

        // Get current tab to extract project ID
        var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        var currentTab = tabs[0];
        var projectId = storedProjectId;

        if (!projectId && currentTab && currentTab.url) {
          var urlMatch = currentTab.url.match(/\/projects\/([a-f0-9-]+)/);
          if (urlMatch) projectId = urlMatch[1];
        }

        if (!projectId) {
          throw new Error('Open a Lovable project page first.');
        }

        if (!authToken) {
          // Fallback: try cookies
          if (statusEl) statusEl.textContent = '\ud83d\udd04 Trying via cookies...';
          var cookieResponse = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: "readCookies" }, function(resp) { resolve(resp); });
          });
          if (cookieResponse && cookieResponse.success && cookieResponse.tokens && cookieResponse.tokens.length > 0) {
            authToken = cookieResponse.tokens[0].token;
          }
        }

        if (!authToken) {
        if (!authToken) throw new Error('Open lovable.dev in another tab and wait for sync.');
        }

        // Download project
        if (statusEl) { statusEl.textContent = '\ud83d\udce1 Downloading project files...'; }
        btn.textContent = '📡 Downloading...';

        var dlResponse = await new Promise(function(resolve) {
          chrome.runtime.sendMessage({ action: "downloadProject", projectId: projectId, token: authToken }, function(resp) { resolve(resp); });
        });

        if (!dlResponse || !dlResponse.success) {
          throw new Error(dlResponse && dlResponse.error ? dlResponse.error : 'Download failed');
        }

        var files = dlResponse.files;
        if (!files || files.length === 0) throw new Error('No files found in the project.');

        // Create ZIP
        if (statusEl) statusEl.textContent = '📦 Creating ZIP with ' + files.length + ' files...';
        btn.textContent = '📦 Packaging...';

        if (typeof JSZip === 'undefined') throw new Error('JSZip library not loaded.');
        var zip = new JSZip();
        var imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff'];
        var addedFiles = 0;

        for (var fi = 0; fi < files.length; fi++) {
          var f = files[fi];
          if (!f.name) continue;
          if (f.sizeExceeded) continue;

          if (f.contents && f.binary) {
            zip.file(f.name, f.contents, { base64: true, binary: true });
            addedFiles++;
          } else if (!f.contents && imageExts.some(function(ext) { return f.name.toLowerCase().indexOf(ext, f.name.length - ext.length) !== -1; })) {
            try {
              var encodedPath = encodeURIComponent(f.name);
              var imgUrl = 'https://api.lovable.dev/projects/' + projectId + '/files/raw?path=' + encodedPath;
              var imgResp = await fetch(imgUrl, {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + authToken, 'Accept': '*/*' },
                credentials: 'omit',
                mode: 'cors'
              });
              if (imgResp.ok) {
                var ab = await imgResp.arrayBuffer();
                zip.file(f.name, ab, { binary: true });
                addedFiles++;
              } else if (f.contents) {
                zip.file(f.name, f.contents);
                addedFiles++;
              }
            } catch(imgErr) {
              if (f.contents) { zip.file(f.name, f.contents); addedFiles++; }
            }
          } else if (f.contents) {
            zip.file(f.name, f.contents);
            addedFiles++;
          }
        }

        if (statusEl) statusEl.textContent = '🗜️ Compressing ' + addedFiles + ' files...';
        var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
        var timestamp = new Date().toISOString().split('T')[0];
        var zipName = 'lovable-' + projectId.substring(0, 8) + '-' + timestamp + '.zip';

        var url = URL.createObjectURL(zipBlob);
        var a = document.createElement('a');
        a.href = url;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (statusEl) { statusEl.className = 'sp-log sp-log-success'; statusEl.textContent = '\u2705 ' + addedFiles + ' files downloaded successfully!'; }
        btn.textContent = '✅ Download Complete!';
        setTimeout(function() {
          btn.textContent = '\ud83d\udce5 Download All Files';
          btn.disabled = false;
          if (statusEl) statusEl.style.display = 'none';
        }, 4000);
      } catch(err) {
        if (statusEl) { statusEl.className = 'sp-log sp-log-error'; statusEl.textContent = '\u274c ' + (err.message || err); statusEl.style.display = 'block'; }
        btn.textContent = '\u274c Failed';
        setTimeout(function() {
          btn.textContent = '\ud83d\udce5 Download All Files';
          btn.disabled = false;
        }, 3000);
      }
    });
  }

  // --- Initialize ---
  (async function init() {
    deviceId = await getDeviceId();
    chrome.storage.local.get(["ql_dark_mode"], r => { if(r.ql_dark_mode === false) document.body.classList.add('sp-light'); });
    chrome.storage.local.get(["ql_license_valid","ql_license_key","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status","ql_session_id"], async (res) => {
      if(res.ql_license_valid) {
        userName = res.ql_user_name || null;
        expiresAt = res.ql_expires_at || null;
        licenseStatus = res.ql_license_status || null;
        sessionId = res.ql_session_id || null;
        showMainUI();
        if(res.ql_license_key) {
          try {
            const data = await bgFetch(VALIDATE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ license_key: res.ql_license_key, session_id: sessionId, heartbeat: true, device_id: deviceId }) });
            if(data.valid) {
              userName = data.user_name || userName; expiresAt = data.expires_at || expiresAt; licenseStatus = data.status || licenseStatus; sessionId = data.session_id || sessionId;
              chrome.storage.local.set({ ql_user_name: userName, ql_expires_at: expiresAt, ql_license_status: licenseStatus, ql_session_id: sessionId, ql_method_version: data.method_version || 'v1' });
              const nameEl = document.getElementById('sp-name'); if(nameEl) nameEl.textContent = userName || 'User';
              updateCountdown();
            } else {
              chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"]);
              showLicenseGate();
              if(data.reason === 'device_conflict') setTimeout(() => showAlert('Access Denied', data.message), 500);
            }
          } catch(e) {}
        }
      } else {
        showLicenseGate();
      }
    });
  })();

  // ===== SHIELD SYSTEM (Sidebar) =====
  let spShieldActive = false;

  function setupSpShield() {
    const btn = document.getElementById('sp-shield-btn');
    if (!btn) return;

    chrome.storage.local.get(['ql_shield_active'], (res) => {
      if (res.ql_shield_active === true) {
        spShieldActive = true;
        btn.classList.add('sp-shield-active');
        const label = document.getElementById('sp-shield-label');
        if (label) label.textContent = 'Disable Shield';
        injectSpShieldOverlay();
      }
    });

    btn.addEventListener('click', () => {
      spShieldActive = !spShieldActive;
      chrome.storage.local.set({ ql_shield_active: spShieldActive });

      const label = document.getElementById('sp-shield-label');
      if (spShieldActive) {
        btn.classList.add('sp-shield-active');
        if (label) label.textContent = 'Disable Shield';
        injectSpShieldOverlay();
        showAlert('Shield Enabled 🛡️', 'The Lovable input is blocked.');
      } else {
        btn.classList.remove('sp-shield-active');
        if (label) label.textContent = 'Enable Shield';
        removeSpShieldOverlay();
        showAlert('Shield Disabled', 'The Lovable input is available.');
      }
    });
  }

  function injectSpShieldOverlay() {
    // Send message to content script to inject shield
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: function() {
            if (document.getElementById('ql-shield-overlay')) return;
            const chatForm = document.querySelector('form#chat-input');
            if (!chatForm) return;
            const existingPos = getComputedStyle(chatForm).position;
            if (existingPos === 'static') chatForm.style.position = 'relative';
            const overlay = document.createElement('div');
            overlay.id = 'ql-shield-overlay';
            overlay.style.cssText = 'position:absolute;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border-radius:24px;background:rgba(10,10,11,0.88);backdrop-filter:blur(8px);border:1.5px solid rgba(168,85,247,0.35);box-shadow:0 0 40px -8px rgba(168,85,247,0.28);cursor:not-allowed;pointer-events:all;';
            overlay.innerHTML = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#A855F7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 12px rgba(168,85,247,0.55))"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span style="color:#22D3EE;font-size:13px;font-weight:600;font-family:Inter,sans-serif">\ud83d\udee1\ufe0f Protected by VibeX Academy</span><span style="color:#bfc0c2;font-size:10px;font-family:Inter,sans-serif">Use the extension to send prompts</span>';
            ['click','mousedown','keydown'].forEach(ev => overlay.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }, true));
            chatForm.appendChild(overlay);
            chatForm.querySelectorAll('input,button,textarea,[contenteditable]').forEach(el => {
              if (el.id === 'ql-shield-overlay') return;
              el.dataset.qlShieldDisabled = el.disabled || '';
              el.setAttribute('tabindex', '-1');
              if (el.tagName !== 'DIV') el.disabled = true;
              if (el.contentEditable === 'true') { el.contentEditable = 'false'; el.dataset.qlShieldEditable = 'true'; }
            });
          }
        }).catch(() => {});
      }
    });
  }

  function removeSpShieldOverlay() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: function() {
            const overlay = document.getElementById('ql-shield-overlay');
            if (overlay) overlay.remove();
            const chatForm = document.querySelector('form#chat-input');
            if (!chatForm) return;
            chatForm.querySelectorAll('[data-ql-shield-disabled]').forEach(el => {
              const wasDis = el.dataset.qlShieldDisabled;
              if (wasDis === 'true') el.disabled = true;
              else el.disabled = false;
              delete el.dataset.qlShieldDisabled;
              el.removeAttribute('tabindex');
              if (el.dataset.qlShieldEditable === 'true') { el.contentEditable = 'true'; delete el.dataset.qlShieldEditable; }
            });
          }
        }).catch(() => {});
      }
    });
  }

  // ===== NATIVE CHAT MODE (Sidebar) =====
  var spNativeChatActive = false;

  function setupSpNativeChat() {
    var btn = document.getElementById('sp-native-chat-btn');
    if (!btn) return;

    chrome.storage.local.get(['ql_native_chat'], function(res) {
      if (res.ql_native_chat === true) {
        spNativeChatActive = true;
        btn.style.background = 'linear-gradient(135deg,rgba(34,211,238,0.15),rgba(124,58,237,0.10))';
        btn.style.borderColor = 'rgba(34,211,238,0.40)';
        btn.style.color = '#A855F7';
        var label = document.getElementById('sp-native-chat-label');
        if (label) label.textContent = 'Back to Extension';
      }
    });

    btn.addEventListener('click', function() {
      spNativeChatActive = !spNativeChatActive;
      chrome.storage.local.set({ ql_native_chat: spNativeChatActive });

      var label = document.getElementById('sp-native-chat-label');
      if (spNativeChatActive) {
        btn.style.background = 'linear-gradient(135deg,rgba(34,211,238,0.15),rgba(124,58,237,0.10))';
        btn.style.borderColor = 'rgba(34,211,238,0.40)';
        btn.style.color = '#A855F7';
        if (label) label.textContent = 'Back to Extension';
        sendNativeChatCommand('activate');
        showAlert('Native Chat Enabled 💬', 'Use the native Lovable input with the extension features.');
      } else {
        btn.style.background = 'linear-gradient(135deg,rgba(168,85,247,0.12),rgba(124,58,237,0.08))';
        btn.style.borderColor = 'rgba(168,85,247,0.3)';
        btn.style.color = 'var(--ql-accent,#A855F7)';
        if (label) label.textContent = 'Use Native Chat';
        sendNativeChatCommand('deactivate');
        showAlert('Native Chat Disabled', 'Returned to extension mode.');
      }
    });
  }

  // Envia comando para o content-script real (paridade total com o popup).
  function sendNativeChatCommand(cmd) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0] || !tabs[0].id) return;
      try {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ql_native_chat_' + cmd }, function() {
          // Ignora erros (ex.: aba sem content-script)
          void chrome.runtime.lastError;
        });
      } catch (e) { /* noop */ }
    });
  }

  function setupSpCreateProject() {
    var btn = document.getElementById('sp-create-project');
    if (!btn) return;
    btn.addEventListener('click', async function() {
      var statusEl = document.getElementById('sp-download-status');
      var originalLabel = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Creating project...';
      if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'sp-log'; statusEl.textContent = 'Preparing creation...'; }
      try {
        var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'ql_license_key'], r); });
        var authToken = sd.lovable_token || '';
        var licenseKey = sd.ql_license_key || '';
        if (authToken.indexOf('Bearer ') === 0) authToken = authToken.slice(7);
        if (!licenseKey) throw new Error('License not found.');
        if (!authToken) {
          var cookieResponse = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: 'readCookies' }, function(resp) { resolve(resp); });
          });
          if (cookieResponse && cookieResponse.success && cookieResponse.tokens && cookieResponse.tokens.length > 0) {
            authToken = cookieResponse.tokens[0].token;
          }
        }
        if (!authToken) throw new Error('Open lovable.dev in another tab and wait for sync.');

        if (statusEl) statusEl.textContent = 'Requesting creation on the server...';
        var resp = await fetch(SUPABASE_URL + '/functions/v1/create-lovable-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ license_key: licenseKey, token_lovable: authToken })
        });
        var data = await resp.json();
        if (!data || !data.success || !data.link) {
          throw new Error((data && data.error_display) || 'Failed to create project');
        }
        if (statusEl) statusEl.textContent = '✅ Project created! Opening...';
        btn.textContent = '✅ Success!';
        setTimeout(function(){
          try { chrome.tabs.create({ url: data.link, active: true }); }
          catch(e) { window.open(data.link, '_blank'); }
          btn.disabled = false;
          btn.innerHTML = originalLabel;
        }, 500);
      } catch(err) {
        console.error('[SpCreateProject]', err);
        if (statusEl) statusEl.textContent = '\u274c ' + (err.message || 'Error');
        btn.disabled = false;
        btn.innerHTML = originalLabel;
      }
    });
  }

})();
