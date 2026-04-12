const API_URL    = "https://script.google.com/macros/s/AKfycbyhsAeqXWyuR0sRoNmy2i1vcyvKAk7Q-gaivbiNTLAq7eDKdCev8RpsG11v1aEGdTbB/exec";
const NTFY_TOPIC = "castlive-ops-2026-xk9"; // ganti jadi nama unik kamu

const PIC_MENTIONS = {
  "jonathan" : "@jonathan",  "tyo"      : "@Tyo",
  "hamzah"   : "@Hamzah",    "hanif"    : "@Hanif",
  "riva"     : "@Riva",      "ferry"    : "@Ferry",
  "bernhard" : "@Bernhard",  "leleng"   : "@Leleng",
  "nadiem"   : "@Nadiem",    "fadhil"   : "@Fadhil",
  "imam"     : "@Imam",      "eric"     : "@Eric",
  "rizky"    : "@Rizky",     "yohan"    : "@Yohan",
  "septian"  : "@Septian",   "agung"    : "@Agung",
  "apri"     : "@Apri",      "maulidan" : "@Maul",
  "arbi"     : "@Arbi",      "afdal"    : "@Afdal",
  "roiisul"  : "@Roiisul",   "rakha"    : "@Rakha",
  "isaac"    : "@Isaac",     "raffyco"  : "@Raffyco",
  "luthfi rizal" : "@Luthfi Rizal",
};

const MAX_STUDIO_PER_PIC = 2;
const MAX_OPERATOR_DIST  = 4;

const LSC_NAMES_SET = new Set(["jonathan", "hamzah", "tyo", "hanif"]);
const DEDICATED_OPS = ["arbi", "agung", "raffyco", "isaac", "roiisul", "eric"];

const MANDATORY_STUDIOS = {
  2  : ["agung", "arbi", "raffyco"],
  29 : ["roiisul", "eric", "isaac"],
};

// ── DENAH STUDIO ─────────────────────────────
const STUDIO_PHYSICAL = {};
[1,2,3,5].forEach((s,i)                    => STUDIO_PHYSICAL[s] = {c:"entrance", p:i});
[6,7,8,9,10,11,12,15].forEach((s,i)        => STUDIO_PHYSICAL[s] = {c:"A",  p:i});
[16,17,18,19,20,21,22,23,25].forEach((s,i) => STUDIO_PHYSICAL[s] = {c:"B1", p:i});
[26,27,28,29,30,31,32].forEach((s,i)       => STUDIO_PHYSICAL[s] = {c:"B2", p:i});

function physicalDist(a, b) {
  if (a === b) return 0;
  const pA = STUDIO_PHYSICAL[a], pB = STUDIO_PHYSICAL[b];
  if (!pA || !pB) return 99;
  if (pA.c === pB.c) return Math.abs(pA.p - pB.p);
  if (pA.c === "B1" && pB.c === "B2") return Math.abs(pA.p - (pB.p + 4));
  if (pA.c === "B2" && pB.c === "B1") return Math.abs((pA.p + 4) - pB.p);
  if ((pA.c === "entrance" && pB.c === "A") || (pA.c === "A" && pB.c === "entrance"))
    return 1 + Math.abs(pA.p - pB.p);
  if ((pA.c === "entrance" && pB.c === "B1") || (pA.c === "B1" && pB.c === "entrance")) {
    const eP  = pA.c === "entrance" ? pA.p : pB.p;
    const b1P = pA.c === "B1"       ? pA.p : pB.p;
    return Math.abs(eP - 3) + Math.abs(b1P - 8) + 1;
  }
  if ((pA.c === "A" && pB.c === "B1") || (pA.c === "B1" && pB.c === "A"))
    return 4 + Math.abs(pA.p - pB.p);
  return 10;
}

const DEDICATED_ZONE_A = new Set([1, 2, 3, 5, 6, 7]);
const DEDICATED_ZONE_B = new Set([19, 20, 21, 25, 26, 27, 28, 29, 30, 31, 32]);
const DEDICATED_HOME   = {
  "agung": 2, "arbi": 2, "raffyco": 2,
  "roiisul": 29, "eric": 29, "isaac": 29,
};

function getDedicatedGroup(studioN) {
  if (DEDICATED_ZONE_A.has(studioN)) return ["agung", "arbi", "raffyco"];
  if (DEDICATED_ZONE_B.has(studioN)) return ["roiisul", "eric", "isaac"];
  return null;
}

// ─────────────────────────────────────────────
let sessions       = [];
let scheduledTasks = [];
let swRegistration = null;
let activeTab      = "marathon";
let ntfySource     = null;
const seenNtfyIds  = new Set();

window.addEventListener("DOMContentLoaded", async () => {
  updateClock();
  setInterval(updateClock, 1000);
  await registerSW();
  await requestNotifPermission();
  connectNtfy();           // ← semua user mulai listen ntfy
  await loadSchedule();
  setInterval(loadSchedule, 5 * 120 * 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      connectNtfy();
      loadSchedule();
    }
  });
  window.addEventListener("pageshow", e => {
    if (e.persisted) { connectNtfy(); loadSchedule(); }
  });
});

// ── SERVICE WORKER ───────────────────────────
async function registerSW() {
  if ("serviceWorker" in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    } catch(e) {
      console.warn("SW register failed:", e);
    }
  }
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

// ── NTFY — listen notif dari user lain ───────
function connectNtfy() {
  if (ntfySource && ntfySource.readyState === EventSource.OPEN) return;

  ntfySource = new EventSource(`https://ntfy.sh/${NTFY_TOPIC}/sse`);

  ntfySource.addEventListener("message", e => {
    try {
      const d = JSON.parse(e.data);
      if (d.event !== "message") return;
      if (seenNtfyIds.has(d.id)) return;
      seenNtfyIds.add(d.id);
      setTimeout(() => seenNtfyIds.delete(d.id), 60000);
      // Tampil lokal saja, TIDAK re-broadcast
      sendNotification(d.title || "Live Reminder", d.message || d.body || "", `ntfy-${d.id}`);
    } catch(err) {}
  });

  ntfySource.onerror = () => {
    ntfySource?.close();
    ntfySource = null;
    setTimeout(connectNtfy, 5000);
  };
}

// ── BROADCAST ke semua user ──────────────────
async function broadcastNotif(title, body, urgent = false) {
  sendNotification(title, body, `local-${Date.now()}`, urgent);

  try {
    const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method : "POST",
      headers: {
        "Title"       : title,
        "Priority"    : urgent ? "urgent" : "high",
        "Tags"        : "bell",
        "Content-Type": "text/plain",
      },
      body,
    });
    const resText = await res.text();
    console.log("ntfy response:", res.status, resText); // ← lihat di DevTools
    if (!res.ok) throw new Error(`ntfy ${res.status}: ${resText}`);
    showBanner("🔔 Notif dikirim!", "success");
  } catch(e) {
    console.error("ntfy error:", e);
    showBanner("⚠️ " + e.message, "warning");
  }
}


// ── KIRIM NOTIF LOKAL ─────────────────────────
function sendNotification(title, body, tag, urgent = false) {
  if (Notification.permission !== "granted") {
    requestNotifPermission();
    return;
  }

  const options = {
    body,
    tag    : tag || `notif-${Date.now()}`,
    icon   : "./icon-192.png",
    badge  : "./icon-192.png",
    vibrate: urgent ? [300, 100, 300, 100, 300] : [200, 100, 200],
    requireInteraction: false,
  };

  if (swRegistration) {
    swRegistration.showNotification(title, options)
      .catch(() => { try { new Notification(title, options); } catch(e) {} });
  } else {
    navigator.serviceWorker?.ready
      .then(reg => reg.showNotification(title, options))
      .catch(() => { try { new Notification(title, options); } catch(e) {} });
  }
}

// ── LOAD JADWAL ──────────────────────────────
async function loadSchedule() {
  if (!sessions.length) {
    try {
      const cached = localStorage.getItem("lastSchedule");
      if (cached) {
        const data = JSON.parse(cached);
        sessions = data.sessions.map(s => { s.isMarathon = s.hosts.length > 1; return s; });
        renderTab(activeTab);
        updateStats();
      }
    } catch(e) {}
  }

  showLoading(true);
  try {
    const res  = await fetch(API_URL + "?t=" + Date.now());
    const text = await res.text();
    const data = JSON.parse(text);
    if (!data.success) throw new Error(data.error);

    localStorage.setItem("lastSchedule", JSON.stringify(data));
    sessions = data.sessions.map(s => { s.isMarathon = s.hosts.length > 1; return s; });
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
  if (tab === "standby")  renderStandby();
}

function formatPic(rawName) {
  if (!rawName || rawName === "-" || rawName === "") return "LSC";
  const key    = rawName.trim().toLowerCase();
  const mapped = PIC_MENTIONS[key];
  return mapped || ("@" + rawName.trim());
}

function getShift(timeStr) {
  if (!timeStr || timeStr === "-" || timeStr === "23:59/00:00") return "siang";
  const [h, m] = timeStr.split(":").map(Number);
  if (h === 0 && m === 0) return "siang";
  if (h < 8)  return "malam";
  if (h < 16) return "pagi";
  return "siang";
}

function getAvailableOps(sessions, eventTimeStr) {
  let eventShift, tEvent;

  if (eventTimeStr === "23:59/00:00") {
    eventShift = "siang"; tEvent = 23 * 60 + 59;
  } else {
    const [h, m] = (eventTimeStr || "0:0").split(":").map(Number);
    if (h === 0 && m === 0) {
      eventShift = "malam"; tEvent = 0;
    } else {
      eventShift = getShift(eventTimeStr);
      tEvent     = h * 60 + m;
    }
  }

  const available = new Set();
  sessions.forEach(s => {
    (s.hosts || []).forEach(h => {
      if (!h.picData || h.picData === "-") return;
      const endStr    = (h.endTime && h.endTime !== "-") ? h.endTime : h.startTime;
      const hostShift = getShift(endStr);
      if (hostShift !== eventShift) return;

      const [sh, sm] = (h.startTime || "99:99").split(":").map(Number);
      const tStart   = sh * 60 + sm;
      const [eh, em] = endStr.split(":").map(Number);
      let tEnd = eh * 60 + em;
      if (tEnd === 0) tEnd = 24 * 60;
      if (tEnd <= tStart) tEnd += 24 * 60;

      let tEventAdj = tEvent;
      if (eventShift === "malam" && tEvent < tStart) tEventAdj = tEvent + 24 * 60;

      if (tStart <= tEventAdj && tEventAdj <= tEnd)
        available.add(h.picData.trim().toLowerCase());
    });
  });
  return available;
}

// ── ASSIGN PICS ───────────────────────────────
function assignPics(starts, ends, validPics = null) {
  const picCount    = {};
  const picRawNames = {};
  const picStudios  = {};

  function isCoord(name) {
    if (!name || name === "-" || name === "") return true;
    return LSC_NAMES_SET.has(name.trim().toLowerCase());
  }
  function sNum(s) {
    const m = String(s.studio || "").match(/\d+/);
    return m ? parseInt(m[0]) : 99;
  }
  function isInShift(key) {
    if (!validPics) return true;
    return validPics.has(key);
  }
  function reg(rawName) {
    if (!rawName || isCoord(rawName)) return;
    const key = rawName.trim().toLowerCase();
    if (picCount[key] === undefined) picCount[key] = 0;
    if (!picRawNames[key]) picRawNames[key] = rawName;
  }
  function assignKey(key, s) {
    picCount[key]++;
    if (!picStudios[key]) picStudios[key] = [];
    picStudios[key].push(sNum(s));
    s.assignedPic = formatPic(picRawNames[key] || key);
  }
  function opDistTo(key, studioN) {
    const assigned = picStudios[key] || [];
    if (assigned.length === 0) return 0;
    return Math.min(...assigned.map(s => physicalDist(s, studioN)));
  }
  function findMandatory(studioN) {
    const group = MANDATORY_STUDIOS[studioN];
    if (!group) return null;
    for (const name of group) {
      const key = name.toLowerCase();
      if (!isInShift(key)) continue;
      if ((picCount[key] || 0) < MAX_STUDIO_PER_PIC) return key;
    }
    return null;
  }
  function findDedicatedInGroup(group, studioN) {
    for (const name of group) {
      const key = name.toLowerCase();
      if (!isInShift(key)) continue;
      if ((picCount[key] || 0) >= MAX_STUDIO_PER_PIC) continue;
      if (opDistTo(key, studioN) > MAX_OPERATOR_DIST) continue;
      return key;
    }
    return null;
  }
  function findIdle(excludeKey = null) {
    for (const [key, count] of Object.entries(picCount)) {
      if (key === excludeKey) continue;
      if (!isInShift(key)) continue;
      if (DEDICATED_OPS.includes(key)) continue;
      if (count === 0) return key;
    }
    return null;
  }
  function findBetterOp(studioN, excludeKey) {
    const idle = findIdle(excludeKey);
    if (idle) return idle;
    const excludeDist = opDistTo(excludeKey, studioN);
    let bestKey = null, bestDist = Infinity;
    for (const [key, count] of Object.entries(picCount)) {
      if (key === excludeKey) continue;
      if (!isInShift(key)) continue;
      if (DEDICATED_OPS.includes(key)) continue;
      if (count >= MAX_STUDIO_PER_PIC) continue;
      const assigned = picStudios[key] || [];
      if (assigned.length === 0) continue;
      const dist = Math.min(...assigned.map(s => physicalDist(s, studioN)));
      if (dist < excludeDist && dist < bestDist) { bestDist = dist; bestKey = key; }
    }
    return bestKey;
  }
  function doAssign(s, rawPic) {
    const studioN  = sNum(s);
    const dedGroup = getDedicatedGroup(studioN);

    if (MANDATORY_STUDIOS[studioN]) {
      const mandKey = findMandatory(studioN);
      if (mandKey) assignKey(mandKey, s); else s.assignedPic = "LSC";
      return;
    }
    if (dedGroup) {
      const ded = findDedicatedInGroup(dedGroup, studioN);
      if (ded) { assignKey(ded, s); return; }
      const idle = findIdle();
      if (idle) { assignKey(idle, s); return; }
      s.assignedPic = "LSC";
      return;
    }
    if (!isCoord(rawPic)) {
      const key = rawPic.trim().toLowerCase();
      if (picCount[key] === undefined) picCount[key] = 0;
      if (picCount[key] === 0) { assignKey(key, s); return; }
      if (picCount[key] === 1) {
        const better = findBetterOp(studioN, key);
        if (better) { assignKey(better, s); return; }
        assignKey(key, s); return;
      }
    }
    const idle = findIdle();
    if (idle) { assignKey(idle, s); return; }
    for (const [key, count] of Object.entries(picCount)) {
      if (!isInShift(key) || DEDICATED_OPS.includes(key)) continue;
      if (count < MAX_STUDIO_PER_PIC) { assignKey(key, s); return; }
    }
    s.assignedPic = "LSC";
  }

  [...starts, ...ends].forEach(s => reg(s.picForEvent || "-"));
  DEDICATED_OPS.forEach(name => {
    if (!validPics || validPics.has(name.toLowerCase())) reg(name);
  });

  function sortMandatoryFirst(list) {
    return [...list].sort((a, b) => {
      const aN = sNum(a), bN = sNum(b);
      const aM = !!MANDATORY_STUDIOS[aN], bM = !!MANDATORY_STUDIOS[bN];
      if (aM !== bM) return aM ? -1 : 1;
      const aZ = DEDICATED_ZONE_B.has(aN) ? 0 : DEDICATED_ZONE_A.has(aN) ? 1 : 2;
      const bZ = DEDICATED_ZONE_B.has(bN) ? 0 : DEDICATED_ZONE_A.has(bN) ? 1 : 2;
      if (aZ !== bZ) return aZ - bZ;
      return aN - bN;
    });
  }

  sortMandatoryFirst(ends).forEach(s   => doAssign(s, s.picForEvent || "-"));
  sortMandatoryFirst(starts).forEach(s => doAssign(s, s.picForEvent || "-"));
}

// ── MARATHON ──────────────────────────────────
function renderMarathon() {
  const container = document.getElementById("schedule-list");
  container.innerHTML = "";
  const list = sessions.filter(s => s.isMarathon);
  if (!list.length) { container.innerHTML = `<div class="empty">📭 Tidak ada sesi marathon</div>`; return; }

  const now = Date.now();
  list.forEach(s => {
    const curIdx  = getCurrentHostIdx(s);
    let endMs     = timeToMs(s.date, s.endTime);
    const startMs = timeToMs(s.date, s.startTime);
    if (endMs && startMs && endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
    const isEnded = endMs ? now > endMs : false;

    const card = document.createElement("div");
    card.className = `marathon-session-card ${isEnded ? "ms-ended" : ""}`;
    card.innerHTML = `
      <div class="ms-header">
        <div class="ms-brand">🏃 ${s.brand} ${isEnded ? `<span class="ended-badge">✓ ENDED</span>` : ""}</div>
        <div class="ms-meta">
          <span class="badge marketplace">${s.marketplace}</span>
          <span class="badge studio">${s.studio}</span>
          <span class="badge idline">📋 ${s.idLine || s.skpId || "-"}</span>
        </div>
        <div class="ms-time">▶ ${s.startTime} · ⏹ ${s.endTime} · ${s.hosts.length} host</div>
      </div>
      <div class="ms-hosts" id="msh-${s.idLine || s.skpId}"></div>`;
    container.appendChild(card);

    const hc = card.querySelector(`#msh-${s.idLine || s.skpId}`);
    s.hosts.forEach((h, hi) => {
      const isCurrent = !isEnded && hi === curIdx;
      const isNext    = !isEnded && hi === curIdx + 1;
      const isPast    = isEnded || (curIdx >= 0 && hi < curIdx);
      const row = document.createElement("div");
      row.className = `host-row ${isCurrent ? "host-current" : ""} ${isNext ? "host-next" : ""} ${isPast ? "host-past" : ""}`;
      row.innerHTML = `
        <div class="hr-num">${hi + 1}</div>
        <div class="hr-time"><span class="hr-start">▶ ${h.startTime}</span><span class="hr-arrow">→</span><span class="hr-end">⏹ ${h.endTime}</span></div>
        <div class="hr-info">
          <div class="hr-name">${h.host}
            ${isCurrent ? `<span class="live-badge">● LIVE</span>` : ""}
            ${isNext    ? `<span class="next-badge">NEXT</span>` : ""}
            ${isEnded && hi === s.hosts.length - 1 ? `<span class="ended-host-badge">✓ selesai</span>` : ""}
          </div>
          <div class="hr-pic">🧑‍💼 PIC: ${h.picData || "-"}</div>
        </div>`;
      hc.appendChild(row);
    });
  });
}

// ── TIMELINE ──────────────────────────────────
function renderTimeline() {
  const container = document.getElementById("schedule-list");
  container.innerHTML = "";
  if (!sessions.length) { container.innerHTML = `<div class="empty">📭 Tidak ada jadwal</div>`; return; }

  const events = {};
  sessions.forEach(s => {
    const firstPic = s.hosts?.[0]?.picData || "-";
    const lastPic  = s.hosts?.[s.hosts.length - 1]?.picData || "-";
    if (s.startTime && s.startTime !== "-") {
      if (!events[s.startTime]) events[s.startTime] = { starts: [], ends: [] };
      events[s.startTime].starts.push({ ...s, picForEvent: firstPic });
    }
    if (s.endTime && s.endTime !== "-") {
      const endKey = (s.endTime === "00:00" || s.endTime === "23:59") ? "23:59/00:00" : s.endTime;
      if (!events[endKey]) events[endKey] = { starts: [], ends: [] };
      events[endKey].ends.push({ ...s, picForEvent: lastPic });
    }
  });

  Object.entries(events).forEach(([time, ev]) => {
    const validPics = getAvailableOps(sessions, time);
    assignPics(ev.starts, ev.ends, validPics);
  });

  const sorted = Object.keys(events).sort((a, b) => {
    const toMin = t => { if (t === "23:59/00:00") return 1441; const [h,m] = t.split(":").map(Number); return h*60+m; };
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
  const now = Date.now(), startMs = timeToMs(s.date, s.startTime);
  const isPast = startMs && startMs < now;
  const isSoon = startMs && (startMs - now) < 15 * 60 * 1000 && !isPast;
  const picLabel = s.assignedPic || "LSC";
  const isLSC   = picLabel === "LSC";
  const firstHost = s.hosts?.[0]?.host || "-";
  const card = document.createElement("div");
  card.className = `session-card ${isPast ? "past" : ""} ${isSoon ? "soon" : ""} ${s.isMarathon ? "marathon-card" : ""}`;
  card.innerHTML = `
    <div class="session-num">${num}</div>
    <div class="session-info">
      <div class="session-brand">${s.brand}
        ${s.isMarathon ? `<span class="type-badge marathon-badge">🏃</span>` : `<span class="type-badge single-badge">⚡</span>`}
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

function renderSingle() {
  const container = document.getElementById("schedule-list");
  container.innerHTML = "";
  const list = sessions.filter(s => !s.isMarathon);
  if (!list.length) { container.innerHTML = `<div class="empty">📭 Tidak ada sesi single</div>`; return; }
  const copies = list.map(s => Object.assign({}, s));
  assignPics(copies, []);
  copies.forEach((s, i) => container.appendChild(makeTimelineCard(s, i + 1, "start")));
}

// ── STANDBY ───────────────────────────────────
const STANDBY_BRANDS = [
  { key: "AT Tiktok",        slotFormat: false, match: s => s.brand.toLowerCase().includes("american tourister") && s.marketplace.toLowerCase() === "tiktok" },
  { key: "Samsonite Tiktok", slotFormat: false, match: s => s.brand.toLowerCase().includes("samsonite") && s.marketplace.toLowerCase() === "tiktok" },
  { key: "AT Shopee",        slotFormat: false, match: s => s.brand.toLowerCase().includes("american tourister") && s.marketplace.toLowerCase() === "shopee" },
  { key: "Samsonite Shopee", slotFormat: true,  match: s => s.brand.toLowerCase().includes("samsonite") && s.marketplace.toLowerCase() === "shopee" },
  { key: "ASICS",            slotFormat: false, match: s => s.brand.toLowerCase().includes("asics") },
];

function buildPicShiftData() {
  const shifts = { pagi: {}, siang: {} };
  sessions.forEach(s => {
    const studioNum = parseInt((s.studio || "").match(/\d+/)?.[0] || "0");
    if (!studioNum) return;
    s.hosts.forEach(h => {
      if (!h.picData || h.picData === "-") return;
      const endStr = (h.endTime && h.endTime !== "-") ? h.endTime : h.startTime;
      const shift  = getShift(endStr);
      if (shift === "malam") return;
      const key  = h.picData.trim().toLowerCase();
      const name = formatPic(h.picData);
      if (!shifts[shift][key]) shifts[shift][key] = { name, studios: new Set() };
      shifts[shift][key].studios.add(studioNum);
    });
  });
  return shifts;
}

function buildStandbyData() {
  return STANDBY_BRANDS.map(b => {
    const matched = sessions.filter(b.match);
    const slots = [], seenKey = new Set();
    matched.forEach(s => {
      if (b.slotFormat) {
        s.hosts.forEach(h => {
          if (!h.picData || h.picData === "-") return;
          const endStr = (h.endTime && h.endTime !== "-") ? h.endTime : h.startTime;
          if (getShift(endStr) === "malam") return;
          const st = (h.startTime || "").substring(0,5), en = (h.endTime || "").substring(0,5);
          const key = `${st}-${en}-${h.picData}`;
          if (seenKey.has(key)) return; seenKey.add(key);
          slots.push({ type:"slot", label:`${st.replace(":00","")}–${en.replace(":00","")}`, pic: h.picData.trim(), sortKey: toMinJS(h.startTime) });
        });
      } else {
        s.hosts.forEach(h => {
          if (!h.picData || h.picData === "-") return;
          const endStr = (h.endTime && h.endTime !== "-") ? h.endTime : h.startTime;
          const shift  = getShift(endStr);
          if (shift === "malam") return;
          const key = `${shift}-${h.picData}`;
          if (seenKey.has(key)) return; seenKey.add(key);
          slots.push({ type:"shift", label: shift.toUpperCase(), pic: h.picData.trim(), sortKey: shift === "pagi" ? 0 : 1 });
        });
      }
    });
    slots.sort((a,b) => a.sortKey - b.sortKey);
    return { key: b.key, slotFormat: b.slotFormat, slots };
  }).filter(b => b.slots.length > 0);
}

function renderStandby() {
  const container = document.getElementById("schedule-list");
  container.innerHTML = "";
  if (!sessions.length) { container.innerHTML = `<div class="empty">📭 Data belum dimuat</div>`; return; }

  const dateStr = sessions[0]?.date || "";
  let dateLabel = "";
  try { dateLabel = new Date(dateStr + "T12:00:00+07:00").toLocaleDateString("id-ID", { weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Jakarta" }).toUpperCase(); } catch(e) {}

  const picShift = buildPicShiftData(), standbyList = buildStandbyData();
  let html = `<div class="standby-wrapper">`;
  html += `<div class="standby-section"><div class="standby-title">📅 REMINDER ${dateLabel}</div></div>`;

  ["pagi","siang"].forEach(shift => {
    const data = picShift[shift];
    if (!data || !Object.keys(data).length) return;
    html += `<div class="standby-section"><div class="standby-label">👥 PIC SHIFT ${shift.toUpperCase()}</div>`;
    Object.entries(data).sort((a,b) => a[0].localeCompare(b[0])).forEach(([,d]) => {
      const studios = [...d.studios].sort((a,b) => a-b).join(", ");
      html += `<div class="pic-row"><span class="pic-name">${d.name}</span><span class="pic-studios">${studios}</span></div>`;
    });
    html += `</div>`;
  });

  standbyList.forEach(b => {
    html += `<div class="standby-brand-card"><div class="standby-brand-title">📍 STANDBY ${b.key.toUpperCase()}</div>`;
    b.slots.forEach(slot => {
      html += `<div class="standby-row"><span class="standby-time">${slot.label}</span><span class="standby-pic">${formatPic(slot.pic)}</span></div>`;
    });
    html += `</div>`;
  });

  html += `<div class="standby-section"><div class="standby-label">📋 PROSEDUR</div><div class="standby-text">1. BACK UP HOST SELAIN ASICS, AT, dan SAMSO WAJIB HAND TALENT
2. CEK KEHADIRAN HOST BAIK SINGLE HOST/MARATHON DAN LAPOR KE GRUP HOST TAG TALCO KALO 30 SEBELUM LIVE HOST SELANJUTNYA BELUM DATANG
3. PASTIKAN SEMUA STUDIO ADA AKUN ABSEN HOST</div></div>`;

  html += `<div class="standby-section"><div class="standby-label">🔗 LINKS</div>
    <a class="standby-link" href="https://forms.gle/J8WG4kmQap7h6VcZ7" target="_blank">📝 Form Bukti Tayang</a>
    <a class="standby-link" href="https://docs.google.com/spreadsheets/d/1vbjwOFg_vmyJNs9UXuLMJF-TekN6xfomAzXy-zoDP7o/edit?gid=0" target="_blank">📊 Data Report & List Host</a>
    <a class="standby-link" href="https://docs.google.com/spreadsheets/d/1XhC8QOC9loOCODjMRkdNa4yfl8BeDVZct8wsFbeeIz0/edit?gid=743892642" target="_blank">📷 Backup Screenshot LS</a>
    <a class="standby-link" href="https://docs.google.com/spreadsheets/d/1dTDvRuYPYZ5_5Z4t6sUAP3myjE_mo23RlVkhU-rPk0E/edit?gid=1067791791" target="_blank">📈 Insight AT & Samsonite</a>
  </div>`;
  html += `<button class="standby-copy" onclick="copyStandbyText()">📋 Copy Teks Reminder</button></div>`;
  container.innerHTML = html;
}

function copyStandbyText() {
  const dateStr = sessions[0]?.date || "";
  let dateLabel = "";
  try { dateLabel = new Date(dateStr + "T12:00:00+07:00").toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Jakarta"}).toUpperCase(); } catch(e) {}
  const picShift = buildPicShiftData(), standbyList = buildStandbyData();
  let text = `REMINDER ${dateLabel}\n\n`;
  ["pagi","siang"].forEach(shift => {
    const data = picShift[shift];
    if (!data || !Object.keys(data).length) return;
    text += `PIC SHIFT ${shift.toUpperCase()}\n`;
    Object.entries(data).sort((a,b) => a[0].localeCompare(b[0])).forEach(([,d]) => {
      text += `${d.name.replace("@","")}\t${[...d.studios].sort((a,b)=>a-b).join(",")}\n`;
    });
    text += "\n";
  });
  standbyList.forEach(b => {
    text += `STANDBY ${b.key.toUpperCase()}\n`;
    b.slots.forEach(slot => { text += `${slot.label} ${slot.pic}\n`; });
    text += "\n";
  });
  text += `1. BACK UP HOST SELAIN ASICS, AT, dan SAMSO WAJIB HAND TALENT\n2. CEK KEHADIRAN HOST BAIK SINGLE HOST/MARATHON DAN LAPOR KE GRUP HOST TAG TALCO KALO 30 SEBELUM LIVE HOST SELANJUTNYA BELUM DATANG\n3. PASTIKAN SEMUA STUDIO ADA AKUN ABSEN HOST\n\n`;
  text += `Form bukti tayang:\nhttps://forms.gle/J8WG4kmQap7h6VcZ7\n\nLINK Data Report Terbaru dan link LIST HOST:\nhttps://docs.google.com/spreadsheets/d/1vbjwOFg_vmyJNs9UXuLMJF-TekN6xfomAzXy-zoDP7o/edit?gid=0\n\nBACKUP Screenshot LS Streamlab Upload BY HOST\nhttps://docs.google.com/spreadsheets/d/1XhC8QOC9loOCODjMRkdNa4yfl8BeDVZct8wsFbeeIz0/edit?gid=743892642\n\nLINK Insight American Tourister dan Samsonite:\nhttps://docs.google.com/spreadsheets/d/1dTDvRuYPYZ5_5Z4t6sUAP3myjE_mo23RlVkhU-rPk0E/edit?gid=1067791791`;
  navigator.clipboard.writeText(text).then(() => showBanner("✅ Teks di-copy!", "success")).catch(() => showBanner("❌ Gagal copy", "error"));
}

// ── NOTIF PANEL ───────────────────────────────
function showNotifPanel() {
  const panel = document.getElementById("notif-panel");
  if (panel.style.display !== "none") { panel.style.display = "none"; return; }

  const now = Date.now(), list = document.getElementById("notif-time-list");
  list.innerHTML = "";
  const times = new Set();
  sessions.forEach(s => { if (s.startTime && s.startTime !== "-") times.add(s.startTime); });

  [...times].sort().forEach(time => {
    const ms = timeToMs(sessions[0]?.date, time);
    if (!ms) return;
    const diff = ms - now;
    if (diff < -60 * 60 * 1000) return;
    const diffMin = Math.round(diff / 60000);
    const label   = time + (diffMin > 0 ? ` (+${diffMin}m)` : " (lewat)");
    const btn = document.createElement("button");
    btn.className = "notif-time-btn";
    btn.textContent = label;
    btn.onclick = () => sendManualNotifFor(time);
    list.appendChild(btn);
  });
  panel.style.display = "block";
}

function closeNotifPanel() {
  document.getElementById("notif-panel").style.display = "none";
}

function sendManualNotifFor(time) {
  const group = sessions.filter(s => s.startTime === time);
  if (!group.length) { showBanner("Tidak ada sesi di jam ini", "warning"); return; }
  const lines = group.map((s, i) => {
    const h = s.hosts?.[0];
    return `${i+1}. ${s.brand} | ${s.marketplace} | ${s.studio}\n   👤 ${h?.host || "-"} ${h?.picData ? formatPic(h.picData) : "LSC"}`;
  });
  broadcastNotif(`⏰ REMINDER — START ${time}`, lines.join("\n"), false);
  closeNotifPanel();
}

function sendManualNotifAll() {
  const now = Date.now(), upcoming = {};
  sessions.forEach(s => {
    if (!s.startTime || s.startTime === "-") return;
    const ms = timeToMs(s.date, s.startTime);
    if (!ms) return;
    const diff = ms - now;
    if (diff < -5 * 60 * 1000 || diff > 2 * 60 * 60 * 1000) return;
    if (!upcoming[s.startTime]) upcoming[s.startTime] = [];
    upcoming[s.startTime].push(s);
  });
  const times = Object.keys(upcoming);
  if (!times.length) { showBanner("Tidak ada sesi upcoming (2 jam ke depan)", "warning"); return; }
  times.sort().forEach((time, idx) => {
    setTimeout(() => {
      const group = upcoming[time];
      const lines = group.map((s, i) => {
        const h = s.hosts?.[0];
        return `${i+1}. ${s.brand} | ${s.marketplace} | ${s.studio}\n   👤 ${h?.host || "-"} ${h?.picData ? formatPic(h.picData) : "LSC"}`;
      });
      broadcastNotif(`⏰ REMINDER — START ${time}`, lines.join("\n"), false);
    }, idx * 2000);
  });
  closeNotifPanel();
}

// ── STATS ─────────────────────────────────────
function updateStats() {
  const m  = sessions.filter(s => s.isMarathon).length;
  const sg = sessions.filter(s => !s.isMarathon).length;
  document.getElementById("stat-total").textContent    = sessions.length;
  document.getElementById("stat-marathon").textContent = m;
  document.getElementById("stat-single").textContent   = sg;
}

// ── AUTO NOTIF ────────────────────────────────
function scheduleAllNotifications(list) {
  const now = Date.now();
  let count = 0;
  const startGroups = {};
  list.forEach(s => {
    if (s.startTime && s.startTime !== "-") {
      if (!startGroups[s.startTime]) startGroups[s.startTime] = [];
      startGroups[s.startTime].push(s);
    }
  });
  Object.entries(startGroups).forEach(([time, group]) => {
    const startMs = timeToMs(group[0].date, time);
    if (!startMs) return;
    [{ min: 60, prefix: "🔔 SETUP", urgent: false },
     { min: 10, prefix: "⏰ 10 MENIT LAGI", urgent: false },
     { min: 5,  prefix: "🚨 5 MENIT LAGI",  urgent: true  }]
    .forEach(({ min, prefix, urgent }) => {
      const t = startMs - min * 60 * 1000;
      if (t > now) {
        scheduledTasks.push(setTimeout(() => fireGroupNotif(`${prefix} — START ${time}`, group, "start", urgent), t - now));
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

function fireGroupNotif(title, group, type, urgent = false) {
  const lines = group.map((s, i) => {
    const h = type === "start" ? s.hosts?.[0] : s.hosts?.[s.hosts.length - 1];
    const host = h?.host || "-", pic = h?.picData ? formatPic(h.picData) : "LSC";
    return type === "start"
      ? `${i+1}. ${s.brand} | ${s.marketplace} | ${s.studio}\n   👤 ${host} ${pic}`
      : `${i+1}. ${s.brand} | ${s.marketplace} | ${s.studio} ${pic}`;
  });
  sendNotification(title, lines.join("\n"), `grp-${type}-${title}-${Date.now()}`, urgent);
}

// ── HELPERS ───────────────────────────────────
function getCurrentHostIdx(session) {
  const now = Date.now();
  for (let i = 0; i < session.hosts.length; i++) {
    const h = session.hosts[i];
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
  const el = document.getElementById("clock"), de = document.getElementById("date-display");
  if (el) el.textContent = now.toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit", second:"2-digit", timeZone:"Asia/Jakarta" });
  if (de) de.textContent = now.toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long", year:"numeric", timeZone:"Asia/Jakarta" });
}

function showLoading(show) {
  document.getElementById("loading").style.display = show ? "flex" : "none";
}

function showBanner(msg, type = "info") {
  const el = document.getElementById("banner");
  el.textContent = msg; el.className = "banner " + type; el.style.display = "block";
  setTimeout(() => el.style.display = "none", 4000);
}

async function debugNotif() {
  const lines = [
    `URL: ${location.href}`,
    `Permission: ${Notification.permission}`,
    `SW: ${!!swRegistration} (${swRegistration?.active?.state || "none"})`,
    `ntfy: ${ntfySource?.readyState === 1 ? "connected" : "disconnected"}`,
  ];
  alert(lines.join("\n"));
  if (Notification.permission !== "granted") {
    const r = await Notification.requestPermission();
    if (r !== "granted") return;
  }
  sendNotification("🔔 Debug Test", "Notif berhasil dari " + location.hostname, "debug-" + Date.now());
}
