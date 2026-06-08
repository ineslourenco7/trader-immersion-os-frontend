/* Trading Room - cockpit unificado */
const fmtPct = v => `${((Number(v)||0)*100).toFixed(2)}%`;
const API = window.location.origin;
let DATA = null, TWIN = null, ACTIVE_SESSION = null, MT5 = null, API_ON = false;
const SIDEBAR_KEY = 'tr-sidebar-collapsed-v4';

function applySidebarState(){}

/* Pages */
function initNav(){
  document.querySelectorAll('.nav-link').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const page = a.getAttribute('data-page');
      document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
      a.classList.add('active');
      document.querySelectorAll('.page').forEach(p=>p.style.display='none');
      const target = document.getElementById(page === 'cockpit' ? 'cockpit' : (page + 'Page'));
      if (target) target.style.display='block';
    });
  });
}

function goSettings(){
  document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
  const el = document.querySelector('[data-page="settings"]'); if(el) el.classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.style.display='none');
  const s = document.getElementById('settingsPage'); if(s) s.style.display='block';
}

async function apiGet(path, fallbackUrl){
  try{
    const r = await fetch(`${window.location.origin}${path}`, {cache:'no-store'});
    if(!r.ok) throw new Error(`${path} ${r.status}`);
    API_ON = true; return await r.json();
  }catch(e){ if(fallbackUrl) return fetch(fallbackUrl, {cache:'reload'}).then(r=>r.json()); throw e; }
}

async function load(){
  initNav();
  DATA = await apiGet('/api/room-engine', 'data/alphaforge-snapshot.json');
  TWIN = await apiGet('/api/trader-twin', 'data/trader-twin.json');
  TWIN = TWIN || {};
  ACTIVE_SESSION = (await apiGet('/api/session/active')).active;
  MT5 = await apiGet('/api/mt5/accounts').catch(()=>({accounts:[], recent_trades:[], metrics:{}}));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{ });
  setInterval(refreshLiveData, 15000);
  renderAll();
  renderNotifications();
  renderTicker();
  renderSentiment();
  renderScenario();
  renderTopSetups();
  renderDiaryHeat();
  renderPerformance();
  renderChat();
  initLotCalc();
  initMentor();
}

async function refreshLiveData(){
  try{
    const r = await fetch(`${window.location.origin}/api/room-engine`, {cache:'no-store'});
    if (!r.ok) throw new Error();
    DATA = await r.json();
    TWIN = (await fetch(`${window.location.origin}/api/trader-twin`, {cache:'no-store'}).then(r=>r.json()).catch(()=>({}))) || TWIN;
    ACTIVE_SESSION = (await fetch(`${window.location.origin}/api/session/active`, {cache:'no-store'}).then(r=>r.json()).catch(()=>({active:null}))).active;
    MT5 = (await fetch(`${window.location.origin}/api/mt5/accounts`, {cache:'no-store'}).then(r=>r.json()).catch(()=>({accounts:[], recent_trades:[], metrics:{}}))) || MT5;
    API_ON = true;
    renderAll();
  }catch(e){}
}

function set(sel, value){ const el=document.querySelector(sel); if(el) el.textContent=value; }
function safeArr(x){ return Array.isArray(x) ? x : []; }

function renderAll(){
  if(!DATA || !TWIN) return;
  const m = DATA.metrics || {};
  set('#perfNet', `${Number((m.total_pnl_pct||0)||0)>=0?'+':''}${((Number(m.total_pnl_pct||0)||0)*100).toFixed(2)}€`);
  set('#perfWin', (`${(Number(m.win_rate||0)*100).toFixed(2)}%`));
  set('#perfPf', String(Number((m.win_rate||0)||0)));
  set('#perfTrades', m.trade_count || 0);
  const asset = DATA.asset || DATA.goal?.asset || 'BTCUSD';
  set('#chartSymbol', asset);
  set('#manipAsset', asset);
  set('#notifBadge', '12');
  document.querySelector('#notifBadge').style.display='inline-block';
}

/* Notifications/Ticker placeholders */
function renderNotifications(){
  const el = document.querySelector('#notifBadge'); if(!el) return;
  el.style.display='none';
}
function renderTicker(){
  const root = document.querySelector('#tickerTape'); if(!root) return;
  const items = [
    {s:'BTCUSD', p:'+1.27%', c:'ok'},
    {s:'XAUUSD', p:'+0.63%', c:'ok'},
    {s:'EURUSD', p:'-0.21%', c:'bad'},
    {s:'NAS100', p:'+0.74%', c:'ok'},
    {s:'US30', p:'-0.35%', c:'bad'},
  ];
  root.innerHTML = items.map(i=>`<span>${i.s} <b class="${i.c}">${i.p}</b></span>`).join('');
}

function renderSentiment(){
  const c = document.querySelector('#sentimentCanvas'); if(!c) return;
  const ctx = c.getContext('2d');
  const w = c.width = c.clientWidth; const h = c.height = 180;
  ctx.fillStyle='#0f1726'; ctx.fillRect(0,0,w,h/2);
  ctx.strokeStyle='#22d3ee'; ctx.lineWidth=1.5; ctx.beginPath();
  for(let i=0;i<w;i+=4){ ctx.lineTo(i, (h/2) + (Math.sin(i/35)*36)); }
  ctx.stroke();
  ctx.strokeStyle='#ef4444'; ctx.beginPath();
  for(let i=0;i<w;i+=4){ ctx.lineTo(i, (h/2) + (Math.cos(i/42)*28)); }
  ctx.stroke();
}

function renderScenario(){
  const c = document.querySelector('#scenarioCanvas'); if(!c) return;
  const ctx = c.getContext('2d');
  const w = c.width = c.clientWidth; const h = c.height = 160;
  ctx.fillStyle='#0b1221'; ctx.fillRect(0,0,w,h);
  ctx.font='12px Inter, ui-sans-serif, system-ui';
  ctx.fillStyle='#cbd5e1'; ctx.fillText('Sem historial suficiente para simular cenário.', 12, 28);
  ctx.strokeStyle='#14303d'; ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke();
  const root = document.querySelector('#scenarioStats'); if(!root) return;
  root.innerHTML = `<div class="statRow" style="display:flex;justify-content:space-between;background:#0b1221;border:1px solid var(--border);padding:8px;border-radius:10px"><span>Chance TP</span><b class="ok mono">62%</b></div><div class="statRow" style="display:flex;justify-content:space-between;background:#0b1221;border:1px solid var(--border);padding:8px;border-radius:10px;margin-top:8px"><span>Chance SL</span><b class="bad mono">38%</b></div><div class="statRow" style="display:flex;justify-content:space-between;background:#0b1221;border:1px solid var(--border);padding:8px;border-radius:10px;margin-top:8px"><span>Profit esperado</span><b class="ok mono">1.65</b></div>`;
}

function renderTopSetups(){
  const root = document.querySelector('#topSetupsList'); if(!root) return;
  const setups = [
    {n:'Liquidity Sweep + BOS', w:'78%'},
    {n:'FVG + Order Block', w:'72%'},
    {n:'Rejeição de Liquidez + EMA 34', w:'68%'},
  ];
  root.innerHTML = setups.map(s=>`<div class="setupItem"><span>${s.n}</span><b class="mono">${s.w}</b></div>`).join('');
}

function renderDiaryHeat(){
  const root = document.querySelector('#calendarHeatmap'); if(!root) return;
  const levels = ['ok','ok','warn','bad','ok','hot','ok','ok','ok','warn','bad','ok','ok','hot','ok','ok','warn'];
  root.innerHTML = levels.map(l=>`<div class="cell ${l}"></div>`).join('');
}

function renderPerformance(){
  const c = document.querySelector('#miniEquity'); if(!c) return;
  const ctx = c.getContext('2d');
  const w = c.width = c.clientWidth; const h = c.height = 100;
  ctx.fillStyle='#0b1221'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#22b87b'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(0,h/2);
  for(let i=1;i<w;i++) ctx.lineTo(i, h/2 - (Math.sin(i/28)*22 + Math.sin(i/11)*10));
  ctx.stroke();
}

/* Calculator */
function initLotCalc(){
  const def = document.querySelector('#lotDefault');
  if(def) def.checked = true;
  if(def) def.addEventListener('change', ()=>{
    const risco = document.querySelector('#lotRisco');
    if(risco) risco.value = def.checked ? '1' : risco.value;
  });
}
function calcLot(){
  const banca = Number(document.querySelector('#lotBanca')?.value || 0);
  const riscoPct = Number(document.querySelector('#lotRisco')?.value || 0);
  const sl = Number(document.querySelector('#lotSl')?.value || 1);
  const ponto = Number(document.querySelector('#lotPonto')?.value || 1);
  const riscoAbs = banca * (riscoPct / 100);
  const lote = Math.floor((riscoAbs / ((sl * ponto) || 1)) * 100) / 100;
  set('#resRiscoAbs', `$${riscoAbs.toFixed(2)}`);
  set('#resLote', `${Number.isFinite(lote)?lote:0} lotes`);
}

/* Chat */
function renderChat(){}
function sendChat(){
  const input = document.querySelector('#chatInput'); if(!input) return;
  const v = input.value.trim(); if(!v) return;
  const box = document.querySelector('#chatBox'); if(!box) return;
  box.innerHTML += `<div class="chatBubble"><strong>Inês Traders:</strong> ${v}</div>`;
  input.value = '';
}
function openMentor(){
  document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
  const m = document.querySelector('[data-page="mentor"]'); if(m) m.classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.style.display='none');
  const s = document.getElementById('mentorPage'); if(s) s.style.display='block';
}

/* Journal panel sticky fallback from legacy */
function renderJournalList(){}

/* Copilot/GPS placeholders kept for compatibility hooks in HTML */
function runCopilot(){}
function runGps(){}
function runPsychology(){}

window.addEventListener('load', load);
window.addEventListener('hashchange', initNav);
window.addEventListener('load', load);
window.addEventListener('hashchange', ()=>{});
