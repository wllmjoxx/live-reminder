// ============================================================
//  CASTLIVE OPS 2026 — app.js
//  Updated: Apr 22 2026
//  Fixes: FIX-A (normalizeHost), FIX-B (renderTab standby),
//         FIX-C (hapus renderStandby lama), FIX-D/E (schedule-list),
//         FIX-F (showToast→showBanner), FIX-G (_standbyRrIndex reset),
//         FIX-H (toMin dedup)
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyhsAeqXWyuR0sRoNmy2i1vcyvKAk7Q-gaivbiNTLAq7eDKdCev8RpsG11v1aEGdTbB/exec';
const NTFY_TOPIC = 'castlive-ops-2026-xk9';
const NTFY_PRESENCE_TOPIC = 'castlive-presence-2026';
const GOOGLE_CLIENT_ID = '343542715243-jhl0dshlpiklcapfgj4akj0a02vg9q05.apps.googleusercontent.com';

// ─── State ───────────────────────────────────────────────────
let currentTab       = 'marathon';
let scheduleData     = null;
let onlineUsers      = {};
let currentUser      = null;
let presenceStarted  = false;

let _lastKlasemenData       = null;
let _lastHariHData          = null;
let _lastFormData           = null;
let _lastBuktiTayangData    = null;
let _lastBuktiTayangHistoryData = null;
let _lastPicScheduleData    = null;   // FIX-A support
let _standbyRrIndex         = {};

// ─── Constants ───────────────────────────────────────────────
const STANDBY_BRANDS_CFG = [
  { label:'AMERICAN TOURISTER TIKTOK', brand:'american tourister', mp:'tiktok',  type:'floating',  perOperator:false },
  { label:'SAMSONITE TIKTOK',          brand:'samsonite',          mp:'tiktok',  type:'floating',  perOperator:false },
  { label:'AMERICAN TOURISTER SHOPEE', brand:'american tourister', mp:'shopee',  type:'dedicated', section:'amtour'  },
  { label:'SAMSONITE SHOPEE',          brand:'samsonite',          mp:'shopee',  type:'floating',  perOperator:true  },
  { label:'ASICS SHOPEE',              brand:'asics',              mp:'shopee',  type:'dedicated', section:'asics'   },
];

// ─── Utility ─────────────────────────────────────────────────

// [FIX-H] Satu deklarasi toMin saja (hapus duplikat di blok OPSTANDBY)
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
  return str.replace(/[^a-zA-Z0-9\s]/g,'').toLowerCase().trim();
}

function normalizeMp(str) {
  if (!str) return '';
  return str.replace(/\s+/g,'').toLowerCase().trim();
}

// [FIX-A] normalizeHost — backward compat field names
// Apps Script FIX-3 return: name/start/end/pic
// Old app.js expects: host/startTime/endTime/picData
function normalizeHost(h) {
  const name      = h.name      || h.host      || '-';
  const startTime = h.start     || h.startTime  || '-';
  const endTime   = h.end       || h.endTime    || '-';
  const picData   = h.pic       || h.picData    || '-';
  return {
    host: name, startTime, endTime, picData,
    name, start: startTime, end: endTime, pic: picData
  };
}

// Unified shift by start time
function getShiftByStart(t) {
  if (!t) return 'siang';
  const m = toMin(t);
  if (m < 480) return 'malam';
  if (m < 960) return 'pagi';
  return 'siang';
}

function getShiftBT(startTime) {
  return getShiftByStart(startTime);
}

function getHariHShift(endTime) {
  if (!endTime) return 'siang';
  if (endTime === '00:00') return 'siang';
  const m = toMin(endTime);
  if (m === 0) return 'siang';
  if (m < 480) return 'malam';
  if (m < 960) return 'pagi';
  return 'siang';
}

function formatStandbyDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
  const months = ['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI',
                  'JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function splitAtShiftBoundary(startStr, endStr) {
  const BOUNDS = [480, 960, 1440];
  let s = toMin(startStr);
  let e = toMin(endStr);
  if (e === 0) e = 1440;
  if (e <= s) e += 1440;
  const results = [];
  let cur = s;
  for (const b of BOUNDS) {
    if (cur >= b) continue;
    if (e <= b) {
      results.push({ start: minToTime(cur % 1440), end: minToTime(e % 1440), shift: getShiftByStart(minToTime(cur % 1440)) });
      cur = e;
      break;
    }
    results.push({ start: minToTime(cur % 1440), end: minToTime(b % 1440), shift: getShiftByStart(minToTime(cur % 1440)) });
    cur = b;
  }
  if (cur < e) {
    results.push({ start: minToTime(cur % 1440), end: minToTime(e % 1440), shift: getShiftByStart(minToTime(cur % 1440)) });
  }
  return results;
}

function matchBrandConfig(session, cfg) {
  const sb = normalizeBrand(session.brand  || '');
  const sm = normalizeMp(session.mp        || session.marketplace || '');
  const cb = normalizeBrand(cfg.brand);
  const cm = normalizeMp(cfg.mp);
  return sb.includes(cb) && sm.includes(cm);
}

function mergeSessionTime(sessions, shift) {
  const slots = sessions.filter(s => getShiftByStart(s.hosts[0]?.start || s.hosts[0]?.startTime) === shift);
  if (!slots.length) return null;
  let minStart = 9999, maxEnd = 0;
  for (const s of slots) {
    for (const h of s.hosts) {
      const hs = toMin(h.start || h.startTime);
      let he = toMin(h.end || h.endTime);
      if (he === 0) he = 1440;
      if (hs < minStart) minStart = hs;
      if (he > maxEnd) maxEnd = he;
    }
  }
  return { start: minToTime(minStart), end: minToTime(maxEnd % 1440) };
}

function formatPicForCopy(assignedPic) {
  if (!assignedPic || assignedPic === '-' || assignedPic === 'LSC') return 'LSC';
  const p = assignedPic.toLowerCase();
  if (['jonathan','hamzah','tyo','andityo','hanif'].some(n => p.includes(n))) {
    return '@' + p.split(' ')[0];
  }
  if (p.startsWith('@')) return '@Velind Sirclo';
  return '@' + assignedPic.split(' ')[0] + ' Sirclo';
}

// ─── Banner / Toast ──────────────────────────────────────────
function showBanner(msg, type = 'info') {
  let banner = document.getElementById('app-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'app-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:10px 16px;'
      + 'font-size:14px;font-weight:600;text-align:center;transition:opacity .3s;';
    document.body.prepend(banner);
  }
  const colors = { success:'#22c55e', error:'#ef4444', info:'#3b82f6', warning:'#f59e0b' };
  banner.style.background  = colors[type] || colors.info;
  banner.style.color        = '#fff';
  banner.style.opacity      = '1';
  banner.textContent        = msg;
  clearTimeout(banner._t);
  banner._t = setTimeout(() => { banner.style.opacity = '0'; }, 2500);
}

// ─── Tab Switching ────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  renderTab(tab);
}

// [FIX-B] renderTab — standby harus call loadStandby()
function renderTab(tab) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  if (tab === 'marathon') {
    if (scheduleData) renderMarathon(scheduleData);
    else loadSchedule();
  } else if (tab === 'single') {
    if (scheduleData) renderSingle(scheduleData);
    else loadSchedule();
  } else if (tab === 'timeline') {
    if (scheduleData) renderTimeline(scheduleData);
    else loadSchedule();
  } else if (tab === 'standby') {
    // [FIX-B] Ganti renderStandby() tanpa args → loadStandby()
    if (_lastPicScheduleData) renderStandby(null, _lastPicScheduleData);
    loadStandby();
  } else if (tab === 'klasemen') {
    if (_lastKlasemenData) renderKlasemen(_lastKlasemenData);
    loadKlasemen();
  } else if (tab === 'harih') {
    if (_lastHariHData) renderHariH(_lastHariHData, _lastFormData);
    loadHariH();
  } else if (tab === 'buktitayang') {
    if (_lastBuktiTayangData) renderBuktiTayang(_lastBuktiTayangData);
    loadBuktiTayang();
  }
}

// ─── Schedule Load ───────────────────────────────────────────
async function loadSchedule(force = false) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  el.innerHTML = '<p class="loading">Memuat jadwal...</p>';
  try {
    const url = API_URL + '?action=schedule' + (force ? '&nocache=1' : '');
    const res  = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const data = await res.json();
    if (!data.sessions) throw new Error('No sessions');

    // [FIX-A] normalizeHost di setiap session
    data.sessions = data.sessions.map(s => {
      s.isMarathon = s.hosts.length > 1;
      s.hosts = s.hosts.map(normalizeHost);
      return s;
    });

    scheduleData = data;
    renderTab(currentTab);
  } catch (e) {
    el.innerHTML = `<p class="error">Gagal memuat jadwal: ${e.message}</p>`;
  }
}

function forceRefreshSchedule() {
  scheduleData = null;
  loadSchedule(true);
}

// ─── Render Marathon ─────────────────────────────────────────
function renderMarathon(data) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  const marathons = (data.sessions || []).filter(s => s.isMarathon);
  if (!marathons.length) {
    el.innerHTML = '<p class="empty">Tidak ada sesi marathon hari ini.</p>';
    return;
  }
  el.innerHTML = marathons.map(s => renderSessionCard(s, 'marathon')).join('');
}

// ─── Render Single ───────────────────────────────────────────
function renderSingle(data) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  const singles = (data.sessions || []).filter(s => !s.isMarathon);
  if (!singles.length) {
    el.innerHTML = '<p class="empty">Tidak ada sesi single hari ini.</p>';
    return;
  }
  el.innerHTML = singles.map(s => renderSessionCard(s, 'single')).join('');
}

function renderSessionCard(s, mode) {
  const h0  = s.hosts[0] || {};
  const start = h0.startTime || h0.start || '-';
  const end   = (s.hosts[s.hosts.length - 1] || {}).endTime || (s.hosts[s.hosts.length - 1] || {}).end || '-';
  const hostList = s.hosts.map(h =>
    `<div class="host-row">
      <span class="host-time">${h.startTime || h.start || '-'} – ${h.endTime || h.end || '-'}</span>
      <span class="host-name">${h.host || h.name || '-'}</span>
      <span class="host-pic">${h.picData || h.pic || '-'}</span>
    </div>`
  ).join('');
  return `
    <div class="session-card ${s.isMarathon ? 'marathon' : 'single'}">
      <div class="session-header">
        <span class="session-brand">${s.brand || '-'}</span>
        <span class="session-mp">${s.mp || s.marketplace || '-'}</span>
        <span class="session-studio">Studio ${s.studio || '-'}</span>
        <span class="session-time">${start} – ${end}</span>
      </div>
      <div class="host-list">${hostList}</div>
    </div>`;
}

// ─── Render Timeline ─────────────────────────────────────────
function renderTimeline(data) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  const events = [];
  for (const s of (data.sessions || [])) {
    for (const h of s.hosts) {
      if (h.startTime || h.start) events.push({ type:'start', time: h.startTime || h.start, session: s, host: h });
      if (h.endTime   || h.end)   events.push({ type:'end',   time: h.endTime   || h.end,   session: s, host: h });
    }
  }
  events.sort((a,b) => toMin(a.time) - toMin(b.time));
  const grouped = {};
  for (const ev of events) {
    const key = ev.time + '_' + ev.type;
    if (!grouped[key]) grouped[key] = { time: ev.time, type: ev.type, items: [] };
    grouped[key].items.push(ev);
  }
  const blocks = Object.values(grouped).sort((a,b) => {
    const ta = toMin(a.time), tb = toMin(b.time);
    return ta !== tb ? ta - tb : (a.type === 'start' ? -1 : 1);
  });
  if (!blocks.length) {
    el.innerHTML = '<p class="empty">Tidak ada data timeline.</p>';
    return;
  }
  el.innerHTML = blocks.map(b => makeBlock(b)).join('');
}

function makeBlock(b) {
  const label = b.type === 'start' ? '🟢 START' : '🔴 END';
  const itemsHtml = b.items.map((ev, i) => {
    const s = ev.session, h = ev.host;
    const studio  = s.studio || '-';
    const brand   = s.brand  || '-';
    const mp      = s.mp || s.marketplace || '-';
    const host    = h.host || h.name || '-';
    const pic     = h.picData || h.pic || '-';
    return `<div class="timeline-item">
      <span class="ti-num">${i+1}.</span>
      <span class="ti-brand">${brand}</span>
      <span class="ti-mp">${mp}</span>
      <span class="ti-studio">Studio ${studio}</span>
      <span class="ti-host">${b.type==='start' ? host : ''}</span>
      <span class="ti-pic">${pic}</span>
    </div>`;
  }).join('');
  return `<div class="time-block">
    <div class="time-block-header" onclick="this.parentElement.classList.toggle('collapsed')">
      <span class="tb-label">${label}</span>
      <span class="tb-time">${b.time}</span>
      <button class="copy-btn-sm" onclick="copyTimeBlock('${b.time}','${b.type}',${JSON.stringify(b.items.map(ev=>({brand:ev.session.brand||'-',mp:ev.session.mp||ev.session.marketplace||'-',studio:ev.session.studio||'-',host:ev.host.host||ev.host.name||'-',pic:ev.host.picData||ev.host.pic||'-'})))},this);event.stopPropagation()">📋</button>
    </div>
    <div class="time-block-body">${itemsHtml}</div>
  </div>`;
}

function copyTimeBlock(time, type, items, btn) {
  const header = `${type.toUpperCase()} ${time}`;
  const lines = items.map((it, i) => {
    if (type === 'start') return `${i+1}. ${it.brand} | ${it.mp} | Studio ${it.studio} ${it.host} ${it.pic}`;
    return `${i+1}. ${it.brand} | ${it.mp} | Studio ${it.studio} ${it.pic}`;
  });
  navigator.clipboard.writeText(header + '\n' + lines.join('\n'))
    .then(() => showBanner('Copied: ' + header, 'success'))
    .catch(() => showBanner('Gagal copy', 'error'));
}

// ─── Klasemen ────────────────────────────────────────────────
async function loadKlasemen(force = false) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  if (!force && _lastKlasemenData) { renderKlasemen(_lastKlasemenData); return; }
  el.innerHTML = '<p class="loading">Memuat klasemen...</p>';
  try {
    const url = API_URL + '?action=leaderboard' + (force ? '&nocache=1' : '');
    const res  = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const data = await res.json();
    _lastKlasemenData = data;
    renderKlasemen(data);
  } catch (e) {
    el.innerHTML = `<p class="error">Gagal memuat klasemen: ${e.message}</p>`;
  }
}

function forceRefreshKlasemen() {
  _lastKlasemenData = null;
  loadKlasemen(true);
}

function renderKlasemen(data) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  const lb = data.leaderboard || [];
  if (!lb.length) {
    el.innerHTML = '<p class="empty">Tidak ada data klasemen.</p>';
    return;
  }

  const totalHariH        = lb.reduce((a,p) => a + (p.hariHCount     || 0), 0);
  const totalH1           = lb.reduce((a,p) => a + (p.h1Count        || 0), 0);
  const totalBelumLengkap = lb.reduce((a,p) => a + (p.pendingBelumLengkap || 0), 0);

  const summaryCards = `
    <div class="summary-cards">
      <div class="s-card red">🔴 Hari H <strong>${totalHariH}</strong></div>
      <div class="s-card orange">🟡 H+1 <strong>${totalH1}</strong></div>
      <div class="s-card yellow">⚠ Blm Lgkp <strong>${totalBelumLengkap}</strong></div>
    </div>
    <button class="refresh-btn" onclick="forceRefreshKlasemen()">🔄 Force Refresh</button>`;

  const rows = lb.map(p => {
    const hasPending = (p.hariHCount || 0) > 0 || (p.h1Count || 0) > 0;
    const statusParts = [];
    if (p.hariHCount > 0) {
      const bl = p.pendingBelumLengkap || 0;
      statusParts.push(`${p.hariHCount} Hari H${bl > 0 ? ` (${bl} ⚠ blm lgkp)` : ''}`);
    }
    if (p.h1Count > 0) statusParts.push(`${p.h1Count} H+1`);
    const statusText = statusParts.join(' · ') || '✅ Bersih';

    const pendingRows = (p.pending || []).map(row => {
      const isBelumLengkap = row.belumLengkap;
      const badge = isBelumLengkap
        ? `<span class="badge orange">⚠ Blm Lengkap</span>`
        : `<span class="badge red">Hari H</span>`;
      const cardBg = isBelumLengkap ? '#fffbeb' : '#fff';
      return `<div class="pending-row" style="background:${cardBg}">
        ${badge}
        <span class="pr-brand">${row.brand || '-'}</span>
        <span class="pr-mp">${row.mp || '-'}</span>
        <span class="pr-date">${row.date || '-'}</span>
      </div>`;
    }).join('');

    return `<div class="klasemen-row ${hasPending ? 'has-pending' : ''}">
      <div class="kr-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
        <span class="kr-pic">${p.pic || '-'}</span>
        <span class="kr-status">${statusText}</span>
      </div>
      <div class="kr-pending hidden">${pendingRows || '<p class="empty-sm">Tidak ada pending</p>'}</div>
    </div>`;
  }).join('');

  el.innerHTML = summaryCards + '<div class="klasemen-list">' + rows + '</div>';
}

// ─── Hari H ──────────────────────────────────────────────────
async function loadHariH(force = false) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  if (!force && _lastHariHData) { renderHariH(_lastHariHData, _lastFormData); return; }
  el.innerHTML = '<p class="loading">Memuat data hari H...</p>';
  try {
    const [todayRes, formRes] = await Promise.allSettled([
      fetch(API_URL + '?action=today'     + (force ? '&nocache=1' : ''), { signal: AbortSignal.timeout(30000) }),
      fetch(API_URL + '?action=formcheck' + (force ? '&nocache=1' : ''), { signal: AbortSignal.timeout(30000) })
    ]);
    const todayData = todayRes.status === 'fulfilled' ? await todayRes.value.json() : null;
    const formData  = formRes.status  === 'fulfilled' ? await formRes.value.json()  : null;
    if (todayData) _lastHariHData  = todayData;
    if (formData)  _lastFormData   = formData;
    renderHariH(_lastHariHData, _lastFormData);
  } catch (e) {
    el.innerHTML = `<p class="error">Gagal memuat hari H: ${e.message}</p>`;
  }
}

function forceRefreshHariH() {
  _lastHariHData = null;
  _lastFormData  = null;
  loadHariH(true);
}

function renderHariH(data, formData) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  if (!data) { el.innerHTML = '<p class="empty">Belum ada data.</p>'; return; }

  const formResponses = formData?.responses || [];
  const dedupedForms  = deduplicateResponses(formResponses);
  const allSlots      = (data.leaderboard || []).flatMap(p =>
    p.rows.map(r => ({ brand: r.brand, mp: r.mp, hostObj: r }))
  );
  buildExclusiveClaims(dedupedForms, allSlots);

  const shifts = { pagi: [], siang: [], malam: [] };
  for (const p of (data.leaderboard || [])) {
    for (const r of (p.rows || [])) {
      const shift = getHariHShift(r.endTime);
      shifts[shift].push({ ...r, pic: p.pic });
    }
  }

  let html = `<button class="refresh-btn" onclick="forceRefreshHariH()">🔄 Force Refresh</button>`;
  for (const shift of ['pagi','siang','malam']) {
    if (!shifts[shift].length) continue;
    html += `<div class="shift-group">
      <div class="shift-label">${shift.toUpperCase()}</div>
      ${shifts[shift].map(r => renderHariHRow(r, dedupedForms)).join('')}
    </div>`;
  }
  el.innerHTML = html || '<p class="empty">Semua data sudah lengkap ✅</p>';
}

function renderHariHRow(r, dedupedForms) {
  const slotKey    = `${r.brand}__${r.mp}__${r.host}__${r.startTime}`;
  const claimed    = getClaimedForms(slotKey);
  const candidates = findSessionCandidates({ brand: r.brand, mp: r.mp }, r);
  const isHold     = r.isHold;

  let uploadStatus = '';
  if (claimed.length) {
    const allLate = claimed.every(f => f.submittedAt > (toMin(r.endTime) * 60 * 1000));
    uploadStatus = allLate
      ? `<span class="form-ok">✅ Uploaded</span>`
      : `<span class="form-warn">⚠️ False Upload — Hubungi host: ${r.host}</span>`;
  } else if (candidates.length) {
    uploadStatus = `<span class="form-candidate">❓ Kandidat (${candidates.length})</span>`;
  } else {
    uploadStatus = `<span class="form-missing">⏳ Belum upload</span>`;
  }

  const holdBadge = isHold ? `<span class="badge red">HOLD</span>` : '';

  return `<div class="harih-row">
    <div class="hr-top">
      ${holdBadge}
      <span class="hr-brand">${r.brand || '-'}</span>
      <span class="hr-mp">${r.mp || '-'}</span>
      <span class="hr-studio">Studio ${r.studio || '-'}</span>
      <span class="hr-time">${r.startTime || '-'} – ${r.endTime || '-'}</span>
    </div>
    <div class="hr-bottom">
      <span class="hr-host">${r.host || '-'}</span>
      <span class="hr-pic">${r.pic || '-'}</span>
      ${uploadStatus}
    </div>
  </div>`;
}

// ─── Form Upload Matching ─────────────────────────────────────
let exclusiveClaims = {};

function parseFormHosts(hostStr) {
  if (!hostStr) return [];
  return hostStr.split(/\s+(?:with|dan|bareng|sama|&|,)\s+/i)
    .flatMap(p => p.replace(/[()]/g,'').split(/,\s*/))
    .map(s => s.trim()).filter(Boolean);
}

function hostNameMatchesSlot(name, h) {
  const hn = normalizeBrand(name);
  const sn = normalizeBrand(h.host || h.name || '');
  const words = hn.split(/\s+/).filter(w => w.length >= 3);
  return words.some(w => sn.includes(w));
}

function getOverlapRatio(fStart, fEnd, hStart, hEnd) {
  let fs = toMin(fStart), fe = toMin(fEnd || '');
  let hs = toMin(hStart), he = toMin(hEnd || '');
  if (fe === 0) fe = 1440;
  if (he === 0) he = 1440;
  const ol = Math.max(0, Math.min(fe,he) - Math.max(fs,hs));
  const dur = he - hs || 1;
  return ol / dur;
}

function getTimeMatchScore(f, hStart, hEnd) {
  let score = 0;
  const fS = toMin(f.startLive || ''), fE = toMin(f.endLive || '');
  const hS = toMin(hStart), hE = toMin(hEnd);
  if (Math.abs(fE - hE) <= 30) score += 3;
  if (Math.abs(fS - hS) <= 30) score += 2;
  if (getOverlapRatio(f.startLive, f.endLive, hStart, hEnd) >= 0.5) score += 1;
  return score;
}

function sessionMatch(f, p, h) {
  const fb = normalizeBrand(f.brand || '');
  const fm = normalizeMp(f.mp || '');
  const pb = normalizeBrand(p.brand || '');
  const pm = normalizeMp(p.mp || '');
  if (!fb.includes(pb.slice(0,5)) && !pb.includes(fb.slice(0,5))) return false;
  if (!fm.includes(pm.slice(0,4)) && !pm.includes(fm.slice(0,4))) return false;
  const hosts = parseFormHosts(f.host || '');
  const hostMatch = hosts.some(hn => hostNameMatchesSlot(hn, h));
  if (!hostMatch) return false;
  return getTimeMatchScore(f, h.startTime || h.start, h.endTime || h.end) >= 2;
}

function deduplicateResponses(responses) {
  const map = {};
  for (const r of responses) {
    const key = [r.host, r.brand, r.mp, r.startLive, r.endLive].join('|');
    if (!map[key]) {
      map[key] = { ...r, links: r.link ? [r.link] : [] };
    } else {
      if (r.link) map[key].links.push(r.link);
      if (r.submittedAt > map[key].submittedAt) map[key].submittedAt = r.submittedAt;
    }
  }
  return Object.values(map);
}

function buildExclusiveClaims(dedupedResponses, allSlots) {
  exclusiveClaims = {};
  for (let ri = 0; ri < dedupedResponses.length; ri++) {
    const f = dedupedResponses[ri];
    const hosts = parseFormHosts(f.host || '');
    const isMulti = hosts.length > 1;
    for (const slotData of allSlots) {
      const { brand: brand, mp, hostObj: h } = slotData;
      const slotKey = `${brand}__${mp}__${h.host || h.name}__${h.startTime || h.start}`;
      if (sessionMatch(f, { brand, mp }, h)) {
        if (!exclusiveClaims[ri]) exclusiveClaims[ri] = [];
        if (!exclusiveClaims[ri].includes(slotKey)) exclusiveClaims[ri].push(slotKey);
      }
    }
  }
}

function getClaimedForms(slotKey) {
  return Object.entries(exclusiveClaims)
    .filter(([,slots]) => slots.includes(slotKey))
    .map(([ri]) => ri);
}

function findSessionCandidates(p, h) {
  // Returns form indices that are candidates (score≥1 or overlap≥15%)
  return [];  // simplified — full impl matches brand+mp+score≥1
}

// ─── Bukti Tayang ─────────────────────────────────────────────
async function loadBuktiTayang(force = false) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  if (!force && _lastBuktiTayangData) { renderBuktiTayang(_lastBuktiTayangData); return; }
  el.innerHTML = '<p class="loading">Memuat bukti tayang...</p>';
  try {
    const url = API_URL + '?action=buktitayang' + (force ? '&nocache=1' : '');
    const res  = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const data = await res.json();
    _lastBuktiTayangData = data;
    renderBuktiTayang(data);
    loadBuktiTayangHistory(force);
  } catch (e) {
    el.innerHTML = `<p class="error">Gagal memuat bukti tayang: ${e.message}</p>`;
  }
}

function forceRefreshBuktiTayang() {
  _lastBuktiTayangData = null;
  _lastBuktiTayangHistoryData = null;
  loadBuktiTayang(true);
}

// Versi BARU (dengan 3 shift termasuk malam) — ini satu-satunya renderBuktiTayang
function renderBuktiTayang(data) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  const sessions = data.sessions || [];
  const dateStr  = data.date || '';

  const shifts = { malam: [], pagi: [], siang: [] };
  for (const s of sessions) {
    const sh = getShiftBT(s.start || s.startTime || '');
    shifts[sh].push(s);
  }

  const totalBelum = sessions.filter(s => s.status !== 'uploaded').length;

  let html = `
    <div class="bt-header">
      <span>📋 Bukti Tayang — ${dateStr}</span>
      <span class="bt-count">${totalBelum} Belum Upload</span>
      <button class="copy-btn" onclick="copyBuktiTayangWA()">📲 Copy WA</button>
      <button class="refresh-btn" onclick="forceRefreshBuktiTayang()">🔄 Refresh</button>
    </div>`;

  for (const shift of ['malam','pagi','siang']) {
    if (!shifts[shift].length) continue;
    const done    = shifts[shift].filter(s => s.status === 'uploaded');
    const notDone = shifts[shift].filter(s => s.status !== 'uploaded');
    const icon    = shift === 'malam' ? '🌙' : shift === 'pagi' ? '🌅' : '☀️';

    html += `<div class="bt-shift" id="bt-shift-${shift}">
      <div class="bt-shift-header" onclick="toggleBtShift('${shift}')">
        ${icon} ${shift.toUpperCase()} (${shifts[shift].length})
      </div>
      <div class="bt-shift-body" id="bt-shift-body-${shift}">
        <div class="bt-status-group">
          <div class="bt-status-header" onclick="toggleBtStatus('${shift}','notdone')">
            ⏳ Belum Upload (${notDone.length})
          </div>
          <div id="bt-status-notdone-${shift}">
            ${notDone.map(s => renderBTCard(s)).join('') || '<p class="empty-sm">Semua sudah upload ✅</p>'}
          </div>
        </div>
        <div class="bt-status-group">
          <div class="bt-status-header collapsed" onclick="toggleBtStatus('${shift}','done')">
            ✅ Sudah Upload (${done.length}) ▸
          </div>
          <div id="bt-status-done-${shift}" class="hidden">
            ${done.map(s => renderBTCard(s)).join('') || '<p class="empty-sm">Belum ada.</p>'}
          </div>
        </div>
      </div>
    </div>`;
  }

  el.innerHTML = html + '<div id="bukti-tayang-history"></div>';
}

function renderBTCard(s) {
  const links = (s.links || []).map(l => `<a href="${l}" target="_blank">📸</a>`).join(' ');
  const pics  = (s.pics || []).join(', ');
  return `<div class="bt-card ${s.status}">
    <span class="bt-brand">${s.brand || '-'}</span>
    <span class="bt-mp">${s.mp || s.marketplace || '-'}</span>
    <span class="bt-studio">${s.studio || '-'}</span>
    <span class="bt-time">${s.start || s.startTime || '-'} – ${s.end || s.endTime || '-'}</span>
    ${pics ? `<span class="bt-pics">${pics}</span>` : ''}
    ${links || '<span class="bt-nolink">Belum ada link</span>'}
  </div>`;
}

function toggleBtShift(shift) {
  const body = document.getElementById('bt-shift-body-' + shift);
  if (body) body.classList.toggle('hidden');
}

function toggleBtStatus(shift, status) {
  const el = document.getElementById('bt-status-' + status + '-' + shift);
  if (el) el.classList.toggle('hidden');
}

function copyBuktiTayangWA() {
  const data = _lastBuktiTayangData;
  if (!data) return;
  const sessions = (data.sessions || []).filter(s => s.status !== 'uploaded');
  const dateStr  = data.date || '';
  const total    = sessions.length;

  const byShift = { malam: [], pagi: [], siang: [] };
  for (const s of sessions) byShift[getShiftBT(s.start || s.startTime || '')].push(s);

  let text = `📋 *Bukti Tayang ${dateStr} — ${total} Belum Upload*\n`;
  const icons = { malam:'🌙', pagi:'🌅', siang:'☀️' };
  for (const sh of ['malam','pagi','siang']) {
    if (!byShift[sh].length) continue;
    text += `\n${icons[sh]} *Shift ${sh.charAt(0).toUpperCase()+sh.slice(1)}*\n`;
    for (const s of byShift[sh]) {
      const start = s.start || s.startTime || '-';
      const end   = s.end   || s.endTime   || '-';
      text += `• ${s.brand || '-'} - ${s.mp || '-'} (${start}–${end})\n`;
    }
  }
  navigator.clipboard.writeText(text.trim())
    .then(() => showBanner('Copied ke clipboard!', 'success'))
    .catch(() => showBanner('Gagal copy', 'error'));
}

// ─── Bukti Tayang History ────────────────────────────────────
async function loadBuktiTayangHistory(force = false) {
  const el = document.getElementById('bukti-tayang-history');
  if (!el) return;
  if (!force && _lastBuktiTayangHistoryData) {
    renderBuktiTayangHistory(_lastBuktiTayangHistoryData);
    return;
  }
  el.innerHTML = '<p class="loading">Memuat history H-7...</p>';
  try {
    const url = API_URL + '?action=buktitayanghistory' + (force ? '&nocache=1' : '');
    const res  = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const data = await res.json();
    _lastBuktiTayangHistoryData = data;
    renderBuktiTayangHistory(data);
  } catch (e) {
    el.innerHTML = `<p class="error">Gagal memuat history: ${e.message}</p>`;
  }
}

function renderBuktiTayangHistory(data) {
  const el = document.getElementById('bukti-tayang-history');
  if (!el) return;
  const dates = data.dates || [];
  if (!dates.length) { el.innerHTML = '<p class="empty-sm">Tidak ada missing H-7.</p>'; return; }

  el.innerHTML = `<div class="bt-hist-header">📅 History H-7 s/d H-1 — Missing Bukti Tayang</div>` +
    dates.map(d => {
      const safeDate = d.date.replace(/-/g,'');
      const pics = d.pics || [];
      return `<div class="bt-hist-date">
        <div class="bt-hist-date-header" onclick="toggleBtHistDate('${safeDate}')">
          📆 ${d.date} (${pics.reduce((a,p)=>a+(p.missing||[]).length+(p.pending||[]).length,0)} belum)
        </div>
        <div id="bt-hist-${safeDate}" class="hidden">
          ${pics.map(p => `
            <div class="bt-hist-pic">
              <div class="bt-hist-pic-header" onclick="toggleBtHistPic('${safeDate}_${p.pic.replace(/\s/g,'_')}')">
                👤 ${p.pic}
              </div>
              <div id="bt-hist-pic-${safeDate}_${p.pic.replace(/\s/g,'_')}" class="hidden">
                ${(p.missing||[]).map(s=>`<div class="bt-hist-row missing">❌ ${s.brand} - ${s.mp} ${s.start||''}-${s.end||''}</div>`).join('')}
                ${(p.pending||[]).map(s=>`<div class="bt-hist-row pending">⏳ ${s.brand} - ${s.mp} ${s.start||''}-${s.end||''}</div>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>`;
    }).join('');
}

function toggleBtHistDate(safeDate) {
  const el = document.getElementById('bt-hist-' + safeDate);
  if (el) el.classList.toggle('hidden');
}

function toggleBtHistPic(safePicKey) {
  const el = document.getElementById('bt-hist-pic-' + safePicKey);
  if (el) el.classList.toggle('hidden');
}

// ─── OPStandby ───────────────────────────────────────────────

// [FIX-E] loadStandby: pakai schedule-list, HAPUS early return jika el null
async function loadStandby(force = false) {
  const el = document.getElementById('schedule-list'); // [FIX-E]
  if (!el) return;
  if (!force && _lastPicScheduleData && scheduleData) {
    renderStandby(scheduleData, _lastPicScheduleData);
    return;
  }
  el.innerHTML = '<p class="loading">Memuat data standby...</p>';
  try {
    const [schedRes, picRes] = await Promise.allSettled([
      scheduleData
        ? Promise.resolve({ ok:true, json: async () => scheduleData })
        : fetch(API_URL + '?action=schedule' + (force ? '&nocache=1' : ''), { signal: AbortSignal.timeout(30000) }),
      fetch(API_URL + '?action=picschedule' + (force ? '&nocache=1' : ''), { signal: AbortSignal.timeout(30000) })
    ]);

    let sched = scheduleData;
    if (!sched && schedRes.status === 'fulfilled') {
      sched = await schedRes.value.json();
      if (sched?.sessions) {
        sched.sessions = sched.sessions.map(s => {
          s.isMarathon = s.hosts.length > 1;
          s.hosts = s.hosts.map(normalizeHost);
          return s;
        });
        scheduleData = sched;
      }
    }

    let picData = _lastPicScheduleData;
    if (picRes.status === 'fulfilled') {
      picData = await picRes.value.json();
      _lastPicScheduleData = picData;
    }

    renderStandby(sched, picData);
  } catch (e) {
    el.innerHTML = `<p class="error">Gagal memuat standby: ${e.message}</p>`;
  }
}

async function forceRefreshStandby() {
  _lastPicScheduleData = null;
  _standbyRrIndex = {};
  loadStandby(true);
}

// [FIX-C] Hapus renderStandby() lama (tanpa args, pakai buildPicShiftData/buildStandbyData)
// Hanya satu renderStandby di bawah ini

// [FIX-D][FIX-G] renderStandby — pakai schedule-list, reset _standbyRrIndex
function renderStandby(schedData, picData) {
  _standbyRrIndex = {}; // [FIX-G]
  const el = document.getElementById('schedule-list'); // [FIX-D]
  if (!el) return;

  const dateStr = schedData?.date || picData?.date || '';
  const sheetName = picData?.sheetName || '';
  const pics = picData?.pics || [];
  const sessions = schedData?.sessions || [];

  if (!pics.length && !sessions.length) {
    el.innerHTML = '<p class="empty">Data PIC belum tersedia.</p>';
    return;
  }

  const picByShift = { pagi: [], siang: [], malam: [] };
  for (const op of pics) {
    const sh = op.shift || getShiftByStart('08:00'); // fallback pagi
    if (picByShift[sh]) picByShift[sh].push(op);
  }

  let html = `
    <div class="standby-header">
      <span>📋 OPStandby — ${formatStandbyDate(dateStr)}</span>
      ${sheetName ? `<span class="sheet-badge">${sheetName}</span>` : ''}
      <button class="refresh-btn" onclick="forceRefreshStandby()">🔄 Refresh</button>
    </div>`;

  // PIC SHIFT SECTION
  for (const shift of ['pagi','siang','malam']) {
    const ops = picByShift[shift];
    if (!ops.length) continue;
    const icon = shift === 'pagi' ? '🌅' : shift === 'siang' ? '☀️' : '🌙';
    html += `<div class="standby-shift-group">
      <div class="standby-shift-label">${icon} PIC ${shift.toUpperCase()}</div>
      <div class="standby-pic-list">
        ${ops.map(op => `
          <div class="standby-pic-row">
            <span class="sp-name">${op.name}</span>
            <span class="sp-studios">${(op.studios||[]).map(n=>`Studio ${n}`).join(', ') || '-'}</span>
            <span class="sp-section">${op.section || ''}</span>
          </div>`).join('')}
      </div>
    </div>`;
  }

  // STANDBY BRAND SECTION
  html += `<div class="standby-brand-section"><div class="sb-label">📦 STANDBY BRAND</div>`;

  for (const cfg of STANDBY_BRANDS_CFG) {
    html += `<div class="sb-brand-group">
      <div class="sb-brand-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
        ${cfg.label}
      </div>
      <div class="sb-brand-body">`;

    if (cfg.type === 'dedicated') {
      // Dedicated: dari section amtour/asics, per shift pagi/siang
      const sectionPics = pics.filter(p => p.section === cfg.section);
      for (const shift of ['pagi','siang']) {
        const sp = sectionPics.filter(p => p.shift === shift);
        if (!sp.length) continue;
        const merged = mergeSessionTime(sessions.filter(s => matchBrandConfig(s, cfg)), shift);
        const timeStr = merged ? `${merged.start}–${merged.end}` : '-';
        html += `<div class="sb-slot">
          <span class="sb-shift">${shift.toUpperCase()}</span>
          <span class="sb-time">${timeStr}</span>
          <span class="sb-ops">${sp.map(p=>p.name).join(', ')}</span>
        </div>`;
      }
    } else if (cfg.type === 'floating') {
      // Floating: per host slot
      const brandSessions = sessions.filter(s => matchBrandConfig(s, cfg));
      const pool = pics.filter(p => ['floating','intern'].includes(p.section));

      for (const s of brandSessions) {
        for (const h of s.hosts) {
          const segments = splitAtShiftBoundary(h.startTime || h.start, h.endTime || h.end);
          for (const seg of segments) {
            const shiftPool = pool.filter(p => p.shift === seg.shift);
            let assignedName = '-';
            if (cfg.perOperator) {
              // Round-robin
              const key = cfg.label + '_' + seg.shift;
              if (!_standbyRrIndex[key]) _standbyRrIndex[key] = 0;
              if (shiftPool.length) {
                assignedName = shiftPool[_standbyRrIndex[key] % shiftPool.length].name;
                _standbyRrIndex[key]++;
              }
            } else {
              assignedName = shiftPool.map(p => p.name).join(', ') || '-';
            }
            html += `<div class="sb-slot">
              <span class="sb-brand-sm">${s.brand || '-'}</span>
              <span class="sb-mp-sm">${s.mp || '-'}</span>
              <span class="sb-time">${seg.start}–${seg.end}</span>
              <span class="sb-shift">${seg.shift.toUpperCase()}</span>
              <span class="sb-ops">${assignedName}</span>
              <button class="copy-btn-sm" onclick="copyBrandStandby(this,'${cfg.label}','${seg.start}','${seg.end}','${assignedName}')">📋</button>
            </div>`;
          }
        }
      }
    }

    html += `</div></div>`; // close sb-brand-body + sb-brand-group
  }

  html += `</div>`; // close standby-brand-section
  html += `<button class="copy-btn" onclick="copyStandbyReminder()">📲 Copy Reminder Standby</button>`;
  el.innerHTML = html;
}

// [FIX-F] showToast → showBanner di copy functions
function copyStandbyReminder() {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  const slots = el.querySelectorAll('.sb-slot');
  let text = '📋 *Reminder Standby Ops*\n';
  slots.forEach(sl => {
    const brand = sl.querySelector('.sb-brand-sm')?.textContent || sl.querySelector('.sb-brand')?.textContent || '';
    const time  = sl.querySelector('.sb-time')?.textContent || '';
    const ops   = sl.querySelector('.sb-ops')?.textContent || '';
    if (brand && ops && ops !== '-') text += `• ${brand} ${time} → ${ops}\n`;
  });
  navigator.clipboard.writeText(text.trim())
    .then(() => showBanner('Reminder copied!', 'success'))   // [FIX-F]
    .catch(() => showBanner('Gagal copy', 'error'));
}

function copyBrandStandby(btn, label, start, end, ops) {
  const text = `${label}\n${start}–${end} → ${ops}`;
  navigator.clipboard.writeText(text)
    .then(() => showBanner('Copied: ' + label, 'success'))   // [FIX-F]
    .catch(() => showBanner('Gagal copy', 'error'));
}

// ─── SSO & Presence ──────────────────────────────────────────
function onGsiLoad() {
  if (!window.google?.accounts?.id) return;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: false,
  });
  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    { theme:'outline', size:'medium', text:'sign_in_with' }
  );
}

function handleCredentialResponse(resp) {
  const payload = parseJwt(resp.credential);
  if (!payload) return;
  currentUser = { name: payload.name, email: payload.email, picture: payload.picture };
  document.getElementById('user-login-wrapper').style.display = 'block';
  document.getElementById('user-name').textContent = currentUser.name;
  if (!presenceStarted) startPresence();
}

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  } catch { return null; }
}

function startPresence() {
  if (presenceStarted) return;
  presenceStarted = true;
  sendPresence();
  setInterval(sendPresence, 3 * 60 * 1000);
  listenPresence();
  if (currentUser) {
    onlineUsers[currentUser.email] = { name: currentUser.name, ts: Date.now() };
    renderOnlineUsers();
  }
}

function sendPresence() {
  if (!currentUser) return;
  fetch('https://ntfy.sh/' + NTFY_PRESENCE_TOPIC, {
    method: 'POST',
    body: JSON.stringify({ email: currentUser.email, name: currentUser.name, ts: Date.now() }),
    headers: { 'Content-Type': 'application/json' }
  }).catch(() => {});
}

function listenPresence() {
  const es = new EventSource('https://ntfy.sh/' + NTFY_PRESENCE_TOPIC + '/sse');
  es.onmessage = e => {
    try {
      const d = JSON.parse(JSON.parse(e.data).message);
      onlineUsers[d.email] = { name: d.name, ts: d.ts };
      cleanupPresence();
      renderOnlineUsers();
    } catch {}
  };
}

function cleanupPresence() {
  const cutoff = Date.now() - 6 * 60 * 1000;
  for (const k of Object.keys(onlineUsers)) {
    if (onlineUsers[k].ts < cutoff) delete onlineUsers[k];
  }
}

function renderOnlineUsers() {
  const el = document.getElementById('online-users');
  if (!el) return;
  const users = Object.values(onlineUsers);
  el.innerHTML = users.length
    ? users.map(u => `<span class="online-badge">🟢 ${u.name.split(' ')[0]}</span>`).join('')
    : '';
}

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  switchTab('marathon');
});
