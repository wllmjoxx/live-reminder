// ============================================================
//  CASTLIVE OPS 2026 — app.js  (REVISED — match index.html)
//  CHANGES vs versi lama:
//  - showBanner → pakai #banner + class alert-*
//  - switchTab  → pakai id="tab-{name}" bukan .tab-btn
//  - renderTab  → tab name hariH & buktiTayang (camelCase)
//  - loadSchedule → showLoading/hideLoading + updateStats
//  - renderMarathon/Single → Bootstrap card HTML
//  - handleCredentialResponse → hapus #user-name yg tdk ada
//  - renderOnlineUsers → querySelectorAll (ada 2 id sama)
//  - tambah updateClock, updateStats, showLoading, hideLoading
//  - DOMContentLoaded → loadSchedule() + updateClock()
// ============================================================

const API_URL             = 'https://script.google.com/macros/s/AKfycbyhsAeqXWyuR0sRoNmy2i1vcyvKAk7Q-gaivbiNTLAq7eDKdCev8RpsG11v1aEGdTbB/exec';
const NTFY_TOPIC          = 'castlive-ops-2026-xk9';
const NTFY_PRESENCE_TOPIC = 'castlive-presence-2026';
const GOOGLE_CLIENT_ID    = '343542715243-jhl0dshlpiklcapfgj4akj0a02vg9q05.apps.googleusercontent.com';

// ─── State ───────────────────────────────────────────────────
let currentTab      = 'marathon';
let scheduleData    = null;
let onlineUsers     = {};
let currentUser     = null;
let presenceStarted = false;

let _lastKlasemenData           = null;
let _lastHariHData              = null;
let _lastFormData               = null;
let _lastBuktiTayangData        = null;
let _lastBuktiTayangHistoryData = null;
let _lastPicScheduleData        = null;
let _standbyRrIndex             = {};
let exclusiveClaims             = {};

// ─── Constants ───────────────────────────────────────────────
const STANDBY_BRANDS_CFG = [
  { label:'AMERICAN TOURISTER TIKTOK', brand:'american tourister', mp:'tiktok',  type:'floating',  perOperator:false },
  { label:'SAMSONITE TIKTOK',          brand:'samsonite',          mp:'tiktok',  type:'floating',  perOperator:false },
  { label:'AMERICAN TOURISTER SHOPEE', brand:'american tourister', mp:'shopee',  type:'dedicated', section:'amtour'  },
  { label:'SAMSONITE SHOPEE',          brand:'samsonite',          mp:'shopee',  type:'floating',  perOperator:true  },
  { label:'ASICS SHOPEE',              brand:'asics',              mp:'shopee',  type:'dedicated', section:'asics'   },
];

// ─── Utility (TIDAK BERUBAH) ─────────────────────────────────
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

function normalizeHost(h) {
  const name      = h.name      || h.host      || '-';
  const startTime = h.start     || h.startTime  || '-';
  const endTime   = h.end       || h.endTime    || '-';
  const picData   = h.pic       || h.picData    || '-';
  return { host:name, startTime, endTime, picData, name, start:startTime, end:endTime, pic:picData };
}

function getShiftByStart(t) {
  if (!t) return 'siang';
  const m = toMin(t);
  if (m < 480) return 'malam';
  if (m < 960) return 'pagi';
  return 'siang';
}

function getShiftBT(startTime) { return getShiftByStart(startTime); }

function getHariHShift(endTime) {
  if (!endTime || endTime === '00:00') return 'siang';
  const m = toMin(endTime);
  if (m === 0) return 'siang';
  if (m < 480) return 'malam';
  if (m < 960) return 'pagi';
  return 'siang';
}

function formatStandbyDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days   = ['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
  const months = ['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function splitAtShiftBoundary(startStr, endStr) {
  const BOUNDS = [480, 960, 1440];
  let s = toMin(startStr), e = toMin(endStr);
  if (e === 0) e = 1440;
  if (e <= s) e += 1440;
  const results = []; let cur = s;
  for (const b of BOUNDS) {
    if (cur >= b) continue;
    if (e <= b) { results.push({ start:minToTime(cur%1440), end:minToTime(e%1440), shift:getShiftByStart(minToTime(cur%1440)) }); cur=e; break; }
    results.push({ start:minToTime(cur%1440), end:minToTime(b%1440), shift:getShiftByStart(minToTime(cur%1440)) }); cur=b;
  }
  if (cur < e) results.push({ start:minToTime(cur%1440), end:minToTime(e%1440), shift:getShiftByStart(minToTime(cur%1440)) });
  return results;
}

function matchBrandConfig(session, cfg) {
  const sb = normalizeBrand(session.brand || '');
  const sm = normalizeMp(session.mp || session.marketplace || '');
  return sb.includes(normalizeBrand(cfg.brand)) && sm.includes(normalizeMp(cfg.mp));
}

function mergeSessionTime(sessions, shift) {
  const slots = sessions.filter(s => getShiftByStart(s.hosts?.[0]?.start || s.hosts?.[0]?.startTime) === shift);
  if (!slots.length) return null;
  let minStart = 9999, maxEnd = 0;
  for (const s of slots) for (const h of (s.hosts||[])) {
    const hs = toMin(h.start||h.startTime); let he = toMin(h.end||h.endTime); if(he===0)he=1440;
    if(hs<minStart)minStart=hs; if(he>maxEnd)maxEnd=he;
  }
  return { start:minToTime(minStart), end:minToTime(maxEnd%1440) };
}

function nowMin() { const n=new Date(); return n.getHours()*60+n.getMinutes(); }

function getHostStatus(startTime, endTime) {
  const nm=nowMin(), s=toMin(startTime); let e=toMin(endTime); if(e===0)e=1440;
  if(nm>=s&&nm<e) return 'current';
  if(nm<s)        return 'next';
  return 'past';
}

// ════════════════════════════════════════════════════════════
//  ★ CHANGED: showBanner — pakai #banner + class alert-*
// ════════════════════════════════════════════════════════════
function showBanner(msg, type = 'success') {
  const el = document.getElementById('banner');
  if (!el) return;
  el.className = `alert alert-${type === 'error' ? 'danger' : type}`;
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'alert'; el.textContent = ''; }, 2800);
}

// ════════════════════════════════════════════════════════════
//  ★ NEW: showLoading / hideLoading / updateStats / updateClock
// ════════════════════════════════════════════════════════════
function showLoading() {
  const ld = document.getElementById('loading');
  const sl = document.getElementById('schedule-list');
  if (ld) ld.style.display = 'flex';
  if (sl) sl.innerHTML = '';
}

function hideLoading() {
  const ld = document.getElementById('loading');
  if (ld) ld.style.display = 'none';
}

function updateStats(data) {
  const sessions = data?.sessions || [];
  const total    = sessions.length;
  const marathon = sessions.filter(s => s.isMarathon).length;
  const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  set('stat-total',    total);
  set('stat-marathon', marathon);
  set('stat-single',   total - marathon);
}

function updateClock() {
  const now  = new Date();
  const pad  = n => String(n).padStart(2,'0');
  const days   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const clk = document.getElementById('clock');
  const dsp = document.getElementById('date-display');
  if (clk) clk.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  if (dsp) dsp.textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

// ════════════════════════════════════════════════════════════
//  ★ CHANGED: switchTab — pakai id="tab-{name}" bukan .tab-btn
// ════════════════════════════════════════════════════════════
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tab-' + tab);
  if (btn) btn.classList.add('active');
  renderTab(tab);
}

// ════════════════════════════════════════════════════════════
//  ★ CHANGED: renderTab — tab names hariH & buktiTayang
// ════════════════════════════════════════════════════════════
function renderTab(tab) {
  if      (tab === 'marathon')    { if (scheduleData) renderMarathon(scheduleData);   else loadSchedule(); }
  else if (tab === 'single')      { if (scheduleData) renderSingle(scheduleData);     else loadSchedule(); }
  else if (tab === 'timeline')    { if (scheduleData) renderTimeline(scheduleData);   else loadSchedule(); }
  else if (tab === 'standby')     { if (_lastPicScheduleData) renderStandby(scheduleData, _lastPicScheduleData); loadStandby(); }
  else if (tab === 'klasemen')    { if (_lastKlasemenData) renderKlasemen(_lastKlasemenData); loadKlasemen(); }
  else if (tab === 'hariH')       { if (_lastHariHData) renderHariH(_lastHariHData, _lastFormData); loadHariH(); }       // ★ hariH
  else if (tab === 'buktiTayang') { if (_lastBuktiTayangData) renderBuktiTayang(_lastBuktiTayangData); loadBuktiTayang(); } // ★ buktiTayang
}

// ════════════════════════════════════════════════════════════
//  ★ CHANGED: loadSchedule — showLoading/hideLoading/updateStats
// ════════════════════════════════════════════════════════════
async function loadSchedule(force = false) {
  showLoading(); // ★
  try {
    const url = API_URL + '?action=schedule' + (force ? '&nocache=1' : '');
    const res  = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const data = await res.json();
    if (!data.sessions) throw new Error('No sessions');
    data.sessions = data.sessions.map(s => {
      s.isMarathon = (s.hosts||[]).length > 1;
      s.hosts = (s.hosts||[]).map(normalizeHost);
      return s;
    });
    scheduleData = data;
    updateStats(data); // ★
    hideLoading();     // ★
    renderTab(currentTab);
  } catch (e) {
    hideLoading(); // ★
    const el = document.getElementById('schedule-list');
    if (el) el.innerHTML = `<div class="empty"><span class="empty-icon">⚠️</span>Gagal memuat jadwal<br><small>${e.message}</small></div>`;
  }
}

function forceRefreshSchedule() { scheduleData = null; loadSchedule(true); }

// ════════════════════════════════════════════════════════════
//  ★ CHANGED: renderMarathon — Bootstrap marathon card HTML
// ════════════════════════════════════════════════════════════
function renderMarathon(data) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  const list = (data.sessions||[]).filter(s => s.isMarathon);
  if (!list.length) { el.innerHTML = '<div class="empty"><span class="empty-icon">🏃</span>Tidak ada sesi marathon hari ini.</div>'; return; }

  el.innerHTML = list.map(s => {
    const h0    = s.hosts[0];
    const hLast = s.hosts[s.hosts.length-1];
    const start = h0.startTime||h0.start||'-';
    const end   = hLast.endTime||hLast.end||'-';
    const isEnded = nowMin() >= (toMin(end)||1440);

    const hostRows = s.hosts.map((h, hi) => {
      const status    = getHostStatus(h.startTime||h.start, h.endTime||h.end);
      const rowCls    = status==='current'?'host-current':status==='next'?'host-next':'host-past';
      const liveBadge = status==='current'
        ? '<span class="live-badge">● LIVE</span>'
        : status==='next' ? '<span class="next-badge">NEXT</span>' : '';
      return `
        <div class="host-row ${rowCls}">
          <div class="hr-num">${hi+1}</div>
          <div class="hr-time">
            <span class="hr-start">${h.startTime||h.start||'-'}</span>
            <span class="hr-arrow">→</span>
            <span class="hr-end">${h.endTime||h.end||'-'}</span>
          </div>
          <div class="hr-info">
            <div class="hr-name">${h.host||h.name||'-'}${liveBadge}</div>
            <div class="hr-pic">${h.picData||h.pic||'-'}</div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="marathon-session-card${isEnded?' ms-ended':''}">
        <div class="ms-card-header">
          <div class="ms-brand">${s.brand||'-'}</div>
          <div class="ms-meta">
            <span class="badge marketplace">${s.mp||s.marketplace||'-'}</span>
            <span class="badge studio">Studio ${s.studio||'-'}</span>
            ${s.idLine?`<span class="badge idline">${s.idLine}</span>`:''}
          </div>
          <div class="ms-time">${start} – ${end}</div>
        </div>
        <div class="ms-card-body">${hostRows}</div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
//  ★ CHANGED: renderSingle — Bootstrap session card HTML
// ════════════════════════════════════════════════════════════
function renderSingle(data) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  const list = (data.sessions||[]).filter(s => !s.isMarathon);
  if (!list.length) { el.innerHTML = '<div class="empty"><span class="empty-icon">👤</span>Tidak ada sesi single hari ini.</div>'; return; }

  el.innerHTML = list.map((s, i) => {
    const h      = (s.hosts||[])[0] || {};
    const start  = h.startTime||h.start||'-';
    const end    = h.endTime||h.end||'-';
    const status = getHostStatus(start, end);
    const cls    = status==='current'?' soon':status==='past'?' past':'';
    const pic    = h.picData||h.pic||'-';
    const isLsc  = ['jonathan','hamzah','tyo','hanif','andityo'].some(n=>pic.toLowerCase().includes(n));
    const liveBadge = status==='current'?'<span class="live-badge">● LIVE</span>':'';
    return `
      <div class="session-card${cls}">
        <div class="session-num">${i+1}</div>
        <div class="session-info">
          <div class="session-brand">${s.brand||'-'}${liveBadge}</div>
          <div class="session-meta">
            <span class="badge marketplace">${s.mp||s.marketplace||'-'}</span>
            <span class="badge studio">Studio ${s.studio||'-'}</span>
            ${s.idLine?`<span class="badge idline">${s.idLine}</span>`:''}
          </div>
          <div class="session-host">${h.host||h.name||'-'}</div>
          <div class="session-time-small">${start} – ${end}</div>
        </div>
        <div class="session-pic-right${isLsc?' lsc':''}">${pic}</div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
//  ★ CHANGED: renderTimeline + makeBlock — Bootstrap HTML
// ════════════════════════════════════════════════════════════
function renderTimeline(data) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  const events = [];
  for (const s of (data.sessions||[])) {
    for (const h of (s.hosts||[])) {
      const st=h.startTime||h.start, en=h.endTime||h.end;
      if(st) events.push({type:'start',time:st,session:s,host:h});
      if(en) events.push({type:'end',  time:en,session:s,host:h});
    }
  }
  events.sort((a,b)=>toMin(a.time)-toMin(b.time));
  const grouped={};
  for(const ev of events){
    const key=ev.time+'_'+ev.type;
    if(!grouped[key]) grouped[key]={time:ev.time,type:ev.type,items:[]};
    grouped[key].items.push(ev);
  }
  const blocks=Object.values(grouped).sort((a,b)=>{
    const ta=toMin(a.time),tb=toMin(b.time);
    return ta!==tb?ta-tb:(a.type==='start'?-1:1);
  });
  if(!blocks.length){el.innerHTML='<div class="empty"><span class="empty-icon">📅</span>Tidak ada data timeline.</div>';return;}
  el.innerHTML=blocks.map(b=>makeBlock(b)).join('');
}

function makeBlock(b) {
  const hdrCls = b.type==='start'?'start-header':'end-header';
  const dotCls = b.type==='start'?'start-dot':'end-dot';
  const nm     = nowMin();
  const isPast = nm > toMin(b.time) + (b.type==='end'?5:0);

  const copyItems = b.items.map(ev=>({
    brand:ev.session.brand||'-', mp:ev.session.mp||ev.session.marketplace||'-',
    studio:ev.session.studio||'-', host:ev.host.host||ev.host.name||'-', pic:ev.host.picData||ev.host.pic||'-'
  }));
  const copyAttr = JSON.stringify(copyItems).replace(/"/g,'&quot;');

  const itemsHtml = b.items.map((ev,i) => {
    const s=ev.session,h=ev.host;
    return `
      <div class="session-card${isPast?' past':''}">
        <div class="session-num">${i+1}</div>
        <div class="session-info">
          <div class="session-brand">${s.brand||'-'}</div>
          <div class="session-meta">
            <span class="badge marketplace">${s.mp||s.marketplace||'-'}</span>
            <span class="badge studio">Studio ${s.studio||'-'}</span>
          </div>
          ${b.type==='start'?`<div class="session-host">${h.host||h.name||'-'}</div>`:''}
        </div>
        <div class="session-pic-right">${h.picData||h.pic||'-'}</div>
      </div>`;
  }).join('');

  return `
    <div class="time-block">
      <div class="time-header ${hdrCls}" onclick="toggleTimeBlock(this)">
        <div class="dot ${dotCls}"></div>
        <span>${b.type==='start'?'START':'END'} ${b.time}</span>
        <span class="count-badge">${b.items.length}</span>
        <button class="btn btn-outline-secondary btn-sm" style="padding:2px 8px;font-size:0.6rem;margin-left:4px"
          onclick="event.stopPropagation();copyTimeBlock('${b.time}','${b.type}','${copyAttr}',this)">📋</button>
        <span class="toggle-icon">▾</span>
      </div>
      <div class="sessions-container" style="max-height:2000px">${itemsHtml}</div>
    </div>`;
}

function toggleTimeBlock(header) {
  header.closest('.time-block').classList.toggle('collapsed');
}

function copyTimeBlock(time, type, itemsAttr, btn) {
  let items; try{items=JSON.parse(itemsAttr.replace(/&quot;/g,'"'));}catch{return;}
  const header=`${type.toUpperCase()} ${time}`;
  const lines=items.map((it,i)=>type==='start'
    ?`${i+1}. ${it.brand} | ${it.mp} | Studio ${it.studio} ${it.host} ${it.pic}`
    :`${i+1}. ${it.brand} | ${it.mp} | Studio ${it.studio} ${it.pic}`);
  navigator.clipboard.writeText(header+'\n'+lines.join('\n'))
    .then(()=>showBanner('Copied: '+header,'success'))
    .catch(()=>showBanner('Gagal copy','danger'));
}

// ─── Klasemen (TIDAK BERUBAH struktur, hanya loading) ────────
async function loadKlasemen(force = false) {
  if (!force && _lastKlasemenData) { renderKlasemen(_lastKlasemenData); return; }
  showLoading();
  try {
    const res  = await fetch(API_URL+'?action=leaderboard'+(force?'&nocache=1':''),{signal:AbortSignal.timeout(30000)});
    const data = await res.json();
    _lastKlasemenData = data;
    hideLoading();
    renderKlasemen(data);
  } catch(e) {
    hideLoading();
    document.getElementById('schedule-list').innerHTML=`<div class="empty"><span class="empty-icon">⚠️</span>Gagal memuat klasemen</div>`;
  }
}

function forceRefreshKlasemen() { _lastKlasemenData=null; loadKlasemen(true); }

function renderKlasemen(data) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  const lb = data.leaderboard||[];
  if (!lb.length) { el.innerHTML='<div class="empty"><span class="empty-icon">🏆</span>Tidak ada data klasemen.</div>'; return; }

  const totalHH = lb.reduce((a,p)=>a+(p.hariHCount||0),0);
  const totalH1 = lb.reduce((a,p)=>a+(p.h1Count||0),0);
  const totalBL = lb.reduce((a,p)=>a+(p.pendingBelumLengkap||0),0);

  const summaryHtml = `
    <div style="display:flex;gap:8px;padding:8px 0 6px;flex-wrap:wrap">
      <div class="card" style="flex:1;min-width:80px;padding:10px 8px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:var(--bs-danger)">${totalHH}</div>
        <div style="font-size:0.58rem;color:var(--bs-muted);text-transform:uppercase">🔴 Hari H</div>
      </div>
      <div class="card" style="flex:1;min-width:80px;padding:10px 8px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:#e65100">${totalH1}</div>
        <div style="font-size:0.58rem;color:var(--bs-muted);text-transform:uppercase">🟡 H+1</div>
      </div>
      <div class="card" style="flex:1;min-width:80px;padding:10px 8px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:#f57f17">${totalBL}</div>
        <div style="font-size:0.58rem;color:var(--bs-muted);text-transform:uppercase">⚠ Blm Lgkp</div>
      </div>
    </div>
    <button class="btn btn-outline-secondary btn-sm" style="width:100%;margin-bottom:8px" onclick="forceRefreshKlasemen()">🔄 Force Refresh</button>`;

  const rows = lb.map(p => {
    const hasPending=(p.hariHCount||0)>0||(p.h1Count||0)>0;
    let parts=[];
    if(p.hariHCount>0){const bl=p.pendingBelumLengkap||0;parts.push(`${p.hariHCount} Hari H${bl>0?` (${bl} ⚠)`:''}`)}
    if(p.h1Count>0) parts.push(`${p.h1Count} H+1`);
    const statusText=parts.join(' · ')||'✅ Bersih';

    const pendingHtml=(p.pending||[]).map(row=>{
      const isBL=row.belumLengkap;
      const bg=isBL?'#fffbeb':'#fff8f8';
      const badge=isBL
        ?`<span class="badge" style="background:#fef3c7;color:#92400e">⚠ Blm Lgkp</span>`
        :`<span class="badge" style="background:var(--bs-danger-subtle);color:var(--bs-danger-text)">Hari H</span>`;
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 12px;background:${bg};border-bottom:1px solid #f5f5f5;font-size:0.73rem">
        ${badge}
        <span style="font-weight:600;flex:1">${row.brand||'-'}</span>
        <span style="color:var(--bs-primary)">${row.mp||'-'}</span>
        <span style="color:#adb5bd;min-width:76px;text-align:right">${row.date||'-'}</span>
      </div>`;
    }).join('');

    return `<div class="card" style="${hasPending?'border-left:4px solid var(--bs-danger)':''}">
      <div style="display:flex;align-items:center;padding:9px 12px;cursor:pointer;background:${hasPending?'#fff5f5':'#fafafa'}"
           onclick="this.nextElementSibling.classList.toggle('hidden')">
        <span style="font-weight:700;font-size:0.84rem;flex:1">${p.pic||'-'}</span>
        <span style="font-size:0.72rem;color:var(--bs-muted)">${statusText}</span>
      </div>
      <div class="hidden">${pendingHtml||'<div style="padding:8px 12px;color:#adb5bd;font-size:0.73rem">Tidak ada pending ✅</div>'}</div>
    </div>`;
  }).join('');

  el.innerHTML = summaryHtml + rows;
}

// ─── Hari H (loading fix) ─────────────────────────────────────
async function loadHariH(force = false) {
  if (!force && _lastHariHData) { renderHariH(_lastHariHData, _lastFormData); return; }
  showLoading();
  try {
    const [todayRes, formRes] = await Promise.allSettled([
      fetch(API_URL+'?action=today'    +(force?'&nocache=1':''),{signal:AbortSignal.timeout(30000)}),
      fetch(API_URL+'?action=formcheck'+(force?'&nocache=1':''),{signal:AbortSignal.timeout(30000)})
    ]);
    if(todayRes.status==='fulfilled') _lastHariHData = await todayRes.value.json();
    if(formRes.status ==='fulfilled') _lastFormData  = await formRes.value.json();
    hideLoading();
    renderHariH(_lastHariHData, _lastFormData);
  } catch(e) {
    hideLoading();
    document.getElementById('schedule-list').innerHTML=`<div class="empty"><span class="empty-icon">⚠️</span>Gagal memuat Hari H</div>`;
  }
}

function forceRefreshHariH() { _lastHariHData=null; _lastFormData=null; loadHariH(true); }

function renderHariH(data, formData) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  if (!data) { el.innerHTML='<div class="empty"><span class="empty-icon">📋</span>Belum ada data.</div>'; return; }

  const formResponses = formData?.responses||[];
  const dedupedForms  = deduplicateResponses(formResponses);
  const allSlots      = (data.leaderboard||[]).flatMap(p=>(p.rows||[]).map(r=>({brand:r.brand,mp:r.mp,hostObj:r})));
  buildExclusiveClaims(dedupedForms, allSlots);

  const shifts = {pagi:[],siang:[],malam:[]};
  for(const p of (data.leaderboard||[])) for(const r of (p.rows||[])) shifts[getHariHShift(r.endTime)].push({...r,pic:p.pic});

  const shiftIcon={pagi:'🌅',siang:'☀️',malam:'🌙'};
  let html=`<button class="btn btn-outline-secondary btn-sm" style="width:100%;margin:6px 0 10px" onclick="forceRefreshHariH()">🔄 Force Refresh</button>`;

  for(const shift of ['pagi','siang','malam']){
    if(!shifts[shift].length) continue;
    const rowsHtml = shifts[shift].map(r=>{
      const slotKey=`${r.brand}__${r.mp}__${r.host||r.name}__${r.startTime||r.start}`;
      const claimed =getClaimedForms(slotKey, dedupedForms);
      const isHold  =r.isHold;
      let uploadHtml;
      if(claimed.length){
        const valid=claimed.find(f=>(f.submittedAt||0)>toMin(r.endTime||'00:00')*60000);
        uploadHtml=valid
          ?`<span class="badge" style="background:var(--bs-success-subtle);color:var(--bs-success-text)">✅ Uploaded</span>`
          :`<span class="badge" style="background:var(--bs-danger-subtle);color:var(--bs-danger-text)">⚠️ False Upload</span>`;
      } else {
        uploadHtml=`<span class="badge" style="background:var(--bs-secondary-subtle);color:#495057">⏳ Belum</span>`;
      }
      const holdBadge=isHold?`<span class="badge" style="background:var(--bs-danger);color:#fff">HOLD</span>`:'';
      return `<div class="card" style="padding:8px 12px;margin-bottom:5px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
          ${holdBadge}
          <span style="font-weight:700;font-size:0.84rem;flex:1">${r.brand||'-'}</span>
          <span class="badge marketplace">${r.mp||'-'}</span>
          <span class="badge studio">Studio ${r.studio||'-'}</span>
          <span style="font-size:0.72rem;font-weight:600;color:var(--bs-muted)">${r.startTime||r.start||'-'} – ${r.endTime||r.end||'-'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:0.75rem;color:var(--bs-dark);flex:1">${r.host||r.name||'-'}</span>
          <span style="font-size:0.72rem;color:var(--bs-muted)">${r.pic||'-'}</span>
          ${uploadHtml}
        </div>
      </div>`;
    }).join('');
    html+=`<div class="section-header">${shiftIcon[shift]} ${shift.toUpperCase()}</div>${rowsHtml}`;
  }
  el.innerHTML=html||'<div class="empty"><span class="empty-icon">✅</span>Semua data sudah lengkap!</div>';
}

// ─── Form Upload Matching (TIDAK BERUBAH) ────────────────────
function parseFormHosts(hostStr) {
  if(!hostStr) return [];
  return hostStr.split(/\s+(?:with|dan|bareng|sama|&|,)\s+/i)
    .flatMap(p=>p.replace(/[()]/g,'').split(/,\s*/))
    .map(s=>s.trim()).filter(Boolean);
}

function hostNameMatchesSlot(name,h){
  const hn=normalizeBrand(name),sn=normalizeBrand(h.host||h.name||'');
  return hn.split(/\s+/).filter(w=>w.length>=3).some(w=>sn.includes(w));
}

function getOverlapRatio(fStart,fEnd,hStart,hEnd){
  let fs=toMin(fStart),fe=toMin(fEnd||''),hs=toMin(hStart),he=toMin(hEnd||'');
  if(fe===0)fe=1440;if(he===0)he=1440;
  return Math.max(0,Math.min(fe,he)-Math.max(fs,hs))/(he-hs||1);
}

function getTimeMatchScore(f,hStart,hEnd){
  let sc=0;
  const fS=toMin(f.startLive||''),fE=toMin(f.endLive||''),hS=toMin(hStart),hE=toMin(hEnd);
  if(Math.abs(fE-hE)<=30)sc+=3;if(Math.abs(fS-hS)<=30)sc+=2;
  if(getOverlapRatio(f.startLive,f.endLive,hStart,hEnd)>=0.5)sc+=1;
  return sc;
}

function sessionMatch(f,p,h){
  const fb=normalizeBrand(f.brand||''),fm=normalizeMp(f.mp||'');
  const pb=normalizeBrand(p.brand||''),pm=normalizeMp(p.mp||'');
  if(!fb.includes(pb.slice(0,5))&&!pb.includes(fb.slice(0,5)))return false;
  if(!fm.includes(pm.slice(0,4))&&!pm.includes(fm.slice(0,4)))return false;
  if(!parseFormHosts(f.host||'').some(hn=>hostNameMatchesSlot(hn,h)))return false;
  return getTimeMatchScore(f,h.startTime||h.start,h.endTime||h.end)>=2;
}

function deduplicateResponses(responses){
  const map={};
  for(const r of responses){
    const key=[r.host,r.brand,r.mp,r.startLive,r.endLive].join('|');
    if(!map[key]) map[key]={...r,links:r.link?[r.link]:[]};
    else{if(r.link)map[key].links.push(r.link);if((r.submittedAt||0)>(map[key].submittedAt||0))map[key].submittedAt=r.submittedAt;}
  }
  return Object.values(map);
}

function buildExclusiveClaims(dedupedResponses,allSlots){
  exclusiveClaims={};
  for(let ri=0;ri<dedupedResponses.length;ri++){
    const f=dedupedResponses[ri];
    for(const{brand,mp,hostObj:h}of allSlots){
      const slotKey=`${brand}__${mp}__${h.host||h.name}__${h.startTime||h.start}`;
      if(sessionMatch(f,{brand,mp},h)){
        if(!exclusiveClaims[ri])exclusiveClaims[ri]=[];
        if(!exclusiveClaims[ri].includes(slotKey))exclusiveClaims[ri].push(slotKey);
      }
    }
  }
}

// ★ CHANGED: terima dedupedForms sebagai parameter
function getClaimedForms(slotKey, dedupedForms) {
  return Object.entries(exclusiveClaims)
    .filter(([,slots])=>slots.includes(slotKey))
    .map(([ri])=>dedupedForms?.[parseInt(ri)]).filter(Boolean);
}

function findSessionCandidates(p,h){ return []; }

// ─── Bukti Tayang (loading fix) ───────────────────────────────
async function loadBuktiTayang(force=false){
  if(!force&&_lastBuktiTayangData){renderBuktiTayang(_lastBuktiTayangData);return;}
  showLoading();
  try{
    const res=await fetch(API_URL+'?action=buktitayang'+(force?'&nocache=1':''),{signal:AbortSignal.timeout(30000)});
    const data=await res.json();
    _lastBuktiTayangData=data;
    hideLoading();
    renderBuktiTayang(data);
    loadBuktiTayangHistory(force);
  }catch(e){
    hideLoading();
    document.getElementById('schedule-list').innerHTML=`<div class="empty"><span class="empty-icon">⚠️</span>Gagal memuat bukti tayang</div>`;
  }
}

function forceRefreshBuktiTayang(){_lastBuktiTayangData=null;_lastBuktiTayangHistoryData=null;loadBuktiTayang(true);}

function renderBuktiTayang(data){
  const el=document.getElementById('schedule-list');
  if(!el)return;
  const sessions=data.sessions||[],dateStr=data.date||'';
  const totalBelum=sessions.filter(s=>s.status!=='uploaded').length;
  const shifts={malam:[],pagi:[],siang:[]};
  for(const s of sessions)shifts[getShiftBT(s.start||s.startTime||'')].push(s);
  const shiftIcon={malam:'🌙',pagi:'🌅',siang:'☀️'};
  const hdrCls={malam:'header-purple',pagi:'header-warning',siang:'header-primary'};

  const renderCard=s=>{
    const icon=s.status==='uploaded'?'✅':'⏳';
    const links=(s.links||[]).map(l=>`<a href="${l}" target="_blank" style="font-size:0.7rem">📸</a>`).join(' ');
    return `<div class="bt-card ${s.status||'missing'}">
      <span>${icon}</span>
      <span class="bt-brand">${s.brand||'-'}</span>
      <span class="bt-mp">${s.mp||s.marketplace||'-'}</span>
      <span style="font-size:0.68rem;color:var(--bs-muted)">${s.start||s.startTime||'-'} – ${s.end||s.endTime||'-'}</span>
      ${links||'<span class="bt-nolink">Belum ada link</span>'}
    </div>`;
  };

  let html=`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0 10px;flex-wrap:wrap">
      <span style="font-weight:700;font-size:0.85rem">📋 Bukti Tayang — ${dateStr}</span>
      <span class="badge" style="background:var(--bs-danger);color:#fff">${totalBelum} Belum Upload</span>
      <button class="btn btn-outline-secondary btn-sm" onclick="copyBuktiTayangWA()">📲 Copy WA</button>
      <button class="btn btn-outline-secondary btn-sm" onclick="forceRefreshBuktiTayang()">🔄</button>
    </div>`;

  for(const shift of ['malam','pagi','siang']){
    if(!shifts[shift].length)continue;
    const done=shifts[shift].filter(s=>s.status==='uploaded');
    const notDone=shifts[shift].filter(s=>s.status!=='uploaded');
    html+=`<div class="card" style="margin-bottom:8px">
      <div class="card-header ${hdrCls[shift]}">${shiftIcon[shift]} ${shift.charAt(0).toUpperCase()+shift.slice(1)} (${shifts[shift].length})</div>
      <div class="card-body" style="padding:8px">
        ${notDone.length?notDone.map(renderCard).join(''):'<p style="font-size:0.73rem;color:#adb5bd;margin:0">Semua sudah upload ✅</p>'}
        ${done.length?`<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bs-border-subtle)">
          <div style="font-size:0.68rem;color:var(--bs-muted);font-weight:600;cursor:pointer;margin-bottom:4px"
               onclick="this.nextElementSibling.classList.toggle('hidden')">✅ Sudah Upload (${done.length}) ▸</div>
          <div class="hidden">${done.map(renderCard).join('')}</div>
        </div>`:''}
      </div>
    </div>`;
  }
  el.innerHTML=html+'<div id="bukti-tayang-history"></div>';
}

function copyBuktiTayangWA(){
  if(!_lastBuktiTayangData)return;
  const sessions=(_lastBuktiTayangData.sessions||[]).filter(s=>s.status!=='uploaded');
  const dateStr=_lastBuktiTayangData.date||'';
  const byShift={malam:[],pagi:[],siang:[]};
  for(const s of sessions)byShift[getShiftBT(s.start||s.startTime||'')].push(s);
  const icons={malam:'🌙',pagi:'🌅',siang:'☀️'};
  let text=`📋 *Bukti Tayang ${dateStr} — ${sessions.length} Belum Upload*\n`;
  for(const sh of ['malam','pagi','siang']){
    if(!byShift[sh].length)continue;
    text+=`\n${icons[sh]} *Shift ${sh.charAt(0).toUpperCase()+sh.slice(1)}*\n`;
    for(const s of byShift[sh]) text+=`• ${s.brand||'-'} - ${s.mp||'-'} (${s.start||s.startTime||'-'}–${s.end||s.endTime||'-'})\n`;
  }
  navigator.clipboard.writeText(text.trim()).then(()=>showBanner('Copied!','success')).catch(()=>showBanner('Gagal copy','danger'));
}

// ─── Bukti Tayang History (TIDAK BERUBAH) ────────────────────
async function loadBuktiTayangHistory(force=false){
  const el=document.getElementById('bukti-tayang-history');
  if(!el)return;
  if(!force&&_lastBuktiTayangHistoryData){renderBuktiTayangHistory(_lastBuktiTayangHistoryData);return;}
  el.innerHTML='<p style="font-size:0.73rem;color:var(--bs-muted);padding:6px 0">⏳ Memuat history H-7...</p>';
  try{
    const res=await fetch(API_URL+'?action=buktitayanghistory'+(force?'&nocache=1':''),{signal:AbortSignal.timeout(30000)});
    const data=await res.json();
    _lastBuktiTayangHistoryData=data;
    renderBuktiTayangHistory(data);
  }catch(e){el.innerHTML=`<p style="font-size:0.72rem;color:var(--bs-danger)">Gagal: ${e.message}</p>`;}
}

function renderBuktiTayangHistory(data){
  const el=document.getElementById('bukti-tayang-history');
  if(!el)return;
  const dates=data.dates||[];
  if(!dates.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="font-weight:700;font-size:0.76rem;color:var(--bs-muted);padding:10px 0 6px;border-top:2px solid var(--bs-border);margin-top:10px">📅 History H-7 s/d H-1</div>`+
    dates.map(d=>{
      const safe=d.date.replace(/-/g,'');
      const total=(d.pics||[]).reduce((a,p)=>a+(p.missing||[]).length+(p.pending||[]).length,0);
      return `<div class="card" style="margin-bottom:6px">
        <div style="padding:8px 12px;cursor:pointer;font-size:0.78rem;font-weight:600;display:flex;justify-content:space-between;align-items:center;background:var(--bs-light)"
             onclick="this.nextElementSibling.classList.toggle('hidden')">
          📆 ${d.date}
          <span class="badge" style="background:var(--bs-danger-subtle);color:var(--bs-danger-text)">${total} belum</span>
        </div>
        <div class="hidden">
          ${(d.pics||[]).map(p=>`<div style="border-top:1px solid var(--bs-border-subtle)">
            <div style="padding:6px 16px;cursor:pointer;font-size:0.73rem;font-weight:600;color:var(--bs-muted)"
                 onclick="this.nextElementSibling.classList.toggle('hidden')">
              👤 ${p.pic} <span style="color:var(--bs-danger)">(${(p.missing||[]).length+(p.pending||[]).length})</span>
            </div>
            <div class="hidden" style="padding:0 16px 8px">
              ${(p.missing||[]).map(s=>`<div style="font-size:0.72rem;color:var(--bs-danger);padding:2px 0">❌ ${s.brand} - ${s.mp} ${s.start||''}-${s.end||''}</div>`).join('')}
              ${(p.pending||[]).map(s=>`<div style="font-size:0.72rem;color:#e65100;padding:2px 0">⏳ ${s.brand} - ${s.mp} ${s.start||''}-${s.end||''}</div>`).join('')}
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');
}

// ─── OPStandby (loading fix + FIX-C/D/E/G) ──────────────────
async function loadStandby(force=false){
  const el=document.getElementById('schedule-list');
  if(!el)return;
  if(!force&&_lastPicScheduleData&&scheduleData){renderStandby(scheduleData,_lastPicScheduleData);return;}
  showLoading();
  try{
    const[schedRes,picRes]=await Promise.allSettled([
      scheduleData
        ?Promise.resolve(scheduleData)
        :fetch(API_URL+'?action=schedule'+(force?'&nocache=1':''),{signal:AbortSignal.timeout(30000)}).then(r=>r.json()),
      fetch(API_URL+'?action=picschedule'+(force?'&nocache=1':''),{signal:AbortSignal.timeout(30000)}).then(r=>r.json())
    ]);
    if(schedRes.status==='fulfilled'&&!scheduleData){
      const sd=schedRes.value;
      if(sd?.sessions){sd.sessions=sd.sessions.map(s=>{s.isMarathon=(s.hosts||[]).length>1;s.hosts=(s.hosts||[]).map(normalizeHost);return s;});scheduleData=sd;updateStats(sd);}
    }
    if(picRes.status==='fulfilled') _lastPicScheduleData=picRes.value;
    hideLoading();
    renderStandby(scheduleData,_lastPicScheduleData);
  }catch(e){
    hideLoading();
    el.innerHTML=`<div class="empty"><span class="empty-icon">⚠️</span>Gagal memuat standby</div>`;
  }
}

async function forceRefreshStandby(){_lastPicScheduleData=null;_standbyRrIndex={};loadStandby(true);}

function renderStandby(schedData,picData){
  _standbyRrIndex={};
  const el=document.getElementById('schedule-list');
  if(!el)return;
  const pics=picData?.pics||[],sessions=schedData?.sessions||[];
  const dateStr=picData?.date||schedData?.date||'',sheetNm=picData?.sheetName||'';

  if(!pics.length&&!sessions.length){el.innerHTML='<div class="empty"><span class="empty-icon">🧑‍💼</span>Data PIC belum tersedia.</div>';return;}

  const picByShift={pagi:[],siang:[],malam:[]};
  for(const op of pics){const sh=op.shift||'pagi';if(picByShift[sh])picByShift[sh].push(op);}

  const shiftColors={pagi:'shift-pagi',siang:'shift-siang',malam:'shift-malam'};
  const shiftIcon={pagi:'🌅',siang:'☀️',malam:'🌙'};
  const days=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  let dateDisplay='';
  if(dateStr){const d=new Date(dateStr+'T00:00:00');dateDisplay=`${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;}

  let html=`<div class="standby-wrapper">
    <div class="date-banner">
      <div class="date-title">OPStandby${sheetNm?' — '+sheetNm:''}</div>
      <div class="date-value">${dateDisplay}</div>
    </div>
    <div class="standby-section"><h3>🧑‍💼 PIC per Shift</h3>`;

  for(const shift of ['pagi','siang','malam']){
    if(!picByShift[shift].length)continue;
    html+=`<div class="shift-block ${shiftColors[shift]}">
      <div class="shift-header">${shiftIcon[shift]} ${shift.charAt(0).toUpperCase()+shift.slice(1)}</div>
      <ul>${picByShift[shift].map(op=>`<li><strong>${op.name}</strong><span class="section-tag">${op.section||''}</span>${(op.studios||[]).map(n=>`<span class="studio-badge">Studio ${n}</span>`).join('')}</li>`).join('')}</ul>
    </div>`;
  }
  html+=`</div><div class="standby-section"><h3>📦 Standby Brand</h3>`;

  for(const cfg of STANDBY_BRANDS_CFG){
    html+=`<div class="brand-standby-block"><div class="brand-standby-header">${cfg.label}</div>`;
    if(cfg.type==='dedicated'){
      const sp=pics.filter(p=>p.section===cfg.section);
      for(const shift of ['pagi','siang']){
        const spSh=sp.filter(p=>p.shift===shift);if(!spSh.length)continue;
        const merged=mergeSessionTime(sessions.filter(s=>matchBrandConfig(s,cfg)),shift);
        const tStr=merged?`${merged.start}–${merged.end}`:'-';
        html+=`<div class="standby-row"><span class="shift-pill ${shiftColors[shift]}">${shift.toUpperCase()}</span><span style="color:var(--bs-muted);font-size:0.78rem">${tStr}</span><span class="ops-list">${spSh.map(p=>p.name).join(', ')}</span></div>`;
      }
    } else {
      const brandSessions=sessions.filter(s=>matchBrandConfig(s,cfg));
      const pool=pics.filter(p=>['floating','intern'].includes(p.section));
      if(!brandSessions.length){html+=`<div class="empty-ops">Tidak ada sesi hari ini</div>`;}
      else for(const s of brandSessions) for(const h of (s.hosts||[])){
        const segs=splitAtShiftBoundary(h.startTime||h.start,h.endTime||h.end);
        for(const seg of segs){
          const shiftPool=pool.filter(p=>p.shift===seg.shift);
          let nm='-';
          if(cfg.perOperator){const key=cfg.label+'_'+seg.shift;if(!_standbyRrIndex[key])_standbyRrIndex[key]=0;if(shiftPool.length){nm=shiftPool[_standbyRrIndex[key]%shiftPool.length].name;_standbyRrIndex[key]++;}}
          else{nm=shiftPool.map(p=>p.name).join(', ')||'-';}
          const cpTxt=`${cfg.label}\n${seg.start}–${seg.end} → ${nm}`;
          html+=`<div class="standby-row">
            <span class="shift-pill ${shiftColors[seg.shift]}">${seg.shift.toUpperCase()}</span>
            <span style="font-size:0.75rem;color:var(--bs-muted)">${seg.start}–${seg.end}</span>
            <span class="ops-list">${nm}</span>
            <button class="copy-btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(cpTxt)}).then(()=>showBanner('Copied!','success'))">📋</button>
          </div>`;
        }
      }
    }
    html+=`</div>`;
  }
  html+=`</div>
    <button class="btn-copy-standby" onclick="copyStandbyReminder()">📲 Copy Reminder Standby</button>
    <div style="margin-top:8px;text-align:right"><button class="refresh-btn" onclick="forceRefreshStandby()">🔄 Refresh</button></div>
  </div>`;
  el.innerHTML=html;
}

function copyStandbyReminder(){
  const pics=_lastPicScheduleData?.pics||[],sessions=scheduleData?.sessions||[],dateStr=_lastPicScheduleData?.date||scheduleData?.date||'';
  const picByShift={pagi:[],siang:[],malam:[]};
  for(const op of pics){if(picByShift[op.shift])picByShift[op.shift].push(op);}
  const icons={pagi:'🌅',siang:'☀️',malam:'🌙'};
  let text=`📋 *OPStandby ${dateStr}*\n`;
  for(const sh of ['pagi','siang','malam']){
    if(!picByShift[sh].length)continue;
    text+=`\n${icons[sh]} *PIC ${sh.toUpperCase()}*\n`;
    for(const op of picByShift[sh]) text+=`• ${op.name}${(op.studios||[]).length?` (${op.studios.map(n=>`St.${n}`).join(',')})`:''}\n`;
  }
  text+='\n📦 *STANDBY BRAND*\n';
  for(const cfg of STANDBY_BRANDS_CFG){
    const bs=sessions.filter(s=>matchBrandConfig(s,cfg));if(!bs.length)continue;
    const pool=pics.filter(p=>['floating','intern'].includes(p.section));
    if(cfg.type==='dedicated'){for(const sh of ['pagi','siang']){const sp=pics.filter(p=>p.section===cfg.section&&p.shift===sh);if(sp.length)text+=`• ${cfg.label} (${sh}): ${sp.map(p=>p.name).join(', ')}\n`;}}
    else{let rr=0;for(const s of bs)for(const h of (s.hosts||[])){const segs=splitAtShiftBoundary(h.startTime||h.start,h.endTime||h.end);for(const seg of segs){const shPool=pool.filter(p=>p.shift===seg.shift);const nm=cfg.perOperator?(shPool.length?shPool[rr++%shPool.length].name:'-'):shPool.map(p=>p.name).join(',')||'-';text+=`• ${cfg.label} ${seg.start}–${seg.end} (${seg.shift}): ${nm}\n`;}}}
  }
  navigator.clipboard.writeText(text.trim()).then(()=>showBanner('Reminder copied!','success')).catch(()=>showBanner('Gagal','danger'));
}

// ════════════════════════════════════════════════════════════
//  ★ CHANGED: SSO — hapus #user-name yg tidak ada di HTML
// ════════════════════════════════════════════════════════════
function onGsiLoad(){
  if(!window.google?.accounts?.id)return;
  google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:handleCredentialResponse,auto_select:false});
  const btnEl=document.getElementById('google-signin-btn');
  if(btnEl)google.accounts.id.renderButton(btnEl,{theme:'outline',size:'medium'});
  const wrapper=document.getElementById('user-login-wrapper');
  if(wrapper)wrapper.style.display='flex';
}

function handleCredentialResponse(resp){
  const payload=parseJwt(resp.credential);
  if(!payload)return;
  currentUser={name:payload.name,email:payload.email,picture:payload.picture};
  // ★ HAPUS: getElementById('user-name') — tidak ada di HTML
  if(!presenceStarted)startPresence();
}

function parseJwt(token){
  try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}
  catch{return null;}
}

function startPresence(){
  if(presenceStarted)return;
  presenceStarted=true;
  if(currentUser){onlineUsers[currentUser.email]={name:currentUser.name,ts:Date.now()};renderOnlineUsers();}
  sendPresence();setInterval(sendPresence,3*60*1000);listenPresence();
}

function sendPresence(){
  if(!currentUser)return;
  fetch('https://ntfy.sh/'+NTFY_PRESENCE_TOPIC,{method:'POST',body:JSON.stringify({email:currentUser.email,name:currentUser.name,ts:Date.now()}),headers:{'Content-Type':'application/json'}}).catch(()=>{});
}

function listenPresence(){
  const es=new EventSource('https://ntfy.sh/'+NTFY_PRESENCE_TOPIC+'/sse');
  es.onmessage=e=>{try{const d=JSON.parse(JSON.parse(e.data).message);onlineUsers[d.email]={name:d.name,ts:d.ts};cleanupPresence();renderOnlineUsers();}catch{}};
}

function cleanupPresence(){
  const cut=Date.now()-6*60*1000;
  for(const k of Object.keys(onlineUsers))if(onlineUsers[k].ts<cut)delete onlineUsers[k];
}

// ════════════════════════════════════════════════════════════
//  ★ CHANGED: renderOnlineUsers — querySelectorAll (ada 2 id)
// ════════════════════════════════════════════════════════════
function renderOnlineUsers(){
  document.querySelectorAll('#online-users').forEach(el=>{
    const users=Object.values(onlineUsers);
    el.innerHTML=users.length
      ?users.map(u=>`<span class="online-badge">🟢 ${u.name.split(' ')[0]}</span>`).join(' ')
      :'👤 —';
  });
}

// ════════════════════════════════════════════════════════════
//  ★ CHANGED: Init — loadSchedule() + updateClock tiap detik
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);
  loadSchedule(); // ★ loadSchedule langsung, bukan switchTab
});
