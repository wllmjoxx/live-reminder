const API_URL = "https://script.google.com/macros/s/AKfycbyhsAeqXWyuR0sRoNmy2i1vcyvKAk7Q-gaivbiNTLAq7eDKdCev8RpsG11v1aEGdTbB/exec";

// ── CONFIG: sesuaikan mention per nama PIC ───
// key = nama di DC sheet (lowercase), value = mention display
const PIC_MENTIONS = {
  "jonathan"  : "@jonathan",
  "tyo"       : "@Tyo Sirclo",
  "hamzah"    : "@Hamzah Sirclo",
  "hanif"     : "@Hanif Sirclo",
  "riva"      : "@Riva Sirclo",
  "ferry"     : "@Ferry Sirclo",
  "bernhard"  : "@Bernhard Sirclo",
  "leleng"    : "@Leleng Sirclo",
  "nadiem"    : "@Nadiem Sirclo",
  "fadhil"    : "@Fadhil Sirclo",
  "imam"      : "@Imam Sirclo",
  "eric"      : "@Eric Sirclo",
  "rizky"     : "@Rizky Sirclo",
  "yohan"     : "@Yohan Sirclo",
  "septian"   : "@Septian Sirclo",
  "agung"     : "@Agung Sirclo",
  "apri"      : "@Mas Apri",
  "maulidan"  : "@Maul Sirclo",
  "arbi"      : "@Arbi Intern Sirclo",
  "afdal"     : "@Afdal Sirclo",
  "roiisul"   : "@Roiisul Sirclo",
  "rakha"     : "@Rakha Sirclo",
  "isaac"     : "@Isaac Sirclo",
};

const MAX_STUDIO_PER_PIC = 2;

let sessions       = [];
let scheduledTasks = [];
let swRegistration = null;
let activeTab      = "marathon";

window.addEventListener("DOMContentLoaded", async () => {
  updateClock();
  setInterval(updateClock, 1000);
  await registerSW();
  await requestNotifPermission();
  await loadSchedule();
  setInterval(loadSchedule, 5 * 60 * 1000);
});

// ── SERVICE WORKER ───────────────────────────
async function registerSW() {
  if ("serviceWorker" in navigator)
    swRegistration = await navigator.serviceWorker.register("/sw.js");
}

// ── NOTIF PERMISSION ─────────────────────────
async function requestNotifPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    showBanner("❌ Notifikasi diblokir", "error"); return false;
  }
  const r = await Notification.requestPermission();
  if (r === "granted") showBanner("✅ Notifikasi aktif!", "success");
  return r === "granted";
}

// ── LOAD JADWAL ──────────────────────────────
async function loadSchedule() {
  showLoading(true);
  try {
    const res  = await fetch(API_URL + "?t=" + Date.now());
    const text = await res.text();
    const data = JSON.parse(text);
    if (!data.success) throw new Error(data.error);

    sessions = data.sessions.map(s => {
      s.isMarathon = s.hosts.length > 1;
      return s;
    });

    renderTab(activeTab);
    cancelAllScheduled();
    scheduleAllNotifications(sessions);
    updateStats();
    showBanner(`✅ ${data.date} — ${sessions.length} sesi`, "success");
  } catch (err) {
    showBanner("❌ Gagal load: " + err.message, "error");
  }
  showLoading(false);
}

// ── TAB ──────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  renderTab(tab);
}

function renderTab(tab) {
  if (tab === "marathon") renderMarathon();
  if (tab === "timeline") renderTimeline();
  if (tab === "single")   renderSingle();
}

// ── FORMAT PIC MENTION ────────────────────────
function formatPic(rawName) {
  if (!rawName || rawName === "-" || rawName === "") return "LSC";
  const key    = rawName.trim().toLowerCase();
  const mapped = PIC_MENTIONS[key];
  return mapped || ("@" + rawName.trim());
}

// ── ASSIGN PIC — max 2 per pic, end priority ──
// Modifies .assignedPic on each session object
function assignPics(starts, ends) {
  const picCount = {}; // rawName -> count

  function tryAssign(s, rawPic) {
    if (!rawPic || rawPic === "-" || rawPic === "") {
      s.assignedPic = "LSC"; return;
    }
    const key = rawPic.trim().toLowerCase();
    if (!picCount[key]) picCount[key] = 0;
    if (picCount[key] < MAX_STUDIO_PER_PIC) {
      picCount[key]++;
      s.assignedPic = formatPic(rawPic);
    } else {
      s.assignedPic = "LSC";
    }
  }

  // Tentukan prioritas: banyak mana?
  const endFirst = ends.length >= starts.length;

  if (endFirst) {
    ends.forEach(s   => tryAssign(s, s.picStudioEnd || s.picStudio));
    starts.forEach(s => tryAssign(s, s.picStudio));
  } else {
    starts.forEach(s => tryAssign(s, s.picStudio));
    ends.forEach(s   => tryAssign(s, s.picStudioEnd || s.picStudio));
  }
}

// ── TAB 1: MARATHON ──────────────────────────
function renderMarathon() {
  const container = document.getElementById("schedule-list");
  container.innerHTML = "";

  const list = sessions.filter(s => s.isMarathon);
  if (!list.length) {
    container.innerHTML = `<div class="empty">📭 Tidak ada sesi marathon</div>`;
    return;
  }

  list.forEach(s => {
    const curIdx = getCurrentHostIdx(s);
    const card   = document.createElement("div");
    card.className = "marathon-session-card";

    card.innerHTML = `
      <div class="ms-header">
        <div class="ms-brand">🏃 ${s.brand}</div>
        <div class="ms-meta">
          <span class="badge marketplace">${s.marketplace}</span>
          <span class="badge studio">${s.studio}</span>
          <span class="badge idline">📋 ${s.idLine || s.skpId || "-"}</span>
        </div>
        <div class="ms-time">▶ ${s.startTime} &nbsp;·&nbsp; ⏹ ${s.endTime} &nbsp;·&nbsp; ${s.hosts.length} host</div>
      </div>
      <div class="ms-hosts" id="msh-${s.idLine || s.skpId}"></div>`;

    container.appendChild(card);

    const hostContainer = card.querySelector(`#msh-${s.idLine || s.skpId}`);
    s.hosts.forEach((h, hi) => {
      const isCurrent = hi === curIdx;
      const isNext    = hi === curIdx + 1;
      const isPast    = curIdx >= 0 && hi < curIdx;

      const row = document.createElement("div");
      row.className = `host-row ${isCurrent ? "host-current" : ""} ${isNext ? "host-next" : ""} ${isPast ? "host-past" : ""}`;
      row.innerHTML = `
        <div class="hr-num">${hi + 1}</div>
        <div class="hr-time">
          <span class="hr-start">▶ ${h.startTime}</span>
          <span class="hr-arrow">→</span>
          <span class="hr-end">⏹ ${h.endTime}</span>
        </div>
        <div class="hr-info">
          <div class="hr-name">
            ${h.host}
            ${isCurrent ? `<span class="live-badge">● LIVE</span>` : ""}
            ${isNext    ? `<span class="next-badge">NEXT</span>`   : ""}
          </div>
          <div class="hr-pic">🧑‍💼 PIC: ${h.picData || "-"}</div>
        </div>`;
      hostContainer.appendChild(row);
    });
  });
}

// ── TAB 2: TIMELINE (Start/End + PIC) ────────
function renderTimeline() {
  const container = document.getElementById("schedule-list");
  container.innerHTML = "";

  if (!sessions.length) {
    container.innerHTML = `<div class="empty">📭 Tidak ada jadwal</div>`;
    return;
  }

  const events = {};

  sessions.forEach(s => {
    if (s.startTime && s.startTime !== "-") {
      if (!events[s.startTime]) events[s.startTime] = { starts: [], ends: [] };
      events[s.startTime].starts.push(Object.assign({}, s));
    }
    if (s.endTime && s.endTime !== "-") {
      const endKey = (s.endTime === "00:00" || s.endTime === "23:59")
        ? "23:59/00:00" : s.endTime;
      if (!events[endKey]) events[endKey] = { starts: [], ends: [] };
      events[endKey].ends.push(Object.assign({}, s));
    }
  });

  Object.values(events).forEach(ev => assignPics(ev.starts, ev.ends));

  const sorted = Object.keys(events).sort((a, b) => {
    const toMin = t => {
      if (t === "23:59/00:00") return 1441;
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    return toMin(a) - toMin(b);
  });

  sorted.forEach(time => {
    const ev = events[time];
    const displayTime = time === "23:59/00:00" ? "23:59 / 00:00" : time;

    if (ev.starts.length) {
      const block = document.createElement("div");
      block.className = "time-block";
      block.innerHTML = `<div class="time-header start-header"><span class="dot start-dot"></span> start ${displayTime}</div>`;
      ev.starts.forEach((s, i) => block.appendChild(makeTimelineCard(s, i + 1, "start")));
      container.appendChild(block);
    }

    if (ev.ends.length) {
      const block = document.createElement("div");
      block.className = "time-block";
      block.innerHTML = `<div class="time-header end-header"><span class="dot end-dot"></span> end ${displayTime}</div>`;
      ev.ends.forEach((s, i) => block.appendChild(makeTimelineCard(s, i + 1, "end")));
      container.appendChild(block);
    }
  });
}


function makeTimelineCard(s, num, mode) {
  const now     = Date.now();
  const startMs = timeToMs(s.date, s.startTime);
  const isPast  = startMs && startMs < now;
  const isSoon  = startMs && (startMs - now) < 15 * 60 * 1000 && !isPast;
  const picLabel = s.assignedPic || "LSC";
  const isLSC   = picLabel === "LSC";
  const firstHost = s.hosts?.[0]?.host || "-";

  const card = document.createElement("div");
  card.className = `session-card ${isPast ? "past" : ""} ${isSoon ? "soon" : ""} ${s.isMarathon ? "marathon-card" : ""}`;

  card.innerHTML = `
    <div class="session-num">${num}</div>
    <div class="session-info">
      <div class="session-brand">
        ${s.brand}
        ${s.isMarathon
          ? `<span class="type-badge marathon-badge">🏃</span>`
          : `<span class="type-badge single-badge">⚡</span>`}
      </div>
      <div class="session-meta">
        <span class="badge marketplace">${s.marketplace}</span>
        <span class="badge studio">${s.studio}</span>
      </div>
      <div class="session-host">👤 ${firstHost}</div>
    </div>
    <div class="session-pic-right ${isLSC ? "lsc" : ""}">${picLabel}</div>`;

  return card;
}


// ── TAB 3: SINGLE ────────────────────────────
function renderSingle() {
  const container = document.getElementById("schedule-list");
  container.innerHTML = "";

  const list = sessions.filter(s => !s.isMarathon);
  if (!list.length) {
    container.innerHTML = `<div class="empty">📭 Tidak ada sesi single</div>`;
    return;
  }

  // Flat list, no dropdown
  const copies = list.map(s => Object.assign({}, s));
  assignPics(copies, []);
  copies.forEach((s, i) => container.appendChild(makeTimelineCard(s, i + 1, "start")));
}



// ── STATS ─────────────────────────────────────
function updateStats() {
  const m  = sessions.filter(s => s.isMarathon).length;
  const sg = sessions.filter(s => !s.isMarathon).length;
  document.getElementById("stat-total").textContent    = sessions.length;
  document.getElementById("stat-marathon").textContent = m;
  document.getElementById("stat-single").textContent   = sg;
}

// ── NOTIFIKASI — batch per jam ─────────────────
function scheduleAllNotifications(list) {
  const now = Date.now();
  let count = 0;

  const startGroups = {};
  const endGroups   = {};

  list.forEach(s => {
    if (s.startTime && s.startTime !== "-") {
      if (!startGroups[s.startTime]) startGroups[s.startTime] = [];
      startGroups[s.startTime].push(s);
    }
    if (s.endTime && s.endTime !== "-") {
      if (!endGroups[s.endTime]) endGroups[s.endTime] = [];
      endGroups[s.endTime].push(s);
    }
  });

  Object.entries(startGroups).forEach(([time, group]) => {
    const startMs = timeToMs(group[0].date, time);
    if (!startMs) return;
    [[60, "🔔 1 JAM LAGI"], [10, "⏰ 10 MENIT LAGI"], [5, "🚨 5 MENIT LAGI"]].forEach(([min, prefix]) => {
      const t = startMs - min * 60 * 1000;
      if (t > now) {
        scheduledTasks.push(setTimeout(() =>
          fireGroupNotif(`${prefix} — START ${time}`, group, "start"), t - now));
        count++;
      }
    });
  });

  Object.entries(endGroups).forEach(([time, group]) => {
    let endMs = timeToMs(group[0].date, time);
    const sMs = timeToMs(group[0].date, group[0].startTime);
    if (endMs && sMs && endMs <= sMs) endMs += 24 * 60 * 60 * 1000;
    if (!endMs) return;
    [[10, "⏰ 10 MENIT LAGI"], [5, "🚨 5 MENIT LAGI"]].forEach(([min, prefix]) => {
      const t = endMs - min * 60 * 1000;
      if (t > now) {
        scheduledTasks.push(setTimeout(() =>
          fireGroupNotif(`${prefix} — END ${time}`, group, "end"), t - now));
        count++;
      }
    });
  });

  document.getElementById("notif-count").textContent = `🔔 ${count} notif terjadwal hari ini`;
}

function cancelAllScheduled() {
  scheduledTasks.forEach(id => clearTimeout(id));
  scheduledTasks = [];
}

function fireGroupNotif(title, group, type) {
  const lines = group.map((s, i) => {
    const h    = type === "start" ? s.hosts?.[0] : s.hosts?.[s.hosts.length - 1];
    const host = h?.host || "-";
    const pic  = formatPic(type === "start" ? s.picStudio : (s.picStudioEnd || s.picStudio));
    const line = type === "start"
      ? `${i+1}. ${s.brand} | ${s.marketplace} | ${s.studio}\n   👤 ${host} ${pic}`
      : `${i+1}. ${s.brand} | ${s.marketplace} | ${s.studio} ${pic}`;
    return line;
  });

  const body = lines.join("\n");
  const tag  = `grp-${type}-${title}`;

  if (swRegistration) {
    navigator.serviceWorker.controller?.postMessage({ type: "SHOW_NOTIFICATION", title, body, tag });
  } else if (Notification.permission === "granted") {
    new Notification(title, { body, tag });
  }
}

// ── HELPERS ───────────────────────────────────
function getCurrentHostIdx(session) {
  const now = Date.now();
  for (let i = 0; i < session.hosts.length; i++) {
    const h       = session.hosts[i];
    const startMs = timeToMs(session.date, h.startTime);
    let   endMs   = timeToMs(session.date, h.endTime);
    if (!startMs || !endMs) continue;
    if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
    if (now >= startMs && now < endMs) return i;
  }
  return -1;
}

function toMinJS(t) {
  if (!t || t === "-") return 9999;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function timeToMs(dateStr, timeStr) {
  try {
    if (!timeStr || timeStr === "-") return null;
    const t = timeStr.length === 4 ? "0" + timeStr : timeStr;
    return new Date(`${dateStr}T${t}:00+07:00`).getTime();
  } catch { return null; }
}

function updateClock() {
  const now = new Date();
  const el  = document.getElementById("clock");
  const de  = document.getElementById("date-display");
  if (el) el.textContent = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" });
  if (de) de.textContent = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
}

function showLoading(show) {
  document.getElementById("loading").style.display = show ? "flex" : "none";
}

function showBanner(msg, type = "info") {
  const el = document.getElementById("banner");
  el.textContent   = msg;
  el.className     = "banner " + type;
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 4000);
}
