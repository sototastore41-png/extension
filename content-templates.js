// ============================================
// VibeX Academy - Lovable Extension - HTML Templates (content)
// Separado da logica de negocio (content.js)
// ============================================

const SVG_ICONS = {
  wrench: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  shield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  zap: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  msgSquare: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  trendUp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  palette: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="0.5"/><circle cx="17.5" cy="10.5" r="0.5"/><circle cx="8.5" cy="7.5" r="0.5"/><circle cx="6.5" cy="12" r="0.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  box: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  bell: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  moon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  gauge: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/><path d="M12 14a2 2 0 0 0-2 2"/></svg>',
  mic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  headphones: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  sparkles: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  sidePanel: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
};

const PROMPT_TEMPLATES = [
  { icon: SVG_ICONS.wrench, label: "Bugs", prompt: "Analyze the code and identify all bugs, errors, and failures. Fix each one and explain the problem and the applied solution." },
  { icon: SVG_ICONS.edit, label: "Refactor", prompt: "Create a complete step-by-step plan to refactor and optimize the system." },
  { icon: SVG_ICONS.shield, label: "Errors", prompt: "Implement robust error handling throughout the code, including try/catch, validations, and user-friendly error messages." },
  { icon: SVG_ICONS.zap, label: "Optimize", prompt: "Analyze and optimize the system performance by identifying bottlenecks, improving queries, reducing re-renders, and applying best practices." },
  { icon: SVG_ICONS.msgSquare, label: "Comments", prompt: "Add clear comments and documentation throughout the code, explaining the logic, parameters, and return values of each function." },
  { icon: SVG_ICONS.trendUp, label: "SEO", prompt: "Create a complete SEO creation and optimization plan for this site. Include meta tag analysis (title, description, og:image), heading structure (H1-H6), sitemap.xml, robots.txt, structured data (JSON-LD), performance (Core Web Vitals), accessibility, friendly URLs, canonical tags, image alt text, lazy loading, and internal link-building strategies. Implement all identified improvements." },
  { icon: SVG_ICONS.palette, label: "UI", prompt: "Improve the user interface by making it more modern, responsive, and accessible, following UX/UI best practices." },
  { icon: SVG_ICONS.box, label: "Components", prompt: "Reorganize the code into reusable, well-structured components with single responsibilities." },
  { icon: SVG_ICONS.search, label: "Review", prompt: "Perform a complete code review, identifying quality, security, and performance issues and suggesting improvements." },
];

// ---- Template: License Gate ----
function templateLicenseGate(minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left" style="display:flex;align-items:center;gap:6px;">' +
      '<img src="' + chrome.runtime.getURL('images/logo_circle_tight.png') + '" style="width:34px;height:34px;border-radius:50%;object-fit:contain;" alt="Logo">' +
      '<span class="ql-title">VibeX Academy - Lovable Extension</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
       '<span class="ql-badge">GS v6.0.13</span>' +
      '<button id="ql-minimize" class="ql-minimize-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-body">' +
    '<div class="ql-license-gate">' +
      '<div class="ql-logo-container" style="text-align:center;margin:6px auto 24px;display:flex;justify-content:center;"><img src="' + chrome.runtime.getURL('images/logo_circle_tight.png') + '" style="width:170px;height:158px;object-fit:contain;display:block;filter:drop-shadow(0 0 22px rgba(168,85,247,0.32));" alt="VibeX Academy - Lovable Extension Logo"></div>' +
      '<p class="ql-gate-title">Activate License</p>' +
      '<p class="ql-gate-desc">Enter your license key to unlock.</p>' +
      '<div class="ql-field">' +
        '<input id="ql-license-input" placeholder="QL-XXXXXXXXXXXXXXXXXXXX" spellcheck="false">' +
      '</div>' +
      '<button id="ql-validate-btn">Validate License</button>' +
      '<div id="ql-license-log"></div>' +
      '<div class="ql-gate-divider"><span>or</span></div>' +
      '<button id="ql-buy-license-btn" class="ql-buy-btn">Request your key via Discord</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>';
}

// ---- Template: Main UI ----
function templateMainUI(greeting, statusBadge, minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-brand" style="display:flex;align-items:center;gap:7px;"><img src="' + chrome.runtime.getURL('images/logo_circle_tight.png') + '" style="width:34px;height:34px;border-radius:50%;object-fit:contain;" alt="Logo"> VibeX Academy - Lovable Extension</span>' +
      '<span class="ql-badge-pro-header">PRO</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<button class="ql-icon-btn ql-notif-btn" title="Notifications">' + SVG_ICONS.bell + '<span class="ql-notif-badge" style="display:none">0</span></button>' +
      '<button id="ql-sidepanel-btn" class="ql-icon-btn" title="Open in Side Panel">' + SVG_ICONS.sidePanel + '</button>' +
      '<button class="ql-icon-btn" title="Theme">' + SVG_ICONS.moon + '</button>' +
      '<button id="ql-lite-mode-btn" class="ql-icon-btn" title="Lite Mode">' + SVG_ICONS.gauge + '</button>' +
      '<button id="ql-logout-btn" class="ql-icon-btn" title="Logout">\ud83d\udeaa</button>' +
      '<button id="ql-minimize" class="ql-icon-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
   '<div id="ql-body">' +
    '<div id="ql-update-banner" style="display:none"></div>' +
    '<div class="ql-profile-card">' +
      '<div class="ql-profile-top">' +
        '<div class="ql-profile-info">' +
          '<span class="ql-profile-name">' + escapeHtml(greeting) + '</span>' +
          statusBadge +
        '</div>' +
      '</div>' +
      '<div id="ql-sync-status" class="ql-sync-status ql-sync-waiting">' +
        '<span class="ql-sync-text">\u23f3 Waiting for sync...</span>' +
      '</div>' +
      '<div id="ql-trial-corntdown" class="ql-trial-corntdown" style="display:none"></div>' +
    '</div>' +
    '<div id="ql-reseller-btn" style="display:none;margin-bottom:14px">' +
      '<a href="https://wa.me/8801889067101" target="_blank" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;border:1px solid rgba(168,85,247,0.3);background:rgba(168,85,247,0.06);color:var(--ql-accent,#A855F7);text-decoration:none;font-size:12px;font-weight:700;transition:all 0.2s">' +
        '\ud83d\udcbc Reseller Panel<span style="margin-left:auto;font-size:10px;opacity:0.6">\u2192</span>' +
      '</a>' +
    '</div>' +
    '<!-- Tabs -->' +
    '<div class="ql-tabs" id="ql-tabs">' +
      '<button class="ql-tab ql-tab-active" data-tab="prompt">\u26a1 Prompt</button>' +
      '<button class="ql-tab" data-tab="history">\ud83d\udcac History <span class="ql-tab-badge" id="ql-history-badge" style="display:none">0</span></button>' +
    '</div>' +
    '<div id="ql-tab-content">' +
    '<div class="ql-model-selector-container">' +
      '<div class="ql-model-selector-header" id="ql-model-selector-btn">' +
        '<span id="ql-active-model-icon">\ud83e\udde0</span>' +
        '<span id="ql-active-model-name">Loading Model...</span>' +
        '<span class="ql-model-selector-arrow">\u25be</span>' +
      '</div>' +
      '<div class="ql-model-options" id="ql-model-options" style="display:none">' +
        '<div class="ql-model-option" data-model="gpt-4o" data-icon="\ud83e\uddbe">' +
          '<span class="ql-model-opt-icon">\ud83e\uddbe</span>' +
          '<div class="ql-model-opt-text">' +
            '<span class="ql-model-opt-title">GPT5-CODEX</span>' +
            '<span class="ql-model-opt-desc">Best for logic and coding</span>' +
          '</div>' +
        '</div>' +
        '<div class="ql-model-option" data-model="gemini-1.5-pro" data-icon="\u2728">' +
          '<span class="ql-model-opt-icon">\u2728</span>' +
          '<div class="ql-model-opt-text">' +
            '<span class="ql-model-opt-title">Gemini 3.1 Pro</span>' +
            '<span class="ql-model-opt-desc">Excellent reasoning and long context</span>' +
          '</div>' +
        '</div>' +
        '<div class="ql-model-option" data-model="claude-3-opus" data-icon="\ud83d\udca1">' +
          '<span class="ql-model-opt-icon">\ud83d\udca1</span>' +
          '<div class="ql-model-opt-text">' +
            '<span class="ql-model-opt-title">Claude Opus 4.7</span>' +
            '<span class="ql-model-opt-desc">Creativity and natural writing</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<textarea id="ql-msg" rows="3" placeholder="Type your command..." spellcheck="false"></textarea>' +
    '<div id="ql-attach-preview" class="ql-attach-preview" style="display:none"></div>' +
    '<div class="ql-action-bar">' +
      '<div class="ql-action-left">' +
        '<label class="ql-toggle">' +
          '<input type="checkbox" id="ql-modo-plano">' +
          '<span class="ql-toggle-slider"></span>' +
        '</label>' +
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
    '<div id="ql-download-status" style="display:none"></div>' +
    '</div>' +
  '<div id="ql-footer" class="ql-footer">' +
    '<div class="ql-footer-row">' +
      '<a href="https://wa.me/8801889067101" target="_blank" class="ql-support-link">' + SVG_ICONS.headphones + ' Support</a>' +
       '<span class="ql-footer-version">GS v6.0.13</span>' +
    '</div>' +
    '<span class="ql-badge-mz">Developed by VibeX Academy</span>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>' +
  '<!-- Notifications Panel -->' +
  '<div id="ql-notif-panel" class="ql-notif-panel" style="display:none">' +
    '<div class="ql-notif-header">' +
      '<span>Notifications</span>' +
      '<button id="ql-notif-close" class="ql-notif-close-btn">\u2715</button>' +
    '</div>' +
    '<div id="ql-notif-list" class="ql-notif-list">' +
      '<p class="ql-notif-empty">Loading...</p>' +
    '</div>' +
  '</div>' +
  '<!-- Custom Alert -->' +
  '<div id="ql-custom-alert" class="ql-custom-alert" style="display:none">' +
    '<div class="ql-alert-content">' +
      '<div class="ql-alert-icon">\u2705</div>' +
      '<div class="ql-alert-title">Success!</div>' +
      '<div class="ql-alert-message"></div>' +
      '<button class="ql-alert-ok-btn">OK</button>' +
    '</div>' +
  '</div>';
}

// ---- Template: Expired License Overlay ----
function templateExpiredOverlay() {
  return '<div class="ql-sweetalert-box">' +
    '<div class="ql-sweetalert-icon">\u23f0</div>' +
    '<h2 class="ql-sweetalert-title">License Expired!</h2>' +
    '<p class="ql-sweetalert-text">Your license has expired. Renew now to continue.</p>' +
    '<div class="ql-sweetalert-actions">' +
      '<button class="ql-sweetalert-btn ql-sweetalert-btn-primary" id="ql-sweetalert-renew">\ud83d\uded2 Renew Now</button>' +
      '<button class="ql-sweetalert-btn ql-sweetalert-btn-secondary" id="ql-sweetalert-close">Close</button>' +
    '</div>' +
  '</div>';
}

// ---- Template: Payment UI (packages list) ----
var BRL_TO_MZN = 12.6;
var QL_CONTACT_URL = "https://wa.me/8801889067101";
var QL_STORE_URL = "https://lovablecredit.com";
var QL_BRL_PLANS = [
  { name: "Weekly",  price: "49,90",  period: "per week",      popular: false, badge: "7d",  icon: "\u26a1",
    features: ["Full extension access", "Plan Mode active", "Support via Discord"] },
  { name: "Monthly",   price: "97,90",  period: "per month",    popular: true,  badge: "30d", icon: "\ud83d\udc51",
    features: ["Everything in the Weekly plan", "Best value", "Priority support"] },
  { name: "Lifetime", price: "149,90", period: "one-time payment", popular: false, badge: "\u221e", icon: "\u267e\ufe0f",
    features: ["Lifetime access", "Lifetime updates", "VIP priority support"] }
];
function qlFmtMzn(brl) {
  var n = parseFloat(String(brl).replace(",", ".")) * BRL_TO_MZN;
  if (!isFinite(n)) return "0";
  return Math.round(n).toLocaleString("pt-MZ");
}
function templateBrlCard(plan, idx) {
  var features = plan.features.map(function(f){ return '<li>' + escapeHtml(f) + '</li>'; }).join('');
  var popular = plan.popular ? '<span class="ql-pkg-popular">\u2b50 POPULAR</span>' : '';
  return '<div class="ql-pkg-card ql-pkg-brl' + (plan.popular ? ' ql-pkg-highlight' : '') + '" data-brl-idx="' + idx + '">' +
    popular +
    '<div class="ql-pkg-name">' + escapeHtml(plan.icon) + ' ' + escapeHtml(plan.name) + '</div>' +
    '<div class="ql-pkg-price">R$ ' + escapeHtml(plan.price) + '</div>' +
    '<div class="ql-pkg-mzn">\u2248 ' + qlFmtMzn(plan.price) + ' MZN <span>(approx. exchange rate)</span></div>' +
    '<div class="ql-pkg-duration">' + escapeHtml(plan.period) + '</div>' +
    '<ul class="ql-pkg-features">' + features + '</ul>' +
    '<button class="ql-pkg-select-btn ql-brl-buy">Request your key via Discord</button>' +
  '</div>';
}
function templateBrlSection() {
  var cards = QL_BRL_PLANS.map(function(p, i){ return templateBrlCard(p, i); }).join('');
  return '<div class="ql-pay-divider"><span>\ud83d\udcb3 Prices in BRL (R$)</span></div>' +
    '<div class="ql-packages-list ql-brl-list">' + cards + '</div>';
}
function templatePaymentUI(minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-brand" style="display:flex;align-items:center;gap:7px;"><img src="' + chrome.runtime.getURL('images/logo_circle_tight.png') + '" style="width:34px;height:34px;border-radius:50%;object-fit:contain;" alt="Logo"> VibeX Academy - Lovable Extension</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<button id="ql-pay-back" class="ql-icon-btn" title="Back">\u2190</button>' +
      '<button id="ql-minimize" class="ql-icon-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-body">' +
    '<div class="ql-pay-section">' +
      '<div class="ql-pay-title">Escolha seu Plan</div>' +
      templateBrlSection() +
      '<div class="ql-pay-divider"><span>\ud83c\uddf2\ud83c\uddff Prices in Meticais (MZN)</span></div>' +
      '<div id="ql-packages-list" class="ql-packages-list">' +
        '<div class="ql-pay-loading">\u23f3 Loading plans...</div>' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>';
}

// ---- Template: Package Card ----
function templatePackageCard(pkg) {
  const popular = pkg.is_popular ? '<span class="ql-pkg-popular">\u2b50 POPULAR</span>' : '';
  const duration = pkg.duration_days ? escapeHtml(String(pkg.duration_days)) + ' days' : 'Lifetime';
  const features = (pkg.features || []).map(function(f) { return '<li>' + escapeHtml(f) + '</li>'; }).join('');
  return '<div class="ql-pkg-card' + (pkg.is_popular ? ' ql-pkg-highlight' : '') + '" data-pkg-id="' + escapeHtml(pkg.id) + '" data-pkg-name="' + escapeHtml(pkg.name) + '" data-pkg-price="' + escapeHtml(String(pkg.price)) + '">' +
    popular +
    '<div class="ql-pkg-name">' + escapeHtml(pkg.name) + '</div>' +
    '<div class="ql-pkg-price">' + escapeHtml(String(pkg.price)) + ' <span>MZN</span></div>' +
    '<div class="ql-pkg-duration">' + duration + '</div>' +
    '<ul class="ql-pkg-features">' + features + '</ul>' +
    '<button class="ql-pkg-select-btn">Selecionar</button>' +
  '</div>';
}

// ---- Template: Checkort Screen ----
function templateCheckortScreen(pkg, minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-brand">\u26a1 Payment</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<button id="ql-checkort-back" class="ql-icon-btn" title="Back">\u2190</button>' +
      '<button id="ql-minimize" class="ql-icon-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-body">' +
    '<div class="ql-pay-section">' +
      '<div class="ql-selected-pkg">\ud83d\udce6 <strong>' + escapeHtml(pkg.name) + '</strong> \u2014 ' + escapeHtml(String(pkg.price)) + ' MZN</div>' +
      '<div class="ql-pay-field">' +
        '<label>Payment Method</label>' +
        '<div class="ql-pay-methods">' +
          '<button class="ql-method-btn ql-method-active" data-method="mpesa">' +
            '<span class="ql-method-icon">\ud83d\udcf1</span> M-Pesa' +
          '</button>' +
          '<button class="ql-method-btn" data-method="emola">' +
            '<span class="ql-method-icon">\ud83d\udcb3</span> e-Mola' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ql-pay-field">' +
        '<label>N\u00famero de Telefone</label>' +
        '<input type="tel" id="ql-pay-phone" placeholder="84/85/86/87XXXXXXX" maxlength="9" spellcheck="false">' +
        '<span class="ql-pay-hint" id="ql-phone-hint">M-Pesa: 84 or 85 | e-Mola: 86 or 87</span>' +
      '</div>' +
      '<button id="ql-confirm-pay" class="ql-confirm-pay-btn">\ud83d\udcb0 Pay ' + escapeHtml(String(pkg.price)) + ' MZN</button>' +
      '<div id="ql-pay-log" class="ql-pay-log"></div>' +
    '</div>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>';
}

// ---- Template: Payment Success ----
function templatePaymentSuccess(licenseKey) {
  return '<div class="ql-pay-section" style="text-align:center;padding:24px 16px">' +
    '<div style="font-size:48px;margin-bottom:12px">\ud83c\udf89</div>' +
    '<div class="ql-pay-title">Payment Confirmed!</div>' +
    '<p style="color:var(--ql-muted);font-size:12px;margin:8px 0 16px">Your license has been activated successfully.</p>' +
    '<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;margin-bottom:12px">' +
      '<p style="font-size:10px;color:var(--ql-muted);margin-bottom:4px">Your license key</p>' +
      '<p id="ql-new-key" style="font-family:monospace;font-size:13px;color:var(--ql-accent);font-weight:600;word-break:break-all">' + escapeHtml(licenseKey) + '</p>' +
    '</div>' +
    '<button id="ql-copy-key" class="ql-confirm-pay-btn" style="margin-bottom:8px">\ud83d\udccb Copy Key</button>' +
    '<p style="font-size:10px;color:var(--ql-muted);margin-bottom:12px">Paste the key above to activate the extension.</p>' +
    '<button id="ql-activate-key" class="ql-buy-btn" style="font-size:12px">\ud83d\udd11 Activate Now</button>' +
  '</div>';
}

