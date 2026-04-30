const API_URL    = "https://script.google.com/macros/s/AKfycbyhsAeqXWyuR0sRoNmy2i1vcyvKAk7Q-gaivbiNTLAq7eDKdCev8RpsG11v1aEGdTbB/exec";
const NTFY_TOPIC = "castlive-ops-2026-xk9";
const ICON_URL   = new URL("./icon-192.png", location.href).href;
const GOOGLE_CLIENT_ID = "343542715243-jhl0dshlpiklcapfgj4akj0a02vg9q05.apps.googleusercontent.com";
const PRESENCE_TOPIC   = "castlive-presence-2026";

let currentUserEmail = localStorage.getItem("userEmail") || null;
let onlineUsers      = {};
let presenceStarted  = false;

// ─── BUKTI TAYANG HELPERS ─────────────────────────────

// function getShiftBT(startTime) {
//   if (!startTime) return 'pagi';
//   const m = toMin(startTime);
//   return m < 12 * 60 ? 'pagi' : 'siang';
// }

function formatPicForCopy(assignedPic) {
  if (!assignedPic || assignedPic === 'LSC') return 'LSC';
  const lower = assignedPic.replace('@', '').toLowerCase().trim();
  // LSC coordinator (jonathan, hamzah, tyo, hanif) → @jonathan (lowercase, no Sirclo)
  if (LSC_NAMES_SET.has(lower)) return `@${lower}`;
  // Unknown name (sudah ada @ dari formatPic) → @Velind Sirclo
  if (assignedPic.startsWith('@')) return `${assignedPic} Sirclo`;
  // Regular PIC → @Maul Sirclo, @Arbi Sirclo, dll
  return `@${assignedPic} Sirclo`;
}


// function toggleBtShift(shift) {
//   const body    = document.getElementById('bt-shift-body-' + shift);
//   const chevron = document.getElementById('bt-shift-chevron-' + shift);
//   if (!body) return;
//   const isOpen = body.style.display !== 'none';
//   body.style.display = isOpen ? 'none' : '';
//   if (chevron) chevron.textContent = isOpen ? '▸' : '▾';
// }




function onGsiLoad() {
  if (!currentUserEmail) {
    google.accounts.id.initialize({
      client_id  : GOOGLE_CLIENT_ID,
      callback   : handleGoogleSignIn,
      auto_select: false,
    });
    const wrapper = document.getElementById("user-login-wrapper");
    const btnDiv  = document.getElementById("google-signin-btn");
    if (wrapper) wrapper.style.display = "flex";
    if (btnDiv) {
      google.accounts.id.renderButton(btnDiv, {
        type : "standard",
        theme: "filled_blue",
        size : "large",
        text : "sign_in_with",
        width: 280,
      });
    }
  } else {
    startPresenceIfNeeded();
  }
}

function handleGoogleSignIn(response) {
  try {
    const payload = JSON.parse(atob(response.credential.split(".")[1]));
    currentUserEmail = payload.email;
    localStorage.setItem("userEmail", currentUserEmail);
    const wrapper = document.getElementById("user-login-wrapper");
    if (wrapper) wrapper.style.display = "none";
    startPresenceIfNeeded();
    updateOnlineDisplay();
    showBanner(`✅ Login: ${currentUserEmail}`, "success");
  } catch(e) {
    showBanner("❌ Gagal login Google", "error");
  }
}

function logoutUser() {
  currentUserEmail = null;
  localStorage.removeItem("userEmail");
  presenceStarted  = false;
  onlineUsers      = {};
  updateOnlineDisplay();
  location.reload();
}

function startPresenceIfNeeded() {
  if (presenceStarted || !currentUserEmail) return;
  presenceStarted = true;
  broadcastPresence();
  listenPresence();
  setInterval(broadcastPresence, 3 * 60 * 1000);
  setInterval(() => {
    const cutoff = Date.now() - 6 * 60 * 1000;
    Object.keys(onlineUsers).forEach(email => {
      if (onlineUsers[email] < cutoff) delete onlineUsers[email];
    });
    updateOnlineDisplay();
  }, 60 * 1000);
}

function broadcastPresence() {
  if (!currentUserEmail) return;
  fetch(`https://ntfy.sh/${PRESENCE_TOPIC}`, {
    method: "POST",
    body  : JSON.stringify({ type: "presence", email: currentUserEmail, ts: Date.now() }),
  }).catch(() => {});
}

function listenPresence() {
  const src = new EventSource(`https://ntfy.sh/${PRESENCE_TOPIC}/sse`);
  src.addEventListener("message", e => {
    try {
      const d    = JSON.parse(e.data);
      if (d.event !== "message") return;
      const body = JSON.parse(d.message || d.body || "{}");
      if (body.type === "presence" && body.email) {
        onlineUsers[body.email] = body.ts;
        updateOnlineDisplay();
      }
    } catch(err) {}
  });
  src.onerror = () => { src.close(); setTimeout(listenPresence, 5000); };
}

function updateOnlineDisplay() {
  const el = document.getElementById("online-users");
  if (!el) return;
  if (!currentUserEmail) {
    el.innerHTML = `<span style="cursor:pointer;color:var(--bs-muted);font-size:0.62rem"
      onclick="document.getElementById('user-login-wrapper').style.display='flex'">
      👤 Login untuk lihat online users
    </span>`;
    return;
  }
  onlineUsers[currentUserEmail] = Math.max(onlineUsers[currentUserEmail] || 0, Date.now() - 10000);
  const cutoff = Date.now() - 5 * 60 * 1000;
  const active = Object.entries(onlineUsers)
    .filter(([, ts]) => ts > cutoff)
    .map(([email]) => email.split("@")[0]);
  el.innerHTML = `
    <span style="color:var(--bs-success);font-weight:700">🟢 ${active.length}</span>
    <span style="color:var(--bs-muted)"> online: </span>
    <span style="color:#60a5fa;font-weight:600">${active.join(", ")}</span>
    <span onclick="logoutUser()"
      style="margin-left:6px;cursor:pointer;color:#adb5bd;font-size:0.6rem;text-decoration:underline">
      logout
    </span>`;
}

const PIC_MENTIONS = {
  "jonathan":"Jonathan","tyo":"Tyo","hamzah":"Hamzah","hanif":"Hanif",
  "riva":"Riva","ferry":"Ferry","bernhard":"Bernhard","leleng":"Leleng",
  "nadiem":"Nadiem","fadhil":"Fadhil","imam":"Imam","eric":"Eric",
  "rizky":"Rizky","yohan":"Yohan","septian":"Septian","agung":"Agung",
  "apri":"Apri","maulidan":"Maul","arbi":"Arbi","afdal":"Afdal",
  "roiisul":"Roiisul","rakha":"Rakha","isaac":"Isaac","raffyco":"Raffyco",
  "luthfi rizal":"Luthfi Rizal",
};

const MAX_STUDIO_PER_PIC = 2;
const MAX_OPERATOR_DIST  = 4;
const LSC_NAMES_SET = new Set(["jonathan","hamzah","tyo","hanif"]);
const DEDICATED_OPS = ["arbi","agung","raffyco","isaac","roiisul","eric"];
const MANDATORY_STUDIOS = {
  2:["agung","arbi","raffyco"], 29:["roiisul","eric","isaac"],
};

const STUDIO_PHYSICAL = {};
[1,2,3,5].forEach((s,i)                    => STUDIO_PHYSICAL[s]={c:"entrance",p:i});
[6,7,8,9,10,11,12,15].forEach((s,i)        => STUDIO_PHYSICAL[s]={c:"A",p:i});
[16,17,18,19,20,21,22,23,25].forEach((s,i) => STUDIO_PHYSICAL[s]={c:"B1",p:i});
[26,27,28,29,30,31,32].forEach((s,i)       => STUDIO_PHYSICAL[s]={c:"B2",p:i});

function physicalDist(a,b){
  if(a===b)return 0;
  const pA=STUDIO_PHYSICAL[a],pB=STUDIO_PHYSICAL[b];
  if(!pA||!pB)return 99;
  if(pA.c===pB.c)return Math.abs(pA.p-pB.p);
  if(pA.c==="B1"&&pB.c==="B2")return Math.abs(pA.p-(pB.p+4));
  if(pA.c==="B2"&&pB.c==="B1")return Math.abs((pA.p+4)-pB.p);
  if((pA.c==="entrance"&&pB.c==="A")||(pA.c==="A"&&pB.c==="entrance"))return 1+Math.abs(pA.p-pB.p);
  if((pA.c==="entrance"&&pB.c==="B1")||(pA.c==="B1"&&pB.c==="entrance")){
    const eP=pA.c==="entrance"?pA.p:pB.p,b1P=pA.c==="B1"?pA.p:pB.p;
    return Math.abs(eP-3)+Math.abs(b1P-8)+1;
  }
  if((pA.c==="A"&&pB.c==="B1")||(pA.c==="B1"&&pB.c==="A"))return 4+Math.abs(pA.p-pB.p);
  return 10;
}

const DEDICATED_ZONE_A=new Set([1,2,3,5,6,7]);
const DEDICATED_ZONE_B=new Set([19,20,21,25,26,27,28,29,30,31,32]);
const DEDICATED_HOME={"agung":2,"arbi":2,"raffyco":2,"roiisul":29,"eric":29,"isaac":29};

function getDedicatedGroup(n){
  if(DEDICATED_ZONE_A.has(n))return["agung","arbi","raffyco"];
  if(DEDICATED_ZONE_B.has(n))return["roiisul","eric","isaac"];
  return null;
}

let sessions=[],scheduledTasks=[],swRegistration=null,activeTab="marathon",ntfySource=null;
const seenNtfyIds=new Set();

window.addEventListener("DOMContentLoaded", async () => {
  updateClock();
  updateTabLabels();
  setInterval(updateClock, 1000);
  await registerSW();
  await requestNotifPermission();
  connectNtfy();
  await loadSchedule();
  setInterval(loadSchedule, 5 * 120 * 1000);
  if (currentUserEmail) {
    startPresenceIfNeeded();
    updateOnlineDisplay();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      connectNtfy();
      broadcastPresence();
      loadSchedule();
    }
  });
  window.addEventListener("pageshow", e => {
    if (e.persisted) { connectNtfy(); broadcastPresence(); loadSchedule(); }
  });
});

async function registerSW(){
  if("serviceWorker"in navigator){
    try{swRegistration=await navigator.serviceWorker.register("./sw.js",{scope:"./"});}
    catch(e){console.warn("SW failed:",e);}
  }
}

async function requestNotifPermission(){
  if(!("Notification"in window))return false;
  if(Notification.permission==="granted")return true;
  if(Notification.permission==="denied"){showBanner("❌ Notifikasi diblokir","error");return false;}
  const r=await Notification.requestPermission();
  if(r==="granted")showBanner("✅ Notifikasi aktif!","success");
  return r==="granted";
}

function connectNtfy(){
  if(ntfySource&&ntfySource.readyState===EventSource.OPEN)return;
  ntfySource=new EventSource(`https://ntfy.sh/${NTFY_TOPIC}/sse`);
  ntfySource.addEventListener("message",e=>{
    try{
      const d=JSON.parse(e.data);
      if(d.event!=="message")return;
      if(seenNtfyIds.has(d.id))return;
      seenNtfyIds.add(d.id);
      setTimeout(()=>seenNtfyIds.delete(d.id),60000);
      sendNotification(d.title||"Live Reminder",d.message||d.body||"",`ntfy-${d.id}`);
    }catch(err){}
  });
  ntfySource.onerror=()=>{ntfySource?.close();ntfySource=null;setTimeout(connectNtfy,5000);};
}

async function broadcastNotif(title,body,urgent=false){
  sendNotification(title,body,`local-${Date.now()}`,urgent);
  try{
    const res=await fetch(`https://ntfy.sh/${NTFY_TOPIC}`,{
      method:"POST",body:`${title}\n\n${body}`,
    });
    if(!res.ok)throw new Error(`ntfy ${res.status}`);
    showBanner("🔔 Notif dikirim ke semua user!","success");
  }catch(e){
    console.error("ntfy error:",e);
    showBanner("⚠️ Broadcast gagal: "+e.message,"warning");
  }
}

function sendNotification(title,body,tag,urgent=false){
  if(Notification.permission!=="granted"){requestNotifPermission();return;}
  const options={
    body,tag:tag||`notif-${Date.now()}`,
    icon:ICON_URL,badge:ICON_URL,
    vibrate:urgent?[300,100,300,100,300]:[200,100,200],
    requireInteraction:false,
  };
  if(swRegistration){
    swRegistration.showNotification(title,options).catch(()=>{try{new Notification(title,options);}catch(e){}});
  }else{
    navigator.serviceWorker?.ready
      .then(reg=>reg.showNotification(title,options))
      .catch(()=>{try{new Notification(title,options);}catch(e){}});
  }
}

async function loadSchedule(){
  if(!sessions.length){
    try{
      const cached=localStorage.getItem("lastSchedule");
      if(cached){
        const data=JSON.parse(cached);
        sessions=data.sessions.map(s=>{
        s.isMarathon=s.hosts.length>1;
        s.hosts=(s.hosts||[]).map(h=>({
          host:      h.host      ?? h.name  ?? '-',
          startTime: h.startTime ?? h.start ?? '-',
          endTime:   h.endTime   ?? h.end   ?? '-',
          picData:   h.picData   ?? h.pic   ?? '-',
        }));
        return s;
      });

        renderTab(activeTab);updateStats();
      }
    }catch(e){}
  }
  showLoading(true);
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    const res=await fetch(API_URL+"?t="+Date.now(),{signal:controller.signal});
    clearTimeout(timeout);
    const data=JSON.parse(await res.text());
    if(!data.success)throw new Error(data.error);
    localStorage.setItem("lastSchedule",JSON.stringify(data));
    sessions=data.sessions.map(s=>{
        s.isMarathon=s.hosts.length>1;
        s.hosts=(s.hosts||[]).map(h=>({
          host:      h.host      ?? h.name  ?? '-',
          startTime: h.startTime ?? h.start ?? '-',
          endTime:   h.endTime   ?? h.end   ?? '-',
          picData:   h.picData   ?? h.pic   ?? '-',
        }));
        return s;
      });
    renderTab(activeTab);cancelAllScheduled();scheduleAllNotifications(sessions);updateStats();
    showBanner(`✅ ${data.date} — ${sessions.length} sesi`,"success");
  }catch(err){
    if(err.name==="AbortError"){
      showBanner("⚠️ Timeout — pakai data cache","warning");
    }else{
      showBanner("❌ Gagal load: "+err.message,"error");
    }
  }
  showLoading(false);
}

function switchTab(tab){
  activeTab=tab;
  document.querySelectorAll(".nav-link").forEach(b=>b.classList.remove("active"));
  document.getElementById("tab-"+tab).classList.add("active");
  renderTab(tab);
}

function renderTab(tab) {
  if(tab==="marathon")    renderMarathon();
  if(tab==="timeline")    renderTimeline();
  if(tab==="single")      renderSingle();
  if(tab==="standby")     { if(_lastPicScheduleData) renderStandby(null, _lastPicScheduleData); loadStandby(); }
  if(tab==="klasemen")    loadKlasemen();
  if(tab==="hariH")       loadHariH();
  if(tab==="buktiTayang") loadBuktiTayang();
  if(tab === "mcr")         renderMCR();

}


function formatPic(rawName){
  if(!rawName||rawName==="-"||rawName==="")return"LSC";
  const key=rawName.trim().toLowerCase();
  return PIC_MENTIONS[key]||("@"+rawName.trim());
}

function getShift(timeStr){
  if(!timeStr||timeStr==="-"||timeStr==="23:59/00:00")return"siang";
  const[h,m]=timeStr.split(":").map(Number);
  if(h===0&&m===0)return"siang";
  if(h<8)return"malam";
  if(h<16)return"pagi";
  return"siang";
}

function getAvailableOps(sessions,eventTimeStr){
  let eventShift,tEvent;
  if(eventTimeStr==="23:59/00:00"){eventShift="siang";tEvent=23*60+59;}
  else{
    const[h,m]=(eventTimeStr||"0:0").split(":").map(Number);
    if(h===0&&m===0){eventShift="malam";tEvent=0;}
    else{eventShift=getShift(eventTimeStr);tEvent=h*60+m;}
  }
  const available=new Set();
  sessions.forEach(s=>{
    (s.hosts||[]).forEach(h=>{
      if(!h.picData||h.picData==="-")return;
      const endStr=(h.endTime&&h.endTime!=="-")?h.endTime:h.startTime;
      if(getShift(endStr)!==eventShift)return;
      const[sh,sm]=(h.startTime||"99:99").split(":").map(Number);
      const tStart=sh*60+sm;
      const[eh,em]=endStr.split(":").map(Number);
      let tEnd=eh*60+em;
      if(tEnd===0)tEnd=24*60;
      if(tEnd<=tStart)tEnd+=24*60;
      let tAdj=tEvent;
      if(eventShift==="malam"&&tEvent<tStart)tAdj=tEvent+24*60;
      if(tStart<=tAdj&&tAdj<=tEnd)available.add(h.picData.trim().toLowerCase());
    });
  });
  return available;
}

function assignPics(starts,ends,validPics=null){
  const picCount={},picRawNames={},picStudios={};
  const isCoord=n=>!n||n==="-"||n===""||LSC_NAMES_SET.has(n.trim().toLowerCase());
  const sNum=s=>{const m=String(s.studio||"").match(/\d+/);return m?parseInt(m[0]):99;};
  const isInShift=k=>!validPics||validPics.has(k);
  const reg=rawName=>{
    if(!rawName||isCoord(rawName))return;
    const key=rawName.trim().toLowerCase();
    if(picCount[key]===undefined)picCount[key]=0;
    if(!picRawNames[key])picRawNames[key]=rawName;
  };
  const assignKey=(key,s)=>{
    picCount[key]++;
    if(!picStudios[key])picStudios[key]=[];
    picStudios[key].push(sNum(s));
    s.assignedPic=formatPic(picRawNames[key]||key);
  };
  const opDistTo=(key,n)=>{
    const a=picStudios[key]||[];
    return a.length===0?0:Math.min(...a.map(s=>physicalDist(s,n)));
  };
  const findMandatory=n=>{
    const g=MANDATORY_STUDIOS[n];if(!g)return null;
    for(const name of g){const k=name.toLowerCase();if(!isInShift(k))continue;if((picCount[k]||0)<MAX_STUDIO_PER_PIC)return k;}
    return null;
  };
  const findDedInGroup=(g,n)=>{
    for(const name of g){
      const k=name.toLowerCase();
      if(!isInShift(k))continue;
      if((picCount[k]||0)>=MAX_STUDIO_PER_PIC)continue;
      if(opDistTo(k,n)>MAX_OPERATOR_DIST)continue;
      return k;
    }return null;
  };
  const findIdle=(excl=null)=>{
    for(const[k,c]of Object.entries(picCount)){
      if(k===excl)continue;if(!isInShift(k))continue;
      if(DEDICATED_OPS.includes(k))continue;if(c===0)return k;
    }return null;
  };
  const findBetter=(n,excl)=>{
    const idle=findIdle(excl);if(idle)return idle;
    const ed=opDistTo(excl,n);let bestK=null,bestD=Infinity;
    for(const[k,c]of Object.entries(picCount)){
      if(k===excl)continue;if(!isInShift(k))continue;
      if(DEDICATED_OPS.includes(k))continue;if(c>=MAX_STUDIO_PER_PIC)continue;
      const a=picStudios[k]||[];if(!a.length)continue;
      const d=Math.min(...a.map(s=>physicalDist(s,n)));
      if(d<ed&&d<bestD){bestD=d;bestK=k;}
    }return bestK;
  };
  const doAssign=(s,rawPic)=>{
    const n=sNum(s),dg=getDedicatedGroup(n);
    if(MANDATORY_STUDIOS[n]){const mk=findMandatory(n);if(mk)assignKey(mk,s);else s.assignedPic="LSC";return;}
    if(dg){
      const ded=findDedInGroup(dg,n);if(ded){assignKey(ded,s);return;}
      const idle=findIdle();if(idle){assignKey(idle,s);return;}
      s.assignedPic="LSC";return;
    }
    if(!isCoord(rawPic)){
      const key=rawPic.trim().toLowerCase();
      if(picCount[key]===undefined)picCount[key]=0;
      if(isInShift(key)){
        if(picCount[key]===0){assignKey(key,s);return;}
        if(picCount[key]===1){
          const better=findBetter(n,key);
          if(better){assignKey(better,s);return;}
          assignKey(key,s);return;
        }
      }
    }
    const idle=findIdle();
    if(idle){assignKey(idle,s);return;}
    for(const[k,c]of Object.entries(picCount)){
      if(!isInShift(k)||DEDICATED_OPS.includes(k))continue;
      if(c<MAX_STUDIO_PER_PIC){assignKey(k,s);return;}
    }
    s.assignedPic="LSC";
  };
  [...starts,...ends].forEach(s=>reg(s.picForEvent||"-"));
  DEDICATED_OPS.forEach(name=>{if(!validPics||validPics.has(name.toLowerCase()))reg(name);});
  const sortFn=list=>[...list].sort((a,b)=>{
    const aN=sNum(a),bN=sNum(b);
    const aM=!!MANDATORY_STUDIOS[aN],bM=!!MANDATORY_STUDIOS[bN];
    if(aM!==bM)return aM?-1:1;
    const aZ=DEDICATED_ZONE_B.has(aN)?0:DEDICATED_ZONE_A.has(aN)?1:2;
    const bZ=DEDICATED_ZONE_B.has(bN)?0:DEDICATED_ZONE_A.has(bN)?1:2;
    if(aZ!==bZ)return aZ-bZ;
    return aN-bN;
  });
  sortFn(ends).forEach(s=>doAssign(s,s.picForEvent||"-"));
  sortFn(starts).forEach(s=>doAssign(s,s.picForEvent||"-"));
}

// ─────────────────────────────────────────────
// RENDER MARATHON
// ─────────────────────────────────────────────
function renderMarathon(){
  const container=document.getElementById("schedule-list");
  container.innerHTML="";
  const list=sessions.filter(s=>s.isMarathon);
  if(!list.length){
    container.innerHTML=`<div class="empty"><span class="empty-icon">📭</span>Tidak ada sesi marathon hari ini</div>`;
    return;
  }
  const now=Date.now();
  list.forEach(s=>{
    const curIdx=getCurrentHostIdx(s);
    let endMs=timeToMs(s.date,s.endTime);
    const startMs=timeToMs(s.date,s.startTime);
    if(endMs&&startMs&&endMs<=startMs)endMs+=24*60*60*1000;
    const isEnded=endMs?now>endMs:false;
    const card=document.createElement("div");
    card.className=`marathon-session-card${isEnded?" ms-ended":""}`;
    card.innerHTML=`
      <div class="ms-card-header">
        <div class="ms-brand">🏃 ${s.brand}
          ${isEnded?`<span class="badge" style="background:var(--bs-secondary-subtle);color:var(--bs-secondary);font-size:0.55rem;vertical-align:middle;margin-left:6px">✓ ENDED</span>`:""}
        </div>
        <div class="ms-meta">
          <span class="badge marketplace">${s.marketplace}</span>
          <span class="badge studio">${s.studio}</span>
          <span class="badge idline">📋 ${s.idLine||s.skpId||"-"}</span>
        </div>
        <div class="ms-time">▶ ${s.startTime} &nbsp;·&nbsp; ⏹ ${s.endTime} &nbsp;·&nbsp; ${s.hosts.length} host</div>
      </div>
      <div class="ms-card-body" id="msh-${s.idLine||s.skpId}"></div>`;
    container.appendChild(card);
    const hc=card.querySelector(`#msh-${s.idLine||s.skpId}`);
    s.hosts.forEach((h,hi)=>{
      const isCurrent=!isEnded&&hi===curIdx;
      const isNext=!isEnded&&hi===curIdx+1;
      const isPast=isEnded||(curIdx>=0&&hi<curIdx);
      const row=document.createElement("div");
      row.className=`host-row${isCurrent?" host-current":""}${isNext?" host-next":""}${isPast?" host-past":""}`;
      row.innerHTML=`
        <div class="hr-num">${hi+1}</div>
        <div class="hr-time"><span class="hr-start">▶ ${h.startTime}</span><span class="hr-arrow">→</span><span class="hr-end">⏹ ${h.endTime}</span></div>
        <div class="hr-info">
          <div class="hr-name">${h.host}${isCurrent?`<span class="live-badge">● LIVE</span>`:""}${isNext?`<span class="next-badge">NEXT</span>`:""}${isEnded&&hi===s.hosts.length-1?`<span class="badge" style="background:var(--bs-secondary-subtle);color:var(--bs-secondary);font-size:0.55rem;margin-left:4px">✓ selesai</span>`:""}</div>
          <div class="hr-pic">🧑‍💼 PIC: ${h.picData||"-"}</div>
        </div>`;
      hc.appendChild(row);
    });
  });
}

// ─── Helper: parse "HH:mm" → total menit ───────────────────────────────────
function toMin(t) {
  if (!t) return 0;
  const str = (typeof t === 'string') ? t : String(t);
  const parts = str.split(':');
  if (parts.length < 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// ─── Helper: normalize brand string (hapus special chars) ──────────────────
// FIX: supaya "He!!o by Paseo" bisa match "Hello by Paseo"
function normalizeBrand(str) {
  if (!str) return '';
  return str.replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase().trim();
}

// ─────────────────────────────────────────────
// RENDER TIMELINE
// ─────────────────────────────────────────────
function renderTimeline(){
  const container=document.getElementById("schedule-list");
  container.innerHTML="";
    // ── Copy Button ──────────────────────────────────────
  const copyBar = document.createElement('div');
  copyBar.style.cssText = 'padding:8px 10px 2px;';
  copyBar.innerHTML = `<button id="btn-copy-timeline" onclick="copyTimeline()"
    style="width:100%;padding:9px;background:#f0f4ff;border:1px solid #9ec5fe;
           border-radius:6px;cursor:pointer;font-weight:600;
           color:var(--bs-primary-text);font-size:13px;">
    📋 Copy Timeline
  </button>`;
  container.appendChild(copyBar);
  // ────────────────────────────────────────────────────

  if(!sessions.length){container.innerHTML=`<div class="empty"><span class="empty-icon">📭</span>Tidak ada jadwal</div>`;return;}
  const events={};
  sessions.forEach(s=>{
    const firstPic=s.hosts?.[0]?.picData||"-";
    const lastPic=s.hosts?.[s.hosts.length-1]?.picData||"-";
    if(s.startTime&&s.startTime!=="-"){
      if(!events[s.startTime])events[s.startTime]={starts:[],ends:[]};
      events[s.startTime].starts.push({...s,picForEvent:firstPic});
    }
    if(s.endTime&&s.endTime!=="-"){
      const endKey=(s.endTime==="00:00"||s.endTime==="23:59")?"23:59/00:00":s.endTime;
      if(!events[endKey])events[endKey]={starts:[],ends:[]};
      events[endKey].ends.push({...s,picForEvent:lastPic});
    }
  });
  Object.entries(events).forEach(([time,ev])=>{assignPics(ev.starts,ev.ends,getAvailableOps(sessions,time));});
  const now=Date.now();
  const sorted=Object.keys(events).sort((a,b)=>{
    const f=t=>t==="23:59/00:00"?1441:(([h,m])=>h*60+m)(t.split(":").map(Number));
    return f(a)-f(b);
  });
  let firstUpcoming=null;
function makeBlock(ev,time,type){
  const items=type==="start"?ev.starts:ev.ends;
  if(!items.length)return null;
  const display=time==="23:59/00:00"?"23:59 / 00:00":time;
  const checkTime=time==="23:59/00:00"?"23:59":time;
  const eventMs=timeToMs(sessions[0]?.date,checkTime);
  const isPast=eventMs&&eventMs<now;
  const block=document.createElement("div");
  block.className=`time-block${isPast?" collapsed":""}`;

  const header=document.createElement("div");
  header.className=`time-header ${type==="start"?"start":"end"}-header`;
  header.style.cssText="display:flex;align-items:center;gap:6px;justify-content:space-between;";

  // ── Copy button (stop propagation supaya tidak trigger toggle) ──
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "📋";
  copyBtn.title = `Copy ${type} ${display}`;
  copyBtn.style.cssText = `
    padding:2px 8px;border-radius:4px;font-size:0.65rem;font-weight:700;cursor:pointer;
    border:1px solid rgba(0,0,0,0.15);background:rgba(255,255,255,0.6);
    color:inherit;flex-shrink:0;line-height:1.4;
  `;
  copyBtn.onclick = (e) => {
    e.stopPropagation();
    copyTimeBlock(time, type, items, copyBtn);
  };

  if(isPast){
    header.style.opacity="0.55";
    header.innerHTML=`
      <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
        <span class="dot ${type==="start"?"start":"end"}-dot"></span>
        <span>${type==="start"?"Start":"End"} ${display}</span>
        <span class="count-badge">▸ ${items.length}</span>
      </div>`;
    header.appendChild(copyBtn);
    header.onclick=(e)=>{
      if(e.target===copyBtn)return;
      const wasCollapsed=block.classList.contains("collapsed");
      block.classList.toggle("collapsed");
      const cnt=block.querySelector(".sessions-container");
      cnt.style.maxHeight=wasCollapsed?cnt.scrollHeight+"px":"0px";
    };
  }else{
    header.innerHTML=`
      <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">
        <span class="dot ${type==="start"?"start":"end"}-dot"></span>
        <span>${type==="start"?"▶ Start":"⏹ End"} ${display}</span>
        <span class="toggle-icon">▾</span>
      </div>`;
    header.appendChild(copyBtn);
  }

  const content=document.createElement("div");
  content.className="sessions-container";
  content.style.maxHeight=isPast?"0px":"none";
  items.forEach((s,i)=>content.appendChild(makeTimelineCard(s,i+1,type,time)));
  block.appendChild(header);
  block.appendChild(content);
  if(!isPast&&!firstUpcoming)firstUpcoming=block;
  return block;
}

  sorted.forEach(time=>{
    const ev=events[time];
    const sb=makeBlock(ev,time,"start");
    const eb=makeBlock(ev,time,"end");
    if(sb)container.appendChild(sb);
    if(eb)container.appendChild(eb);
  });
  if(firstUpcoming)setTimeout(()=>firstUpcoming.scrollIntoView({behavior:"smooth",block:"start"}),150);
}

function makeTimelineCard(s,num,mode,eventTime=null){
  const now=Date.now();
  const checkTime=eventTime||s.startTime;
  const eventMs=checkTime==="23:59/00:00"?null:timeToMs(s.date,checkTime);
  const isPast=eventMs&&eventMs<now;
  const isSoon=eventMs&&(eventMs-now)<15*60*1000&&!isPast;
  const picLabel=s.assignedPic||"LSC";
  const isLSC=picLabel==="LSC";
  const firstHost=s.hosts?.[0]?.host||"-";
  const card=document.createElement("div");
  card.className=`session-card${isPast?" past":""}${isSoon?" soon":""}${s.isMarathon?" marathon-card":""}`;
  card.innerHTML=`
    <div class="session-num">${num}</div>
    <div class="session-info">
      <div class="session-brand">${s.brand}${s.isMarathon?`<span class="type-badge marathon-badge">🏃 Marathon</span>`:`<span class="type-badge single-badge">⚡ Single</span>`}</div>
      <div class="session-meta"><span class="badge marketplace">${s.marketplace}</span><span class="badge studio">${s.studio}</span></div>
      <div class="session-host">👤 ${firstHost}</div>
      ${mode==="single"?`<div class="session-time-small">▶ ${s.startTime||"-"} &nbsp; ⏹ ${s.endTime||"-"}</div>`:""}
    </div>
    <div class="session-pic-right${isLSC?" lsc":""}">${picLabel}</div>`;
  return card;
}

function renderSingle(){
  const container=document.getElementById("schedule-list");
  container.innerHTML="";
  const list=sessions.filter(s=>!s.isMarathon);
  if(!list.length){container.innerHTML=`<div class="empty"><span class="empty-icon">📭</span>Tidak ada sesi single</div>`;return;}
  const copies=list.map(s=>Object.assign({},s));
  assignPics(copies,[]);
  copies.forEach((s,i)=>container.appendChild(makeTimelineCard(s,i+1,"single")));
}

// ─────────────────────────────────────────────
// STANDBY
// ─────────────────────────────────────────────
const STANDBY_BRANDS=[
  {key:"AT Tiktok",slotFormat:false,showBackup:true,match:s=>s.brand.toLowerCase().includes("american tourister")&&s.marketplace.toLowerCase()==="tiktok"},
  {key:"Samsonite Tiktok",slotFormat:false,showBackup:true,match:s=>s.brand.toLowerCase().includes("samsonite")&&s.marketplace.toLowerCase()==="tiktok"},
  {key:"AT Shopee",slotFormat:false,showBackup:false,match:s=>s.brand.toLowerCase().includes("american tourister")&&s.marketplace.toLowerCase()==="shopee"},
  {key:"Samsonite Shopee",slotFormat:true,showBackup:false,match:s=>s.brand.toLowerCase().includes("samsonite")&&s.marketplace.toLowerCase()==="shopee"},
  {key:"ASICS",slotFormat:false,showBackup:false,match:s=>s.brand.toLowerCase().includes("asics")},
];
const BACKUP_DEPRIORITY={pagi:new Set(["nadiem"]),siang:new Set(["maulidan"])};

function buildPicShiftData(){
  const shifts={pagi:{},siang:{}};
  sessions.forEach(s=>{
    const n=parseInt((s.studio||"").match(/\d+/)?.[0]||"0");if(!n)return;
    s.hosts.forEach(h=>{
      if(!h.picData||h.picData==="-")return;
      const endStr=(h.endTime&&h.endTime!=="-")?h.endTime:h.startTime;
      const shift=getShift(endStr);if(shift==="malam")return;
      const key=h.picData.trim().toLowerCase(),name=formatPic(h.picData);
      if(!shifts[shift][key])shifts[shift][key]={name,studios:new Set()};
      shifts[shift][key].studios.add(n);
    });
  });
  return shifts;
}

function buildStandbyData(){
  const nonDedByShift={pagi:{},siang:{}};
  sessions.forEach(s=>{
    s.hosts.forEach(h=>{
      if(!h.picData||h.picData==="-")return;
      const key=h.picData.trim().toLowerCase();
      if(DEDICATED_OPS.includes(key)||LSC_NAMES_SET.has(key))return;
      const endStr=(h.endTime&&h.endTime!=="-")?h.endTime:h.startTime;
      const shift=getShift(endStr);if(shift==="malam")return;
      const cur=nonDedByShift[shift][key];
      if(!cur){nonDedByShift[shift][key]={name:h.picData.trim(),minStart:h.startTime,maxEnd:endStr};}
      else{
        if(toMinJS(h.startTime)<toMinJS(cur.minStart))cur.minStart=h.startTime;
        if(toMinJS(endStr)>toMinJS(cur.maxEnd))cur.maxEnd=endStr;
      }
    });
  });
  function findBackup(shift,usedSet){
    const entries=Object.values(nonDedByShift[shift]);
    for(const e of entries){if(usedSet.has(e.name.toLowerCase()))continue;if(BACKUP_DEPRIORITY[shift]?.has(e.name.toLowerCase()))continue;return e;}
    for(const e of entries){if(usedSet.has(e.name.toLowerCase()))continue;return e;}
    return null;
  }
  return STANDBY_BRANDS.map(b=>{
    const matched=sessions.filter(b.match);
    const slots=[],seenKey=new Set();
    const usedNonDed={pagi:new Set(),siang:new Set()};
    matched.forEach(s=>{
      if(b.slotFormat){
        s.hosts.forEach(h=>{
          const endStr=(h.endTime&&h.endTime!=="-")?h.endTime:h.startTime;
          const shift=getShift(endStr);if(shift==="malam")return;
          const st=(h.startTime||"").substring(0,5),en=(h.endTime||"").substring(0,5);
          let picForSlot=null;
          const picKey=(h.picData||"").trim().toLowerCase();
          if(!h.picData||h.picData==="-"||DEDICATED_OPS.includes(picKey)||LSC_NAMES_SET.has(picKey)){
            const backup=findBackup(shift,usedNonDed[shift]);if(!backup)return;
            picForSlot=backup.name;usedNonDed[shift].add(backup.name.toLowerCase());
          }else{picForSlot=h.picData.trim();}
          const slotKey=`${st}-${en}-${picForSlot.toLowerCase()}`;
          if(seenKey.has(slotKey))return;seenKey.add(slotKey);
          slots.push({type:"slot",label:`${st.replace(":00","")}–${en.replace(":00","")}`,pic:picForSlot,nonDedPic:null,nonDedTime:null,sortKey:toMinJS(h.startTime)});
        });
      }else{
        s.hosts.forEach(h=>{
          if(!h.picData||h.picData==="-")return;
          const endStr=(h.endTime&&h.endTime!=="-")?h.endTime:h.startTime;
          const shift=getShift(endStr);if(shift==="malam")return;
          const shiftKey=`${shift}-${h.picData.trim().toLowerCase()}`;
          if(seenKey.has(shiftKey))return;seenKey.add(shiftKey);
          let nonDedPic=null,nonDedTime=null;
          if(b.showBackup){
            const backup=findBackup(shift,usedNonDed[shift]);
            if(backup){nonDedPic=backup.name;const st=backup.minStart.replace(":00","");const en=backup.maxEnd.replace(":00","");nonDedTime=`${st}–${en}`;usedNonDed[shift].add(backup.name.toLowerCase());}
          }
          slots.push({type:"shift",label:shift.toUpperCase(),pic:h.picData.trim(),nonDedPic,nonDedTime,sortKey:shift==="pagi"?0:1});
        });
      }
    });
    slots.sort((a,b)=>a.sortKey-b.sortKey);
    return{key:b.key,slotFormat:b.slotFormat,slots};
  }).filter(b=>b.slots.length>0);
}

function renderStandby(){
  const container=document.getElementById("schedule-list");
  container.innerHTML="";
  if(!sessions.length){container.innerHTML=`<div class="empty"><span class="empty-icon">📭</span>Data belum dimuat</div>`;return;}
  const dateStr=sessions[0]?.date||"";
  let dateLabel="";
  try{dateLabel=new Date(dateStr+"T12:00:00+07:00").toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Jakarta"}).toUpperCase();}catch(e){}
  const picShift=buildPicShiftData();
  const standbyList=buildStandbyData();
  let html=`<div class="standby-wrapper">`;
  html+=`<div class="date-banner"><div class="date-title">📅 REMINDER HARIAN</div><div class="date-value">${dateLabel}</div></div>`;
  ["pagi","siang"].forEach(shift=>{
    const data=picShift[shift];
    if(!data||!Object.keys(data).length)return;
    const isShiftPagi=shift==="pagi";
    html+=`<div class="card"><div class="card-header ${isShiftPagi?"header-primary":"header-warning"}">👥 PIC Shift ${shift.charAt(0).toUpperCase()+shift.slice(1)}</div><div class="list-group">`;
    Object.entries(data).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([,d])=>{
      html+=`<div class="list-group-item"><span class="item-name">${d.name}</span><span class="item-right">Studio ${[...d.studios].sort((a,b)=>a-b).join(", ")}</span></div>`;
    });
    html+=`</div></div>`;
  });
  standbyList.forEach(b=>{
    html+=`<div class="card"><div class="card-header header-warning">📍 Standby ${b.key}</div>`;
    b.slots.forEach(slot=>{
      const picDisp=formatPic(slot.pic);
      let backupStr="";
      if(slot.nonDedPic){backupStr=` <span style="color:var(--bs-muted);font-weight:400">/ ${formatPic(slot.nonDedPic)}</span>`;if(slot.nonDedTime)backupStr+=` <span style="color:#adb5bd;font-size:0.62rem">(${slot.nonDedTime})</span>`;}
      html+=`<div class="standby-row-item"><span class="standby-time">${slot.label}</span><span class="standby-pic">${picDisp}${backupStr}</span></div>`;
    });
    html+=`</div>`;
  });
  html+=`<div class="card"><div class="card-header">📋 Prosedur</div><div class="card-body"><div class="standby-text">1. BACK UP HOST SELAIN ASICS, AT, dan SAMSO WAJIB HAND TALENT\n2. CEK KEHADIRAN HOST BAIK SINGLE HOST/MARATHON DAN LAPOR KE GRUP HOST TAG TALCO KALO 30 SEBELUM LIVE HOST SELANJUTNYA BELUM DATANG\n3. PASTIKAN SEMUA STUDIO ADA AKUN ABSEN HOST</div></div></div>`;
  html+=`<div class="card"><div class="card-header header-primary">🔗 Links</div>
    <a class="standby-link" href="https://forms.gle/J8WG4kmQap7h6VcZ7" target="_blank">📝 Form Bukti Tayang</a>
    <a class="standby-link" href="https://docs.google.com/spreadsheets/d/1vbjwOFg_vmyJNs9UXuLMJF-TekN6xfomAzXy-zoDP7o/edit?gid=0" target="_blank">📊 Data Report & List Host</a>
    <a class="standby-link" href="https://docs.google.com/spreadsheets/d/1XhC8QOC9loOCODjMRkdNa4yfl8BeDVZct8wsFbeeIz0/edit?gid=743892642" target="_blank">📷 Backup Screenshot LS</a>
    <a class="standby-link" href="https://docs.google.com/spreadsheets/d/1dTDvRuYPYZ5_5Z4t6sUAP3myjE_mo23RlVkhU-rPk0E/edit?gid=1067791791" target="_blank">📈 Insight AT & Samsonite</a>
  </div>`;
  html+=`<button class="btn-copy-standby" onclick="copyStandbyText()">📋 Copy Teks Reminder</button></div>`;
  container.innerHTML=html;
}

// ─────────────────────────────────────────────
// KLASEMEN
// ─────────────────────────────────────────────
function _bsLoadingHTML(msg){
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 20px;gap:12px"><div class="spinner-border"></div><span style="color:var(--bs-muted);font-size:0.82rem;font-weight:500">${msg}</span></div>`;
}

let _lastKlasemenData = null;

async function loadKlasemen() {
  if (activeTab !== "klasemen") return;
  const container = document.getElementById("schedule-list");
  if (_lastKlasemenData) { renderKlasemen(_lastKlasemenData); }
  else { container.innerHTML = _bsLoadingHTML("Memuat klasemen..."); }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(API_URL + "?action=leaderboard&t=" + Date.now(), { signal: controller.signal });
    clearTimeout(timeout);
    const data = JSON.parse(await res.text());
    if (!data.success) throw new Error(data.error || "Unknown error");
    if (!data.leaderboard) {
      if (!_lastKlasemenData && activeTab === "klasemen")
        container.innerHTML = `<div class="empty"><span class="empty-icon">⚠️</span>Deploy Apps Script versi baru dulu</div>`;
      return;
    }
    if (activeTab !== "klasemen") return;
    _lastKlasemenData = data;
    renderKlasemen(_lastKlasemenData);
  } catch(err) {
    if (activeTab !== "klasemen") return;
    if (!_lastKlasemenData)
      container.innerHTML = `<div class="empty"><span class="empty-icon">❌</span>${err.name === "AbortError" ? "Timeout, coba refresh" : err.message}</div>`;
    else
      showBanner(err.name === "AbortError" ? "⚠️ Timeout — menampilkan data terakhir" : "⚠️ Gagal update: " + err.message, "warning");
  }
}

async function forceRefreshKlasemen() {
  if (activeTab !== "klasemen") return;
  const container = document.getElementById("schedule-list");
  _lastKlasemenData = null;
  container.innerHTML = _bsLoadingHTML("Force refresh...");
  try {
    const res = await fetch(API_URL + "?action=leaderboard&nocache=1&t=" + Date.now());
    const data = JSON.parse(await res.text());
    if (!data.success) throw new Error(data.error);
    if (activeTab !== "klasemen") return;
    _lastKlasemenData = data;
    renderKlasemen(_lastKlasemenData);
    showBanner("✅ Klasemen diperbarui!", "success");
  } catch(err) {
    if (activeTab !== "klasemen") return;
    container.innerHTML = `<div class="empty"><span class="empty-icon">❌</span>${err.message}</div>`;
  }
}

function renderKlasemen(data) {
  const container = document.getElementById("schedule-list");
  if (!data.leaderboard) {
    container.innerHTML = `<div class="empty"><span class="empty-icon">⚠️</span>Deploy Apps Script versi baru dulu</div>`;
    return;
  }

  const totalPendHariH = data.leaderboard.reduce((s, r) => s + r.pendingHariH, 0);
  const totalPendH1    = data.leaderboard.reduce((s, r) => s + r.pendingH1, 0);
  const totalRows      = data.leaderboard.reduce((s, r) => s + r.total, 0);
  const totalHold      = data.leaderboard.reduce((s, r) => s + r.hold, 0);
  // ─── NEW: total belumLengkap ───
  const totalBelumLengkap = data.leaderboard.reduce((s, r) => s + (r.pendingBelumLengkap || 0), 0);

  const summaryCard = (bg, border, numColor, num, label) =>
    `<div style="flex:1;background:${bg};border:1px solid ${border};border-radius:var(--bs-radius-lg);padding:10px 6px;text-align:center;position:relative;overflow:hidden">
       <div style="font-size:1.15rem;font-weight:800;color:${numColor}">${num}</div>
       <div style="font-size:0.58rem;color:var(--bs-muted);margin-top:1px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">${label}</div>
     </div>`;

  let html = `<div style="padding:8px 10px 24px">`;

  html += `<div style="text-align:center;margin-bottom:12px">
    <div style="font-size:0.85rem;font-weight:700;color:var(--bs-dark)">🏆 Klasemen Pending Data Input</div>
    <div style="font-size:0.68rem;color:var(--bs-muted);margin-top:3px">${data.dateFrom || ""} → ${data.dateTo || ""}</div>
  </div>`;

  // ─── Summary Cards ───
  html += `<div style="display:flex;gap:7px;margin-bottom:14px">
    ${summaryCard("var(--bs-danger-subtle)",   "#f1aeb5",          "var(--bs-danger)",   totalPendHariH,    "⏳ Hari H")}
    ${summaryCard("var(--bs-warning-subtle)",  "#ffe69c",          "#856404",            totalPendH1,       "📋 H+1")}
    ${summaryCard("var(--bs-primary-subtle)",  "#9ec5fe",          "var(--bs-primary)",  totalRows,         "📂 Total")}
  </div>`;

  // ─── Leaderboard Table ───
  html += `<div style="background:var(--bs-white);border-radius:var(--bs-radius-xl);overflow:hidden;margin-bottom:14px;border:1px solid var(--bs-border);box-shadow:var(--bs-shadow-sm)">
    <div style="padding:7px 12px;background:var(--bs-light);border-bottom:1px solid var(--bs-border);font-size:0.6rem;font-weight:700;color:var(--bs-muted);display:flex;gap:4px;text-transform:uppercase;letter-spacing:0.5px">
      <span style="width:26px">#</span>
      <span style="flex:1">PIC</span>
      <span style="width:44px;text-align:center">H+1</span>
      <span style="width:44px;text-align:center">Hari H</span>
      <span style="width:38px;text-align:center">Total</span>
      <span style="width:34px;text-align:center">Hold</span>
    </div>`;

  data.leaderboard.forEach((r, idx) => {
    const pts              = r.pendingPoints;
    const belumLengkapCount = r.pendingBelumLengkap || 0;
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;

    const sColor = pts === 0
      ? "var(--bs-success)"
      : pts <= 5  ? "var(--bs-primary)"
      : pts <= 15 ? "#856404"
      : "var(--bs-danger)";

    // ─── NEW: status text bedain belumLengkap ───
    let sTxt;
    if (pts === 0) {
      sTxt = "✅ Data Lengkap";
    } else {
      const parts = [];
      if (r.pendingHariH > 0) {
        const blStr = belumLengkapCount > 0 ? ` ()` : "";
        parts.push(`${r.pendingHariH} Hari H${blStr}`);
      }
      if (r.pendingH1 > 0) parts.push(`${r.pendingH1} H+1`);
      sTxt = parts.join(" · ");
    }

    const rowBg = idx % 2 === 1 ? "var(--bs-light)" : "var(--bs-white)";

    html += `<div style="padding:7px 12px;border-top:1px solid var(--bs-border-subtle);display:flex;align-items:center;gap:4px;background:${rowBg}">
      <span style="width:26px;font-size:0.8rem">${medal}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.82rem;font-weight:700;color:var(--bs-dark)">${formatPic(r.pic)}</div>
        <div style="font-size:0.6rem;color:${sColor};font-weight:600;margin-top:1px">${sTxt}</div>
      </div>
      <span style="width:44px;text-align:center;font-size:0.85rem;font-weight:700;color:#856404">${r.pendingH1}</span>
      <span style="width:44px;text-align:center;font-size:0.85rem;font-weight:700;color:var(--bs-danger)">${r.pendingHariH}</span>
      <span style="width:38px;text-align:center;font-size:0.75rem;color:var(--bs-muted)">${r.total}</span>
      <span style="width:34px;text-align:center;font-size:0.75rem;color:var(--bs-secondary)">${r.hold}</span>
    </div>`;
  });

  html += `</div>`;

  // ─── Copy ID Line Buttons ───
  html += `<div style="font-size:0.68rem;font-weight:700;color:var(--bs-primary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">📋 Copy ID Line Pending per PIC</div>`;
  html += `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">`;

  data.leaderboard.forEach(r => {
    const hasPending = r.pendingRows?.length > 0;
    const idLines    = (r.pendingRows || []).map(p => p.idLine).filter(Boolean);
    const pts        = r.pendingPoints;
    if (hasPending) {
      html += `<button onclick="copyIdLines('${r.pic}',${JSON.stringify(idLines).replace(/"/g, '&quot;')})"
        style="padding:5px 11px;border:1px solid #9ec5fe;border-radius:var(--bs-radius-pill);background:var(--bs-primary-subtle);color:var(--bs-primary-text);font-size:0.7rem;font-weight:600;cursor:pointer">
        ${formatPic(r.pic)} <span style="color:#856404;font-weight:700">(${pts})</span>
      </button>`;
    } else {
      html += `<button disabled style="padding:5px 11px;border:1px solid var(--bs-border);border-radius:var(--bs-radius-pill);background:var(--bs-light);color:#adb5bd;font-size:0.7rem;font-weight:600;cursor:not-allowed">
        ${formatPic(r.pic)} ✅
      </button>`;
    }
  });

  html += `</div>`;

  // ─── Detail Pending per PIC ───
  const withPending = data.leaderboard.filter(r => r.pendingRows?.length > 0);
  if (withPending.length) {
    withPending.forEach(r => {
      html += `<div style="margin-bottom:12px">
        <div style="font-size:0.7rem;font-weight:700;color:var(--bs-primary);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px">
          ${formatPic(r.pic)} — ${r.pendingRows.length} sesi pending
        </div>`;

      r.pendingRows.forEach(p => {
        const tags = [];

        // ─── NEW: bedain belumLengkap (oranye) vs missing biasa (merah) ───
        if (p.hariH) {
          if (p.belumLengkap) {
            tags.push(`<span style="background:#fff3cd;color:#92400e;border:1px solid #fde68a;font-size:0.58rem;padding:2px 7px;border-radius:var(--bs-radius-pill);font-weight:600">Hari H</span>`);
          } else {
            tags.push(`<span style="background:var(--bs-danger-subtle);color:var(--bs-danger-text);font-size:0.58rem;padding:2px 7px;border-radius:var(--bs-radius-pill);font-weight:600">Hari H</span>`);
          }
        }
        if (p.h1) {
          tags.push(`<span style="background:var(--bs-warning-subtle);color:var(--bs-warning-text);font-size:0.58rem;padding:2px 7px;border-radius:var(--bs-radius-pill);font-weight:600">H+1</span>`);
        }

        // ─── NEW: border & background bedain belumLengkap ───
        const cardBorder = p.belumLengkap ? "#fde68a" : "var(--bs-border)";
        const cardBg     = p.belumLengkap ? "#fffbeb" : "var(--bs-white)";

        html += `<div style="background:${cardBg};border-radius:var(--bs-radius);padding:7px 10px;margin-bottom:3px;display:flex;align-items:center;gap:8px;border:1px solid ${cardBorder};box-shadow:var(--bs-shadow-sm)">
          <div style="flex:1;min-width:0">
            <div style="font-size:0.78rem;font-weight:600;color:var(--bs-dark)">${p.brand}</div>
            <div style="font-size:0.63rem;color:var(--bs-muted);margin-top:1px">${p.date} · ${p.startTime} · ${p.studio}</div>
          </div>
          <div style="display:flex;gap:3px">${tags.join("")}</div>
          <div style="font-size:0.6rem;color:#adb5bd;font-family:monospace;flex-shrink:0">${p.idLine}</div>
        </div>`;
      });

      html += `</div>`;
    });
  }

  html += `<button onclick="forceRefreshKlasemen()" class="btn btn-outline-primary btn-block" style="margin-top:6px;padding:10px">🔄 Refresh (Clear Cache)</button>`;
  html += `</div>`;
  container.innerHTML = html;
}


function updateTabLabels() {
  const toWIB = d => new Date(d.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const fmt   = d => d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
  const today = toWIB(new Date());
  const h7 = new Date(today); h7.setDate(h7.getDate() - 7);
  const h1 = new Date(today); h1.setDate(h1.getDate() - 1);
  const btnKlasemen = document.getElementById("tab-klasemen");
  const btnHariH    = document.getElementById("tab-hariH");
  if (btnKlasemen) btnKlasemen.innerHTML = `Data <span style="opacity:0.75;font-size:0.85em">${fmt(h7)} – ${fmt(h1)}</span>`;
  if (btnHariH)    btnHariH.innerHTML    = `Data <span style="opacity:0.75;font-size:0.85em">${fmt(today)}</span>`;
}

// ─────────────────────────────────────────────
// HARI H
// ─────────────────────────────────────────────
let _lastHariHData = null;
let _lastFormData  = [];

// FIX: Promise.allSettled supaya kalau formcheck gagal, today data tetap muncul
async function loadHariH() {
  if (activeTab !== "hariH") return;
  const container = document.getElementById("schedule-list");
  if (_lastHariHData) { renderHariH(_lastHariHData, _lastFormData); }
  else { container.innerHTML = _bsLoadingHTML("Memuat data hari ini..."); }
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 20000);
    const [todayResult, formResult] = await Promise.allSettled([
      fetch(API_URL + "?action=today&t="     + Date.now(), { signal: controller.signal }),
      fetch(API_URL + "?action=formcheck&t=" + Date.now(), { signal: controller.signal }),
    ]);
    clearTimeout(timeout);
    if (todayResult.status === "rejected") throw todayResult.reason;
    const data     = JSON.parse(await todayResult.value.text());
    const formData = formResult.status === "fulfilled"
      ? JSON.parse(await formResult.value.text())
      : { success: false };
    if (!data.success) throw new Error(data.error || "Unknown error");
    if (activeTab !== "hariH") return;
    _lastHariHData = data;
    _lastFormData  = formData.success ? formData.responses : [];
    renderHariH(_lastHariHData, _lastFormData);
  } catch(err) {
    if (activeTab !== "hariH") return;
    if (!_lastHariHData)
      container.innerHTML = `<div class="empty"><span class="empty-icon">❌</span>${err.name === "AbortError" ? "Timeout, coba refresh" : err.message}</div>`;
    else
      showBanner(err.name === "AbortError" ? "⚠️ Timeout — menampilkan data terakhir" : "⚠️ Gagal update: " + err.message, "warning");
  }
}

// FIX: Promise.allSettled juga untuk forceRefresh
async function forceRefreshHariH() {
  if (activeTab !== "hariH") return;
  const container = document.getElementById("schedule-list");
  _lastHariHData = null; _lastFormData = [];
  container.innerHTML = _bsLoadingHTML("Force refresh...");
  try {
    const controller = new AbortController();
    // FIX: timeout 30000ms (dari 20000ms)
    const timeout = setTimeout(() => controller.abort(), 30000);
    const [todayResult, formResult] = await Promise.allSettled([
      fetch(API_URL + "?action=today&nocache=1&t="     + Date.now(), { signal: controller.signal }),
      fetch(API_URL + "?action=formcheck&nocache=1&t=" + Date.now(), { signal: controller.signal }),
    ]);
    clearTimeout(timeout);
    if (todayResult.status === "rejected") throw todayResult.reason;
    const data     = JSON.parse(await todayResult.value.text());
    const formData = formResult.status === "fulfilled"
      ? JSON.parse(await formResult.value.text())
      : { success: false };
    if (!data.success) throw new Error(data.error || "Unknown error");
    if (activeTab !== "hariH") return;
    _lastHariHData = data;
    _lastFormData  = formData.success ? formData.responses : [];
    renderHariH(_lastHariHData, _lastFormData);
    showBanner("✅ Data hari H diperbarui!", "success");
  } catch(err) {
    if (activeTab !== "hariH") return;
    container.innerHTML = `<div class="empty"><span class="empty-icon">❌</span>${err.name === "AbortError" ? "Timeout, coba refresh" : err.message}</div>`;
  }
}


// ✅ FINAL — tidak perlu startTime, tidak perlu override
function getHariHShift(endTime) {
  if (!endTime || endTime === "-") return "siang";
  const [h, m] = endTime.split(":").map(Number);
  if (h === 0 && m === 0) return "siang";  // 00:00 = akhir shift siang
  if (h >= 8  && h < 16) return "pagi";
  if (h >= 16)            return "siang";
  return "malam";                           // 00:01–07:59 genuinely overnight
}

const SHIFT_ORDER = { pagi: 0, siang: 1, malam: 2 };
const SHIFT_LABEL = {
  pagi : "☀️ Shift Pagi   08:00 – 15:59",
  siang: "🌆 Shift Siang  16:00 – 00:00",
  malam: "🌙 Shift Malam  00:01 – 07:59",
};
const SHIFT_COLOR = {
  pagi : { bg: "var(--bs-warning-subtle)",   border: "#ffe69c",          text: "#856404" },
  siang: { bg: "var(--bs-primary-subtle)",   border: "#9ec5fe",          text: "var(--bs-primary)" },
  malam: { bg: "var(--bs-secondary-subtle)", border: "var(--bs-border)", text: "var(--bs-secondary)" },
};

function _fmtSubmitTime(ms) {
  if (!ms) return '-';
  try {
    const d = new Date(ms);
    return d.toLocaleDateString("id-ID", { day:"numeric", month:"short", timeZone:"Asia/Jakarta" })
      + ", " + d.toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit", timeZone:"Asia/Jakarta" });
  } catch(e) { return '-'; }
}

// ─────────────────────────────────────────────
// INTERVAL OVERLAP HELPER
// ─────────────────────────────────────────────
function getOverlapRatio(formStart, formEnd, hStart, hEnd) {
  let fS = toMin(formStart), fE = toMin(formEnd);
  let hS = toMin(hStart),    hE = toMin(hEnd);
  // FIX: Normalize 00:00 end time → 1440
  if (fE === 0) fE = 1440;
  if (hE === 0) hE = 1440;
  const overlap = Math.max(0, Math.min(fE, hE) - Math.max(fS, hS));
  const dur = fE - fS;
  return dur > 0 ? overlap / dur : 0;
}

// ─────────────────────────────────────────────
// ★ parseFormHosts
// "Jonathan (with Agnes)" → ["Jonathan", "Agnes"]
// ─────────────────────────────────────────────
function parseFormHosts(hostStr) {
  if (!hostStr) return [];
  const cleaned = hostStr.replace(/[()]/g, ' ');
  const parts   = cleaned
    .split(/\s*(?:\bwith\b|\bdan\b|\bbareng\b|\bsama\b|&|,)\s*/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  return parts.length > 0 ? parts : [hostStr.trim()];
}

// ─────────────────────────────────────────────
// ★ hostNameMatchesSlot — fuzzy word match
// ─────────────────────────────────────────────
function hostNameMatchesSlot(formHostName, hostObj) {
  const hostName   = typeof hostObj === 'string' ? hostObj : (hostObj?.name || '');
  const wordsForm  = formHostName.toLowerCase().trim().split(/\s+/);
  const wordsSched = hostName.toLowerCase().trim().split(/\s+/);
  return wordsForm.some(wf => {
    if (wf.length < 3) return false;
    return wordsSched.some(ws => {
      if (ws.length < 3) return false;
      const minLen = Math.min(wf.length, ws.length);
      return wf.substring(0, minLen) === ws.substring(0, minLen);
    });
  });
}

// ─────────────────────────────────────────────
// ★ getTimeMatchScore — scoring-based time matching
//   end ±30m → +3 | start ±30m → +2 | overlap≥50% → +1
//   threshold match: ≥2 | kandidat: ≥1 atau overlap≥15%
// ─────────────────────────────────────────────
function getTimeMatchScore(formResp, hostStart, hostEnd) {
  let formStartMin = toMin(formResp.startLive);
  let formEndMin   = toMin(formResp.endLive);
  let hStartMin    = toMin(hostStart);
  let hEndMin      = toMin(hostEnd);
  // FIX: Normalize 00:00 end time → 1440
  if (formEndMin === 0) formEndMin = 1440;
  if (hEndMin === 0)    hEndMin    = 1440;
  let score = 0;
  if (Math.abs(formEndMin - hEndMin) <= 30)     score += 3;
  if (Math.abs(formStartMin - hStartMin) <= 30) score += 2;
  const overlapStart = Math.max(formStartMin, hStartMin);
  const overlapEnd   = Math.min(formEndMin, hEndMin);
  const formDur      = formEndMin - formStartMin;
  if (formDur > 0 && (overlapEnd - overlapStart) / formDur >= 0.5) score += 1;
  return score;
}

// ─────────────────────────────────────────────
// RENDER HARI H
// ─────────────────────────────────────────────
function renderHariH(data, formResponses = []) {
  const container    = document.getElementById("schedule-list");
  const leaderboard  = data.leaderboard || [];
  const totalPending = leaderboard.reduce((s,r) => s + r.pending, 0);
  const totalAll     = leaderboard.reduce((s,r) => s + r.total, 0);

  const shiftGroups = { pagi: {}, siang: {}, malam: {} };
  leaderboard.forEach(r => {
    if (!r.rows || !r.rows.length) return;
    r.rows.forEach(row => {
      const shift = getHariHShift(row.endTime);
      if (!shiftGroups[shift][r.pic]) shiftGroups[shift][r.pic] = { pic: r.pic, rows: [] };
      shiftGroups[shift][r.pic].rows.push(row);
    });
  });

  window._hariHShiftGroups = shiftGroups;
  window._hariHDate        = data.date;

  function sessionMatch(formResp, p, hostObj) {
    const hostName  = typeof hostObj === 'string' ? hostObj : (hostObj?.name || '');
    const hostStart = (typeof hostObj === 'object' && hostObj?.start) ? hostObj.start : p.startTime;
    const hostEnd   = (typeof hostObj === 'object' && hostObj?.end && hostObj.end !== '-') ? hostObj.end : null;

    const formHosts    = parseFormHosts(formResp.host);
    const anyHostMatch = formHosts.some(name => hostNameMatchesSlot(name, hostName));
    if (!anyHostMatch) return false;

    const fBrand = normalizeBrand(formResp.brand);
    const sBrand = normalizeBrand(p.brand);
    if (!fBrand.includes(sBrand.substring(0,5)) && !sBrand.includes(fBrand.substring(0,5))) return false;

    if (formResp.marketplace && p.mp) {
      const mpOk = formResp.marketplace.toLowerCase().includes(p.mp.toLowerCase().substring(0,4))
        || p.mp.toLowerCase().includes(formResp.marketplace.toLowerCase().substring(0,4));
      if (!mpOk) return false;
    }

    const score = getTimeMatchScore(formResp, hostStart, hostEnd);
    if (score < 2) return false;

    return true;
  }

  function deduplicateResponses(responses) {
    const groups = {};
    responses.forEach(r => {
      const key = [
        r.host.toLowerCase().trim(),
        r.brand.toLowerCase().trim(),
        r.marketplace.toLowerCase().trim(),
        r.startLive || '',
        r.endLive   || '',
      ].join('|');
      if (!groups[key]) {
        groups[key] = { ...r };
      } else {
        const existing = groups[key].screenshot.split(',').map(s => s.trim()).filter(Boolean);
        const incoming = r.screenshot.split(',').map(s => s.trim()).filter(Boolean);
        incoming.forEach(lnk => { if (!existing.includes(lnk)) existing.push(lnk); });
        groups[key].screenshot = existing.join(',');
        if (r.submittedAt && r.submittedAt > (groups[key].submittedAt || 0)) {
          groups[key].submittedAt = r.submittedAt;
        }
      }
    });
    return Object.values(groups);
  }

  function buildExclusiveClaims(dedupedResponses, allSlots) {
    const claims = {};

    dedupedResponses.forEach((r, rIdx) => {
      const formHosts   = parseFormHosts(r.host);
      const isMultiHost = formHosts.length > 1;

      if (isMultiHost) {
        const claimedKeys = [];

        formHosts.forEach(formHostName => {
          let bestSlotKey = null;
          let bestScore   = -1;
          let bestDiff    = Infinity;

          allSlots.forEach(({ slotKey, p, h }) => {
            const hostName  = typeof h === 'string' ? h : (h?.name || '');
            const hostStart = (typeof h === 'object' && h?.start) ? h.start : p.startTime;
            const hostEnd   = (typeof h === 'object' && h?.end && h.end !== '-') ? h.end : null;

            if (!hostNameMatchesSlot(formHostName, hostName)) return;

            const fBrand = normalizeBrand(r.brand);
            const sBrand = normalizeBrand(p.brand);
            if (!fBrand.includes(sBrand.substring(0,5)) && !sBrand.includes(fBrand.substring(0,5))) return;

            if (r.marketplace && p.mp) {
              const mpOk = r.marketplace.toLowerCase().includes(p.mp.toLowerCase().substring(0,4))
                || p.mp.toLowerCase().includes(r.marketplace.toLowerCase().substring(0,4));
              if (!mpOk) return;
            }

            const score = getTimeMatchScore(r, hostStart, hostEnd);
            if (score < 2) return;

            const diff = r.startLive ? Math.abs(toMinJS(r.startLive) - toMinJS(hostStart)) : 9999;

            if (score > bestScore || (score === bestScore && diff < bestDiff)) {
              bestScore   = score;
              bestDiff    = diff;
              bestSlotKey = slotKey;
            }
          });

          if (bestSlotKey && !claimedKeys.includes(bestSlotKey)) {
            claimedKeys.push(bestSlotKey);
          }
        });

        if (claimedKeys.length > 0) claims[rIdx] = claimedKeys;

      } else {
        let bestSlotKey = null;
        let bestScore   = -1;
        let bestDiff    = Infinity;

        allSlots.forEach(({ slotKey, p, h }) => {
          if (!sessionMatch(r, p, h)) return;

          const hostStart = (typeof h === 'object' && h?.start) ? h.start : p.startTime;
          const hostEnd   = (typeof h === 'object' && h?.end && h.end !== '-') ? h.end : null;
          const score     = getTimeMatchScore(r, hostStart, hostEnd);
          const diff      = r.startLive ? Math.abs(toMinJS(r.startLive) - toMinJS(hostStart)) : 9999;

          if (score > bestScore || (score === bestScore && diff < bestDiff)) {
            bestScore   = score;
            bestDiff    = diff;
            bestSlotKey = slotKey;
          }
        });

        if (bestSlotKey !== null) claims[rIdx] = [bestSlotKey];
      }
    });

    return claims;
  }

  // ─── PRE-PASS ───────────────────────────────────────────────────────────────
  const dedupedForms = deduplicateResponses(formResponses);

  const allSlots = [];
  leaderboard.forEach(r => {
    (r.rows || []).forEach(p => {
      const hosts = (p.hosts || []).map(h =>
        typeof h === 'string' ? { name: h, start: null, end: null } : h
      );
      hosts.forEach(h => {
        allSlots.push({
          slotKey: `${p.idLine}__${h.start || ''}__${h.name}`,
          p, h,
        });
      });
    });
  });

  const exclusiveClaims = buildExclusiveClaims(dedupedForms, allSlots);

  function getClaimedForms(slotKey) {
    return dedupedForms.filter((_, rIdx) => {
      const c = exclusiveClaims[rIdx];
      return Array.isArray(c) && c.includes(slotKey);
    });
  }

  function findSessionCandidates(p, hostObj) {
    const hostStart = (typeof hostObj === 'object' && hostObj?.start) ? hostObj.start : p.startTime;
    const hostEnd   = (typeof hostObj === 'object' && hostObj?.end && hostObj.end !== '-') ? hostObj.end : null;
    return dedupedForms.filter(r => {
      const fBrand = normalizeBrand(r.brand);
      const sBrand = normalizeBrand(p.brand);
      if (!fBrand.includes(sBrand.substring(0,5)) && !sBrand.includes(fBrand.substring(0,5))) return false;
      if (r.marketplace && p.mp) {
        const mpOk = r.marketplace.toLowerCase().includes(p.mp.toLowerCase().substring(0,4))
          || p.mp.toLowerCase().includes(r.marketplace.toLowerCase().substring(0,4));
        if (!mpOk) return false;
      }
      const score = getTimeMatchScore(r, hostStart, hostEnd);
      const ratio = getOverlapRatio(r.startLive, r.endLive, hostStart, hostEnd);
      return score >= 1 || ratio >= 0.15;
    });
  }

  // ─── RENDER HTML ────────────────────────────────────────────────────────────
  const summaryCard = (bg, border, numColor, num, label) =>
    `<div style="flex:1;background:${bg};border:1px solid ${border};border-radius:var(--bs-radius-lg);padding:10px 6px;text-align:center">
       <div style="font-size:1.15rem;font-weight:800;color:${numColor}">${num}</div>
       <div style="font-size:0.58rem;color:var(--bs-muted);margin-top:1px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">${label}</div>
     </div>`;

  let html = `<div style="padding:8px 10px 24px">`;

  html += `
    <div style="text-align:center;margin-bottom:12px">
      <div style="font-size:0.85rem;font-weight:700;color:var(--bs-dark)">📅 Data Hari H (Belum diisi)</div>
      <div style="font-size:0.85rem;font-weight:700;color:var(--bs-dark)">!Harap selalu cek manual TANGGAL, MP, JAM & DLL pada foto file GMV host di sheet responses!</div>
      <div style="font-size:0.68rem;color:var(--bs-muted);margin-top:3px">${data.date}</div>
    </div>`;

  html += `<div style="display:flex;gap:7px;margin-bottom:12px">
    ${summaryCard("var(--bs-danger-subtle)","#f1aeb5","var(--bs-danger)",totalPending,"⏳ Belum Diisi")}
    ${summaryCard("var(--bs-success-subtle)","#a3cfbb","var(--bs-success)",totalAll-totalPending,"✅ Sudah Diisi")}
    ${summaryCard("var(--bs-primary-subtle)","#9ec5fe","var(--bs-primary)",totalAll,"📋 Total Sesi")}
  </div>`;

  html += `
    <button onclick="forceRefreshHariH()" class="btn btn-outline-primary btn-block"
      style="margin-bottom:16px;padding:8px;font-size:0.78rem">
      🔄 Refresh (Clear Cache)
    </button>`;

  if (totalPending === 0) {
    html += `<div style="text-align:center;padding:28px;color:var(--bs-success);font-size:0.85rem;font-weight:600">✅ Semua data hari ini sudah diisi!</div>`;
  } else {
    ["pagi","siang","malam"].forEach(shift => {
      const picMap     = shiftGroups[shift];
      const pics       = Object.values(picMap);
      if (!pics.length) return;
      const c          = SHIFT_COLOR[shift];
      const totalShift = pics.reduce((s, p) => s + p.rows.length, 0);

      html += `
        <div style="background:${c.bg};border:1px solid ${c.border};border-radius:var(--bs-radius-lg);
                    padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:0.78rem;font-weight:700;color:${c.text}">${SHIFT_LABEL[shift]}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:0.68rem;font-weight:600;color:${c.text};opacity:0.8">${totalShift} sesi belum</span>
            <button onclick="copyShiftPending('${shift}')"
              style="padding:3px 9px;border:1px solid ${c.border};border-radius:var(--bs-radius-pill);
                     background:white;color:${c.text};font-size:0.62rem;font-weight:700;cursor:pointer">
              📋 Copy
            </button>
          </div>
        </div>`;

      pics.sort((a, b) => b.rows.length - a.rows.length).forEach(picData => {
        const rows    = [...picData.rows].sort((a, b) => a.startTime.localeCompare(b.startTime));
        const ids     = rows.map(p => p.idLine).filter(Boolean);
        const safeKey = (picData.pic + "_" + shift).replace(/[^a-zA-Z0-9]/g, '_');

        html += `
          <div style="background:var(--bs-white);border:1px solid var(--bs-border);border-radius:var(--bs-radius-lg);
                      margin-bottom:10px;overflow:hidden;box-shadow:var(--bs-shadow-sm)">
            <div onclick="togglePicDropdown('${safeKey}')"
              style="padding:9px 12px;background:var(--bs-light);display:flex;align-items:center;
                     justify-content:space-between;cursor:pointer;user-select:none;border-bottom:1px solid var(--bs-border)">
              <div style="display:flex;align-items:center;gap:7px">
                <span id="pic-icon-${safeKey}" style="font-size:0.75rem;color:var(--bs-muted)">▸</span>
                <span style="font-size:0.85rem;font-weight:700;color:var(--bs-dark)">${formatPic(picData.pic)}</span>
                <span style="background:var(--bs-danger-subtle);color:var(--bs-danger-text);border:1px solid #f1aeb5;
                             font-size:0.6rem;font-weight:700;padding:1px 7px;border-radius:var(--bs-radius-pill)">
                  ${rows.length} sesi
                </span>
              </div>
              <button onclick="event.stopPropagation();copyIdLines('${picData.pic}',${JSON.stringify(ids).replace(/"/g,'&quot;')})"
                style="padding:3px 10px;border:1px solid #9ec5fe;border-radius:var(--bs-radius-pill);
                       background:var(--bs-primary-subtle);color:var(--bs-primary-text);font-size:0.62rem;font-weight:600;cursor:pointer">
                📋 ID
              </button>
            </div>
            <div id="pic-content-${safeKey}" style="overflow:hidden;transition:max-height 0.3s ease;max-height:0px">`;

        rows.forEach((p, pIdx) => {
          const sessionTime = (p.endTime && p.endTime !== '-') ? `${p.startTime} → ${p.endTime}` : p.startTime;

          const typeBadge = p.isMarathon
            ? `<span style="background:var(--bs-warning-subtle);color:#856404;border:1px solid #ffe69c;font-size:0.55rem;padding:2px 6px;border-radius:var(--bs-radius-pill);font-weight:700">🏃 Marathon</span>`
            : `<span style="background:var(--bs-success-subtle);color:var(--bs-success-text);border:1px solid #a3cfbb;font-size:0.55rem;padding:2px 6px;border-radius:var(--bs-radius-pill);font-weight:700">⚡ Single</span>`;

          // ← HOLD: badge merah jika row.isHold === true
          const holdBadge = p.isHold
            ? `<span style="background:#ef4444;color:#fff;font-size:0.55rem;font-weight:700;
                            padding:2px 6px;border-radius:var(--bs-radius-pill);letter-spacing:.5px">
                HOLD
               </span>`
            : '';

          const rawHosts = (p.hosts && p.hosts.length > 0) ? p.hosts : [];
          const hosts    = rawHosts.map(h => typeof h === 'string' ? { name: h, start: null, end: null } : h);

          const matchedList   = [];
          const unmatchedList = [];

          hosts.forEach((h, hIdx) => {
            const slotKey    = `${p.idLine}__${h.start || ''}__${h.name}`;
            const allMatches = getClaimedForms(slotKey);

            if (allMatches.length > 0) {
              let endMs = null;
              if (h.end && h.end !== '-' && data.date) {
                try {
                  const startMs = h.start ? new Date(`${data.date}T${h.start}:00+07:00`).getTime() : 0;
                  endMs = new Date(`${data.date}T${h.end}:00+07:00`).getTime();
                  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
                } catch(e) {}
              }
              const validMatches = endMs
                ? allMatches.filter(r => !r.submittedAt || r.submittedAt >= endMs)
                : allMatches;
              const falseMatches = endMs
                ? allMatches.filter(r =>  r.submittedAt && r.submittedAt < endMs)
                : [];

              if (validMatches.length > 0) {
                matchedList.push({ h, match: validMatches[0], isValid: true,  falseMatches, endMs });
              } else {
                matchedList.push({ h, match: falseMatches[0], isValid: false, falseMatches, endMs });
              }
            } else {
              unmatchedList.push({ h, hIdx });
            }
          });

          html += `
            <div style="padding:12px 14px;border-bottom:1px solid var(--bs-border-subtle)">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
                <div>
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
                    <span style="font-size:0.82rem;font-weight:700;color:var(--bs-dark)">${p.brand}</span>
                    ${typeBadge}
                    ${holdBadge}
                  </div>
                  <div style="font-size:0.63rem;color:var(--bs-muted);display:flex;gap:10px;flex-wrap:wrap">
                    <span>🕐 ${sessionTime}</span><span>📍 ${p.studio} · ${p.mp}</span>
                  </div>
                </div>
                <div style="font-size:0.6rem;color:#adb5bd;font-family:monospace;flex-shrink:0;padding-top:2px">${p.idLine}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">`;

          if (hosts.length === 0) {
            html += `<div style="font-size:0.62rem;color:#adb5bd;font-style:italic;padding:4px 0">⚠️ Tidak ada data host</div>`;
          } else {
            matchedList.forEach(({ h, match, isValid, falseMatches, endMs }) => {
              const links = match.screenshot.split(',').map(l => l.trim()).filter(Boolean);
              const slotTime = h.start
                ? `<span style="color:var(--bs-muted)">${h.start}${h.end ? ' → ' + h.end : ''}</span>`
                : (match.startLive ? `<span style="color:var(--bs-muted)">${match.startLive}${match.endLive ? ' → ' + match.endLive : ''}</span>` : '');

              if (isValid) {
                const prevFalseNote = falseMatches.length > 0
                  ? `<div style="font-size:0.58rem;color:#856404;margin-top:3px;opacity:0.85">⚠️ ${falseMatches.length}x false upload sebelumnya terdeteksi</div>`
                  : '';
                html += `
                  <div style="background:var(--bs-success-subtle);border:1px solid #a3cfbb;border-radius:var(--bs-radius);padding:7px 10px">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                      <div>
                        <div style="font-size:0.72rem;font-weight:700;color:var(--bs-success-text)">✅ ${h.name}</div>
                        <div style="font-size:0.6rem;margin-top:2px">${slotTime}</div>
                        ${prevFalseNote}
                      </div>
                      <div style="display:flex;gap:5px;flex-shrink:0">
                        ${links.map((lnk, li) => lnk
                          ? `<a href="${lnk}" target="_blank"
                               style="padding:3px 8px;background:white;border:1px solid #a3cfbb;
                                      border-radius:var(--bs-radius-pill);color:var(--bs-primary);
                                      font-size:0.62rem;font-weight:700;text-decoration:none">
                               📎${links.length > 1 ? li + 1 : ''}
                             </a>` : '').join('')}
                      </div>
                    </div>
                  </div>`;
              } else {
                let endLabel = '-';
                if (endMs) {
                  try {
                    const d = new Date(endMs);
                    endLabel = d.toLocaleDateString("id-ID", { day:"numeric", month:"short", timeZone:"Asia/Jakarta" })
                      + ", " + d.toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit", timeZone:"Asia/Jakarta" });
                  } catch(e) {}
                }
                html += `
                  <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:var(--bs-radius);padding:7px 10px">
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                      <div style="flex:1;min-width:0">
                        <div style="font-size:0.72rem;font-weight:700;color:#b91c1c">⚠️ ${h.name}</div>
                        <div style="font-size:0.6rem;margin-top:2px;color:#b91c1c;opacity:0.75">${slotTime}</div>
                        <div style="background:white;border:1px solid #fca5a5;border-radius:var(--bs-radius);padding:5px 8px;margin-top:6px">
                          <div style="font-size:0.62rem;font-weight:700;color:#b91c1c">❌ False form upload terdeteksi (${falseMatches.length}x)</div>
                          <div style="font-size:0.58rem;color:#b91c1c;opacity:0.8;margin-top:1px">
                            Disubmit ${_fmtSubmitTime(match.submittedAt)} — sesi belum selesai (end: ${endLabel})
                          </div>
                        </div>
                        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:var(--bs-radius);padding:5px 8px;margin-top:5px;display:flex;align-items:center;gap:6px">
                          <span style="font-size:0.85rem">⏳</span>
                          <div>
                            <div style="font-size:0.62rem;font-weight:700;color:#c2410c">Menunggu form upload yang benar</div>
                            <div style="font-size:0.58rem;color:#c2410c;opacity:0.85;margin-top:1px">Hubungi host: <strong>${h.name}</strong></div>
                          </div>
                        </div>
                      </div>
                      ${links.length > 0 ? `
                        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;padding-top:2px">
                          ${links.map((lnk, li) => lnk
                            ? `<a href="${lnk}" target="_blank"
                                 style="padding:3px 8px;background:#fee2e2;border:1px solid #fca5a5;
                                        border-radius:var(--bs-radius-pill);color:#b91c1c;
                                        font-size:0.62rem;font-weight:700;text-decoration:none;opacity:0.75">
                                 📎${links.length > 1 ? li + 1 : ''}
                               </a>` : '').join('')}
                        </div>` : ''}
                    </div>
                  </div>`;
              }
            });

            unmatchedList.forEach(({ h, hIdx }) => {
              const candId     = (safeKey + "_p" + pIdx + "_h" + hIdx).replace(/[^a-zA-Z0-9]/g,'_');
              const candidates = findSessionCandidates(p, h);
              const slotTime   = h.start ? `${h.start}${h.end ? ' → ' + h.end : ''}` : null;

              if (candidates.length > 0) {
                html += `
                  <div style="background:#fffbeb;border:1px solid #ffe69c;border-radius:var(--bs-radius);overflow:hidden">
                    <div onclick="toggleCandidates('${candId}')"
                      style="padding:7px 10px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;gap:8px">
                      <div>
                        <div style="font-size:0.72rem;font-weight:700;color:#92400e">❓ ${h.name}</div>
                        ${slotTime ? `<div style="font-size:0.6rem;color:#a0832a;margin-top:2px">${slotTime}</div>` : ''}
                      </div>
                      <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
                        <span style="background:#92400e;color:white;font-size:0.58rem;padding:2px 7px;border-radius:var(--bs-radius-pill);font-weight:700">${candidates.length} kandidat</span>
                        <span id="cand-icon-${candId}" style="font-size:0.72rem;color:#92400e">▸</span>
                      </div>
                    </div>
                    <div id="cand-${candId}" style="display:none;border-top:1px solid #ffe69c;background:#fffdf0;padding:6px 10px;flex-direction:column;gap:5px">
                      ${candidates.map(c => {
                        const links = c.screenshot.split(',').map(l => l.trim()).filter(Boolean);
                        return `
                          <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:white;border-radius:var(--bs-radius);border:1px solid #ffe69c;gap:8px">
                            <div style="min-width:0">
                              <div style="font-size:0.7rem;font-weight:700;color:#92400e">${c.host}</div>
                              <div style="font-size:0.58rem;color:#a0832a;margin-top:1px">${c.startLive}${c.endLive?' → '+c.endLive:''} · ${c.typeLive||'-'}</div>
                            </div>
                            <div style="display:flex;gap:4px;flex-shrink:0">
                              ${links.map((lnk,li) => lnk
                                ? `<a href="${lnk}" target="_blank"
                                     style="padding:3px 8px;background:#fffbeb;border:1px solid #ffe69c;border-radius:var(--bs-radius-pill);color:var(--bs-primary);font-size:0.62rem;font-weight:700;text-decoration:none">
                                     📎${links.length>1?li+1:''}
                                   </a>` : '').join('')}
                            </div>
                          </div>`;
                      }).join('')}
                    </div>
                  </div>`;
              } else {
                html += `
                  <div style="background:var(--bs-danger-subtle);border:1px solid #f1aeb5;border-radius:var(--bs-radius);padding:7px 10px">
                    <div style="font-size:0.72rem;font-weight:700;color:var(--bs-danger-text)">⏳ ${h.name}</div>
                    ${slotTime ? `<div style="font-size:0.6rem;color:var(--bs-danger-text);opacity:0.7;margin-top:2px">${slotTime}</div>` : ''}
                  </div>`;
              }
            });
          }

          html += `</div></div>`;
        });

        html += `</div></div>`;
      });

      html += `<div style="margin-bottom:14px"></div>`;
    });
  }

  html += `</div>`;
  container.innerHTML = html;
}


// ─────────────────────────────────────────────
// TOGGLE HELPERS
// ─────────────────────────────────────────────
function toggleCandidates(id) {
  const el   = document.getElementById("cand-" + id);
  const icon = document.getElementById("cand-icon-" + id);
  if (!el) return;
  const isOpen = el.style.display === "flex" || el.style.display === "block";
  el.style.display = isOpen ? "none" : "flex";
  el.style.flexDirection = "column";
  if (icon) icon.textContent = isOpen ? "▸" : "▾";
}

function togglePicDropdown(safeKey) {
  const content = document.getElementById(`pic-content-${safeKey}`);
  const icon    = document.getElementById(`pic-icon-${safeKey}`);
  if (!content) return;
  const isOpen = content.style.maxHeight !== '0px';
  content.style.maxHeight = isOpen ? '0px' : '1000px';
  if (icon) icon.textContent = isOpen ? '▸' : '▾';
}

function copyShiftPending(shift) {
  const shiftGroups = window._hariHShiftGroups;
  const date        = window._hariHDate || '';
  if (!shiftGroups) return;
  const picMap = shiftGroups[shift];
  const pics   = Object.values(picMap);
  if (!pics.length) { showBanner('Tidak ada pending di shift ini', 'warning'); return; }
  const label = { pagi:'PAGI', siang:'SIANG', malam:'MALAM' };
  let text = `📋 PENDING SHIFT ${label[shift]} — ${date}\n\n`;
  pics.sort((a,b) => b.rows.length - a.rows.length).forEach(picData => {
    const rows = [...picData.rows].sort((a,b) => a.startTime.localeCompare(b.startTime));
    text += `${formatPic(picData.pic)} (${rows.length} sesi)\n`;
    rows.forEach(p => {
      const timeRange = (p.endTime && p.endTime !== '-') ? `${p.startTime}→${p.endTime}` : p.startTime;
      text += `• ${p.brand} | ${p.studio} | ${p.mp} | ${timeRange} | ID: ${p.idLine}\n`;
    });
    text += '\n';
  });
  navigator.clipboard.writeText(text.trim())
    .then(() => showBanner(`✅ Data pending shift ${label[shift]} di-copy!`, 'success'))
    .catch(() => showBanner('❌ Gagal copy', 'error'));
}

function copyIdLines(picName, idLines) {
  if (!idLines || idLines.length === 0) return;
  navigator.clipboard.writeText(idLines.join("\n"))
    .then(() => showBanner(`✅ ${formatPic(picName)}: ${idLines.length} ID Line di-copy!`, "success"))
    .catch(() => showBanner("❌ Gagal copy", "error"));
}

// ─────────────────────────────────────────────
// COPY STANDBY TEXT
// ─────────────────────────────────────────────
function copyStandbyText(){
  const dateStr=sessions[0]?.date||"";
  let dateLabel="";
  try{dateLabel=new Date(dateStr+"T12:00:00+07:00").toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Jakarta"}).toUpperCase();}catch(e){}
  const picShift=buildPicShiftData(),standbyList=buildStandbyData();
  let text=`REMINDER ${dateLabel}\n\n`;
  ["pagi","siang"].forEach(shift=>{
    const data=picShift[shift];if(!data||!Object.keys(data).length)return;
    text+=`PIC SHIFT ${shift.toUpperCase()}\n`;
    Object.entries(data).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([,d])=>{text+=`${d.name.replace("@","")}\t${[...d.studios].sort((a,b)=>a-b).join(",")}\n`;});
    text+="\n";
  });
  standbyList.forEach(b=>{
    text+=`STANDBY ${b.key.toUpperCase()}\n`;
    b.slots.forEach(slot=>{text+=`${slot.label} ${slot.pic}\n`;});
    text+="\n";
  });
  text+=`1. BACK UP HOST SELAIN ASICS, AT, dan SAMSO WAJIB HAND TALENT\n2. CEK KEHADIRAN HOST BAIK SINGLE HOST/MARATHON DAN LAPOR KE GRUP HOST TAG TALCO KALO 30 SEBELUM LIVE HOST SELANJUTNYA BELUM DATANG\n3. PASTIKAN SEMUA STUDIO ADA AKUN ABSEN HOST\n\n`;
  text+=`Form bukti tayang:\nhttps://forms.gle/J8WG4kmQap7h6V\n
  LINK Data Report Terbaru dan link LIST HOST:\nhttps://docs.google.com/spreadsheets/d/1vbjwOFg_vmyJNs9UXuLMJF-TekN6xfomAzXy-zoDP7o/edit?gid=0\n\nBACKUP Screenshot LS Streamlab Upload BY HOST\nhttps://docs.google.com/spreadsheets/d/1XhC8QOC9loOCODjMRkdNa4yfl8BeDVZct8wsFbeeIz0/edit?gid=743892642\n\nLINK Insight American Tourister dan Samsonite:\nhttps://docs.google.com/spreadsheets/d/1dTDvRuYPYZ5_5Z4t6sUAP3myjE_mo23RlVkhU-rPk0E/edit?gid=1067791791`;
  navigator.clipboard.writeText(text)
    .then(()=>showBanner("✅ Teks di-copy!","success"))
    .catch(()=>showBanner("❌ Gagal copy","error"));
}

// ─────────────────────────────────────────────
// NOTIF PANEL
// ─────────────────────────────────────────────
function showNotifPanel(){
  const panel=document.getElementById("notif-panel");
  if(panel.style.display!=="none"){panel.style.display="none";return;}
  const now=Date.now(),list=document.getElementById("notif-time-list");
  list.innerHTML="";
  const startTimes=new Set(),endTimes=new Set();
  sessions.forEach(s=>{
    if(s.startTime&&s.startTime!=="-")startTimes.add(s.startTime);
    if(s.endTime&&s.endTime!=="-")endTimes.add(s.endTime);
  });
  const makeBtn=(time,type)=>{
    const ms=timeToMs(sessions[0]?.date,time);if(!ms)return;
    const diff=ms-now;if(diff<-60*60*1000)return;
    const diffMin=Math.round(diff/60000);
    const btn=document.createElement("button");
    btn.className="notif-time-btn";
    if(type==="start"){btn.style.background="var(--bs-success-subtle)";btn.style.color="var(--bs-success-text)";btn.style.border="1px solid #a3cfbb";}
    else{btn.style.background="var(--bs-danger-subtle)";btn.style.color="var(--bs-danger-text)";btn.style.border="1px solid #f1aeb5";}
    btn.textContent=`${type==="start"?"▶":"⏹"} ${time}${diffMin>0?` (+${diffMin}m)`:" (lewat)"}`;
    btn.onclick=()=>sendManualNotifFor(time,type);
    list.appendChild(btn);
  };
  [...startTimes].sort().forEach(t=>makeBtn(t,"start"));
  [...endTimes].sort().forEach(t=>makeBtn(t,"end"));
  panel.style.display="block";
}

function closeNotifPanel(){document.getElementById("notif-panel").style.display="none";}

function sendManualNotifFor(time,type="start"){
  const group=sessions.filter(s=>type==="start"?s.startTime===time:s.endTime===time);
  if(!group.length){showBanner("Tidak ada sesi di jam ini","warning");return;}
  const lines=buildNotifLines(group,type,time);
  broadcastNotif(`${type==="start"?"▶ START":"⏹ END"} ${time}`,lines.join("\n"),false);
  closeNotifPanel();
}

function sendManualNotifAll(){
  const now=Date.now();
  const upStart={},upEnd={};
  sessions.forEach(s=>{
    const add=(map,time)=>{
      const ms=timeToMs(s.date,time);if(!ms)return;
      const diff=ms-now;if(diff<-5*60*1000||diff>2*60*60*1000)return;
      if(!map[time])map[time]=[];map[time].push(s);
    };
    if(s.startTime&&s.startTime!=="-")add(upStart,s.startTime);
    if(s.endTime&&s.endTime!=="-")add(upEnd,s.endTime);
  });
  const entries=[
    ...Object.entries(upStart).map(([t,g])=>({t,g,type:"start"})),
    ...Object.entries(upEnd).map(([t,g])=>({t,g,type:"end"})),
  ].sort((a,b)=>toMinJS(a.t)-toMinJS(b.t));
  if(!entries.length){showBanner("Tidak ada sesi upcoming (2 jam ke depan)","warning");return;}
  entries.forEach(({t,g,type},idx)=>{
    setTimeout(()=>{
      const lines=buildNotifLines(g,type,t);
      broadcastNotif(`${type==="start"?"▶ START":"⏹ END"} ${t}`,lines.join("\n"),false);
    },idx*2000);
  });
  closeNotifPanel();
  showBanner(`🔔 ${entries.length} notif dikirim (start+end)!`,"success");
}

// ─────────────────────────────────────────────
// STATS & SCHEDULING
// ─────────────────────────────────────────────
function updateStats(){
  const m=sessions.filter(s=>s.isMarathon).length;
  const sg=sessions.filter(s=>!s.isMarathon).length;
  document.getElementById("stat-total").textContent   =sessions.length;
  document.getElementById("stat-marathon").textContent=m;
  document.getElementById("stat-single").textContent  =sg;
}

function scheduleAllNotifications(list){
  const now=Date.now();let count=0;
  const startGroups={},endGroups={};
  list.forEach(s=>{
    if(s.startTime&&s.startTime!=="-"){if(!startGroups[s.startTime])startGroups[s.startTime]=[];startGroups[s.startTime].push(s);}
    if(s.endTime&&s.endTime!=="-"){if(!endGroups[s.endTime])endGroups[s.endTime]=[];endGroups[s.endTime].push(s);}
  });
  Object.entries(startGroups).forEach(([time,group])=>{
    const startMs=timeToMs(group[0].date,time);if(!startMs)return;
    [{min:60,prefix:"🔔 SETUP",urgent:false},{min:10,prefix:"⏰ 10 MENIT LAGI",urgent:false},{min:5,prefix:"🚨 5 MENIT LAGI",urgent:true}]
    .forEach(({min,prefix,urgent})=>{
      const t=startMs-min*60*1000;
      if(t>now){scheduledTasks.push(setTimeout(()=>fireGroupNotif(`${prefix} — START ${time}`,group,"start",urgent),t-now));count++;}
    });
  });
  Object.entries(endGroups).forEach(([time,group])=>{
    const effectiveTime=time==="23:59/00:00"?"23:59":time;
    let endMs=timeToMs(group[0].date,effectiveTime);
    const sMs=timeToMs(group[0].date,group[0].startTime);
    if(endMs&&sMs&&endMs<=sMs)endMs+=24*60*60*1000;
    if(!endMs)return;
    [{min:10,prefix:"⏰ 10 MENIT LAGI",urgent:false},{min:5,prefix:"🚨 5 MENIT LAGI",urgent:true}]
    .forEach(({min,prefix,urgent})=>{
      const t=endMs-min*60*1000;
      if(t>now){scheduledTasks.push(setTimeout(()=>fireGroupNotif(`${prefix} — END ${time}`,group,"end",urgent),t-now));count++;}
    });
  });
  document.getElementById("notif-count").textContent=`🔔 ${count} notif terjadwal`;
}

function buildNotifLines(group,type,eventTime){
  const copies=group.map(s=>({...s,picForEvent:type==="start"?(s.hosts?.[0]?.picData||"-"):(s.hosts?.[s.hosts.length-1]?.picData||"-")}));
  const validPics=eventTime?getAvailableOps(sessions,eventTime):null;
  if(type==="start")assignPics(copies,[],validPics);
  else              assignPics([],copies,validPics);
  return copies.map((s,i)=>{
    const h=type==="start"?s.hosts?.[0]:s.hosts?.[s.hosts.length-1];
    const host=h?.host||"-";
    const pic=s.assignedPic||"LSC";
    return type==="start"
      ?`${i+1}. ${s.brand} | ${s.marketplace} | ${s.studio}\n   👤 ${host} ${pic}`
      :`${i+1}. ${s.brand} | ${s.marketplace} | ${s.studio} ${pic}`;
  });
}

function cancelAllScheduled(){scheduledTasks.forEach(id=>clearTimeout(id));scheduledTasks=[];}

function fireGroupNotif(title,group,type,urgent=false){
  const timeMatch=/(\d{2}:\d{2})/.exec(title);
  const eventTime=timeMatch?timeMatch[1]:null;
  const lines=buildNotifLines(group,type,eventTime);
  sendNotification(title,lines.join("\n"),`grp-${type}-${title}-${Date.now()}`,urgent);
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function getCurrentHostIdx(session){
  const now=Date.now();
  for(let i=0;i<session.hosts.length;i++){
    const h=session.hosts[i];
    const startMs=timeToMs(session.date,h.startTime);
    let endMs=timeToMs(session.date,h.endTime);
    if(!startMs||!endMs)continue;
    if(endMs<=startMs)endMs+=24*60*60*1000;
    if(now>=startMs&&now<endMs)return i;
  }
  return -1;
}

function toMinJS(t){
  if(!t||t==="-")return 9999;
  const[h,m]=t.split(":").map(Number);
  return h*60+m;
}

function timeToMs(dateStr,timeStr){
  try{
    if(!timeStr||timeStr==="-")return null;
    const t=timeStr.length===4?"0"+timeStr:timeStr;
    return new Date(`${dateStr}T${t}:00+07:00`).getTime();
  }catch{return null;}
}

function updateClock(){
  const now=new Date();
  const el=document.getElementById("clock");
  const de=document.getElementById("date-display");
  if(el)el.textContent=now.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"Asia/Jakarta"});
  if(de)de.textContent=now.toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Jakarta"});
}

function showLoading(show){document.getElementById("loading").style.display=show?"flex":"none";}

function showBanner(msg,type="info"){
  const el=document.getElementById("banner");
  el.textContent=msg;
  const map={success:"alert alert-success",error:"alert alert-danger",warning:"alert alert-warning"};
  el.className=map[type]||"alert alert-primary";
  el.style.display="block";
  setTimeout(()=>el.style.display="none",4000);
}

async function debugNotif(){
  const lines=[
    `URL: ${location.href}`,`Permission: ${Notification.permission}`,
    `SW: ${!!swRegistration} (${swRegistration?.active?.state||"none"})`,
    `ntfy: ${ntfySource?.readyState===1?"connected":"disconnected"}`,
    `User: ${currentUserEmail||"tidak login"}`,
    `Online: ${Object.keys(onlineUsers).length} users`,
  ];
  alert(lines.join("\n"));
  if(Notification.permission!=="granted"){
    const r=await Notification.requestPermission();
    if(r!=="granted")return;
  }
  sendNotification("🔔 Debug Test","Notif berhasil dari "+location.hostname,"debug-"+Date.now());
}

// ─────────────────────────────────────────────
// BUKTI TAYANG
// ─────────────────────────────────────────────
let _lastBuktiTayangData = null;

async function loadBuktiTayang() {
  if (activeTab !== 'buktiTayang') return;
  const container = document.getElementById('schedule-list');
  if (_lastBuktiTayangData) { renderBuktiTayang(_lastBuktiTayangData); }
  else { container.innerHTML = _bsLoadingHTML('Memuat bukti tayang...'); }
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 20000);
    const res        = await fetch(API_URL + '?action=buktitayang&t=' + Date.now(), { signal: controller.signal });
    clearTimeout(timeout);
    const data = JSON.parse(await res.text());
    if (!data.success) throw new Error(data.error || 'Unknown error');
    if (activeTab !== 'buktiTayang') return;
    _lastBuktiTayangData = data;
    renderBuktiTayang(data);
  } catch(err) {
    if (activeTab !== 'buktiTayang') return;
    if (!_lastBuktiTayangData)
      container.innerHTML = `<div class="empty"><span class="empty-icon">❌</span>${err.name === 'AbortError' ? 'Timeout, coba refresh' : err.message}</div>`;
    else
      showBanner(err.name === 'AbortError' ? '⚠️ Timeout — menampilkan data terakhir' : '⚠️ Gagal update: ' + err.message, 'warning');
  }
}

async function forceRefreshBuktiTayang() {
  if (activeTab !== 'buktiTayang') return;
  const container = document.getElementById('schedule-list');
  _lastBuktiTayangData = null;
  container.innerHTML = _bsLoadingHTML('Force refresh...');
  try {
    const res  = await fetch(API_URL + '?action=buktitayang&nocache=1&t=' + Date.now());
    const data = JSON.parse(await res.text());
    if (!data.success) throw new Error(data.error);
    if (activeTab !== 'buktiTayang') return;
    _lastBuktiTayangData = data;
    renderBuktiTayang(data);
    showBanner('✅ Bukti tayang diperbarui!', 'success');
  } catch(err) {
    if (activeTab !== 'buktiTayang') return;
    container.innerHTML = `<div class="empty"><span class="empty-icon">❌</span>${err.message}</div>`;
  }
}
// ─────────────────────────────────────────────────────
// BUKTI TAYANG — HELPERS
// ─────────────────────────────────────────────────────

// SESUDAH (benar — 3 shift, split di 08:00 dan 16:00):
function getShiftBT(startTime) {
  if (!startTime) return 'pagi';
  const m = toMin(startTime);
  if (m < 480)  return 'malam';  // 00:00–07:59
  if (m < 960)  return 'pagi';   // 08:00–15:59
  return 'siang';                 // 16:00–23:59
}

function toggleBtShift(shift) {
  const body    = document.getElementById('bt-shift-body-' + shift);
  const chevron = document.getElementById('bt-shift-chevron-' + shift);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if (chevron) chevron.textContent = isOpen ? '▸' : '▾';
}

function toggleBtStatus(shift, status) {
  const body    = document.getElementById(`bt-status-body-${shift}-${status}`);
  const chevron = document.getElementById(`bt-status-chevron-${shift}-${status}`);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if (chevron) chevron.textContent = isOpen ? '▸' : '▾';
}

// ─────────────────────────────────────────────────────
// BUKTI TAYANG — RENDER
// ─────────────────────────────────────────────────────

function renderBuktiTayang(data) {
  const container = document.getElementById('schedule-list');
  if (!container) return;

  if (!data || !data.sessions || data.sessions.length === 0) {
    container.innerHTML = '<div class="empty"><span class="empty-icon">🎬</span>Tidak ada data Bukti Tayang hari ini.</div>';
    return;
  }

  const sessions   = data.sessions;
  const uploaded   = sessions.filter(s => s.status === 'uploaded');
  const linkKosong = sessions.filter(s => s.status === 'pending');
  const missing    = sessions.filter(s => s.status === 'missing');

  // ─── FIX: 3 shift berdasarkan START LIVE ───────────────
  const shifts = {
    malam: {
      done:    sessions.filter(s => s.status === 'uploaded' && getShiftBT(s.startTime) === 'malam'),
      notDone: sessions.filter(s => s.status !== 'uploaded' && getShiftBT(s.startTime) === 'malam'),
    },
    pagi: {
      done:    sessions.filter(s => s.status === 'uploaded' && getShiftBT(s.startTime) === 'pagi'),
      notDone: sessions.filter(s => s.status !== 'uploaded' && getShiftBT(s.startTime) === 'pagi'),
    },
    siang: {
      done:    sessions.filter(s => s.status === 'uploaded' && getShiftBT(s.startTime) === 'siang'),
      notDone: sessions.filter(s => s.status !== 'uploaded' && getShiftBT(s.startTime) === 'siang'),
    },
  };
  // ───────────────────────────────────────────────────────

  function renderCard(s) {
    const isUploaded = s.status === 'uploaded';
    const isPending  = s.status === 'pending';

    const cardBg      = isUploaded ? '#f0fff4' : isPending ? '#fffef0' : '#fff5f5';
    const borderColor = isUploaded ? '#28a745' : isPending ? '#ffc107' : '#dc3545';
    const statusIcon  = isUploaded ? '✅' : '✖';

    const typeBadge = s.isMarathon
      ? `<span style="background:#fff3cd;color:#856404;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;">👤 Marathon</span>`
      : `<span style="background:#ffe5d9;color:#c77700;border-radius:12px;padding:2px 8px;font-size:11px;font-weight:600;">⚡ Single</span>`;

    const statusBadge = isUploaded
      ? `<span style="background:#d4edda;color:#155724;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600;">Uploaded</span>`
      : isPending
      ? `<span style="background:#fff3cd;color:#856404;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600;">Link Kosong</span>`
      : `<span style="background:#f8d7da;color:#721c24;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600;">Belum Upload</span>`;

    let uploadInfo = '';
    if (isUploaded) {
      const picNames = (s.pics || []).join(', ') || '-';
      const linkHtml = (s.links || []).map(l =>
        `<a href="${l}" target="_blank" style="color:#1a73e8;">👁</a>`
      ).join(' ');
      uploadInfo = `<div style="font-size:12px;color:#555;margin-top:4px;">📎 ${s.links?.length || 0} file diupload oleh ${picNames} ${linkHtml}</div>`;
    } else if (isPending) {
      uploadInfo = `<div style="font-size:12px;color:#856404;margin-top:4px;">⏳ Form masuk tapi link kosong</div>`;
    } else {
      uploadInfo = `<div style="font-size:12px;color:#dc3545;margin-top:4px;">✖ Belum ada form upload yang masuk</div>`;
    }

    return `
      <div style="background:${cardBg};border-left:4px solid ${borderColor};border-radius:6px;padding:10px 14px;margin:6px 0;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-weight:700;font-size:14px;">${statusIcon} ${s.brand}</span>
            ${typeBadge}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:11px;color:#aaa;">${s.idLine || ''}</span>
            ${statusBadge}
          </div>
        </div>
        <div style="font-size:12px;color:#666;margin-top:4px;">🕐 ${s.startTime} → ${s.endTime} · 📍 ${s.studio} · ${s.mp}</div>
        ${uploadInfo}
      </div>`;
  }

  function renderDoneSection(shiftKey, done) {
    if (done.length === 0) return '';
    return `
      <div style="margin:8px 0;">
        <button onclick="toggleBtStatus('${shiftKey}','done')"
          style="width:100%;display:flex;align-items:center;gap:8px;padding:8px 14px;background:#d4edda;color:#155724;font-weight:600;font-size:13px;cursor:pointer;border:none;border-radius:6px;text-align:left;">
          ✅ Done
          <span style="background:rgba(0,0,0,0.12);border-radius:10px;padding:1px 8px;font-size:12px;">${done.length}</span>
          <span id="bt-status-chevron-${shiftKey}-done" style="margin-left:auto;">▸</span>
        </button>
        <div id="bt-status-body-${shiftKey}-done" style="display:none;padding:4px 0;">
          ${done.map(renderCard).join('')}
        </div>
      </div>`;
  }

  function renderNotDoneSection(shiftKey, notDone) {
    if (notDone.length === 0) return '';
    return `
      <div style="margin:8px 0;">
        <button onclick="toggleBtStatus('${shiftKey}','notdone')"
          style="width:100%;display:flex;align-items:center;gap:8px;padding:8px 14px;background:#f8d7da;color:#721c24;font-weight:600;font-size:13px;cursor:pointer;border:none;border-radius:6px;text-align:left;">
          ✖ Belum Upload / Link Kosong
          <span style="background:rgba(0,0,0,0.12);border-radius:10px;padding:1px 8px;font-size:12px;">${notDone.length}</span>
          <span id="bt-status-chevron-${shiftKey}-notdone" style="margin-left:auto;">▸</span>
        </button>
        <div id="bt-status-body-${shiftKey}-notdone" style="display:none;padding:4px 0;">
          ${notDone.map(renderCard).join('')}
        </div>
      </div>`;
  }

  function renderShiftGroup(shiftKey, label, emoji, shiftData) {
    const { done, notDone } = shiftData;
    if (done.length === 0 && notDone.length === 0) return '';

    const pillDone    = done.length > 0
      ? `<span style="background:#28a745;color:white;border-radius:12px;padding:2px 8px;font-size:12px;">${done.length} uploaded</span>` : '';
    const pillNotDone = notDone.length > 0
      ? `<span style="background:#dc3545;color:white;border-radius:12px;padding:2px 8px;font-size:12px;">${notDone.length} belum</span>` : '';

    return `
      <div style="margin:12px 0;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">
        <button onclick="toggleBtShift('${shiftKey}')"
          style="width:100%;display:flex;align-items:center;gap:10px;padding:12px 16px;background:#f0f4ff;font-weight:700;font-size:15px;cursor:pointer;border:none;text-align:left;">
          ${emoji} ${label}
          <span style="margin-left:auto;display:flex;align-items:center;gap:6px;">
            ${pillDone}${pillNotDone}
            <span id="bt-shift-chevron-${shiftKey}">▾</span>
          </span>
        </button>
        <div id="bt-shift-body-${shiftKey}" style="padding:8px 12px 12px;background:#fafafa;">
          ${renderDoneSection(shiftKey, done)}
          ${renderNotDoneSection(shiftKey, notDone)}
        </div>
      </div>`;
  }

  container.innerHTML = `
    <div style="padding:0 10px 24px;">
      <div style="text-align:center;margin-bottom:12px;padding-top:8px;">
        <strong style="font-size:16px;">🎬 Bukti Tayang</strong><br>
        <span style="color:#888;font-size:13px;">${data.date || ''}</span>
      </div>

      <div style="display:flex;gap:10px;margin-bottom:12px;">
        <div style="flex:1;background:#d4edda;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#155724;">${uploaded.length}</div>
          <div style="font-size:11px;color:#155724;">✅ UPLOADED</div>
        </div>
        <div style="flex:1;background:#fff3cd;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#856404;">${linkKosong.length}</div>
          <div style="font-size:11px;color:#856404;">⏳ LINK KOSONG</div>
        </div>
        <div style="flex:1;background:#f8d7da;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#721c24;">${missing.length}</div>
          <div style="font-size:11px;color:#721c24;">✖ BELUM UPLOAD</div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:4px;">
        <button onclick="forceRefreshBuktiTayang()"
          style="flex:1;padding:9px;background:#e8f0fe;border:1px solid #4285f4;border-radius:6px;cursor:pointer;font-weight:600;color:#1a73e8;font-size:13px;">
          🔄 Refresh
        </button>
        <button id="btn-copy-wa" onclick="copyBuktiTayangWA()"
          style="flex:1;padding:9px;background:#f0fff4;border:1px solid #28a745;border-radius:6px;cursor:pointer;font-weight:600;color:#155724;font-size:13px;">
          📋 Copy Tagihan WA
        </button>
      </div>

      ${renderShiftGroup('malam', 'Shift Malam  00:00 – 07:59', '🌙', shifts.malam)}
      ${renderShiftGroup('pagi',  'Shift Pagi   08:00 – 15:59', '🌅', shifts.pagi)}
      ${renderShiftGroup('siang', 'Shift Siang  16:00 – 23:59', '☀️', shifts.siang)}
    </div>
  `;
}


// ─────────────────────────────────────────────────────
// BUKTI TAYANG — COPY WA
// ─────────────────────────────────────────────────────

function copyBuktiTayangWA() {
  const data = _lastBuktiTayangData;
  if (!data || !data.sessions) { alert('Data belum loaded.'); return; }

  const belum = data.sessions.filter(s => s.status !== 'uploaded');
  if (belum.length === 0) { alert('Semua sudah upload! 🎉'); return; }

  // ─── FIX: 3 shift ───────────────────────────────────────
  const malam = belum.filter(s => getShiftBT(s.startTime) === 'malam');
  const pagi  = belum.filter(s => getShiftBT(s.startTime) === 'pagi');
  const siang = belum.filter(s => getShiftBT(s.startTime) === 'siang');
  // ─────────────────────────────────────────────────────────

  const d      = new Date();
  const bulan  = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const dateStr = `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;

  let text = `📋 *Bukti Tayang ${dateStr} — ${belum.length} Belum Upload*`;

  if (malam.length > 0) {
    text += `\n\n🌙 *Shift Malam (00:00–07:59)*\n`;
    text += malam.map(s => `• ${s.brand} - ${s.mp} (${s.startTime}–${s.endTime})`).join('\n');
  }
  if (pagi.length > 0) {
    text += `\n\n🌅 *Shift Pagi (08:00–15:59)*\n`;
    text += pagi.map(s => `• ${s.brand} - ${s.mp} (${s.startTime}–${s.endTime})`).join('\n');
  }
  if (siang.length > 0) {
    text += `\n\n☀️ *Shift Siang (16:00–23:59)*\n`;
    text += siang.map(s => `• ${s.brand} - ${s.mp} (${s.startTime}–${s.endTime})`).join('\n');
  }

  navigator.clipboard.writeText(text.trim())
    .then(() => {
      const btn = document.getElementById('btn-copy-wa');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        setTimeout(() => btn.innerHTML = orig, 2000);
      }
    })
    .catch(() => alert('Gagal copy. Coba lagi.'));
}






// ─────────────────────────────────────────────
// COPY TIMELINE
// ─────────────────────────────────────────────
function copyTimeline() {
  if (!sessions.length) { showBanner('Data belum loaded', 'warning'); return; }

  // Build events — sama persis dengan renderTimeline()
  const events = {};
  sessions.forEach(s => {
    if (s.startTime && s.startTime !== '-') {
      if (!events[s.startTime]) events[s.startTime] = { starts: [], ends: [] };
      events[s.startTime].starts.push(s);
    }
    if (s.endTime && s.endTime !== '-') {
      const endKey = (s.endTime === '00:00' || s.endTime === '23:59') ? '23:59/00:00' : s.endTime;
      if (!events[endKey]) events[endKey] = { starts: [], ends: [] };
      events[endKey].ends.push(s);
    }
  });

  // Sort waktu
  const sorted = Object.keys(events).sort((a, b) => {
    const f = t => t === '23:59/00:00' ? 1441 : (([h, m]) => h * 60 + m)(t.split(':').map(Number));
    return f(a) - f(b);
  });

  const lines = [];

  sorted.forEach(time => {
    const ev      = events[time];
    const display = time === '23:59/00:00' ? '23:59 / 00:00' : time;

    if (ev.starts.length > 0) {
      lines.push(`start ${display}`);
      ev.starts.forEach(s => {
        lines.push(`${s.brand}\t${s.marketplace}\t\t\t\t${s.studio}`);
      });
      lines.push('');
    }

    if (ev.ends.length > 0) {
      lines.push(`end ${display}`);
      ev.ends.forEach(s => {
        lines.push(`${s.brand}\t${s.marketplace}\t\t\t\t${s.studio}`);
      });
      lines.push('');
    }
  });

  const text = lines.join('\n').trim();

  navigator.clipboard.writeText(text)
    .then(() => {
      const btn = document.getElementById('btn-copy-timeline');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        setTimeout(() => btn.innerHTML = orig, 2000);
      }
      showBanner('✅ Timeline di-copy!', 'success');
    })
    .catch(() => showBanner('❌ Gagal copy', 'error'));
}


function copyTimeBlock(time, type, items, btn) {
  if (!items || !items.length) return;

  const display = time === '23:59/00:00' ? '23:59 / 00:00' : time;
  const lines   = [];

  lines.push(`${type.toUpperCase()} ${display}`);

  items.forEach((s, i) => {
    const picStr = formatPicForCopy(s.assignedPic || 'LSC');

    if (type === 'start') {
      // START: brand | mp | studio  host  @pic
      const host = s.hosts?.[0]?.host || '-';
      lines.push(`${i + 1}. ${s.brand} | ${s.marketplace} | ${s.studio} ${host}`);
    } else {
      // END: brand | mp | studio  @pic  (no host)
      lines.push(`${i + 1}. ${s.brand} | ${s.marketplace} | ${s.studio}`);
    }
  });

  navigator.clipboard.writeText(lines.join('\n'))
    .then(() => {
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => btn.textContent = orig, 2000);
      }
      showBanner(`✅ ${type === 'start' ? 'Start' : 'End'} ${display} di-copy!`, 'success');
    })
    .catch(() => showBanner('❌ Gagal copy', 'error'));
}



// ══════════════════════════════════════════════════════════════════
//  OPSTANDBY — CONFIG & HELPERS
// ══════════════════════════════════════════════════════════════════

const STANDBY_BRANDS_CFG = [
  { label:'SAMSONITE TIKTOK',          copyLabel:'STANDBY SAMSONITE TIKTOK', brand:'samsonite',          mp:'tiktok',  type:'floating',  perOperator:false },
  { label:'AMERICAN TOURISTER TIKTOK', copyLabel:'STANDBY AT TIKTOK',        brand:'american tourister', mp:'tiktok',  type:'floating',  perOperator:false },
  { label:'SAMSONITE SHOPEE',          copyLabel:'STANDBY SAMSONITE SHOPEE', brand:'samsonite',          mp:'shopee',  type:'floating',  perOperator:true  },
  { label:'AMERICAN TOURISTER SHOPEE', copyLabel:'STANDBY AT SHOPEE',        brand:'american tourister', mp:'shopee',  type:'dedicated', section:'amtour'  },
  { label:'ASICS SHOPEE',              copyLabel:'STBY ASICS',               brand:'asics',              mp:'shopee',  type:'dedicated', section:'asics'   },
];



// State
let _lastPicScheduleData = null;
let _standbyRrIndex = {}; // round-robin counter per brand label

// Konversi "HH:MM" → menit
function toMin(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Menit → "HH:MM"
function minToTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// Klasifikasi shift berdasarkan start time
function getShiftByStart(t) {
  if (!t) return 'siang';
  const m = toMin(t);
  if (m < 480) return 'malam';   // 00:00–07:59
  if (m < 960) return 'pagi';    // 08:00–15:59
  return 'siang';                // 16:00–23:59
}

// Shift boundary dalam menit: pagi/siang = 480 (08:00), siang/malam = 960 (16:00)
const SHIFT_BOUNDS = [480, 960, 1440];

function getBoundShift(min) {
  if (min < 480)  return 'malam';
  if (min < 960)  return 'pagi';
  return 'siang';
}

/**
 * Split slot host yang melintasi boundary shift.
 * Contoh: 14:00–17:00 → [{start:'14:00',end:'16:00',shift:'pagi'}, {start:'16:00',end:'17:00',shift:'siang'}]
 * Contoh: 08:00–10:00 → [{start:'08:00',end:'10:00',shift:'pagi'}]  (tidak split)
 */
function splitAtShiftBoundary(startStr, endStr) {
  let s = toMin(startStr);
  const e = toMin(endStr) || 1440;
  const result = [];

  for (const bound of SHIFT_BOUNDS) {
    if (s >= e) break;
    if (bound <= s) continue; // ✅ SKIP boundary yang sudah terlewat
    const segEnd = Math.min(e, bound);
    if (segEnd > s) {
      result.push({ start: minToTime(s), end: minToTime(segEnd), shift: getBoundShift(s) });
    }
    s = segEnd;
  }
  return result.length ? result : [{ start: startStr, end: endStr, shift: getShiftByStart(startStr) }];
}


/**
 * Fuzzy match session ke brand config.
 * Return true jika brand & marketplace cocok.
 */
function matchBrandConfig(session, cfg) {
  const brand = String(session.brand || session.Brand || '').toLowerCase();
  const mp    = String(session.marketplace || session.Marketplace || '').toLowerCase();
  return brand.includes(cfg.brand) && mp.includes(cfg.mp);
}

/**
 * Dari array segment [{start,end,shift}], merge per shift → earliest start, latest end.
 */
function mergeSessionTime(segments, shift) {
  const filtered = segments.filter(s => s.shift === shift);
  if (!filtered.length) return null;
  const starts = filtered.map(s => toMin(s.start));
  const ends   = filtered.map(s => toMin(s.end));
  return { start: minToTime(Math.min(...starts)), end: minToTime(Math.max(...ends)) };
}

/**
 * Ambil pool operator untuk shift tertentu dari picData.
 * sections: array section yang di-include, e.g. ['floating','intern']
 */
function getPoolForShift(picData, sections, shift) {
  return (picData || []).filter(p => sections.includes(p.section) && p.shift === shift);
}

// ══════════════════════════════════════════════════════════════════
//  LOAD & FETCH
// ══════════════════════════════════════════════════════════════════

async function loadStandby(force = false) {
  const el = document.getElementById('schedule-list');
  if (!el) return;

  // ✅ FIX-7a: Jika dipanggil saat bukan di tab standby, skip render tapi tetap fetch cache
  const isActive = () => activeTab === 'standby';

  // Jika ada cache PIC & tidak force → pakai cache PIC, refresh schedule saja
  if (_lastPicScheduleData && !force) {
    if (isActive()) renderStandby(null, _lastPicScheduleData); // ✅ guard
  } else {
    if (isActive()) el.innerHTML = '<p class="loading">Memuat data standby...</p>'; // ✅ guard
  }

  try {
    const base = API_URL;
    const ts   = force ? `&nocache=${Date.now()}` : '';

    // Parallel fetch schedule + picschedule
    const [schedResp, picResp] = await Promise.all([
      fetch(`${base}?action=schedule${ts}`).then(r => r.json()),
      fetch(`${base}?action=picschedule${ts}`).then(r => r.json()),
    ]);

    // GANTI:
    if (picResp && picResp.pics) {
      // ✅ Swap pagi↔siang karena API label-nya kebalik
      _lastPicScheduleData = picResp.pics.map(p => ({
        ...p,
        shift: p.shift === 'pagi' ? 'siang' : p.shift === 'siang' ? 'pagi' : p.shift
      }));
    }

    // ✅ FIX-7b: Setelah await selesai, cek lagi — user mungkin sudah pindah tab
    if (!isActive()) return;
    renderStandby(schedResp, _lastPicScheduleData);

  } catch(err) {
    console.error('loadStandby error:', err);
    if (!_lastPicScheduleData) {
      if (isActive()) el.innerHTML = `<p class="error">Gagal memuat data: ${err.message}</p>`; // ✅ guard
    }
  }
}


async function forceRefreshStandby() {
  _lastPicScheduleData = null;
  _standbyRrIndex = {};
  await loadStandby(true);
}

// ══════════════════════════════════════════════════════════════════
//  RENDER STANDBY
// ══════════════════════════════════════════════════════════════════

function renderStandby(schedData, picData) {
  const el = document.getElementById('schedule-list');
  if (!el) return;
  if (!picData || !picData.length) {
    el.innerHTML = '<p class="empty">Data PIC belum tersedia.</p>';
    return;
  }

  _lastStandbySchedData = schedData;
  _standbyRrIndex = {};

  const sessions        = (schedData && schedData.sessions) ? schedData.sessions : [];
  const SHIFTS          = ['pagi', 'siang', 'malam'];
  const globalAssigned  = { pagi: new Set(), siang: new Set(), malam: new Set() };

  let html = '';

  // ── SECTION 1: PIC SHIFT ──────────────────────────────────────
  html += `<div class="standby-section"><h3>👤 PIC SHIFT</h3>`;
  for (const shift of SHIFTS) {
    const ops = picData.filter(p => p.shift === shift);
    if (!ops.length) continue;
    const lbl = shift.charAt(0).toUpperCase() + shift.slice(1);
    html += `<div class="shift-block shift-${shift}">`;
    html += `<div class="shift-header">${shiftEmoji(shift)} Shift ${lbl}</div><ul>`;
    for (const op of ops) {
      const st = op.studios && op.studios.length
        ? ` <span class="studio-badge">Studio ${op.studios.join(', ')}</span>` : '';
      html += `<li><strong>${op.name}</strong> <span class="section-tag">${op.section}</span>${st}</li>`;
    }
    html += `</ul></div>`;
  }
  html += `</div>`;

  // ── SECTION 2: STANDBY BRAND ──────────────────────────────────
  html += `<div class="standby-section"><h3>🎯 STANDBY BRAND</h3>`;

  for (const cfg of STANDBY_BRANDS_CFG) {
    html += `<div class="brand-standby-block">`;
    html += `<div class="brand-standby-header">${cfg.label}</div>`;

    const brandSessions = sessions.filter(s => matchBrandConfig(s, cfg));

    if (!brandSessions.length) {
      html += `<p class="empty-ops">Tidak ada jadwal live hari ini.</p>`;

    } else if (cfg.type === 'dedicated') {
      // ── DEDICATED: per shift, fallback floating jika no section op ──
      const sectionOps = picData.filter(p => p.section === cfg.section);
      const shiftCov   = getStandbyShiftCoverage(getStandbyHostSlots(brandSessions));
      if (!_standbyRrIndex[cfg.label]) _standbyRrIndex[cfg.label] = {};
      const rrState    = _standbyRrIndex[cfg.label];
      let anyRow       = false;

      for (const shift of SHIFTS) {
        const cov = shiftCov[shift];
        if (!cov) continue;

        let ops = sectionOps.filter(p => p.shift === shift);
        if (ops.length) {
          // Dedicated section op → track di globalAssigned
          ops.forEach(o => globalAssigned[shift].add(o.name));
        } else {
          // Fallback: ambil 1 dari floating pool (prefer belum dipakai)
          const pool = getPoolForShift(picData, ['floating', 'intern'], shift);
          if (!pool.length) continue;
          const picked = pickStandbyOp(pool, shift, globalAssigned, rrState);
          if (picked) ops = [picked];
        }
        if (!ops.length) continue;

        const lbl = shift.charAt(0).toUpperCase() + shift.slice(1);
        html += `<div class="standby-row">`;
        html += `<span class="shift-pill shift-${shift}">${shiftEmoji(shift)} ${lbl} (${cov.start}–${cov.end})</span>`;
        html += `<span class="ops-list">${ops.map(o => o.name).join(', ')}</span>`;
        html += `</div>`;
        anyRow = true;
      }
      if (!anyRow) html += `<p class="empty-ops">Tidak ada data shift hari ini.</p>`;

    } else if (cfg.type === 'floating') {
      // ── FLOATING: per host slot (chaining), 1 op (prefer belum dipakai) ──
      if (!_standbyRrIndex[cfg.label]) _standbyRrIndex[cfg.label] = {};
      const rrState  = _standbyRrIndex[cfg.label];
      const allSlots = getStandbyHostSlots(brandSessions);

      if (!allSlots.length) {
        html += `<p class="empty-ops">Tidak ada jadwal live hari ini.</p>`;
      } else {
        for (const slot of allSlots) {
          for (const seg of splitAtShiftBoundary(slot.start, slot.end)) {
            const pool = getPoolForShift(picData, ['floating', 'intern'], seg.shift);
            html += `<div class="standby-row">`;
            html += `<span class="shift-pill shift-${seg.shift}">${shiftEmoji(seg.shift)} ${seg.start}–${seg.end}</span>`;
            if (!pool.length) {
              html += `<span class="ops-list">—</span>`;
            } else {
              const assigned = pickStandbyOp(pool, seg.shift, globalAssigned, rrState);
              html += `<span class="ops-list"><strong>${assigned.name}</strong></span>`;
            }
            html += `</div>`;
          }
        }
      }
    }

    html += `<button class="copy-btn-sm" onclick="copyBrandStandby('${cfg.label}')">📋 Copy</button>`;
    html += `</div>`;
  }

  html += `</div>`;
  html += `<div class="standby-actions">
    <button class="btn-copy-standby" onclick="copyAllStandby()">📋 Copy All Reminder</button>
    <button class="refresh-btn" onclick="forceRefreshStandby()">🔄 Refresh</button>
  </div>`;

  el.innerHTML = html;
}






// ── Emoji helper per shift
function shiftEmoji(shift) {
  return shift === 'pagi' ? '🌅' : shift === 'siang' ? '☀️' : '🌙';
}

// ══════════════════════════════════════════════════════════════════
//  COPY REMINDER WA
// ══════════════════════════════════════════════════════════════════

/**
 * Copy full reminder OPStandby untuk WA.
 * Format:
 * 📋 *OPS STANDBY — [TANGGAL]*
 * ...
 */
function copyStandbyReminder() {
  if (!_lastPicScheduleData) {
    alert('Data PIC belum dimuat. Refresh dulu.');
    return;
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).toUpperCase();

  let lines = [];
  lines.push(`📋 *OPS STANDBY — ${dateStr}*`);
  lines.push('');

  const SHIFTS = ['pagi','siang','malam'];

  // PIC SHIFT
  lines.push('*👤 PIC SHIFT*');
  for (const shift of SHIFTS) {
    const ops = _lastPicScheduleData.filter(p => p.shift === shift);
    if (!ops.length) continue;
    const shiftLabel = shift.charAt(0).toUpperCase() + shift.slice(1);
    lines.push(`${shiftEmoji(shift)} *Shift ${shiftLabel}:* ${ops.map(o => o.name).join(', ')}`);
  }
  lines.push('');

  // STANDBY BRAND
  lines.push('*🎯 STANDBY BRAND*');

  // Rebuild dari state terakhir — kita ambil dari DOM karena schedule data mungkin sudah di-render
  // Cara paling reliable: re-compute dari _lastScheduleData
  // → Karena renderStandby() sudah render, kita copy teks dari elemen DOM
  const brandBlocks = document.querySelectorAll('.brand-standby-block');
  for (const block of brandBlocks) {
    const header = block.querySelector('.brand-standby-header')?.textContent || '';
    lines.push(`\n*${header}*`);
    const rows = block.querySelectorAll('.standby-row');
    for (const row of rows) {
      const pill = row.querySelector('.shift-pill')?.textContent?.trim() || '';
      const ops  = row.querySelector('.ops-list')?.textContent?.trim() || '';
      lines.push(`  ${pill}: ${ops}`);
    }
  }

  const text = lines.join('\n');
  navigator.clipboard.writeText(text)
    .then(() => showBanner('✅ Reminder OPStandby berhasil dicopy!', 'success'))
    .catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      showBanner('✅ Reminder OPStandby berhasil dicopy!', 'success');
    });

}

/**
 * Copy reminder untuk 1 brand spesifik.
 */
function copyBrandStandby(label) {
  const blocks = document.querySelectorAll('.brand-standby-block');
  for (const block of blocks) {
    const header = block.querySelector('.brand-standby-header')?.textContent || '';
    if (header !== label) continue;

    let lines = [`*${label}*`];
    const rows = block.querySelectorAll('.standby-row');
    for (const row of rows) {
      const pill = row.querySelector('.shift-pill')?.textContent?.trim() || '';
      const ops  = row.querySelector('.ops-list')?.textContent?.trim() || '';
      lines.push(`  ${pill}: ${ops}`);
    }
    const text = lines.join('\n');
    navigator.clipboard.writeText(text)
      .then(() => showBanner(`✅ Copy ${label} berhasil!`, 'success'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
        showBanner(`✅ Copy ${label} berhasil!`, 'success');
      });

    return;
  }
}


let _lastStandbySchedData = null; // ← TAMBAH INI


async function copyAllStandby() {
  const picData   = _lastPicScheduleData;
  const schedData = _lastStandbySchedData;
  if (!picData || !picData.length) { showBanner('⚠️ Data PIC belum tersedia', 'warning'); return; }

  const sessions       = (schedData && schedData.sessions) ? schedData.sessions : [];
  const SHIFTS         = ['pagi', 'siang', 'malam'];
  const globalAssigned = { pagi: new Set(), siang: new Set(), malam: new Set() };
  const rrCopy         = {};
  const fmtT           = t => (t && t !== '-') ? t.replace(/:00$/, '') : '-';

  const today   = new Date();
  const dateStr = today.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' }).toUpperCase();

  let lines = [`REMINDER ${dateStr}`, ''];

  // ── PIC SHIFT ──────────────────────────────────────────────────
  for (const shift of SHIFTS) {
    const ops = picData.filter(p => p.shift === shift && p.studios && p.studios.length > 0);
    if (!ops.length) continue;
    lines.push(`PIC SHIFT ${shift.toUpperCase()}`);
    for (const op of ops) lines.push(`${op.name}\t${op.studios.join(',')}`);
    lines.push('');
  }

  // ── STANDBY BRAND ──────────────────────────────────────────────
  for (const cfg of STANDBY_BRANDS_CFG) {
    const brandSessions = sessions.filter(s => matchBrandConfig(s, cfg));
    const brandLines    = [];

    if (!rrCopy[cfg.label]) rrCopy[cfg.label] = {};
    const rrState = rrCopy[cfg.label];

    if (cfg.type === 'dedicated') {
      const sectionOps = picData.filter(p => p.section === cfg.section);
      const shiftCov   = getStandbyShiftCoverage(getStandbyHostSlots(brandSessions));

      for (const shift of SHIFTS) {
        if (!shiftCov[shift]) continue;
        let ops = sectionOps.filter(p => p.shift === shift);
        if (ops.length) {
          ops.forEach(o => globalAssigned[shift].add(o.name));
        } else {
          const pool = getPoolForShift(picData, ['floating', 'intern'], shift);
          if (!pool.length) continue;
          const picked = pickStandbyOp(pool, shift, globalAssigned, rrState);
          if (picked) ops = [picked];
        }
        if (!ops.length) continue;
        const lbl = shift.charAt(0).toUpperCase() + shift.slice(1);
        brandLines.push(`${lbl.toUpperCase()} : ${ops.map(o => o.name).join(', ')}`);
      }

    } else if (cfg.type === 'floating') {
      for (const slot of getStandbyHostSlots(brandSessions)) {
        for (const seg of splitAtShiftBoundary(slot.start, slot.end)) {
          const pool = getPoolForShift(picData, ['floating', 'intern'], seg.shift);
          if (!pool.length) { brandLines.push(`${fmtT(seg.start)}-${fmtT(seg.end)} —`); continue; }
          const assigned = pickStandbyOp(pool, seg.shift, globalAssigned, rrState);
          brandLines.push(`${fmtT(seg.start)}-${fmtT(seg.end)} ${assigned.name.toUpperCase()}`);
        }
      }
    }

    if (brandLines.length) {
      lines.push(cfg.copyLabel || `STANDBY ${cfg.label}`);
      lines.push(...brandLines);
      lines.push('');
    }
  }

  // ── Notes & Links ───────────────────────────────────────────
  lines.push('1. BACK UP HOST SELAIN ASICS, AT, dan SAMSO WAJIB HAND TALENT');
  lines.push('2. CEK KEHADIRAN HOST BAIK SINGLE HOST/MARATHON DAN LAPOR KE GRUP HOST TAG TALCO KALO 30 SEBELUM LIVE HOST SELANJUTNYA BELUM DATANG');
  lines.push('3. PASTIKAN SEMUA STUDIO ADA AKUN ABSEN HOST');
  lines.push('');
  lines.push('Form bukti tayang:');
  lines.push('https://forms.gle/J8WG4kmQap7h6VcZ7');
  lines.push('');
  lines.push('SLAB Host Report:');
  lines.push('https://docs.google.com/spreadsheets/d/1vbjwOFg_vmyJNs9UXuLMJF-TekN6xfomAzXy-zoDP7o/edit?gid=0#gid=0');
  lines.push('');
  lines.push('LINK Insight American Tourister dan Samsonite:');
  lines.push('https://docs.google.com/spreadsheets/d/1dTDvRuYPYZ5_5Z4t6sUAP3myjE_mo23RlVkhU-rPk0E/edit?gid=1067297791#gid=1067297791');
  lines.push('');
  lines.push('Upload Screenshot LS Streamlab (Responses) 2.0 (GMV Uploadan host)');
  lines.push('https://docs.google.com/spreadsheets/d/1XhC8QOC9loOCODjMRkdNa4yfl8BeDVZct8wsFbeeIz0/edit?resourcekey=&gid=743892642#gid=743892642');

  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showBanner('✅ Reminder berhasil dicopy!', 'success');
  } catch(e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showBanner('✅ Reminder berhasil dicopy!', 'success');
  }
}



// ── STANDBY HELPERS ──────────────────────────────────────────

// Rekonstruksi slot per host via chaining (ignore h.start, pakai prevEnd)
function getStandbyHostSlots(brandSessions) {
  const raw = [];
  for (const s of brandSessions) {
    const hosts = (s.hosts && s.hosts.length) ? s.hosts : null;
    if (!hosts) {
      const st = s.start ?? s.startTime ?? null;
      const en = s.end   ?? s.endTime   ?? null;
      if (st && en && st !== '-' && en !== '-') raw.push({ start: st, end: en });
      continue;
    }
    for (const h of hosts) {
      // ✅ h.start & h.end sudah benar dari API — pakai langsung, JANGAN chain!
      const st = h.startTime ?? h.start ?? null;
      const en = h.endTime   ?? h.end   ?? null;
      if (!st || !en || st === '-' || en === '-') continue;
      raw.push({ start: st, end: en });
    }
  }
  const seen = new Set();
  return raw
    .filter(s => { const k=`${s.start}|${s.end}`; if(seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}


// Pick operator: prefer yang belum dipakai brand lain (globalAssigned)
function pickStandbyOp(pool, shift, globalAssigned, rrState) {
  if (rrState[shift] === undefined) rrState[shift] = 0;
  for (let i = 0; i < pool.length; i++) {
    const idx = (rrState[shift] + i) % pool.length;
    const op  = pool[idx];
    if (!globalAssigned[shift].has(op.name)) {
      rrState[shift] = idx + 1;
      globalAssigned[shift].add(op.name);
      return op;
    }
  }
  // Semua sudah dipakai → fallback RR biasa
  const op = pool[rrState[shift] % pool.length];
  rrState[shift]++;
  return op;
}

// Hitung coverage waktu per shift dari list slots
function getStandbyShiftCoverage(slots) {
  const cov = {};
  for (const slot of slots) {
    for (const seg of splitAtShiftBoundary(slot.start, slot.end)) {
      if (!cov[seg.shift]) {
        cov[seg.shift] = { start: seg.start, end: seg.end };
      } else {
        if (toMin(seg.start) < toMin(cov[seg.shift].start)) cov[seg.shift].start = seg.start;
        if (toMin(seg.end)   > toMin(cov[seg.shift].end))   cov[seg.shift].end   = seg.end;
      }
    }
  }
  return cov;
}


/* =========================================
   FITUR MCR MONITORING (Sistem Lama 27 WebSocket, Smart Sort, & Scheduler)
========================================= */

let _mcrInitialized = false;
let _mcrStudios = {}; 
let _indoVoice = null; 
let _isMcrUnlocked = false; 

// Daftar PIN dan Pinned Studios
const MCR_SECRET_PIN = "134760"; 
let _pinnedStudios = JSON.parse(localStorage.getItem('mcrPinnedStudios')) || [];

window.speechSynthesis.onvoiceschanged = () => {
    let voices = window.speechSynthesis.getVoices();
    _indoVoice = voices.find(v => v.lang === 'id-ID' || v.name.includes('Indonesia'));
};

const MCR_CONFIG = [
    { id: 1, ip: "ws://192.168.100.237:4455", pw: "123456" },
    { id: 2, ip: "ws://192.168.100.208:4455", pw: "123456" },
    { id: 5, ip: "ws://192.168.100.68:4455", pw: "123456" },
    { id: 6, ip: "ws://192.168.100.58:4455", pw: "123456" },
    { id: 7, ip: "ws://192.168.100.55:4455", pw: "123456" },
    { id: 8, ip: "ws://192.168.100.192:4455", pw: "123456" },
    { id: 9, ip: "ws://192.168.100.70:4455", pw: "123456" },
    { id: 10, ip: "ws://192.168.100.65:4455", pw: "123456" },
    { id: 11, ip: "ws://192.168.100.162:4455", pw: "123456" },
    { id: 12, ip: "ws://192.168.100.224:4455", pw: "123456" },
    { id: 15, ip: "ws://192.168.100.212:4455", pw: "123456" },
    { id: 17, ip: "ws://192.168.100.233:4455", pw: "123456" },
    { id: 18, ip: "ws://192.168.100.136:4455", pw: "123456" },
    { id: 19, ip: "ws://192.168.100.61:4455", pw: "123456" },
    { id: 20, ip: "ws://192.168.100.246:4455", pw: "123456" },
    { id: 21, ip: "ws://192.168.100.188:4455", pw: "123456" },
    { id: 22, ip: "ws://192.168.100.113:4455", pw: "123456" },
    { id: 23, ip: "ws://192.168.100.214:4455", pw: "123456" },
    { id: 25, ip: "ws://192.168.100.60:4455", pw: "123456" },
    { id: 26, ip: "ws://192.168.100.228:4455", pw: "123456" },
    { id: 29, ip: "ws://192.168.100.64:4455", pw: "123456" }
];

const cssPulse = `
@keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(220, 53, 69, 0); } 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); } }
@keyframes pulse-yellow { 0% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(255, 193, 7, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0); } }
.blink-tech { animation: pulse-red 1.5s infinite; border: 2px solid #dc3545 !important; }
.blink-toilet { animation: pulse-yellow 1.5s infinite; border: 2px solid #ffc107 !important; }
`;
const styleSheet = document.createElement("style");
styleSheet.innerText = cssPulse;
document.head.appendChild(styleSheet);


// === FUNGSI MENCARI JADWAL LIVE SEKARANG (Berdasarkan Sesi Utuh / 1 ID Line) ===
function getStudioCurrentSchedule(studioId) {
    if (!sessions || sessions.length === 0) return null;
    let now = new Date();
    let currentMin = now.getHours() * 60 + now.getMinutes();

    for (let s of sessions) {
        let schedStudioStr = s.studio ? String(s.studio).toLowerCase() : "";
        let schedStudioNum = schedStudioStr.match(/\d+/);
        
        if (schedStudioNum && parseInt(schedStudioNum[0]) === studioId) {
            let sessionStartMin = 1440;
            let sessionEndMin = 0;
            let startTimeStr = "00:00";
            let endTimeStr = "00:00";

            if (s.hosts && s.hosts.length > 0) {
                // Cari titik awal dan akhir dari seluruh host di ID Line ini
                for (let h of s.hosts) {
                    let start = toMin(h.startTime);
                    let end = toMin(h.endTime);
                    if (end === 0) end = 1440;
                    
                    if (start < sessionStartMin) {
                        sessionStartMin = start;
                        startTimeStr = h.startTime; 
                    }
                    if (end > sessionEndMin) {
                        sessionEndMin = end;
                        endTimeStr = h.endTime; 
                    }
                }
                
                // Toleransi: Mulai membaca 15 menit sebelum start, sampai 15 menit sesudah end
                if (currentMin >= (sessionStartMin - 15) && currentMin <= (sessionEndMin + 15)) {
                    // Cari tahu Host mana yang sedang bertugas di detik ini
                    let currentActiveHost = "Multiple Hosts";
                    for (let h of s.hosts) {
                        let hStart = toMin(h.startTime);
                        let hEnd = toMin(h.endTime);
                        if (hEnd === 0) hEnd = 1440;
                        if (currentMin >= hStart && currentMin <= hEnd) {
                            currentActiveHost = h.host;
                            break; 
                        }
                    }

                    return {
                        brand: s.brand || "Brand Unknown",
                        startTime: startTimeStr,
                        endTime: endTimeStr,
                        host: currentActiveHost
                    }; 
                }
            }
        }
    }
    return null; // Tidak ada jadwal untuk studio ini di jam sekarang
}


function renderMCR() {
    const el = document.getElementById('schedule-list');
    if (!el) return;
    
    if (!_isMcrUnlocked) {
        el.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; min-height: 400px;">
                <div class="card p-4 shadow-sm" style="width: 350px; text-align: center; border-top: 5px solid #0d6efd;">
                    <h4 class="mb-3">Login to MCR System</h4>
                    <p class="text-muted small mb-4">Master Control Room</p>
                    <input type="password" id="mcr-pin-input" class="form-control text-center mb-3" placeholder="PIN Input" maxlength="6" style="font-size: 1.5rem; letter-spacing: 5px;">
                    <button class="btn btn-primary w-100 fw-bold" onclick="verifyMcrPin()">Login</button>
                    <div id="mcr-pin-error" class="text-danger small mt-2" style="display:none;">PIN Salah!</div>
                </div>
            </div>
        `;
        setTimeout(() => {
            const input = document.getElementById('mcr-pin-input');
            if(input) input.addEventListener("keypress", function(e) { if (e.key === "Enter") verifyMcrPin(); });
        }, 100);
        return;
    }

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <h5 style="margin: 0;">📡 MCR Network & Audio Monitor</h5>
            <button class="btn btn-sm btn-primary" onclick="initMCRConnections()" id="btn-connect-mcr">Connect All Studios</button>
        </div>
        <div id="mcr-grid" style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: flex-start;">
    `;

    // === SMART SORTING (Prioritas: Pin > Jadwal Live > OBS Online > Kosong) ===
    let sortedConfig = [...MCR_CONFIG].sort((a, b) => {
        let aState = _mcrStudios[a.id] || {};
        let bState = _mcrStudios[b.id] || {};

        // 1. PIN SELALU NOMOR 1
        let aPinned = _pinnedStudios.includes(a.id);
        let bPinned = _pinnedStudios.includes(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        // 2. CEK JADWAL LIVE SEKARANG
        let aHasSchedule = getStudioCurrentSchedule(a.id) !== null;
        let bHasSchedule = getStudioCurrentSchedule(b.id) !== null;
        
        if (aHasSchedule && !bHasSchedule) return -1;
        if (!aHasSchedule && bHasSchedule) return 1;

        // 3. JIKA SAMA (Sama-sama ada jadwal atau kosong), CEK OBS ONLINE
        let aIsOnline = aState.isConnected;
        let bIsOnline = bState.isConnected;

        if (aIsOnline && !bIsOnline) return -1;
        if (!aIsOnline && bIsOnline) return 1;

        // 4. JIKA SAMA ONLINE, CEK STATUS STREAMING (Mencegah Studio Mati nyempil di atas)
        let aIsStreaming = aState.isCurrentlyStreaming;
        let bIsStreaming = bState.isCurrentlyStreaming;

        if (aIsStreaming && !bIsStreaming) return -1;
        if (!aIsStreaming && bIsStreaming) return 1;

        // 5. SISANYA URUTKAN BERDASARKAN NOMOR STUDIO
        return a.id - b.id;
    });

    sortedConfig.forEach(s => {
        let st = _mcrStudios[s.id] || {};
        let isConnected = st.isConnected ? true : false;
        let isPinned = _pinnedStudios.includes(s.id);
        
        let pinIcon = isPinned ? '📌' : '📍';
        let pinColor = isPinned ? '#0d6efd' : 'gray';
        let statusText = isConnected ? "🟢 Online" : "⚫ Offline";
        
        let bgStyle = 'background: white; border: 1px solid transparent; border-left: 4px solid gray;';
        if (st.currentSeverity === 'critical') bgStyle = 'background: #fff5f5; border: 1px solid transparent; border-left: 4px solid #dc3545; box-shadow: 0 0 10px rgba(220,53,69,0.5);';
        else if (st.currentSeverity === 'warning') bgStyle = 'background: #fffdf5; border: 1px solid transparent; border-left: 4px solid #ffc107;';
        else if (st.currentSeverity === 'inactive') bgStyle = 'background: #f8f9fa; border: 1px solid transparent; border-left: 4px solid gray;';
        else if (isConnected) bgStyle = `background: ${isPinned ? '#f8faff' : 'white'}; border: 1px solid ${isPinned ? '#cce5ff' : 'transparent'}; border-left: 4px solid var(--bs-success);`;

        let mpDisplay = "none", mpName = "UNKNOWN", mpColor = "#6c757d", mpBg = "#e9ecef";
        if (isConnected && st.lastMpName && st.lastMpName !== "CUSTOM") {
            mpDisplay = "inline-block"; mpName = st.lastMpName; mpColor = st.lastMpColor; mpBg = st.lastMpBg;
        }

        // --- TAMPILKAN DATA JADWAL (BRAND & JAM) ---
        let currentSched = getStudioCurrentSchedule(s.id);
        let infoJadwalHtml = "";
        
        if (currentSched) {
            infoJadwalHtml = `
                <div style="background: #eef2f5; padding: 6px; border-radius: 4px; margin-bottom: 10px; border-left: 3px solid #0d6efd;">
                    <div style="font-weight: bold; font-size: 0.75rem; color: #0d6efd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentSched.brand}</div>
                    <div style="font-size: 0.7rem; color: #495057;">🕛 ${currentSched.startTime} - ${currentSched.endTime} | 🎤 ${currentSched.host}</div>
                </div>
            `;
        } else {
            infoJadwalHtml = `
                <div style="background: #f8f9fa; padding: 6px; border-radius: 4px; margin-bottom: 10px; border: 1px dashed #dee2e6; text-align: center;">
                    <span style="font-size: 0.7rem; color: #adb5bd; font-style: italic;">Tidak ada sesi live</span>
                </div>
            `;
        }

        html += `
            <div style="flex: 0 0 auto; width: 220px;" id="mcr-wrap-${s.id}">
                <div id="mcr-card-${s.id}" style="${bgStyle} border-radius: 8px; padding: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); transition: all 0.3s ease; position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 8px;">
                        <div style="font-weight: bold; font-size: 1rem;">Studio ${s.id}</div>
                        <button onclick="togglePinStudio(${s.id})" class="btn btn-sm" style="padding: 0 5px; font-size: 1rem; color: ${pinColor}; background: none; border: none;" title="Pin Studio ini ke atas">
                            ${pinIcon}
                        </button>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div id="mcr-status-${s.id}" style="font-size: 0.8rem; color: gray;">${statusText}</div>
                        <span id="mcr-mp-${s.id}" style="font-size: 0.65rem; padding: 2px 5px; border-radius: 4px; background: ${mpBg}; color: ${mpColor}; display: ${mpDisplay}; font-weight: bold;">${mpName}</span>
                    </div>

                    ${infoJadwalHtml}

                    <div id="mcr-help-alert-${s.id}" style="display: none; padding: 6px; border-radius: 5px; text-align: center; font-weight: bold; font-size: 0.8rem; margin-bottom: 10px; cursor: pointer;">
                        🚨 BANTUAN
                    </div>

                    <div style="font-size: 0.9rem; display: flex; flex-direction: column; gap: 10px;">
                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                                <span>🔈</span>
                                <span id="mcr-audio-${s.id}" style="font-weight: bold; font-size: 0.8rem; color: gray;">-60.0 dB</span>
                            </div>
                            <div style="height: 6px; width: 100%; background-color: #e9ecef; border-radius: 3px; overflow: hidden;">
                                <div id="mcr-audio-bar-${s.id}" style="height: 100%; width: 0%; background-color: #198754; transition: width 0.1s ease-out, background-color 0.2s;"></div>
                            </div>
                            <div id="mcr-audio-warn-${s.id}" style="font-size: 0.7rem; color: #dc3545; display: none; margin-top: 4px;">⚠️ Mic Mati / No Audio</div>
                        </div>

                        <div>
                            📶 <span id="mcr-bitrate-${s.id}" style="font-weight: bold; color: gray;">0 kbps</span>
                            <div id="mcr-net-warn-${s.id}" style="font-size: 0.7rem; color: #ffc107; display: none; margin-top: 2px;">⚠️ Tidak Stabil</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    el.innerHTML = html;

    if (_mcrInitialized) {
        const btn = document.getElementById('btn-connect-mcr');
        if(btn) {
            btn.innerText = "Mengawasi Studio...";
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
            btn.disabled = true;
        }
    }
}

// Render Ulang (Sort) tiap 30 detik untuk memperbarui layout MCR
setInterval(() => {
    if (_isMcrUnlocked && activeTab === "mcr") renderMCR();
}, 30000);


function togglePinStudio(studioId) {
    if (_pinnedStudios.includes(studioId)) {
        _pinnedStudios = _pinnedStudios.filter(id => id !== studioId);
    } else {
        _pinnedStudios.push(studioId);
    }
    localStorage.setItem('mcrPinnedStudios', JSON.stringify(_pinnedStudios));
    renderMCR(); 
}

function verifyMcrPin() {
    const inputVal = document.getElementById('mcr-pin-input').value;
    const errorEl = document.getElementById('mcr-pin-error');
    if (inputVal === MCR_SECRET_PIN) {
        _isMcrUnlocked = true;
        renderMCR(); 
        showBanner("Akses MCR Terbuka", "success");
    } else {
        errorEl.style.display = "block";
        document.getElementById('mcr-pin-input').value = ""; 
        setTimeout(() => { errorEl.style.display = "none"; }, 3000);
    }
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && activeTab === "mcr" && _mcrInitialized && _isMcrUnlocked) {
        MCR_CONFIG.forEach(async (studio) => {
            const obsState = _mcrStudios[studio.id];
            if (obsState && obsState.isConnected) {
                const statusEl = document.getElementById(`mcr-status-${studio.id}`);
                const cardEl = document.getElementById(`mcr-card-${studio.id}`);
                if (statusEl) statusEl.innerText = "🟢 Online";
                if (cardEl && !cardEl.className.includes("blink")) cardEl.style.borderLeftColor = "var(--bs-success)";

                try {
                    const streamSettings = await obsState.obs.call('GetStreamServiceSettings');
                    const serverUrl = streamSettings.streamServiceSettings?.server || "";
                    const mpBadge = document.getElementById(`mcr-mp-${studio.id}`);
                    if (mpBadge) {
                        let mpInfo = detectMarketplace(serverUrl);
                        obsState.lastMpName = mpInfo.name;
                        mpBadge.innerText = mpInfo.name;
                        mpBadge.style.color = mpInfo.color;
                        mpBadge.style.background = mpInfo.bg;
                        if (mpInfo.name !== "CUSTOM" || serverUrl !== "") mpBadge.style.display = "inline-block";
                    }
                } catch (err) {}
            }
        });
    }
});

function detectMarketplace(serverUrl) {
    if (!serverUrl) return { name: "CUSTOM", color: "#6c757d", bg: "#e9ecef" };
    let url = serverUrl.toLowerCase();
    if (url.includes("tiktok")) return { name: "TIKTOK", color: "#ffffff", bg: "#000000" };
    if (url.includes("shopee")) return { name: "SHOPEE", color: "#ffffff", bg: "#ee4d2d" };
    if (url.includes("tokopedia")) return { name: "TOKOPEDIA", color: "#ffffff", bg: "#03ac0e" };
    if (url.includes("lazada")) return { name: "LAZADA", color: "#ffffff", bg: "#0f136d" };
    if (url.includes("youtube")) return { name: "YOUTUBE", color: "#ffffff", bg: "#ff0000" };
    if (url.includes("facebook")) return { name: "FACEBOOK", color: "#ffffff", bg: "#1877f2" };
    return { name: "RTMP", color: "#ffffff", bg: "#6c757d" }; 
}

async function initMCRConnections() {
    if (_mcrInitialized) return;

    showBanner("Menyambungkan ke OBS...", "success");
    _mcrInitialized = true;
    renderMCR(); 

    MCR_CONFIG.forEach(async (studio) => {
        _mcrStudios[studio.id] = { 
            obs: new OBSWebSocket(), 
            silentSeconds: 0,       
            staticNoiseSeconds: 0,  
            lastDbHistory: [],
            alarmPlayed: false,
            lastUiUpdate: 0,
            lastBytes: 0,
            lastDroppedFrames: 0,
            isConnected: false,
            toiletLastUsed: 0, 
            isHelpActive: false,
            lastMpName: null, lastMpColor: null, lastMpBg: null,
            lastAliveTime: Date.now(),
            isCurrentlyStreaming: false,
            currentSeverity: 'inactive'
        };
        
        const obs = _mcrStudios[studio.id].obs;
        let lastAudioCheckTime = Date.now(); 

        obs.on('ConnectionClosed', () => {
            _mcrStudios[studio.id].isConnected = false;
            if (activeTab === "mcr" && _isMcrUnlocked) {
                const statusEl = document.getElementById(`mcr-status-${studio.id}`);
                const cardEl = document.getElementById(`mcr-card-${studio.id}`);
                if (statusEl) statusEl.innerText = "⚫ Disconnected";
                if (cardEl) {
                    cardEl.style.backgroundColor = "#e9ecef";
                    cardEl.style.borderLeftColor = "gray";
                    cardEl.style.boxShadow = "none";
                }
            }
        });

        try {
            await obs.connect(studio.ip, studio.pw, {
                eventSubscriptions: (1 | 65536 | 64) 
            });
            
            _mcrStudios[studio.id].isConnected = true;
            _mcrStudios[studio.id].lastAliveTime = Date.now();
            
            if (activeTab === "mcr" && _isMcrUnlocked) {
                const statusEl = document.getElementById(`mcr-status-${studio.id}`);
                if(statusEl) statusEl.innerText = "🟢 Online";
            }

            try {
                const streamSettings = await obs.call('GetStreamServiceSettings');
                const serverUrl = streamSettings.streamServiceSettings?.server || "";
                
                let mpInfo = detectMarketplace(serverUrl);
                _mcrStudios[studio.id].lastMpName = mpInfo.name;
                _mcrStudios[studio.id].lastMpColor = mpInfo.color;
                _mcrStudios[studio.id].lastMpBg = mpInfo.bg;

                const mpBadge = document.getElementById(`mcr-mp-${studio.id}`);
                if (mpBadge && activeTab === "mcr" && _isMcrUnlocked) {
                    mpBadge.innerText = mpInfo.name;
                    mpBadge.style.color = mpInfo.color;
                    mpBadge.style.background = mpInfo.bg;
                    if (mpInfo.name !== "CUSTOM" || serverUrl !== "") {
                        mpBadge.style.display = "inline-block";
                    }
                }
            } catch (err) {}

            // CEK PANIC BUTTON
            setInterval(async () => {
                if (!_mcrStudios[studio.id].isConnected) return;
                try {
                    const sceneResponse = await obs.call('GetCurrentProgramScene');
                    let currentSceneName = sceneResponse.sceneName.toUpperCase();
                    let st = _mcrStudios[studio.id];
                    let now = Date.now();

                    if (currentSceneName.includes("BANTUAN") || currentSceneName.includes("TEKNIS") || currentSceneName.includes("HELP")) {
                        if (!st.isHelpActive) {
                            st.isHelpActive = true;
                            activatePanicAlert(studio.id, "BANTUAN TEKNIS", "tech");
                        }
                    } else if (currentSceneName.includes("TOILET") || currentSceneName.includes("RESTROOM")) {
                        let timeSinceLastToilet = now - st.toiletLastUsed;
                        if (timeSinceLastToilet > 600000 || st.toiletLastUsed === 0) { 
                            if (!st.isHelpActive) {
                                st.isHelpActive = true;
                                st.toiletLastUsed = now; 
                                activatePanicAlert(studio.id, "IZIN TOILET", "toilet");
                            }
                        }
                    }
                } catch(e) {}
            }, 3000);

                        // PANTAU AUDIO
            obs.on('InputVolumeMeters', (data) => {
                let nowTime = Date.now();
                let deltaTimeSec = (nowTime - lastAudioCheckTime) / 1000; 
                lastAudioCheckTime = nowTime; 
                
                if (deltaTimeSec > 2) deltaTimeSec = 0; 

                if (_mcrStudios[studio.id].isConnected && activeTab === "mcr" && _isMcrUnlocked) {
                    const statusEl = document.getElementById(`mcr-status-${studio.id}`);
                    if (statusEl && statusEl.innerText !== "🟢 Online") statusEl.innerText = "🟢 Online";
                }

                let currentDb = -60;
                let studioState = _mcrStudios[studio.id];
                
                if (data && data.inputs && data.inputs.length > 0) {
                    let maxLinear = 0;
                    data.inputs.forEach(input => {
                        try {
                            if (input.inputLevelsMul && input.inputLevelsMul.length > 0) {
                                let linearValue = 0;
                                let channel0 = input.inputLevelsMul[0];
                                if (Array.isArray(channel0)) linearValue = parseFloat(channel0[0]); 
                                else linearValue = parseFloat(channel0);
                                if (!isNaN(linearValue) && linearValue > maxLinear) maxLinear = linearValue;
                            }
                        } catch(e) {}
                    });
                    if (maxLinear > 0) currentDb = 20 * Math.log10(maxLinear);
                }
                
                if (isNaN(currentDb) || currentDb === -Infinity || currentDb < -60) currentDb = -60;

                let audioProblem = null;
                // Cek apakah punya jadwal Live (atau sengaja di-pin untuk ditest)
                let isSupposedToLive = getStudioCurrentSchedule(studio.id) !== null || _pinnedStudios.includes(studio.id);

                // Hitung timer deteksi mic mati
                if (currentDb <= -55) {
                    studioState.silentSeconds += deltaTimeSec; 
                    if (studioState.silentSeconds >= 90) {
                        audioProblem = "Mic Mati / Tidak ada suara";
                    }
                } else {
                    studioState.silentSeconds = 0; 
                }

                // Hitung timer deteksi noise
                if (Math.floor(nowTime / 1000) !== Math.floor((nowTime - deltaTimeSec*1000) / 1000)) { 
                    studioState.lastDbHistory.push(currentDb);
                    if (studioState.lastDbHistory.length > 30) studioState.lastDbHistory.shift(); 

                    if (studioState.lastDbHistory.length === 30) {
                        let highest = Math.max(...studioState.lastDbHistory);
                        let lowest = Math.min(...studioState.lastDbHistory);
                        let difference = highest - lowest;

                        if (difference <= 3 && highest > -30) {
                            studioState.staticNoiseSeconds++;
                            if (studioState.staticNoiseSeconds > 60) {
                                audioProblem = "Terdeteksi Noise atau Dengung Statis";
                            }
                        } else {
                            studioState.staticNoiseSeconds = 0; 
                        }
                    }
                }

                // HANYA BUNYIKAN ALARM AUDIO JIKA SEDANG JADWAL LIVE (ATAU DI-PIN)
                if (audioProblem && !studioState.alarmPlayed && !studioState.isHelpActive && isSupposedToLive) {
                    triggerMCRAlarm(studio.id, audioProblem);
                    studioState.alarmPlayed = true;
                } else if (!audioProblem || !isSupposedToLive) {
                    studioState.alarmPlayed = false;
                }

                if (nowTime - studioState.lastUiUpdate > 100) { 
                    studioState.lastUiUpdate = nowTime;
                    
                    if (activeTab === "mcr" && _isMcrUnlocked) {
                        const audioEl = document.getElementById(`mcr-audio-${studio.id}`);
                        const audioBar = document.getElementById(`mcr-audio-bar-${studio.id}`);
                        const warnEl = document.getElementById(`mcr-audio-warn-${studio.id}`);
                        const cardElement = document.getElementById(`mcr-card-${studio.id}`);
                        
                        if (audioEl && audioBar && cardElement && warnEl) {
                            audioEl.innerText = currentDb.toFixed(1) + " dB";
                            
                            let barPercent = ((currentDb + 60) / 60) * 100;
                            if (barPercent < 0) barPercent = 0;
                            if (barPercent > 100) barPercent = 100;
                            audioBar.style.width = `${barPercent}%`;

                            if (currentDb > -9) {
                                audioBar.style.backgroundColor = "#dc3545"; 
                                audioEl.style.color = "#dc3545";
                            } else if (currentDb > -20) {
                                audioBar.style.backgroundColor = "#ffc107"; 
                                audioEl.style.color = "#ffc107";
                            } else {
                                audioBar.style.backgroundColor = "#198754"; 
                                audioEl.style.color = "gray"; 
                            }
                            
                            // Visual peringatan merah teks HANYA MUNCUL jika memang ada jadwal Live (atau Di-Pin)
                            if (audioProblem && isSupposedToLive) {
                                warnEl.innerText = `⚠️ ${audioProblem}`;
                                warnEl.style.display = "block";
                            } else {
                                warnEl.style.display = "none";
                            }
                        }
                    }
                }

                // Tentukan level severity Card untuk pewarnaan background
                let isAudioCritical = (audioProblem === "Mic Mati / Tidak ada suara" && isSupposedToLive);
                if (isAudioCritical) studioState.currentSeverity = 'critical';
                else if (audioProblem && isSupposedToLive) studioState.currentSeverity = 'warning';
                else studioState.currentSeverity = 'normal';
            });

            // PANTAU BITRATE
            setInterval(async () => {
                if (!_mcrStudios[studio.id].isConnected) return; 

                try {
                    const status = await obs.call('GetStreamStatus');
                    let st = _mcrStudios[studio.id];
                    let kbps = 0;
                    let congestion = status.outputCongestion || 0; 
                    let framesDroppedNow = status.outputSkippedFrames - st.lastDroppedFrames;
                    st.lastDroppedFrames = status.outputSkippedFrames;

                    let isCurrentlyStreaming = status.outputActive;
                    let isSupposedToLive = getStudioCurrentSchedule(studio.id) !== null || _pinnedStudios.includes(studio.id);

                    if (isCurrentlyStreaming) st.lastAliveTime = Date.now();

                    // Alarm Terputus Mendadak
                    if (st.isCurrentlyStreaming === true && isCurrentlyStreaming === false) {
                        if (isSupposedToLive) triggerMCRAlarm(studio.id, "STREAM TERPUTUS ATAU END LIVE!");
                    }
                    st.isCurrentlyStreaming = isCurrentlyStreaming;

                    if (isCurrentlyStreaming) {
                        let currentBytes = status.outputBytes;
                        if (st.lastBytes > 0) {
                            let byteDiff = currentBytes - st.lastBytes;
                            kbps = (byteDiff * 8) / 1000 / 2; 
                        }
                        st.lastBytes = currentBytes;
                    } else {
                        st.lastBytes = 0;
                    }

                    st.netProblem = null;
                    let isNetCritical = false;

                    // Hitung masalah jaringan
                    if (isCurrentlyStreaming) {
                        if (congestion > 0.5 || framesDroppedNow > 5) {
                            st.netProblem = "Koneksi Macet Parah";
                            isNetCritical = true;
                            // Bunyikan suara HANYA jika memang harus Live
                            if (Math.random() > 0.9 && !st.isHelpActive && isSupposedToLive) {
                                triggerMCRAlarm(studio.id, "Connection problem and frame dropped");
                            }
                        } else if (congestion > 0.1 || (kbps < 1000 && kbps > 0)) {
                            st.netProblem = "Jaringan Tidak Stabil";
                        }
                    }

                    // Gabungkan Severity Audio & Network (Bebas Drama jika tidak Live)
                    if (!isCurrentlyStreaming) {
                        st.currentSeverity = 'inactive';
                    } else if ((isNetCritical || st.audioProblem === "Mic Mati / Tidak ada suara") && isSupposedToLive) {
                        st.currentSeverity = 'critical';
                    } else if ((st.netProblem || st.audioProblem) && isSupposedToLive) {
                        st.currentSeverity = 'warning';
                    } else {
                        st.currentSeverity = 'normal';
                    }

                    if (activeTab === "mcr" && _isMcrUnlocked) {
                        const bitEl = document.getElementById(`mcr-bitrate-${studio.id}`);
                        const netWarnEl = document.getElementById(`mcr-net-warn-${studio.id}`);
                        const cardElement = document.getElementById(`mcr-card-${studio.id}`);
                        const statusEl = document.getElementById(`mcr-status-${studio.id}`);
                        
                        if (bitEl && cardElement && netWarnEl && statusEl) {
                            if (statusEl.innerText !== "🟢 Online") statusEl.innerText = "🟢 Online";

                            if (!isCurrentlyStreaming) {
                                bitEl.innerText = "0 kbps";
                                bitEl.style.color = "gray"; 
                                
                                // Jika tidak stream TAPI harusnya Live = Error. Kalau tidak Live = Santai
                                if (isSupposedToLive) {
                                    netWarnEl.innerText = "🔴 ERROR: STREAM PUTUS";
                                    netWarnEl.style.color = "#dc3545";
                                    netWarnEl.style.display = "block";
                                } else {
                                    netWarnEl.innerText = "Stream Selesai / Belum Mulai";
                                    netWarnEl.style.color = "gray";
                                    netWarnEl.style.display = "block";
                                }
                            } else {
                                bitEl.innerText = Math.round(kbps) + " kbps";
                                
                                // Tampilkan teks warning jaringan HANYA JIKA memang jadwalnya Live
                                if (st.netProblem === "Koneksi Macet Parah" && isSupposedToLive) {
                                    bitEl.style.color = "#dc3545"; 
                                    netWarnEl.innerText = "⚠️ Macet (Drop Frame)";
                                    netWarnEl.style.color = "#dc3545";
                                    netWarnEl.style.display = "block";
                                } else if (st.netProblem === "Jaringan Tidak Stabil" && isSupposedToLive) {
                                    bitEl.style.color = "#ffc107"; 
                                    netWarnEl.innerText = "⚠️ Tidak Stabil";
                                    netWarnEl.style.color = "#ffc107";
                                    netWarnEl.style.display = "block";
                                } else {
                                    bitEl.style.color = "#198754"; 
                                    netWarnEl.style.display = "none";
                                }
                            }

                            if (!st.isHelpActive) {
                                cardElement.classList.remove('blink-tech', 'blink-toilet');

                                if (st.currentSeverity === 'critical') {
                                    cardElement.style.backgroundColor = "#fff5f5";
                                    cardElement.style.borderLeftColor = "#dc3545";
                                    cardElement.style.boxShadow = "0 0 10px rgba(220, 53, 69, 0.5)"; 
                                } else if (st.currentSeverity === 'warning') {
                                    cardElement.style.backgroundColor = "#fffdf5";
                                    cardElement.style.borderLeftColor = "#ffc107";
                                    cardElement.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)"; 
                                } else if (st.currentSeverity === 'inactive') {
                                    cardElement.style.backgroundColor = "#f8f9fa";
                                    cardElement.style.borderLeftColor = "gray";
                                    cardElement.style.boxShadow = "none";
                                } else {
                                    let isPinned = _pinnedStudios.includes(studio.id);
                                    cardElement.style.backgroundColor = isPinned ? "#f8faff" : "white";
                                    cardElement.style.borderLeftColor = "var(--bs-success)";
                                    cardElement.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
                                }
                            }
                        }
                    }
                } catch(e){}
            }, 2000);


        } catch (error) {
            _mcrStudios[studio.id].isConnected = false;
        }
    });
}

function activatePanicAlert(studioId, tipeBantuan, jenisCard) {
    if (activeTab !== "mcr" || !_isMcrUnlocked) return;

    const cardEl = document.getElementById(`mcr-card-${studioId}`);
    const alertEl = document.getElementById(`mcr-help-alert-${studioId}`);
    
    if (cardEl && alertEl) {
        alertEl.style.display = "block";
        
        if (jenisCard === "tech") {
            alertEl.innerText = "🚨 BANTUAN TEKNIS";
            alertEl.style.backgroundColor = "#f8d7da";
            alertEl.style.color = "#dc3545";
            cardEl.className = "card p-2 shadow-sm blink-tech"; 
            triggerMCRAlarm(studioId, "Meminta bantuan teknis.");
        } else {
            alertEl.innerText = "🚻 IZIN TOILET";
            alertEl.style.backgroundColor = "#fff3cd";
            alertEl.style.color = "#856404";
            cardEl.className = "card p-2 shadow-sm blink-toilet"; 
            triggerMCRAlarm(studioId, "Meminta izin toilet.");
        }

        alertEl.onclick = () => {
            alertEl.style.display = "none";
            cardEl.className = "card p-2 shadow-sm"; 
            cardEl.style.borderLeftColor = "var(--bs-success)";
            _mcrStudios[studioId].isHelpActive = false; 
        };
    }
}

function triggerMCRAlarm(studioId, masalah) {
    showBanner(`⚠️ Studio ${studioId}: ${masalah}`, "danger");
    let speech = new SpeechSynthesisUtterance(`Perhatian. Studio ${studioId}. ${masalah}`);
    speech.lang = "id-ID";
    if (_indoVoice) speech.voice = _indoVoice;
    speech.rate = 0.9;
    window.speechSynthesis.speak(speech);
}
