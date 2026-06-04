// ============================================================
// TechVai - Lovable Extension - Side Panel Logic
// Fully offline - no server dependency
// ============================================================

(function(){
  // ---- Offline license validation ----
  // Any key starting with "TECHVAI-" is accepted as lifetime.
  // The built-in key below always works without user input.
  const BUILTIN_LICENSE_KEY = "TECHVAI-LIFETIME-UNLOCKED";

  function isValidLicenseKey(key) {
    if (!key) return false;
    var k = String(key).trim().toUpperCase();
    return k === BUILTIN_LICENSE_KEY || k.startsWith("TECHVAI-");
  }

  let userName = "User", expiresAt = null, licenseStatus = "pro";
  let spSpeechRecognition = null, spIsRecording = false;
  let spAttachedFiles = [];
  let spActiveTab = 'prompt';
  let spChatHistory = [];
  let spSyncRequestInFlight = false;
  let spLastSyncRequestAt = 0;
  const SP_MAX_FILES = 15;
  const SP_MAX_FILE_SIZE = 20 * 1024 * 1024;
  const SP_HISTORY_KEY = 'ql_chat_history';
  const SP_MAX_HISTORY = 200;

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

  // --- Direct fetch to Lovable API (no proxy server needed) ---
  function lovableFetch(url, opts) {
    opts = opts || {};
    return new Promise(function(resolve, reject) {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return reject(new Error("Extension context invalidated"));
        chrome.runtime.sendMessage({
          action: "proxyFetch",
          url: url,
          method: opts.method || "POST",
          headers: opts.headers || {},
          body: opts.body || null
        }, function(resp) {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp) return reject(new Error("No response"));
          if (resp.data && typeof resp.data === "object") resolve(resp.data);
          else if (!resp.ok) reject(new Error("Fetch failed (" + resp.status + ")"));
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
      showToast('Lite Mode', enabled ? 'Animations reduced.' : 'Animations restored.', 'info');
    });
  }

  // --- License Gate ---
  function showLicenseGate() {
    const body = document.getElementById('sp-body');
    body.innerHTML = spTemplateLicenseGate();
    document.getElementById('sp-validate-btn').addEventListener('click', validateLicense);
  }

  function validateLicense() {
    const input = document.getElementById('sp-license-input');
    const log = document.getElementById('sp-license-log');
    const key = input ? input.value.trim() : '';
    if(!key) { log.className = 'sp-log sp-log-error'; log.textContent = 'Enter a key'; return; }
    if(!isValidLicenseKey(key)) {
      log.className = 'sp-log sp-log-error'; log.textContent = 'Invalid license key';
      return;
    }
    log.className = 'sp-log sp-log-success'; log.textContent = 'License activated!';
    chrome.storage.local.set({
      ql_license_valid: true,
      ql_license_key: key,
      ql_user_name: 'User',
      ql_license_status: 'pro'
    }, () => {
      setTimeout(() => showMainUI(), 600);
    });
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
    var msgs = container.querySelector('.sp-chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    var clearBtn = document.getElementById('sp-chat-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        spChatHistory = [];
        saveChatHistory();
        renderHistoryTab();
      });
    }
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
          '<div class="sp-sync-status" id="sp-sync">\u23f3 Waiting for sync...</div>' +
        '</div>' +
        spTemplateTabs(spActiveTab, spChatHistory.length) +
        '<div id="sp-tab-content"></div>';

      document.querySelectorAll('.sp-tab').forEach(function(t) {
        t.addEventListener('click', function() { switchTab(t.getAttribute('data-tab')); });
      });

      if (spActiveTab === 'history') {
        renderHistoryTab();
      } else {
        showMainUIContent();
      }

      updateSync();
      chrome.storage.onChanged.addListener((ch) => { if(ch.lovable_projectId || ch.lovable_token) updateSync(); });
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

    // Chips
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
      chrome.storage.local.set({ ql_modo_plano: this.checked });
    });

    setupSpFileAttachment();
    setupSpClipboardPaste();
    document.getElementById('sp-send').addEventListener('click', handleSend);
    document.getElementById('sp-msg').addEventListener('keydown', function(e) {
      if(e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
      e.preventDefault();
      const sendBtn = document.getElementById('sp-send');
      if(sendBtn && !sendBtn.disabled) sendBtn.click();
    });
    setupSpSpeech();
    setupSpWatermarkButton();
    setupSpShield();
    setupSpNativeChat();
    setupSpDownloadProject();
    setupSpCreateProject();
    setupSpPublishProject();
    setupSpEnableCloud();
  }

  // --- Speech Recognition ---
  function setupSpSpeech() {
    var btn = document.getElementById('sp-speech');
    if (!btn) return;
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      btn.title = "Speech not supported in this browser";
      btn.style.opacity = "0.4";
      btn.style.cursor = "not-allowed";
      return;
    }
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (spIsRecording && spSpeechRecognition) { spSpeechRecognition.stop(); return; }
      try {
        spSpeechRecognition = new SpeechRecognition();
        spSpeechRecognition.lang = "en-US";
        spSpeechRecognition.continuous = true;
        spSpeechRecognition.interimResults = true;
        spSpeechRecognition.maxAlternatives = 1;
        var finalTranscript = "";
        var textarea = document.getElementById('sp-msg');
        spSpeechRecognition.onstart = function() {
          spIsRecording = true; btn.classList.add('sp-recording');
          finalTranscript = textarea ? textarea.value : "";
        };
        spSpeechRecognition.onresult = function(event) {
          var interim = "";
          for (var i = event.resultIndex; i < event.results.length; i++) {
            var t = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalTranscript += t + " ";
            else interim += t;
          }
          if (textarea) textarea.value = finalTranscript + interim;
        };
        spSpeechRecognition.onerror = function(event) {
          spIsRecording = false; btn.classList.remove('sp-recording');
          if (event.error === "not-allowed") showAlert("Permission Denied", "Allow microphone access in your browser settings.");
          else if (event.error === "no-speech") showAlert("No Audio", "No speech detected. Try again.");
          else if (event.error !== "aborted") showAlert("Voice Error", "Error: " + event.error);
        };
        spSpeechRecognition.onend = function() {
          spIsRecording = false; btn.classList.remove('sp-recording');
          if (textarea) textarea.value = finalTranscript.trim();
        };
        spSpeechRecognition.start();
      } catch(err) {
        spIsRecording = false; btn.classList.remove('sp-recording');
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
        el.textContent = '\u2705 Synced! Project: ' + r.lovable_projectId.substring(0,6) + '...';
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
      function finish(ok) { spSyncRequestInFlight = false; resolve(!!ok); }
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if(chrome.runtime.lastError) return finish(false);
          const tab = tabs && tabs[0];
          const url = tab && tab.url ? tab.url : "";
          if(!tab || !tab.id || !/^https:\/\/([^/]+\.)?lovable\.dev\//i.test(url)) return finish(false);
          chrome.tabs.sendMessage(tab.id, { action: "lovconnectRequestSync" }, function(resp) {
            if(chrome.runtime.lastError) return finish(false);
            finish(resp && resp.ok);
          });
        });
      } catch(e) { finish(false); }
    });
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
      if (spAttachedFiles.length >= SP_MAX_FILES) { showAlert('Limit', 'Max ' + SP_MAX_FILES + ' files.'); return; }
      fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      fileInput.value = '';
      if (!files.length) return;
      await spHandleFilesAttach(files);
    });
  }

  async function spHandleFilesAttach(files) {
    for (var fi = 0; fi < files.length; fi++) {
      var file = files[fi];
      if (spAttachedFiles.length >= SP_MAX_FILES) break;
      if (file.size > SP_MAX_FILE_SIZE) { showAlert('Large file', file.name + ' exceeds 20MB.'); continue; }
      var processedFile = file;
      var previewUrl = null;
      if (['image/png','image/jpeg','image/webp'].indexOf(file.type) >= 0) {
        var compressed = await spCompressImage(file);
        processedFile = compressed.file;
        previewUrl = compressed.previewUrl;
      }
      var idx = spAttachedFiles.length;
      spAttachedFiles.push({
        file_id: 'local_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now()),
        file_name: file.name || ('file_' + Date.now()),
        previewUrl: previewUrl,
        file_type: processedFile.type,
        sizeLabel: spFormatFileSize(processedFile.size),
        uploading: false,
        rawFile: processedFile,
        method: 'v2'
      });
      spRenderAttachPreview();
    }
    showAlert('Attached', files.length + ' file(s) added!');
  }

  // --- Plan Mode Alert ---
  function showModoPlanoAlert() {
    const overlay = document.createElement('div');
    overlay.className = 'sp-modal-overlay';
    overlay.innerHTML = '<div class="sp-modal">' +
      '<div class="sp-modal-icon">\u26a0\ufe0f</div>' +
      '<div class="sp-modal-title">Attention \u2014 Plan Mode</div>' +
      '<div class="sp-modal-body"><strong>Plan Mode</strong> may consume credits, but it can be helpful. Use it in moderation!</div>' +
      '<div style="margin-bottom:14px;">' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">1</span><span class="sp-modal-step-text">Enable <strong>Plan Mode</strong> and send your prompt.</span></div>' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">2</span><span class="sp-modal-step-text">Lovable generates a plan. <strong>Do NOT click Approve</strong> in Lovable.</span></div>' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">3</span><span class="sp-modal-step-text"><strong>Copy the plan</strong> and paste it in the extension prompt.</span></div>' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">4</span><span class="sp-modal-step-text"><strong>Turn off Plan Mode</strong> and send. No extra credits consumed!</span></div>' +
      '</div>' +
      '<button class="sp-modal-btn" id="sp-modal-ok">Got it!</button>' +
    '</div>';
    document.body.appendChild(overlay);
    document.getElementById('sp-modal-ok').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  }

  // --- Send Message (direct to Lovable API) ---
  async function handleSend() {
    const msg = document.getElementById('sp-msg').value.trim();
    const modoPlano = document.getElementById('sp-modo-plano').checked;
    const log = document.getElementById('sp-log');
    const btn = document.getElementById('sp-send');
    if(!msg) { log.className = 'sp-log sp-log-error'; log.textContent = 'Prompt is empty'; return; }
    btn.disabled = true; btn.textContent = '\u23f3';

    const v2Pending = spAttachedFiles.filter(function(f) { return f.rawFile && !f.uploading; });
    var finalMsg = msg;

    log.className = 'sp-log sp-log-info';
    log.textContent = v2Pending.length > 0 ? '\ud83d\udcce Attaching files...' : '\u23f3 Sending...';

    try {
      await spRefreshLovableSession(1200);
      const sd = await new Promise(r => chrome.storage.local.get(["lovable_projectId","lovable_token","lovable_browserSessionId"], r));
      let token = sd.lovable_token || '';
      const pid = sd.lovable_projectId || '';
      const bsess = sd.lovable_browserSessionId || '';
      if(!pid || !token) {
        log.className = 'sp-log sp-log-error';
        log.textContent = 'Project not synced. Open Lovable first.';
        btn.disabled = false; btn.textContent = 'Send';
        return;
      }
      if(token.startsWith('Bearer ')) token = token.slice(7);

      // Build the Lovable API payload directly
      const sessionHeaders = await buildSessionHeaders(pid);

      // Build upload_files for any attached files
      var uploadFiles = [];
      for (let i = 0; i < v2Pending.length; i++) {
        const f = v2Pending[i];
        try {
          const b64 = await spBlobToBase64(f.rawFile);
          uploadFiles.push({ file_data: b64, file_name: f.file_name || ('file_' + i), file_type: f.file_type || 'application/octet-stream' });
        } catch(e) {}
      }

      // Send directly to Lovable chat API
      const lovablePayload = {
        messages: [{ role: "user", content: finalMsg }],
        thinking: modoPlano
      };

      const lovableUrl = 'https://api.lovable.dev/projects/' + pid + '/messages';
      const reqHeaders = Object.assign({}, sessionHeaders, {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });

      // If there are files, embed them as text references
      if (uploadFiles.length > 0) {
        var fileLines = uploadFiles.map(function(f) { return '[Attached: ' + f.file_name + ']'; }).join('\n');
        lovablePayload.messages[0].content = finalMsg + '\n\n' + fileLines;
      }

      const result = await lovableFetch(lovableUrl, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(lovablePayload)
      });

      log.className = 'sp-log sp-log-success';
      log.textContent = '\u2713 Prompt sent!';

      addToHistory(msg, 'ok');
      document.getElementById('sp-msg').value = '';
      spAttachedFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      spAttachedFiles = [];
      spRenderAttachPreview();
      try { if(typeof QLSounds !== "undefined") QLSounds.promptSent(); } catch(e) {}
    } catch(err) {
      log.className = 'sp-log sp-log-error';
      log.textContent = '\u2717 ' + (err.message || err);
      addToHistory(msg, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Send';
    }
  }

  // --- Watermark Removal (direct Lovable API) ---
  function setupSpWatermarkButton(){
    var btn = document.getElementById("sp-remove-watermark");
    if(!btn) return;
    btn.addEventListener("click", async function(){
      var log = document.getElementById("sp-log");
      btn.disabled = true;
      log.className = 'sp-log sp-log-info'; log.textContent = '\u23f3 Sending...';
      try {
        await spRefreshLovableSession(1200);
        var sd = await new Promise(function(r){ chrome.storage.local.get(["lovable_projectId","lovable_token"], r); });
        var token = sd.lovable_token || "";
        var pid = sd.lovable_projectId || "";
        if(!pid || !token){
          log.className = "sp-log sp-log-error";
          log.textContent = "Project not synced.";
          btn.disabled = false;
          return;
        }
        if(token.startsWith("Bearer ")) token = token.slice(7);
        const sessionHeaders = await buildSessionHeaders(pid);
        const reqHeaders = Object.assign({}, sessionHeaders, {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        });
        // Send watermark removal prompt directly to Lovable
        const payload = {
          messages: [{ role: "user", content: "Remove all 'Built with Lovable' watermarks, badges, and footer text from this project. Find all references in the codebase and delete them completely." }],
          thinking: false
        };
        await lovableFetch('https://api.lovable.dev/projects/' + pid + '/messages', {
          method: "POST", headers: reqHeaders, body: JSON.stringify(payload)
        });
        log.className = "sp-log sp-log-success";
        log.textContent = "\u2713 Watermark removal sent!";
      } catch(err) {
        log.className = "sp-log sp-log-error";
        log.textContent = "\u2717 " + (err.message || err);
      } finally {
        btn.disabled = false;
        btn.textContent = "\ud83d\udeab Remove Watermark";
      }
    });
  }

  // --- Publish Project ---
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
        '<div style="background:#0a0a0b;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px;margin-bottom:14px;word-break:break-all"><a href="' + spEscapeHtml(url) + '" target="_blank" style="color:#22D3EE;text-decoration:none;font-size:12px">' + spEscapeHtml(url) + '</a></div>' +
        '<div style="display:flex;gap:6px">' +
          '<button id="sp-publish-copy" style="flex:1;padding:8px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#f4f4f5;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600">\ud83d\udccb Copy</button>' +
          '<button id="sp-publish-open" style="flex:1;padding:8px;border:none;background:linear-gradient(135deg,#EC4899,#d97706);color:#fff;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700">\ud83d\udd17 Open</button>' +
        '</div>' +
        '<button id="sp-publish-close" style="width:100%;margin-top:6px;padding:6px;border:none;background:transparent;color:#71717a;cursor:pointer;font-size:11px">Close</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("sp-publish-copy").addEventListener("click", function(){ navigator.clipboard.writeText(url); this.textContent = "\u2713 Copied!"; });
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
      btn.textContent = "\u23f3 Publishing...";
      try {
        await spRefreshLovableSession(1200);
        var sd = await new Promise(function(r){ chrome.storage.local.get(["lovable_projectId","lovable_token"], r); });
        var token = sd.lovable_token || "";
        var pid = sd.lovable_projectId || "";
        if(!pid || !token){
          log.className = "sp-log sp-log-error"; log.textContent = "Project not synced.";
          btn.disabled = false; btn.textContent = "\ud83c\udf10 Publish Project"; return;
        }
        if(token.startsWith("Bearer ")) token = token.slice(7);
        const sessionHeaders = await buildSessionHeaders(pid);
        const reqHeaders = Object.assign({}, sessionHeaders, { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' });
        // Trigger Lovable publish via their API
        const result = await lovableFetch('https://api.lovable.dev/projects/' + pid + '/deploy', {
          method: "POST", headers: reqHeaders, body: JSON.stringify({})
        });
        log.className = "sp-log sp-log-success";
        log.textContent = "\u2713 Project published!";
        const url = (result && result.url) || (result && result.deployment_url) || ('https://lovable.app/projects/' + pid);
        showSpPublishedUrlModal(url);
      } catch(err) {
        log.className = "sp-log sp-log-error";
        log.textContent = "\u2717 " + (err.message || err);
      } finally {
        btn.disabled = false; btn.textContent = "\ud83c\udf10 Publish Project";
      }
    });
  }

  function setupSpEnableCloud(){
    var btn = document.getElementById("sp-enable-cloud");
    if(!btn) return;
    btn.addEventListener("click", async function(){
      var log = document.getElementById("sp-log");
      btn.disabled = true;
      btn.textContent = "\u23f3 Enabling Cloud...";
      try {
        await spRefreshLovableSession(1200);
        var sd = await new Promise(function(r){ chrome.storage.local.get(["lovable_projectId","lovable_token"], r); });
        var token = sd.lovable_token || "";
        var pid = sd.lovable_projectId || "";
        if(!pid || !token){
          log.className = "sp-log sp-log-error"; log.textContent = "Project not synced.";
          btn.disabled = false; btn.textContent = "\u2601\ufe0f Enable Lovable Cloud"; return;
        }
        if(token.startsWith("Bearer ")) token = token.slice(7);
        const sessionHeaders = await buildSessionHeaders(pid);
        const reqHeaders = Object.assign({}, sessionHeaders, { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' });
        await lovableFetch('https://api.lovable.dev/projects/' + pid + '/cloud', {
          method: "POST", headers: reqHeaders, body: JSON.stringify({ region: "us-east-1" })
        });
        log.className = "sp-log sp-log-success";
        log.textContent = "\u2713 Lovable Cloud enabled!";
      } catch(err) {
        log.className = "sp-log sp-log-error";
        log.textContent = "\u2717 " + (err.message || err);
      } finally {
        btn.disabled = false; btn.textContent = "\u2601\ufe0f Enable Lovable Cloud";
      }
    });
  }

  // --- Download All Project Files ---
  function setupSpDownloadProject() {
    var btn = document.getElementById('sp-download-project');
    if (!btn) return;
    btn.addEventListener('click', async function() {
      var statusEl = document.getElementById('sp-download-status');
      btn.disabled = true;
      btn.textContent = '\ud83d\udd04 Preparing...';
      if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'sp-log sp-log-info'; statusEl.textContent = 'Checking token and project...'; }
      try {
        var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token', 'lovable_projectId'], r); });
        var authToken = sd.lovable_token || '';
        var projectId = sd.lovable_projectId || '';
        if (authToken.indexOf('Bearer ') === 0) authToken = authToken.slice(7);

        var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        var currentTab = tabs[0];
        if (!projectId && currentTab && currentTab.url) {
          var urlMatch = currentTab.url.match(/\/projects\/([a-f0-9-]+)/);
          if (urlMatch) projectId = urlMatch[1];
        }
        if (!projectId) throw new Error('Open a Lovable project page first.');
        if (!authToken) {
          if (statusEl) statusEl.textContent = '\ud83d\udd04 Trying via cookies...';
          var cookieResponse = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: "readCookies" }, function(resp) { resolve(resp); });
          });
          if (cookieResponse && cookieResponse.success && cookieResponse.tokens && cookieResponse.tokens.length > 0) {
            authToken = cookieResponse.tokens[0].token;
          }
        }
        if (!authToken) throw new Error('Open lovable.dev in another tab and wait for sync.');

        if (statusEl) statusEl.textContent = '\ud83d\udce1 Downloading project files...';
        btn.textContent = '\ud83d\udce1 Downloading...';

        var dlResponse = await new Promise(function(resolve) {
          chrome.runtime.sendMessage({ action: "downloadProject", projectId: projectId, token: authToken }, function(resp) { resolve(resp); });
        });
        if (!dlResponse || !dlResponse.success) throw new Error(dlResponse && dlResponse.error ? dlResponse.error : 'Download failed');
        var files = dlResponse.files;
        if (!files || files.length === 0) throw new Error('No files found in the project.');

        if (statusEl) statusEl.textContent = '\ud83d\udce6 Creating ZIP with ' + files.length + ' files...';
        btn.textContent = '\ud83d\udce6 Packaging...';

        if (typeof JSZip === 'undefined') throw new Error('JSZip library not loaded.');
        var zip = new JSZip();
        var imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff'];
        var addedFiles = 0;

        for (var fi = 0; fi < files.length; fi++) {
          var f = files[fi];
          if (!f.name || f.sizeExceeded) continue;
          if (f.contents && f.binary) {
            zip.file(f.name, f.contents, { base64: true, binary: true });
            addedFiles++;
          } else if (!f.contents && imageExts.some(function(ext) { return f.name.toLowerCase().endsWith(ext); })) {
            try {
              var encodedPath = encodeURIComponent(f.name);
              var imgUrl = 'https://api.lovable.dev/projects/' + projectId + '/files/raw?path=' + encodedPath;
              var imgResp = await fetch(imgUrl, { method: 'GET', headers: { 'Authorization': 'Bearer ' + authToken, 'Accept': '*/*' }, credentials: 'omit', mode: 'cors' });
              if (imgResp.ok) { zip.file(f.name, await imgResp.arrayBuffer(), { binary: true }); addedFiles++; }
              else if (f.contents) { zip.file(f.name, f.contents); addedFiles++; }
            } catch(imgErr) { if (f.contents) { zip.file(f.name, f.contents); addedFiles++; } }
          } else if (f.contents) {
            zip.file(f.name, f.contents); addedFiles++;
          }
        }

        if (statusEl) statusEl.textContent = '\ud83d\udddc\ufe0f Compressing ' + addedFiles + ' files...';
        var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
        var timestamp = new Date().toISOString().split('T')[0];
        var zipName = 'lovable-' + projectId.substring(0, 8) + '-' + timestamp + '.zip';
        var url = URL.createObjectURL(zipBlob);
        var a = document.createElement('a');
        a.href = url; a.download = zipName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);

        if (statusEl) { statusEl.className = 'sp-log sp-log-success'; statusEl.textContent = '\u2705 ' + addedFiles + ' files downloaded!'; }
        btn.textContent = '\u2705 Done!';
        setTimeout(function() { btn.textContent = '\ud83d\udce5 Download All Files'; btn.disabled = false; if (statusEl) statusEl.style.display = 'none'; }, 4000);
      } catch(err) {
        if (statusEl) { statusEl.className = 'sp-log sp-log-error'; statusEl.textContent = '\u274c ' + (err.message || err); statusEl.style.display = 'block'; }
        btn.textContent = '\u274c Failed';
        setTimeout(function() { btn.textContent = '\ud83d\udce5 Download All Files'; btn.disabled = false; }, 3000);
      }
    });
  }

  // --- Create Project ---
  function setupSpCreateProject() {
    var btn = document.getElementById('sp-create-project');
    if (!btn) return;
    btn.addEventListener('click', async function() {
      var statusEl = document.getElementById('sp-download-status');
      var originalLabel = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Creating project...';
      if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'sp-log'; statusEl.textContent = 'Preparing...'; }
      try {
        var sd = await new Promise(function(r) { chrome.storage.local.get(['lovable_token'], r); });
        var authToken = sd.lovable_token || '';
        if (authToken.indexOf('Bearer ') === 0) authToken = authToken.slice(7);
        if (!authToken) {
          var cookieResponse = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({ action: 'readCookies' }, function(resp) { resolve(resp); });
          });
          if (cookieResponse && cookieResponse.success && cookieResponse.tokens && cookieResponse.tokens.length > 0) {
            authToken = cookieResponse.tokens[0].token;
          }
        }
        if (!authToken) throw new Error('Open lovable.dev in another tab and wait for sync.');

        if (statusEl) statusEl.textContent = 'Creating project...';
        const sessionHeaders = await buildSessionHeaders('');
        const reqHeaders = Object.assign({}, sessionHeaders, { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' });
        const result = await lovableFetch('https://api.lovable.dev/projects', {
          method: 'POST', headers: reqHeaders, body: JSON.stringify({ title: 'New Project' })
        });
        const link = (result && result.url) || (result && result.id ? 'https://lovable.dev/projects/' + result.id : null);
        if (!link) throw new Error('Failed to create project');
        if (statusEl) statusEl.textContent = '\u2705 Project created! Opening...';
        btn.textContent = '\u2705 Success!';
        setTimeout(function(){
          try { chrome.tabs.create({ url: link, active: true }); } catch(e) { window.open(link, '_blank'); }
          btn.disabled = false; btn.innerHTML = originalLabel;
        }, 500);
      } catch(err) {
        if (statusEl) statusEl.textContent = '\u274c ' + (err.message || 'Error');
        btn.disabled = false; btn.innerHTML = originalLabel;
      }
    });
  }

  // ===== SHIELD SYSTEM =====
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
        showAlert('Shield Enabled', 'The Lovable input is blocked.');
      } else {
        btn.classList.remove('sp-shield-active');
        if (label) label.textContent = 'Enable Shield';
        removeSpShieldOverlay();
        showAlert('Shield Disabled', 'The Lovable input is available.');
      }
    });
  }

  function injectSpShieldOverlay() {
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
            overlay.innerHTML = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#A855F7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 12px rgba(168,85,247,0.55))"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span style="color:#22D3EE;font-size:13px;font-weight:600;font-family:Inter,sans-serif">Protected by TechVai</span><span style="color:#bfc0c2;font-size:10px;font-family:Inter,sans-serif">Use the extension to send prompts</span>';
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
              if (wasDis === 'true') el.disabled = true; else el.disabled = false;
              delete el.dataset.qlShieldDisabled;
              el.removeAttribute('tabindex');
              if (el.dataset.qlShieldEditable === 'true') { el.contentEditable = 'true'; delete el.dataset.qlShieldEditable; }
            });
          }
        }).catch(() => {});
      }
    });
  }

  // ===== NATIVE CHAT MODE =====
  var spNativeChatActive = false;

  function setupSpNativeChat() {
    var btn = document.getElementById('sp-native-chat-btn');
    if (!btn) return;
    chrome.storage.local.get(['ql_native_chat'], function(res) {
      if (res.ql_native_chat === true) {
        spNativeChatActive = true;
        btn.style.background = 'linear-gradient(135deg,rgba(34,211,238,0.15),rgba(124,58,237,0.10))';
        btn.style.borderColor = 'rgba(34,211,238,0.40)';
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
        if (label) label.textContent = 'Back to Extension';
        sendNativeChatCommand('activate');
        showAlert('Native Chat Enabled', 'Use the native Lovable input.');
      } else {
        btn.style.background = 'linear-gradient(135deg,rgba(168,85,247,0.12),rgba(124,58,237,0.08))';
        btn.style.borderColor = 'rgba(168,85,247,0.3)';
        if (label) label.textContent = 'Use Native Chat';
        sendNativeChatCommand('deactivate');
        showAlert('Native Chat Disabled', 'Returned to extension mode.');
      }
    });
  }

  function sendNativeChatCommand(cmd) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0] || !tabs[0].id) return;
      try {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ql_native_chat_' + cmd }, function() { void chrome.runtime.lastError; });
      } catch (e) {}
    });
  }

  // --- Clipboard Paste & Drag-and-Drop ---
  function setupSpClipboardPaste() {
    var textarea = document.getElementById('sp-msg');
    if (!textarea) return;
    var dropZone = document.getElementById('sp-body') || textarea;
    var dragOverlay = null;
    function showDragOverlay() {
      if (dragOverlay) return;
      dragOverlay = document.createElement('div');
      dragOverlay.className = 'sp-drag-overlay';
      dragOverlay.innerHTML = '<div class="sp-drag-overlay-inner">Drop files here</div>';
      document.body.appendChild(dragOverlay);
    }
    function hideDragOverlay() { if (dragOverlay) { dragOverlay.remove(); dragOverlay = null; } }
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); e.stopPropagation(); showDragOverlay(); });
    dropZone.addEventListener('dragleave', function(e) { e.preventDefault(); e.stopPropagation(); if (!dropZone.contains(e.relatedTarget)) hideDragOverlay(); });
    dropZone.addEventListener('drop', async function(e) {
      e.preventDefault(); e.stopPropagation(); hideDragOverlay();
      var files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      await spHandleFilesAttach(files);
    });
    textarea.addEventListener('paste', async function(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var filesToAttach = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.kind === 'file') { e.preventDefault(); var file = item.getAsFile(); if (file) filesToAttach.push(file); }
      }
      if (filesToAttach.length > 0) await spHandleFilesAttach(filesToAttach);
    });
  }

  // --- Initialize ---
  (async function init() {
    chrome.storage.local.get(["ql_dark_mode"], r => { if(r.ql_dark_mode === false) document.body.classList.add('sp-light'); });
    chrome.storage.local.get(["ql_license_valid","ql_user_name","ql_license_status"], (res) => {
      if(res.ql_license_valid) {
        userName = res.ql_user_name || 'User';
        licenseStatus = res.ql_license_status || 'pro';
        showMainUI();
      } else {
        // Auto-activate with built-in key silently
        chrome.storage.local.set({
          ql_license_valid: true,
          ql_license_key: BUILTIN_LICENSE_KEY,
          ql_user_name: 'User',
          ql_license_status: 'pro'
        }, () => { showMainUI(); });
      }
    });
  })();

})();
