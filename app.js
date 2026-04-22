// ============================================================
//  CASTLIVE OPS 2026 — app.js
//  Fix: Apr 22 2026
//  Bugs Fixed:
//  [1] renderBuktiTayang duplikat → pertahankan versi BARU (dengan malam)
//  [2] renderStandby duplikat + element ID salah → hapus versi lama
//  [3] renderTab standby → panggil loadStandby() bukan renderStandby()
//  [4] showToast tidak ada → semua diganti showBanner(...,'success')
//  [5] toMin duplikat → pertahankan 1x saja (di atas, sebelum semua pakai)
//  [6] _standbyRrIndex reset di awal renderStandby()
//  [7] getShiftBT / toggleBtShift / toggleBtStatus duplikat → hapus yang lama
// ============================================================

'use strict';

// ─── CONFIG ──────────────────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycbyhsAeqXWyuR0sRoNmy2i1vcyvKAk7Q-gaivbiNTLAq7eDKdCev8RpsG11v1aEGdTbB/exec';
const NTFY_NOTIF    = 'castlive-ops-2026-xk9';
const NTFY_PRESENCE = 'castlive-presence-2026';
const GOOGLE_CLIENT_ID = '343542715243-jhl0dshlpiklcapfgj4akj0a02vg9q05.apps.googleusercontent.com';
const HEARTBEAT_INTERVAL = 3 * 60 * 1000;
const PRESENCE_TTL       = 6 * 60 * 1000;

// ─── STATE ───────────────────────────────────────────────────
let currentTab            = 'marathon';
let currentUser           = null;
let presenceStarted       = false;
let onlineUsers           = {};
let _lastHariHData        = null;
let _lastFormData         = null;
let _lastKlasemenData     = null;
let _lastBuktiTayangData  = null;
let _lastBuktiTayangHistoryData = null;
let _lastPicScheduleData  = null;
let _standbyRrIndex       = {};   // round-robin per brand label

// ─── STANDBY CONFIG ──────────────────────────────────────────
const STANDBY_BRANDS_CFG = [
  { label:'AMERICAN TOURISTER TIKTOK', brand:'american tourister', mp:'tiktok',  type:'floating',  perOperator:false },
  { label:'SAMSONITE TIKTOK',          brand:'samsonite',          mp:'tiktok',  type:'floating',  perOperator:false },
  { label:'AMERICAN TOURISTER SHOPEE', brand:'american tourister', mp:'shopee',  type:'dedicated', section:'amtour'  },
  { label:'SAMSONITE SHOPEE',          brand:'samsonite',          mp:'shopee',  type:'floating',  perOperator:true  },
  { label:'ASICS SHOPEE',              brand:'asics',              mp:'shopee',  type:'dedicated', section:'asics'   },
];

// ─── UTILS ───────────────────────────────────────────────────

/** [FIX #5] Satu-satunya deklarasi toMin() */
function toMin(t) {
  if (!t) return 0;
  const str = (typeof t === 'string') ? t : String(t);
  const parts = str.split(':');
  if (parts.length < 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function minToTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}

function normalizeBrand(str) {
  if (!str) return '';
  return str.replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase().trim();
}

function normalizeMp(str) {
  if (!str) return '';
  return str.replace(/\s+/g, '').toLowerCase().trim();
}

function formatStandbyDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const days  = ['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
  const months = ['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function apiCall(params, timeout = 30000) {
  const url = API_URL + '?' + new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeout);
    fetch(url, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => { clearTimeout(tid); resolve(d); })
      .catch(e => { clearTimeout(tid); reject(e); });
  });
}

function showBanner(msg, type = 'info') {
  let el = document.getElementById('app-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-banner';
    el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;z-index:9999;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.2);transition:opacity .3s';
    document.body.appendChild(el);
  }
  const colors = { success:'#22c55e', error:'#ef4444', info:'#3b82f6', warning:'#f59e0b' };
  el.style.background = colors[type] || colors.info;
  el.style.color       = '#fff';
  el.style.opacity     = '1';
  el.textContent       = msg;
  clearTimeout(el._tid);
  el._tid = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// ─── SHIFT HELPERS ───────────────────────────────────────────

/** Unified shift by START time — used by OPStandby & Bukti Tayang */
function getShiftByStart(t) {
  if (!t) return 'siang';
  const m = toMin(t);
  if (m < 480)  return 'malam';   // 00:00–07:59
  if (m < 960)  return 'pagi';    // 08:00–15:59
  return 'siang';                 // 16:00–23:59
}

/** [FIX #7] Satu-satunya deklarasi getShiftBT() — delegate ke getShiftByStart */
function getShiftBT(startTime) {
  return getShiftByStart(startTime);
}

/** Tab Hari H shift by END time */
function getHariHShift(endTime) {
  if (!endTime) return 'siang';
  const m = toMin(endTime);
  if (m === 0)   return 'siang';  // 00:00 special case
  if (m < 480)   return 'malam';  // 00:01–07:59
  if (m < 960)   return 'pagi';   // 08:00–15:59
  return 'siang';                 // 16:00–23:59
}

// ─── CROSS-SHIFT SPLIT ───────────────────────────────────────
const SHIFT_BOUNDS = [480, 960, 1440]; // 08:00, 16:00, 24:00

function splitAtShiftBoundary(startStr, endStr) {
  let s = toMin(startStr);
  let e = toMin(endStr);
  if (e === 0) e = 1440;
  if (e <= s) e += 1440;

  const segments = [];
  let cur = s;
  for (const bound of SHIFT_BOUNDS) {
    if (cur >= e) break;
    const next = Math.min(bound, e);
    if (next > cur) {
      segments.push({
        start: minToTime(cur % 1440),
        end:   minToTime(next % 1440),
        shift: getShiftByStart(minToTime(cur % 1440))
      });
    }
    cur = next;
  }
  return segments;
}

// ─── FORM MATCHING HELPERS ───────────────────────────────────

function parseFormHosts(hostStr) {
  if (!hostStr) return [];
  const sep = /\bwith\b|\bdan\b|\bbareng\b|\bsama\b|[&,]/gi;
  const cleaned = hostStr.replace(/\(.*?\)/g, ' ').replace(/\[.*?\]/g, ' ');
  return cleaned.split(sep)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function hostNameMatchesSlot(name, h) {
  if (!name || !h.host) return false;
  const n  = name.toLowerCase();
  const hn = h.host.toLowerCase();
  const nWords  = n.split(/\s+/).filter(w => w.length >= 3);
  const hnWords = hn.split(/\s+/).filter(w => w.length >= 3);
  return nWords.some(w => hnWords.some(hw => hw.includes(w) || w.includes(hw)));
}

function getOverlapRatio(fStart, fEnd, hStart, hEnd) {
  let fS = toMin(fStart), fE = toMin(fEnd);
  let hS = toMin(hStart), hE = toMin(hEnd);
  if (fE === 0) fE = 1440;
  if (hE === 0) hE = 1440;
  const overlapStart = Math.max(fS, hS);
  const overlapEnd   = Math.min(fE, hE);
  if (overlapEnd <= overlapStart) return 0;
  const hostDur = hE - hS;
  if (hostDur <= 0) return 0;
  return (overlapEnd - overlapStart) / hostDur;
}

function getTimeMatchScore(formResp, hostStart, hostEnd) {
  let score = 0;
  const fS = toMin(formResp.startLive);
  const fE = toMin(formResp.endLive);
  const hS = toMin(hostStart);
  let hE   = toMin(hostEnd);
  if (hE === 0) hE = 1440;

  if (formResp.endLive && Math.abs(fE - hE) <= 30)  score += 3;
  if (formResp.startLive && Math.abs(fS - hS) <= 30) score += 2;
  if (getOverlapRatio(formResp.startLive, formResp.endLive, hostStart, hostEnd) >= 0.5) score += 1;
  return score;
}

function sessionMatch(formResp, session, hostObj) {
  const fBrand = normalizeBrand(formResp.brand || '');
  const sBrand = normalizeBrand(session.brand || '');
  if (!fBrand || !sBrand) return false;
  if (fBrand.slice(0,5) !== sBrand.slice(0,5)) return false;

  const fMp = normalizeMp(formResp.marketplace || '');
  const sMp = normalizeMp(session.marketplace || session.mp || '');
  if (fMp.slice(0,4) !== sMp.slice(0,4)) return false;

  const hosts = parseFormHosts(formResp.host || '');
  const nameMatch = hosts.length > 0
    ? hosts.some(n => hostNameMatchesSlot(n, hostObj))
    : hostNameMatchesSlot(formResp.host, hostObj);
  if (!nameMatch) return false;

  return getTimeMatchScore(formResp, hostObj.start, hostObj.end) >= 2;
}

function deduplicateResponses(responses) {
  const map = new Map();
  for (const r of responses) {
    const key = [r.host, r.brand, r.marketplace, r.startLive, r.endLive].join('|').toLowerCase();
    if (map.has(key)) {
      const ex = map.get(key);
      if (r.submittedAt > ex.submittedAt) ex.submittedAt = r.submittedAt;
      if (r.screenshot) ex.screenshots.push(r.screenshot);
    } else {
      map.set(key, { ...r, screenshots: r.screenshot ? [r.screenshot] : [] });
    }
  }
  return Array.from(map.values());
}

function buildExclusiveClaims(dedupedResponses, allSlots) {
  const claims = {};
  dedupedResponses.forEach((r, rIdx) => {
    const hosts = parseFormHosts(r.host || '');
    if (hosts.length <= 1) {
      // single-host: claim 1 best slot
      let best = null, bestScore = -1;
      allSlots.forEach(slot => {
        if (!sessionMatch(r, slot.session, slot.host)) return;
        const sc = getTimeMatchScore(r, slot.host.start, slot.host.end);
        if (sc > bestScore) { bestScore = sc; best = slot.key; }
      });
      if (best) claims[rIdx] = [best];
    } else {
      // multi-host: each name claims its own best slot
      const claimed = [];
      hosts.forEach(name => {
        let best = null, bestScore = -1;
        allSlots.forEach(slot => {
          const fBrand = normalizeBrand(r.brand || '');
          const sBrand = normalizeBrand(slot.session.brand || '');
          if (fBrand.slice(0,5) !== sBrand.slice(0,5)) return;
          const fMp = normalizeMp(r.marketplace || '');
          const sMp = normalizeMp(slot.session.marketplace || slot.session.mp || '');
          if (fMp.slice(0,4) !== sMp.slice(0,4)) return;
          if (!hostNameMatchesSlot(name, slot.host)) return;
          const sc = getTimeMatchScore(r, slot.host.start, slot.host.end);
          if (sc > bestScore) { bestScore = sc; best = slot.key; }
        });
        if (best) claimed.push(best);
      });
      if (claimed.length) claims[rIdx] = claimed;
    }
  });
  return claims;
}

function getClaimedForms(slotKey, dedupedForms, exclusiveClaims) {
  return dedupedForms.filter((_, rIdx) => {
    const cl = exclusiveClaims[rIdx];
    return cl && cl.includes(slotKey);
  });
}

function findSessionCandidates(session, hostObj, dedupedForms) {
  return dedupedForms.filter(r => {
    const fBrand = normalizeBrand(r.brand || '');
    const sBrand = normalizeBrand(session.brand || '');
    if (fBrand.slice(0,5) !== sBrand.slice(0,5)) return false;
    const fMp = normalizeMp(r.marketplace || '');
    const sMp = normalizeMp(session.marketplace || session.mp || '');
    if (fMp.slice(0,4) !== sMp.slice(0,4)) return false;
    const sc      = getTimeMatchScore(r, hostObj.start, hostObj.end);
    const overlap = getOverlapRatio(r.startLive, r.endLive, hostObj.start, hostObj.end);
    return sc >= 1 || overlap >= 0.15;
  });
}

// ─── FORMAT HELPERS ──────────────────────────────────────────

function formatPic(pic) {
  if (!pic) return '-';
  const low = pic.toLowerCase();
  const lsc = ['jonathan','hamzah','tyo','hanif'];
  if (lsc.some(n => low.includes(n))) return '@' + low.split(' ')[0];
  if (low === 'lsc') return 'LSC';
  if (low.startsWith('@')) return '@Velind Sirclo';
  return '@' + pic.split(' ')[0] + ' Sirclo';
}

function formatPicForCopy(assignedPic) {
  return formatPic(assignedPic);
}

function mergeSessionTime(sessions, shift) {
  const segs = sessions.filter(s => getShiftByStart(s.startTime || s.start) === shift);
  if (!segs.length) return null;
  const starts = segs.map(s => toMin(s.startTime || s.start));
  const ends   = segs.map(s => { const e = toMin(s.endTime || s.end); return e === 0 ? 1440 : e; });
  return {
    start: minToTime(Math.min(...starts)),
    end:   minToTime(Math.max(...ends) % 1440)
  };
}

function matchBrandConfig(session, cfg) {
  const sb = normalizeBrand(session.brand || '');
  const sm = normalizeMp(session.marketplace || session.mp || '');
  const cb = normalizeBrand(cfg.brand || '');
  const cm = normalizeMp(cfg.mp || '');
  return sb.includes(cb) && sm.includes(cm);
}

// ─── PRESENCE / SSO ──────────────────────────────────────────

function onGsiLoad() {
  if (window.google && google.accounts) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback:  handleCredentialResponse,
      auto_select: true
    });
    google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      { theme:'outline', size:'medium', type:'standard' }
    );
    google.accounts.id.prompt();
  }
}

function handleCredentialResponse(response) {
  const payload = parseJwt(response.credential);
  currentUser = { name: payload.name, email: payload.email, picture: payload.picture };
  document.getElementById('user-login-wrapper').style.display = 'flex';
  document.getElementById('user-avatar').src  = payload.picture;
  document.getElementById('user-name').textContent = payload.name;
  if (!presenceStarted) startPresence();
}

function parseJwt(token) {
  const b64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  return JSON.parse(decodeURIComponent(atob(b64).split('').map(c =>
    '%' + ('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));
}

function startPresence() {
  presenceStarted = true;
  sendHeartbeat();
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  subscribePresence();
}

function sendHeartbeat() {
  if (!currentUser) return;
  fetch('https://ntfy.sh/' + NTFY_PRESENCE, {
    method: 'POST',
    body: JSON.stringify({ name: currentUser.name, email: currentUser.email, picture: currentUser.picture, ts: Date.now() }),
    headers: { 'Content-Type':'application/json', 'Title':'heartbeat' }
  }).catch(() => {});
  onlineUsers[currentUser.email] = { ...currentUser, ts: Date.now() };
  renderOnlineUsers();
}

function subscribePresence() {
  const es = new EventSource('https://ntfy.sh/' + NTFY_PRESENCE + '/sse');
  es.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.message) {
        const u = JSON.parse(msg.message);
        onlineUsers[u.email] = { ...u };
      }
    } catch(_) {}
    prunePresence();
    renderOnlineUsers();
  };
}

function prunePresence() {
  const cutoff = Date.now() - PRESENCE_TTL;
  Object.keys(onlineUsers).forEach(k => {
    if (onlineUsers[k].ts < cutoff) delete onlineUsers[k];
  });
}

function renderOnlineUsers() {
  const el = document.getElementById('online-users');
  if (!el) return;
  const users = Object.values(onlineUsers);
  el.innerHTML = users.map(u =>
    `<img src="${u.picture}" title="${u.name}" style="width:28px;height:28px;border-radius:50%;border:2px solid #22c55e;margin-left:-6px;" onerror="this.style.display='none'">`
  ).join('');
}

// ─── TAB NAVIGATION ──────────────────────────────────────────

function renderTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  const views = ['marathon','single','timeline','standby','klasemen','hari-h','bukti-tayang'];
  views.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.style.display = v === tab ? '' : 'none';
  });

  if (tab === 'marathon')      loadSchedule('marathon');
  if (tab === 'single')        loadSchedule('single');
  if (tab === 'timeline')      loadTimeline();
  // [FIX #3] standby → loadStandby(), bukan renderStandby()
  if (tab === 'standby')       { if (_lastPicScheduleData) renderStandby(null, _lastPicScheduleData); loadStandby(); }
  if (tab === 'klasemen')      loadKlasemen();
  if (tab === 'hari-h')        loadHariH();
  if (tab === 'bukti-tayang')  { loadBuktiTayang(); loadBuktiTayangHistory(); }
}

// ─── SCHEDULE (MARATHON / SINGLE) ────────────────────────────

async function loadSchedule(type) {
  const el = document.getElementById('view-' + type);
  if (!el) return;
  el.innerHTML = '<p style="text-align:center;color:#888">Memuat jadwal…</p>';
  try {
    const data = await apiCall({ action:'schedule' });
    renderSchedule(data, type, el);
  } catch(e) {
    el.innerHTML = `<p style="color:red">Gagal memuat: ${e.message}</p>`;
  }
}

function renderSchedule(data, type, container) {
  const sessions = (data.sessions || []).filter(s =>
    type === 'marathon' ? (s.isMarathon) : (!s.isMarathon)
  );
  if (!sessions.length) { container.innerHTML = '<p style="color:#888;text-align:center">Tidak ada data.</p>'; return; }

  const byShift = { pagi:[], siang:[], malam:[] };
  sessions.forEach(s => {
    const sh = getShiftByStart(s.startTime);
    (byShift[sh] = byShift[sh] || []).push(s);
  });

  let html = '';
  [['malam','🌙'],['pagi','🌅'],['siang','☀️']].forEach(([shift, icon]) => {
    const list = byShift[shift] || [];
    if (!list.length) return;
    html += `<div class="shift-group">
      <div class="shift-header">${icon} Shift ${shift.charAt(0).toUpperCase()+shift.slice(1)}</div>`;
    list.forEach(s => {
      html += `<div class="session-card">
        <div class="session-title">${s.brand} · ${s.marketplace}</div>
        <div class="session-meta">${s.startTime}–${s.endTime} · Studio ${s.studio}</div>
        <div class="session-hosts">${(s.hosts||[]).map(h=>h.name).join(', ')}</div>
      </div>`;
    });
    html += '</div>';
  });
  container.innerHTML = html;
}

// ─── TIMELINE ────────────────────────────────────────────────

async function loadTimeline() {
  const el = document.getElementById('view-timeline');
  if (!el) return;
  el.innerHTML = '<p style="text-align:center;color:#888">Memuat timeline…</p>';
  try {
    const data = await apiCall({ action:'schedule' });
    renderTimeline(data, el);
  } catch(e) {
    el.innerHTML = `<p style="color:red">Gagal memuat: ${e.message}</p>`;
  }
}

function renderTimeline(data, container) {
  const sessions = data.sessions || [];
  const byStart  = {}, byEnd = {};

  sessions.forEach(s => {
    (byStart[s.startTime] = byStart[s.startTime] || []).push(s);
    (byEnd[s.endTime]     = byEnd[s.endTime]     || []).push(s);
  });

  let html = '<div style="display:flex;gap:16px">';
  html += buildTimelineBlock('START', byStart);
  html += buildTimelineBlock('END',   byEnd);
  html += '</div>';
  container.innerHTML = html;
}

function buildTimelineBlock(type, byTime) {
  const times = Object.keys(byTime).sort();
  let html = `<div style="flex:1"><h3>${type}</h3>`;
  times.forEach(time => {
    const items = byTime[time];
    const id = `tl-${type}-${time.replace(':','')}`;
    html += `<div class="time-block">
      <div class="time-block-header" onclick="document.getElementById('${id}').classList.toggle('open')">
        <span>${time}</span>
        <button class="copy-btn" onclick="copyTimeBlock('${time}','${type}',event)" title="Copy">📋</button>
      </div>
      <div id="${id}" class="time-block-body">`;
    items.forEach((s, i) => {
      const pic = (s.hosts && s.hosts[0]) ? s.hosts[0].pic : '-';
      if (type === 'START') {
        html += `<div>${i+1}. ${s.brand} | ${s.marketplace} | Studio ${s.studio} ${(s.hosts||[]).map(h=>h.name).join('/')} ${formatPicForCopy(pic)}</div>`;
      } else {
        html += `<div>${i+1}. ${s.brand} | ${s.marketplace} | Studio ${s.studio} ${formatPicForCopy(pic)}</div>`;
      }
    });
    html += '</div></div>';
  });
  html += '</div>';
  return html;
}

function copyTimeBlock(time, type, e) {
  if (e) e.stopPropagation();
  const id    = `tl-${type}-${time.replace(':','')}`;
  const el    = document.getElementById(id);
  if (!el) return;
  const lines = Array.from(el.querySelectorAll('div')).map(d => d.textContent.trim());
  const header = `${type} ${time}`;
  navigator.clipboard.writeText(header + '\n' + lines.join('\n'))
    .then(() => showBanner('Copied!', 'success'));
}

// ─── OPSTANDBY ───────────────────────────────────────────────

async function loadStandby(force = false) {
  if (!force && _lastPicScheduleData) {
    renderStandby(null, _lastPicScheduleData);
    return;
  }
  try {
    const [schedData, picData] = await Promise.all([
      apiCall({ action:'schedule', ...(force?{nocache:1}:{}) }),
      apiCall({ action:'picschedule', ...(force?{nocache:1}:{}) })
    ]);
    _lastPicScheduleData = picData.success ? picData : null;
    renderStandby(schedData, _lastPicScheduleData);
  } catch(e) {
    const el = document.getElementById('standby-content');
    if (el) el.innerHTML = `<p style="color:red">Gagal memuat standby: ${e.message}</p>`;
  }
}

async function forceRefreshStandby() {
  _lastPicScheduleData = null;
  _standbyRrIndex = {};
  await loadStandby(true);
}

/** [FIX #2 & #6] Satu-satunya deklarasi renderStandby().
 *  Pakai element #standby-content.
 *  _standbyRrIndex di-reset di sini (fix #6). */
function renderStandby(schedData, picData) {
  // [FIX #6] Reset round-robin setiap render
  _standbyRrIndex = {};

  const el = document.getElementById('standby-content');
  if (!el) return;

  if (!picData) {
    el.innerHTML = '<p style="color:#888;text-align:center">Data PIC belum tersedia.</p>';
    return;
  }

  const ops    = picData.pics || [];
  const today  = picData.date || '';
  const sheet  = picData.sheetName || '';
  const sessions = (schedData && schedData.sessions) || [];

  let html = `<div class="standby-banner">📅 ${formatStandbyDate(today)} · <small>${sheet}</small></div>`;

  // ── PIC SHIFT PAGI / SIANG ──
  const picByShift = { pagi:[], siang:[], malam:[] };
  ops.forEach(op => {
    if (!op.studios || !op.studios.length) return;
    const sh = op.shift || 'pagi';
    picByShift[sh].push(op);
  });

  html += '<h3 class="standby-section-title">👷 PIC Shift</h3>';
  [['pagi','🌅'],['siang','☀️'],['malam','🌙']].forEach(([shift, icon]) => {
    const list = picByShift[shift];
    if (!list.length) return;
    html += `<div class="standby-shift-group">
      <div class="standby-shift-label">${icon} ${shift.toUpperCase()}</div>
      <div class="standby-ops">`;
    list.forEach(op => {
      html += `<div class="standby-op-chip">${op.name} <span class="studio-tag">St.${op.studios.join(',')}</span></div>`;
    });
    html += '</div></div>';
  });

  // ── STANDBY per BRAND ──
  html += '<h3 class="standby-section-title">🎯 Standby Brand</h3>';

  STANDBY_BRANDS_CFG.forEach(cfg => {
    const relatedSessions = sessions.filter(s => matchBrandConfig(s, cfg));
    if (!relatedSessions.length) return;

    html += `<div class="standby-brand-block">
      <div class="standby-brand-title">${cfg.label}</div>`;

    if (cfg.type === 'dedicated') {
      // Dedicated: ambil dari section tertentu, group by shift
      const sectionOps = ops.filter(op => op.section === cfg.section && op.studios && op.studios.length);
      ['pagi','siang'].forEach(shift => {
        const shiftOps = sectionOps.filter(op => op.shift === shift);
        const merged   = mergeSessionTime(relatedSessions, shift);
        if (!shiftOps.length) return;
        html += `<div class="standby-dedicated-row">
          <span class="shift-pill ${shift}">${shift}</span>
          <span>${shiftOps.map(o => o.name).join(', ')}</span>
          ${merged ? `<span class="time-range">${merged.start}–${merged.end}</span>` : ''}
        </div>`;
      });

    } else if (cfg.perOperator) {
      // Floating per-operator: round-robin 1 op per slot
      relatedSessions.forEach(session => {
        const slotShift = getShiftByStart(session.startTime);
        const pool = ops.filter(op =>
          (op.section === 'floating' || op.section === 'intern') &&
          op.shift === slotShift &&
          op.studios && op.studios.length
        );
        if (!pool.length) return;
        if (!_standbyRrIndex[cfg.label]) _standbyRrIndex[cfg.label] = 0;
        const op = pool[_standbyRrIndex[cfg.label] % pool.length];
        _standbyRrIndex[cfg.label]++;
        html += `<div class="standby-slot-row">
          <span class="shift-pill ${slotShift}">${slotShift}</span>
          <span>${session.startTime}–${session.endTime}</span>
          <span>${op.name}</span>
        </div>`;
      });

    } else {
      // Floating all: semua pool untuk shift itu
      const slotsByShift = {};
      relatedSessions.forEach(s => {
        const sh = getShiftByStart(s.startTime);
        (slotsByShift[sh] = slotsByShift[sh] || []).push(s);
      });
      Object.entries(slotsByShift).forEach(([shift, slots]) => {
        const pool = ops.filter(op =>
          (op.section === 'floating' || op.section === 'intern') &&
          op.shift === shift &&
          op.studios && op.studios.length
        );
        if (!pool.length) return;
        slots.forEach(s => {
          html += `<div class="standby-slot-row">
            <span class="shift-pill ${shift}">${shift}</span>
            <span>${s.startTime}–${s.endTime}</span>
            <span>${pool.map(o=>o.name).join(', ')}</span>
          </div>`;
        });
      });
    }

    html += '</div>';
  });

  // Copy button
  html += `<button class="copy-fab" onclick="copyStandbyReminder()">📋 Copy Reminder</button>`;
  el.innerHTML = html;
}

function copyStandbyReminder() {
  const el = document.getElementById('standby-content');
  if (!el) return;
  const text = el.innerText || el.textContent || '';
  navigator.clipboard.writeText(text)
    // [FIX #4] showToast → showBanner
    .then(() => showBanner('Standby reminder di-copy!', 'success'))
    .catch(() => showBanner('Gagal copy', 'error'));
}

function copyBrandStandby(label) {
  const el = document.querySelector(`[data-brand="${label}"]`);
  const text = el ? (el.innerText || '') : label;
  navigator.clipboard.writeText(text)
    // [FIX #4] showToast → showBanner
    .then(() => showBanner(`${label} di-copy!`, 'success'))
    .catch(() => showBanner('Gagal copy', 'error'));
}

// ─── KLASEMEN ────────────────────────────────────────────────

async function loadKlasemen(force = false) {
  const el = document.getElementById('view-klasemen');
  if (!el) return;
  if (!force && _lastKlasemenData) { renderKlasemen(_lastKlasemenData, el); return; }
  el.innerHTML = '<p style="text-align:center;color:#888">Memuat klasemen…</p>';
  try {
    const data = await apiCall({ action:'leaderboard', ...(force?{nocache:1}:{}) }, 30000);
    _lastKlasemenData = data;
    renderKlasemen(data, el);
  } catch(e) {
    el.innerHTML = `<p style="color:red">Gagal memuat: ${e.message}</p>`;
  }
}

function forceRefreshKlasemen() { loadKlasemen(true); }

function renderKlasemen(data, container) {
  const list = data.leaderboard || [];
  if (!list.length) { container.innerHTML = '<p style="color:#888;text-align:center">Data kosong.</p>'; return; }

  let totalPending = 0, totalH1 = 0, totalBelumLengkap = 0;
  list.forEach(p => {
    totalPending += (p.hariHCount || 0);
    totalH1      += (p.h1Count   || 0);
    totalBelumLengkap += (p.pendingBelumLengkap || 0);
  });

  let html = `<div class="summary-cards">
    <div class="summary-card red">⏳ Hari H<br><b>${totalPending}</b></div>
    <div class="summary-card orange">⚠ Blm Lgkp<br><b>${totalBelumLengkap}</b></div>
    <div class="summary-card blue">📋 H+1<br><b>${totalH1}</b></div>
  </div>
  <button class="refresh-btn" onclick="forceRefreshKlasemen()">🔄 Refresh</button>`;

  list.forEach(p => {
    const hh    = p.hariHCount   || 0;
    const h1    = p.h1Count      || 0;
    const blm   = p.pendingBelumLengkap || 0;
    const hhTxt = hh ? `${hh} Hari H${blm ? ` (${blm} ⚠ blm lgkp)` : ''}` : '';
    const h1Txt = h1 ? `${h1} H+1` : '';
    const statusTxt = [hhTxt, h1Txt].filter(Boolean).join(' · ') || '✅ Lengkap';

    html += `<div class="klasemen-row" style="${hh ? 'background:#fff7ed' : ''}">
      <div class="klasemen-pic">${p.pic}</div>
      <div class="klasemen-status">${statusTxt}</div>`;

    if (p.pendingRows && p.pendingRows.length) {
      html += '<div class="klasemen-pending">';
      p.pendingRows.forEach(r => {
        const isBelum = r.belumLengkap;
        html += `<div class="pending-row" style="${isBelum ? 'background:#fffbeb' : ''}">
          <span class="pending-badge ${isBelum ? 'orange' : r.type}">${isBelum ? '⚠ Blm Lengkap' : r.type === 'hariH' ? 'Hari H' : 'H+1'}</span>
          ${r.date} · ${r.brand} · ${r.marketplace} · Studio ${r.studio}
        </div>`;
      });
      html += '</div>';
    }
    html += '</div>';
  });
  container.innerHTML = html;
}

// ─── HARI H ──────────────────────────────────────────────────

async function loadHariH(force = false) {
  const el = document.getElementById('view-hari-h');
  if (!el) return;
  if (!force && _lastHariHData && _lastFormData) { renderHariH(_lastHariHData, _lastFormData, el); return; }
  el.innerHTML = '<p style="text-align:center;color:#888">Memuat data hari H…</p>';
  try {
    const [todayData, formData] = await Promise.allSettled([
      apiCall({ action:'today', ...(force?{nocache:1}:{}) }, 30000),
      apiCall({ action:'formcheck', ...(force?{nocache:1}:{}) }, 30000)
    ]);
    if (todayData.status === 'fulfilled') _lastHariHData = todayData.value;
    if (formData.status  === 'fulfilled') _lastFormData  = formData.value;
    if (_lastHariHData) renderHariH(_lastHariHData, _lastFormData || { responses:[] }, el);
    else el.innerHTML = '<p style="color:red">Gagal memuat data hari H.</p>';
  } catch(e) {
    el.innerHTML = `<p style="color:red">Gagal: ${e.message}</p>`;
  }
}

async function forceRefreshHariH() { await loadHariH(true); }

function renderHariH(data, formData, container) {
  const sessions      = data.leaderboard || [];
  const formResponses = (formData && formData.responses) || [];

  // Pre-pass
  const dedupedForms    = deduplicateResponses(formResponses);
  const allSlots        = [];
  sessions.forEach(p => {
    (p.hariHRows || []).forEach(r => {
      (r.hosts || []).forEach(h => {
        allSlots.push({ key:`${r.idLine}|${h.name}|${h.start}`, session:r, host:h });
      });
    });
  });
  const exclusiveClaims = buildExclusiveClaims(dedupedForms, allSlots);

  const byShift = { pagi:[], siang:[], malam:[] };
  sessions.forEach(p => {
    (p.hariHRows || []).forEach(r => {
      const sh = getHariHShift(r.endTime);
      (byShift[sh] = byShift[sh] || []).push({ r, p });
    });
  });

  let html = `<div class="harih-header">
    <div class="harih-date">${data.date || ''}</div>
    <button class="refresh-btn" onclick="forceRefreshHariH()">🔄 Refresh</button>
  </div>`;

  [['malam','🌙'],['pagi','🌅'],['siang','☀️']].forEach(([shift, icon]) => {
    const rows = byShift[shift] || [];
    if (!rows.length) return;
    html += `<div class="shift-group">
      <div class="shift-header">${icon} Shift ${shift.charAt(0).toUpperCase()+shift.slice(1)} (${rows.length})</div>`;

    rows.forEach(({ r, p }) => {
      const isHold      = r.isHold;
      const holdBadge   = isHold ? '<span class="badge red">HOLD</span>' : '';
      const typeBadge   = r.isMarathon ? '<span class="badge purple">Marathon</span>' : '<span class="badge blue">Single</span>';
      const nonRound    = r.endTime && toMin(r.endTime) % 60 !== 0 && toMin(r.endTime) !== 0;
      const nonRoundWarn= nonRound ? `<div class="warn orange">⚠ Non-round end ${r.endTime}${r.flagData?' · '+r.flagData:''}${r.remarks?' · '+r.remarks:''}</div>` : '';

      html += `<div class="session-card">
        <div class="session-title">${r.brand} · ${r.marketplace} ${typeBadge} ${holdBadge}</div>
        <div class="session-meta">${r.startTime}–${r.endTime} · Studio ${r.studio} · PIC: ${p.pic}</div>
        ${nonRoundWarn}`;

      (r.hosts || []).forEach(h => {
        const slotKey    = `${r.idLine}|${h.name}|${h.start}`;
        const claimed    = getClaimedForms(slotKey, dedupedForms, exclusiveClaims);
        const candidates = findSessionCandidates(r, h, dedupedForms);
        const now        = Date.now();
        const hEndMs     = (() => {
          const d = new Date(); const parts = (h.end||'').split(':');
          d.setHours(+parts[0]||0, +parts[1]||0, 0, 0); return d.getTime();
        })();

        html += `<div class="host-slot">
          <div class="host-name">${h.name} <small>${h.start}–${h.end}</small></div>`;

        if (claimed.length) {
          const isValid = claimed.some(f => f.submittedAt > hEndMs);
          if (isValid) {
            html += `<div class="upload-status green">✅ Upload terdeteksi</div>`;
            claimed.forEach(f => {
              html += `<div class="form-entry">${f.host} · ${f.startLive}–${f.endLive}
                ${f.screenshots && f.screenshots.length ? f.screenshots.map(l=>`<a href="${l}" target="_blank">📸</a>`).join(' ') : ''}
              </div>`;
            });
          } else {
            html += `<div class="upload-status red">⚠️ Menunggu form upload yang benar — Hubungi host: ${h.name}</div>`;
          }
        } else if (candidates.length) {
          html += `<div class="upload-status yellow">❓ Kandidat ditemukan (${candidates.length})</div>`;
        } else {
          html += `<div class="upload-status red">⏳ Belum ada form upload</div>`;
        }

        html += '</div>'; // host-slot
      });

      html += '</div>'; // session-card
    });
    html += '</div>'; // shift-group
  });

  container.innerHTML = html || '<p style="color:#888;text-align:center">Semua sesi sudah lengkap ✅</p>';
}

// ─── BUKTI TAYANG ────────────────────────────────────────────

async function loadBuktiTayang(force = false) {
  if (!force && _lastBuktiTayangData) { renderBuktiTayang(_lastBuktiTayangData); return; }
  try {
    const data = await apiCall({ action:'buktitayang', ...(force?{nocache:1}:{}) }, 30000);
    _lastBuktiTayangData = data;
    renderBuktiTayang(data);
  } catch(e) {
    const el = document.getElementById('schedule-list');
    if (el) el.innerHTML = `<p style="color:red">Gagal memuat Bukti Tayang: ${e.message}</p>`;
  }
}

async function forceRefreshBuktiTayang() {
  _lastBuktiTayangData = null;
  _lastBuktiTayangHistoryData = null;
  await Promise.all([loadBuktiTayang(true), loadBuktiTayangHistory(true)]);
}

/**
 * [FIX #1 & #7] Satu-satunya renderBuktiTayang() — versi BARU dengan shift malam.
 * Kelompok shift by START time via getShiftBT().
 * Order tampil: malam → pagi → siang.
 */
function renderBuktiTayang(data) {
  const el = document.getElementById('schedule-list');
  if (!el) return;

  const sessions = data.sessions || [];
  const dateStr  = data.date || '';
  const total    = sessions.length;
  const belum    = sessions.filter(s => s.status !== 'uploaded').length;

  const shifts = { malam:[], pagi:[], siang:[] };
  sessions.forEach(s => {
    const sh = getShiftBT(s.startTime);
    (shifts[sh] = shifts[sh] || []).push(s);
  });

  let html = `<div class="bt-header">
    <div>📋 Bukti Tayang · ${dateStr}</div>
    <div>Total: ${total} · Belum: ${belum}</div>
    <button class="copy-fab-sm" onclick="copyBuktiTayangWA()">📋 Copy WA</button>
    <button class="refresh-btn" onclick="forceRefreshBuktiTayang()">🔄 Refresh</button>
  </div>`;

  [['malam','🌙'],['pagi','🌅'],['siang','☀️']].forEach(([shift, icon]) => {
    const list = shifts[shift] || [];
    if (!list.length) return;
    const shiftId = `bt-shift-${shift}`;
    const done    = list.filter(s => s.status === 'uploaded');
    const notDone = list.filter(s => s.status !== 'uploaded');

    html += `<div class="bt-shift-group" id="${shiftId}">
      <div class="bt-shift-header" onclick="toggleBtShift('${shift}')">
        ${icon} Shift ${shift.charAt(0).toUpperCase()+shift.slice(1)} 
        <span class="bt-count">${notDone.length}/${list.length} belum</span>
        <span class="toggle-arrow">▾</span>
      </div>
      <div class="bt-shift-body" id="${shiftId}-body">`;

    html += renderShiftGroup('notdone', notDone, shift);
    html += renderShiftGroup('done',    done,    shift);
    html += '</div></div>';
  });

  el.innerHTML = html || '<p style="color:#888;text-align:center">Semua bukti tayang sudah upload ✅</p>';
}

function renderShiftGroup(status, list, shift) {
  if (!list.length) return '';
  const label  = status === 'done' ? '✅ Sudah Upload' : '⏳ Belum Upload';
  const grpId  = `bt-grp-${shift}-${status}`;
  let html = `<div class="bt-status-group">
    <div class="bt-status-header" onclick="toggleBtStatus('${shift}','${status}')">
      ${label} (${list.length}) <span class="toggle-arrow">▸</span>
    </div>
    <div class="bt-status-body" id="${grpId}" style="display:none">`;
  list.forEach(s => {
    html += `<div class="bt-card ${s.status}">
      <div class="bt-card-title">${s.brand} · ${s.mp}</div>
      <div class="bt-card-meta">${s.startTime}–${s.endTime} · Studio ${s.studio}${s.isMarathon?' · Marathon':''}</div>
      ${s.pics && s.pics.length ? `<div class="bt-uploader">👤 ${s.pics.join(', ')}</div>` : ''}
      ${s.links && s.links.length ? s.links.map(l=>`<a href="${l}" target="_blank" class="bt-link">📸 Lihat</a>`).join(' ') : ''}
    </div>`;
  });
  html += '</div></div>';
  return html;
}

/** [FIX #7] Satu-satunya toggleBtShift() */
function toggleBtShift(shift) {
  const body = document.getElementById(`bt-shift-${shift}-body`);
  const arrow = document.querySelector(`#bt-shift-${shift} .toggle-arrow`);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (arrow) arrow.textContent = open ? '▾' : '▸';
}

/** [FIX #7] Satu-satunya toggleBtStatus() */
function toggleBtStatus(shift, status) {
  const el    = document.getElementById(`bt-grp-${shift}-${status}`);
  const header = el ? el.previousElementSibling : null;
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : '';
  const arrow = header ? header.querySelector('.toggle-arrow') : null;
  if (arrow) arrow.textContent = open ? '▸' : '▾';
}

/** Copy ringkasan belum upload ke WA — dengan 3 shift (malam/pagi/siang) */
function copyBuktiTayangWA() {
  const data = _lastBuktiTayangData;
  if (!data) return;
  const sessions = data.sessions || [];
  const belum    = sessions.filter(s => s.status !== 'uploaded');

  const shifts = { malam:[], pagi:[], siang:[] };
  belum.forEach(s => {
    const sh = getShiftBT(s.startTime);
    (shifts[sh] = shifts[sh] || []).push(s);
  });

  const lines = [`📋 *Bukti Tayang ${data.date} — ${belum.length} Belum Upload*`];
  const icons = { malam:'🌙', pagi:'🌅', siang:'☀️' };

  ['malam','pagi','siang'].forEach(shift => {
    const list = shifts[shift] || [];
    if (!list.length) return;
    lines.push(`\n${icons[shift]} *Shift ${shift.charAt(0).toUpperCase()+shift.slice(1)}*`);
    list.forEach(s => {
      lines.push(`• ${s.brand} - ${s.mp} (${s.startTime}–${s.endTime})`);
    });
  });

  navigator.clipboard.writeText(lines.join('\n'))
    .then(() => showBanner('Copy WA berhasil!', 'success'))
    .catch(() => showBanner('Gagal copy', 'error'));
}

// ─── BUKTI TAYANG HISTORY ────────────────────────────────────

async function loadBuktiTayangHistory(force = false) {
  if (!force && _lastBuktiTayangHistoryData) { renderBuktiTayangHistory(_lastBuktiTayangHistoryData); return; }
  try {
    const data = await apiCall({ action:'buktitayanghistory', ...(force?{nocache:1}:{}) }, 30000);
    _lastBuktiTayangHistoryData = data;
    renderBuktiTayangHistory(data);
  } catch(e) {
    const el = document.getElementById('bukti-tayang-history');
    if (el) el.innerHTML = `<p style="color:red">Gagal memuat history: ${e.message}</p>`;
  }
}

function renderBuktiTayangHistory(data) {
  const el = document.getElementById('bukti-tayang-history');
  if (!el) return;
  const byDate = data.byDate || {};
  const dates  = Object.keys(byDate).sort().reverse();
  if (!dates.length) { el.innerHTML = '<p style="color:#888;text-align:center">Tidak ada history pending.</p>'; return; }

  let html = '<h3 style="margin-top:24px">📅 History Belum Upload (H-7 s/d H-1)</h3>';
  dates.forEach(date => {
    const byPic   = byDate[date] || {};
    const safeDate = date.replace(/[^a-z0-9]/gi,'');
    html += `<div class="bt-hist-date" onclick="toggleBtHistDate('${safeDate}')">
      ${date} <span class="toggle-arrow">▾</span>
    </div>
    <div id="bthd-${safeDate}">`;

    Object.entries(byPic).forEach(([pic, rows]) => {
      const safePic = (pic + safeDate).replace(/[^a-z0-9]/gi,'');
      html += `<div class="bt-hist-pic" onclick="toggleBtHistPic('${safePic}')">${pic} (${rows.length}) <span>▸</span></div>
        <div id="bthp-${safePic}" style="display:none">`;
      rows.forEach(r => {
        html += `<div class="bt-hist-row">
          <span class="badge ${r.status === 'pending' ? 'orange' : 'red'}">${r.status}</span>
          ${r.brand} · ${r.mp} · ${r.startTime}–${r.endTime}
        </div>`;
      });
      html += '</div>';
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

function toggleBtHistDate(safeDate) {
  const el = document.getElementById('bthd-' + safeDate);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

function toggleBtHistPic(safePic) {
  const el = document.getElementById('bthp-' + safePic);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

// ─── INIT ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => renderTab(btn.dataset.tab));
  });
  renderTab('marathon');
});
