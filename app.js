const API_URL    = "https://script.google.com/macros/s/AKfycbyhsAeqXWyuR0sRoNmy2i1vcyvKAk7Q-gaivbiNTLAq7eDKdCev8RpsG11v1aEGdTbB/exec";
const NTFY_TOPIC = "castlive-ops-2026-xk9";
const ICON_URL   = new URL("./icon-192.png", location.href).href;
const GOOGLE_CLIENT_ID = "343542715243-jhl0dshlpiklcapfgj4akj0a02vg9q05.apps.googleusercontent.com";
const PRESENCE_TOPIC   = "castlive-presence-2026";

let currentUserEmail = localStorage.getItem("userEmail") || null;
let onlineUsers      = {};
let presenceStarted  = false;

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
        sessions=data.sessions.map(s=>{s.isMarathon=s.hosts.length>1;return s;});
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
    sessions=data.sessions.map(s=>{s.isMarathon=s.hosts.length>1;return s;});
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
  if(tab==="standby")     renderStandby();
  if(tab==="klasemen")    loadKlasemen();
  if(tab==="hariH")       loadHariH();
  if(tab==="buktiTayang") loadBuktiTayang();
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
    if(isPast){
      header.style.opacity="0.55";
      header.innerHTML=`<span class="dot ${type==="start"?"start":"end"}-dot"></span>${type==="start"?"Start":"End"} ${display}<span class="count-badge">▸ ${items.length}</span>`;
      header.onclick=()=>{
        const wasCollapsed=block.classList.contains("collapsed");
        block.classList.toggle("collapsed");
        const cnt=block.querySelector(".sessions-container");
        cnt.style.maxHeight=wasCollapsed?cnt.scrollHeight+"px":"0px";
      };
    }else{
      header.innerHTML=`<span class="dot ${type==="start"?"start":"end"}-dot"></span>${type==="start"?"▶ Start":"⏹ End"} ${display}<span class="toggle-icon">▾</span>`;
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

function renderKlasemen(data){
  const container=document.getElementById("schedule-list");
  if(!data.leaderboard){container.innerHTML=`<div class="empty"><span class="empty-icon">⚠️</span>Deploy Apps Script versi baru dulu</div>`;return;}
  const totalPendHariH=data.leaderboard.reduce((s,r)=>s+r.pendingHariH,0);
  const totalPendH1=data.leaderboard.reduce((s,r)=>s+r.pendingH1,0);
  const totalRows=data.leaderboard.reduce((s,r)=>s+r.total,0);
  const totalHold=data.leaderboard.reduce((s,r)=>s+r.hold,0);
  const summaryCard=(bg,border,numColor,num,label)=>
    `<div style="flex:1;background:${bg};border:1px solid ${border};border-radius:var(--bs-radius-lg);padding:10px 6px;text-align:center;position:relative;overflow:hidden">
       <div style="font-size:1.15rem;font-weight:800;color:${numColor}">${num}</div>
       <div style="font-size:0.58rem;color:var(--bs-muted);margin-top:1px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">${label}</div>
     </div>`;
  let html=`<div style="padding:8px 10px 24px">`;
  html+=`<div style="text-align:center;margin-bottom:12px"><div style="font-size:0.85rem;font-weight:700;color:var(--bs-dark)">🏆 Klasemen Pending Data Input</div><div style="font-size:0.68rem;color:var(--bs-muted);margin-top:3px">${data.dateFrom||""} → ${data.dateTo||""}</div></div>`;
  html+=`<div style="display:flex;gap:7px;margin-bottom:14px">
    ${summaryCard("var(--bs-danger-subtle)","#f1aeb5","var(--bs-danger)",totalPendHariH,"⏳ Hari H")}
    ${summaryCard("var(--bs-warning-subtle)","#ffe69c","#856404",totalPendH1,"📋 H+1")}
    ${summaryCard("var(--bs-primary-subtle)","#9ec5fe","var(--bs-primary)",totalRows,"📂 Total")}
    ${summaryCard("var(--bs-secondary-subtle)","var(--bs-border)","var(--bs-secondary)",totalHold,"⏸ Hold")}
  </div>`;
  html+=`<div style="background:var(--bs-white);border-radius:var(--bs-radius-xl);overflow:hidden;margin-bottom:14px;border:1px solid var(--bs-border);box-shadow:var(--bs-shadow-sm)">
    <div style="padding:7px 12px;background:var(--bs-light);border-bottom:1px solid var(--bs-border);font-size:0.6rem;font-weight:700;color:var(--bs-muted);display:flex;gap:4px;text-transform:uppercase;letter-spacing:0.5px">
      <span style="width:26px">#</span><span style="flex:1">PIC</span>
      <span style="width:44px;text-align:center">H+1</span><span style="width:44px;text-align:center">Hari H</span>
      <span style="width:38px;text-align:center">Total</span><span style="width:34px;text-align:center">Hold</span>
    </div>`;
  data.leaderboard.forEach((r,idx)=>{
    const pts=r.pendingPoints;
    const medal=idx===0?"🥇":idx===1?"🥈":idx===2?"🥉":`${idx+1}.`;
    const sColor=pts===0?"var(--bs-success)":pts<=5?"var(--bs-primary)":pts<=15?"#856404":"var(--bs-danger)";
    const sTxt=pts>0?`${pts} data pending`:"✅ Data Lengkap";
    const rowBg=idx%2===1?"var(--bs-light)":"var(--bs-white)";
    html+=`<div style="padding:7px 12px;border-top:1px solid var(--bs-border-subtle);display:flex;align-items:center;gap:4px;background:${rowBg}">
      <span style="width:26px;font-size:0.8rem">${medal}</span>
      <div style="flex:1;min-width:0"><div style="font-size:0.82rem;font-weight:700;color:var(--bs-dark)">${formatPic(r.pic)}</div><div style="font-size:0.6rem;color:${sColor};font-weight:600;margin-top:1px">${sTxt}</div></div>
      <span style="width:44px;text-align:center;font-size:0.85rem;font-weight:700;color:#856404">${r.pendingH1}</span>
      <span style="width:44px;text-align:center;font-size:0.85rem;font-weight:700;color:var(--bs-danger)">${r.pendingHariH}</span>
      <span style="width:38px;text-align:center;font-size:0.75rem;color:var(--bs-muted)">${r.total}</span>
      <span style="width:34px;text-align:center;font-size:0.75rem;color:var(--bs-secondary)">${r.hold}</span>
    </div>`;
  });
  html+=`</div>`;
  html+=`<div style="font-size:0.68rem;font-weight:700;color:var(--bs-primary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">📋 Copy ID Line Pending per PIC</div>`;
  html+=`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">`;
  data.leaderboard.forEach(r=>{
    const hasPending=r.pendingRows?.length>0;
    const idLines=(r.pendingRows||[]).map(p=>p.idLine).filter(Boolean);
    const pts=r.pendingPoints;
    if(hasPending){
      html+=`<button onclick="copyIdLines('${r.pic}',${JSON.stringify(idLines).replace(/"/g,'&quot;')})"
        style="padding:5px 11px;border:1px solid #9ec5fe;border-radius:var(--bs-radius-pill);background:var(--bs-primary-subtle);color:var(--bs-primary-text);font-size:0.7rem;font-weight:600;cursor:pointer">
        ${formatPic(r.pic)} <span style="color:#856404;font-weight:700">(${pts})</span></button>`;
    }else{
      html+=`<button disabled style="padding:5px 11px;border:1px solid var(--bs-border);border-radius:var(--bs-radius-pill);background:var(--bs-light);color:#adb5bd;font-size:0.7rem;font-weight:600;cursor:not-allowed">${formatPic(r.pic)} ✅</button>`;
    }
  });
  html+=`</div>`;
  const withPending=data.leaderboard.filter(r=>r.pendingRows?.length>0);
  if(withPending.length){
    withPending.forEach(r=>{
      html+=`<div style="margin-bottom:12px"><div style="font-size:0.7rem;font-weight:700;color:var(--bs-primary);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px">${formatPic(r.pic)} — ${r.pendingRows.length} sesi pending</div>`;
      r.pendingRows.forEach(p=>{
        const tags=[];
        if(p.hariH)tags.push(`<span style="background:var(--bs-danger-subtle);color:var(--bs-danger-text);font-size:0.58rem;padding:2px 7px;border-radius:var(--bs-radius-pill);font-weight:600">Hari H</span>`);
        if(p.h1)tags.push(`<span style="background:var(--bs-warning-subtle);color:var(--bs-warning-text);font-size:0.58rem;padding:2px 7px;border-radius:var(--bs-radius-pill);font-weight:600">H+1</span>`);
        html+=`<div style="background:var(--bs-white);border-radius:var(--bs-radius);padding:7px 10px;margin-bottom:3px;display:flex;align-items:center;gap:8px;border:1px solid var(--bs-border);box-shadow:var(--bs-shadow-sm)">
          <div style="flex:1;min-width:0"><div style="font-size:0.78rem;font-weight:600;color:var(--bs-dark)">${p.brand}</div><div style="font-size:0.63rem;color:var(--bs-muted);margin-top:1px">${p.date} · ${p.startTime} · ${p.studio}</div></div>
          <div style="display:flex;gap:3px">${tags.join("")}</div>
          <div style="font-size:0.6rem;color:#adb5bd;font-family:monospace;flex-shrink:0">${p.idLine}</div>
        </div>`;
      });
      html+=`</div>`;
    });
  }
  html+=`<button onclick="forceRefreshKlasemen()" class="btn btn-outline-primary btn-block" style="margin-top:6px;padding:10px">🔄 Refresh (Clear Cache)</button>`;
  html+=`</div>`;
  container.innerHTML=html;
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
    const timeout    = setTimeout(() => controller.abort(), 20000);
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

  // ─────────────────────────────────────────
  // sessionMatch — pakai normalizeBrand (FIX He!!o dll)
  // ─────────────────────────────────────────
  function sessionMatch(formResp, p, hostObj) {
    const hostName  = typeof hostObj === 'string' ? hostObj : (hostObj?.name || '');
    const hostStart = (typeof hostObj === 'object' && hostObj?.start) ? hostObj.start : p.startTime;
    const hostEnd   = (typeof hostObj === 'object' && hostObj?.end && hostObj.end !== '-') ? hostObj.end : null;

    const formHosts    = parseFormHosts(formResp.host);
    const anyHostMatch = formHosts.some(name => hostNameMatchesSlot(name, hostName));
    if (!anyHostMatch) return false;

    // FIX: normalizeBrand sebelum fuzzy match
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

  // ─────────────────────────────────────────
  // deduplicateResponses
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  // buildExclusiveClaims — multi-host aware
  // FIX: pakai normalizeBrand di brand check
  // ─────────────────────────────────────────
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

            // FIX: normalizeBrand
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

  // ─────────────────────────────────────────
  // PRE-PASS
  // ─────────────────────────────────────────
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

  // FIX: normalizeBrand di findSessionCandidates
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

  // ─────────────────────────────────────────
  // RENDER HTML
  // ─────────────────────────────────────────
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

// ─────────────────────────────────────────────
// COPY BUKTI TAYANG → WA
// ─────────────────────────────────────────────
function copyBuktiTayangWA() {
  if (!_lastBuktiTayangData) { showBanner('Data belum dimuat', 'warning'); return; }

  const sessions = _lastBuktiTayangData.sessions || [];
  const date     = _lastBuktiTayangData.date || '';

  let dateLabel = date;
  try {
    dateLabel = new Date(date + 'T12:00:00+07:00')
      .toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Jakarta' })
      .toUpperCase();
  } catch(e) {}

  const missing  = sessions.filter(s => s.status === 'missing');
  const pending  = sessions.filter(s => s.status === 'pending');
  const total    = missing.length + pending.length;

  if (total === 0) {
    showBanner('✅ Semua sesi sudah upload bukti tayang!', 'success');
    return;
  }

  const fmtRow = s => {
    const time = (s.endTime && s.endTime !== '-')
      ? `${s.startTime} → ${s.endTime}` : s.startTime;
    return `• ${s.brand} | ${s.studio} · ${s.mp || '-'} | ${time} | ID: ${s.idLine}`;
  };

  let text = `📸 TAGIHAN BUKTI TAYANG\n${dateLabel}\n`;

  if (missing.length > 0) {
    text += `\n❌ Belum Upload (${missing.length} sesi):\n`;
    text += missing.map(fmtRow).join('\n');
  }

  if (pending.length > 0) {
    text += `\n\n⏳ Link Kosong di Form (${pending.length} sesi):\n`;
    text += pending.map(fmtRow).join('\n');
  }

  text += `\n\nTotal belum lengkap: ${total} sesi`;

  navigator.clipboard.writeText(text)
    .then(() => showBanner(`✅ Teks tagihan (${total} sesi) di-copy!`, 'success'))
    .catch(() => showBanner('❌ Gagal copy', 'error'));
}

// ─────────────────────────────────────────────
// RENDER BUKTI TAYANG
// ─────────────────────────────────────────────
function renderBuktiTayang(data) {
  const container = document.getElementById('schedule-list');

  const sessions      = data.sessions || [];
  const totalUploaded = data.totalUploaded ?? sessions.filter(s => s.status === 'uploaded').length;
  const totalPending  = data.totalPending  ?? sessions.filter(s => s.status === 'pending').length;
  const totalMissing  = data.totalMissing  ?? sessions.filter(s => s.status === 'missing').length;

  const summaryCard = (bg, border, numColor, num, label) =>
    `<div style="flex:1;background:${bg};border:1px solid ${border};border-radius:var(--bs-radius-lg);padding:10px 6px;text-align:center">
       <div style="font-size:1.15rem;font-weight:800;color:${numColor}">${num}</div>
       <div style="font-size:0.58rem;color:var(--bs-muted);margin-top:1px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">${label}</div>
     </div>`;

  let html = `<div style="padding:8px 10px 24px">`;

  html += `
    <div style="text-align:center;margin-bottom:12px">
      <div style="font-size:0.85rem;font-weight:700;color:var(--bs-dark)">📸 Bukti Tayang</div>
      <div style="font-size:0.68rem;color:var(--bs-muted);margin-top:3px">${data.date || '-'}</div>
    </div>`;

  html += `<div style="display:flex;gap:7px;margin-bottom:12px">
    ${summaryCard('var(--bs-success-subtle)', '#a3cfbb', 'var(--bs-success)', totalUploaded, '✅ Uploaded')}
    ${summaryCard('var(--bs-warning-subtle)', '#ffe69c', '#856404',           totalPending,  '⏳ Link Kosong')}
    ${summaryCard('var(--bs-danger-subtle)',  '#f1aeb5', 'var(--bs-danger)',  totalMissing,  '❌ Belum Upload')}
  </div>`;

  html += `
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button onclick="forceRefreshBuktiTayang()"
        class="btn btn-outline-primary"
        style="flex:1;padding:8px;font-size:0.78rem">
        🔄 Refresh
      </button>
      <button onclick="copyBuktiTayangWA()"
        style="flex:1;padding:8px;font-size:0.78rem;font-weight:700;cursor:pointer;
               border:1px solid #a3cfbb;border-radius:var(--bs-radius);
               background:var(--bs-success-subtle);color:var(--bs-success-text)">
        📋 Copy Tagihan WA
      </button>
    </div>`;

  if (!sessions.length) {
    html += `<div class="empty"><span class="empty-icon">📭</span>Tidak ada sesi hari ini</div>`;
  } else {
    sessions.forEach(s => {
      const brand     = s.brand     || '-';
      const mp        = s.mp        || '-';
      const studio    = s.studio    || '-';
      const idLine    = s.idLine    || '-';
      const startTime = s.startTime || '-';
      const endTime   = s.endTime   || '-';
      const sessionTime = (endTime && endTime !== '-')
        ? `${startTime} → ${endTime}` : startTime;

      const typeBadge = s.isMarathon
        ? `<span style="background:var(--bs-warning-subtle);color:#856404;border:1px solid #ffe69c;font-size:0.55rem;padding:2px 6px;border-radius:var(--bs-radius-pill);font-weight:700">🏃 Marathon</span>`
        : `<span style="background:var(--bs-success-subtle);color:var(--bs-success-text);border:1px solid #a3cfbb;font-size:0.55rem;padding:2px 6px;border-radius:var(--bs-radius-pill);font-weight:700">⚡ Single</span>`;

      let statusBg, statusBorder, statusIcon, statusText, statusColor;
      if (s.status === 'uploaded') {
        statusBg = 'var(--bs-success-subtle)'; statusBorder = '#a3cfbb';
        statusIcon = '✅'; statusText = 'Uploaded'; statusColor = 'var(--bs-success-text)';
      } else if (s.status === 'pending') {
        statusBg = 'var(--bs-warning-subtle)'; statusBorder = '#ffe69c';
        statusIcon = '⏳'; statusText = 'Link kosong'; statusColor = '#856404';
      } else {
        statusBg = 'var(--bs-danger-subtle)'; statusBorder = '#f1aeb5';
        statusIcon = '❌'; statusText = 'Belum upload'; statusColor = 'var(--bs-danger-text)';
      }

      const links = Array.isArray(s.links) ? s.links.filter(Boolean) : [];
      const pics  = Array.isArray(s.pics)  ? s.pics.filter(Boolean)  : [];

      html += `
        <div style="background:var(--bs-white);border:1px solid var(--bs-border);border-radius:var(--bs-radius-lg);
                    margin-bottom:8px;overflow:hidden;box-shadow:var(--bs-shadow-sm)">
          <div style="padding:10px 14px;background:${statusBg};border-bottom:1px solid ${statusBorder}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
              <div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
                  <span style="font-size:0.82rem;font-weight:700;color:var(--bs-dark)">${statusIcon} ${brand}</span>
                  ${typeBadge}
                </div>
                <div style="font-size:0.63rem;color:var(--bs-muted);display:flex;gap:10px;flex-wrap:wrap">
                  <span>🕐 ${sessionTime}</span>
                  <span>📍 ${studio} · ${mp}</span>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
                <span style="font-size:0.6rem;color:#adb5bd;font-family:monospace">${idLine}</span>
                <span style="font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:var(--bs-radius-pill);
                             background:white;border:1px solid ${statusBorder};color:${statusColor}">${statusText}</span>
              </div>
            </div>
          </div>

          <div style="padding:8px 14px">
            ${s.status === 'uploaded' ? `
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-size:0.68rem;color:var(--bs-success);font-weight:600">
                  📎 ${links.length} file diupload
                  ${pics.length > 0 ? `<span style="color:var(--bs-muted);font-weight:400"> oleh ${pics.join(', ')}</span>` : ''}
                </span>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  ${links.map((lnk, li) => lnk
                    ? `<a href="${lnk}" target="_blank"
                         style="padding:3px 9px;background:var(--bs-success-subtle);border:1px solid #a3cfbb;
                                border-radius:var(--bs-radius-pill);color:var(--bs-success-text);
                                font-size:0.62rem;font-weight:700;text-decoration:none">
                         📎${links.length > 1 ? ' ' + (li + 1) : ''}
                       </a>` : ''
                  ).join('')}
                </div>
              </div>`
            : s.status === 'pending' ? `
              <div style="font-size:0.68rem;color:#856404;font-weight:600">
                ⚠️ Ada di form tapi link belum diisi
                ${pics.length > 0 ? `<span style="font-weight:400"> — PIC: ${pics.join(', ')}</span>` : ''}
              </div>`
            : `
              <div style="font-size:0.68rem;color:var(--bs-danger);font-weight:600">
                ❌ Belum ada form upload yang masuk
              </div>`}
          </div>
        </div>`;
    });
  }

  html += `</div>`;
  container.innerHTML = html;
}
