/* Trading Room - cockpit unificado */
const fmtPct = v => `${((Number(v)||0)*100).toFixed(2)}%`;
const API = window.location.origin;
let DATA = null, TWIN = null, ACTIVE_SESSION = null, MT5 = null, API_ON = false;
const SIDEBAR_KEY = 'tr-sidebar-collapsed-v2';

function applySidebarState(){
  const sidebar = document.querySelector('.sidebar');
  const collapsed = localStorage.getItem(SIDEBAR_KEY) === '1';
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed', !!collapsed);
  const btn = document.querySelector('#menuToggle');
  if (btn) btn.setAttribute('aria-label', collapsed ? 'Mostrar menu' : 'Ocultar menu');
}
function toggleSidebar(){
  const sidebar = document.querySelector('.sidebar');
  const collapsed = sidebar && sidebar.classList.toggle('collapsed');
  localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  const btn = document.querySelector('#menuToggle');
  if (btn) btn.setAttribute('aria-label', collapsed ? 'Mostrar menu' : 'Ocultar menu');
}

/* Sidebar activa no dashboard */
function initSidebar(){
  const links = document.querySelectorAll('[data-route]');
  links.forEach(a=>a.addEventListener('click', ()=>{
    links.forEach(x=>x.classList.remove('active'));
    a.classList.add('active');
    const name = a.querySelector('span')?.textContent || a.textContent;
    const title = document.querySelector('#pageTitle');
    if(title) title.textContent = name;
  }));
}

async function apiGet(path, fallbackUrl){
  try{
    const r = await fetch(`${API}${path}`, {cache:'no-store'});
    if(!r.ok) throw new Error(`${path} ${r.status}`);
    API_ON = true;
    return await r.json();
  }catch(e){
    if(fallbackUrl) return fetch(fallbackUrl, {cache:'reload'}).then(r=>r.json());
    throw e;
  }
}

async function load(){
  applySidebarState();
  DATA = await apiGet('/api/room-engine', 'data/alphaforge-snapshot.json');
  TWIN = await apiGet('/api/trader-twin', 'data/trader-twin.json');
  if (!TWIN) TWIN = {};
  ACTIVE_SESSION = (await apiGet('/api/session/active')).active;
  MT5 = await apiGet('/api/mt5/accounts').catch(()=>({accounts:[], recent_trades:[], metrics:{}}));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

  setInterval(refreshLiveData, 15000);

  await Promise.all([runGps(), runPsychology(), initAutoJournal()]);
  renderAll();
  updateApiPill();
  const menuBtn = document.querySelector('#menuToggle');
  if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);
  initSidebar();
}

async function refreshLiveData(){
  try{
    const r = await fetch(`${API}/api/room-engine`, {cache:'no-store'});
    if (!r.ok) throw new Error('refresh failed');
    const j = await r.json();
    DATA = j;
    TWIN = (await fetch(`${API}/api/trader-twin`, {cache:'no-store'}).then(r2=>r2.json()).catch(()=>({}))) || TWIN;
    if (!TWIN) TWIN = {};
    ACTIVE_SESSION = (await fetch(`${API}/api/session/active`, {cache:'no-store'}).then(r2=>r2.json()).catch(()=>({active:null}))).active;
    MT5 = (await fetch(`${API}/api/mt5/accounts`, {cache:'no-store'}).then(r2=>r2.json()).catch(()=>({accounts:[], recent_trades:[], metrics:{}}))) || MT5;
    API_ON = true;
    renderAll();
  }catch(e){ console.warn('refresh failed', e); }
}

function updateApiPill(){
  const hint=document.querySelector('#routeHint');
  if(hint) hint.textContent = API_ON ? 'api vivo' : 'paper';
}

/* Data binding */
function set(sel, value){
  const el=document.querySelector(sel);
  if(el) el.textContent=value;
}
function safeArr(x){ return Array.isArray(x) ? x : []; }

/* Core cockpit render */
function renderAll(){
  if(!DATA || !TWIN) return;
  const m = DATA.metrics || {};
  set('#metricTrades', m.trade_count || 0);
  set('#metricWinrate', fmtPct(m.win_rate));
  set('#metricPnl', fmtPct(m.total_pnl_pct));

  const asset = DATA.asset || DATA.goal?.asset || 'XAU/USD';
  set('#assetPill', asset);
  set('#pageTitle', asset);

  renderConnectAccount();
  renderSession();
  renderEngine();
  renderCopilot();
  renderGps();
  renderPsychology();
  renderJournalList();
  renderMarketplace();
  renderVisual();
  renderQuantFund();
}

/* Connect */
function renderConnectAccount(){
  const root = document.querySelector('#connectAccounts'); if(!root) return;
  const accounts = safeArr(MT5?.accounts);
  const trades = safeArr(MT5?.recent_trades).slice(-6).reverse();
  const metrics = MT5?.metrics || {};
  const header = `<div class=\"metricbar\"><div><small>Trades</small><b>${metrics.trade_count||0}</b></div><div><small>Win rate</small><b>${fmtPct(metrics.win_rate||0)}</b></div><div><small>PnL</small><b class=\"${Number(metrics.total_pnl||0)>=0?'ok':'bad'}\">${Number(metrics.total_pnl||0).toFixed(2)}</b></div></div>`;
  const acc = accounts.length ? accounts.map(a=>`<div class=\"row\"><span><b>${a.label}</b> <small class=\"mini\">${a.mode} · ${a.status}</small></span><small class=\"mono\">${a.token||''}</small></div>`).join('') : '<p class=\"mini\">Sem contas ligadas.</p>';
  const trd = trades.length ? trades.map(t=>`<div class=\"trade\"><span class=\"badge ${String(t.side).toLowerCase().includes('sell')?'sell':'buy'}\">${t.side||'trade'}</span><span class=\"mono\">${t.symbol} · ${t.strategy||t.source}</span><strong class=\"${Number(t.pnl)>=0?'ok':'bad'}\">${Number(t.pnl||0).toFixed(2)}</strong></div>`).join('') : '<p class=\"mini\">Sem trades.</p>';
  root.innerHTML = header + acc + trd;
}

/* Session */
function renderSession(){
  const root = document.querySelector('#sessionPanel'); if(!root) return;
  const active = ACTIVE_SESSION ? 'Sessão activa' : 'Sem sessão';
  const klass = ACTIVE_SESSION ? 'ok' : 'amb';
  root.innerHTML = `<div class=\"value ${klass}\" style=\"font-size:18px\">${active}</div>`;
}

/* Engine */
function renderEngine(){
  const root = document.querySelector('#enginePanel'); if(!root) return;
  const state = DATA?.worker_status || DATA?.engine_state_found ? 'on' : 'off';
  const events = safeArr(DATA?.engine_events).slice(-4).reverse();
  const ev = events.map(e=>`<div class=\"row\"><span>${e.type}</span><b class=\"${e.status==='ok'?'ok':'amb'}\">${e.status}</b></div>`).join('');
  root.innerHTML = `<div class=\"value ${state==='on'?'ok':'bad'}\" style=\"font-size:18px\">${state}</div>` + (ev || '<p class=\"mini\">Sem eventos.</p>');
}

/* Copilot */
function renderCopilot(){
  if(!DATA || !TWIN) return;
  const state = TRADING_STATE || {};
  const riskBudget = Number(DATA?.capital?.today_risk_budget_pct || 0);
  const emotional = Number(TWIN?.adaptive_emotional_risk || TWIN?.emotional_risk_base || 0);
  set('#copilotRulesPass', (riskBudget>0 && emotional<=0.75) ? '5/5' : '4/5');
  set('#copilotRisk', fmtPct(emotional));
  set('#copilotRR', '1.6');
  const decision = document.querySelector('#copilotDecision');
  if(state.copilot_decision === 'approved'){
    if(decision){ decision.className='ok'; decision.textContent='Trade autorizado'; }
  }else{
    if(decision){ decision.className='amb'; decision.textContent='Sessão não autorizada'; }
  }
}
async function runCopilot(){
  const checks = [document.querySelector('#copilotTrend')?.checked, document.querySelector('#copilotLiquidity')?.checked, document.querySelector('#copilotStructure')?.checked, document.querySelector('#copilotNews')?.checked, document.querySelector('#copilotRiskOk')?.checked].filter(Boolean).length;
  set('#copilotRulesPass', `${checks}/5`);
  const out = document.querySelector('#copilotOutput');
  if(!out) return;
  out.innerHTML = checks===5 ? '<div class=\"ok\">Checklist OK — confirma e executa.</div>' : '<div class=\"bad\">Faltam cheques. Completa a checklist.</div>';
}

/* GPS */
function renderGps(){}
async function runGps(){
  try{
    const scoreEl = document.querySelector('#gpsScore');
    const verdictEl = document.querySelector('#gpsVerdict');
    const blockedEl = document.querySelector('#gpsBlocked');
    const regimeEl = document.querySelector('#gpsRegime');
    if(scoreEl) scoreEl.textContent='--';
    if(verdictEl) verdictEl.textContent='A carregar...';
    const state = (await fetch('/api/trading-state', {cache:'no-store'}).then(r=>r.json()).catch(()=>null)) || {};
    const gps = await fetch('/api/trading-gps', {cache:'no-store'}).then(r=>r.json()).catch(()=>null);
    const score = (gps && gps.regime_confidence!=null) ? Math.round(gps.regime_confidence*100) : (state.mental_risk!=null ? Math.round((1-state.mental_risk)*100) : '--');
    if(scoreEl) scoreEl.textContent = score==='--' ? '--' : `${score}/100`;
    if(gps){
      if(verdictEl) verdictEl.textContent = gps.verdict==='go' ? 'Operar' : 'Aguardar';
      if(blockedEl) blockedEl.textContent = gps.blocked ? 'Bloqueado' : 'Livre';
      if(regimeEl) regimeEl.textContent = gps.regime || state?.session_regime || 'unknown';
    }else{
      if(verdictEl) verdictEl.textContent = state.copilot_decision==='approved' ? 'Sessão autorizada' : 'Aguardar';
      if(blockedEl) blockedEl.textContent = '--';
      if(regimeEl) regimeEl.textContent = state.session_regime || 'unknown';
    }
  }catch(e){ console.warn('gps failed', e); }
}

/* Psychology */
function renderPsychology(){}
async function runPsychology(){
  try{
    const res = await fetch('/api/psychology', {cache:'no-store'}).then(r=>r.json()).catch(()=>null);
    const root = document.querySelector('#psychologyOutput'); if(!root) return;
    if(!res){ root.innerHTML = '<p class="mini">Sem análise.</p>'; return; }
    const score = Number(res.score ?? 0);
    root.innerHTML = `<div class=\"metricbar\"><div><small>Score</small><b>${score}</b></div><div><small>Acção</small><b>${res.guardrail || 'Respirar'}</b></div></div>`;
  }catch(e){}
}

/* Journal */
async function saveJournal(){
  const ta = document.querySelector('#journalText');
  const text = ta?.value?.trim(); if(!text) return;
  await apiGet('/api/journal/save?text=' + encodeURIComponent(text));
  ta.value='';
  renderJournalList();
}
function renderJournalList(){
  const root = document.querySelector('#journalEntries'); if(!root) return;
  root.innerHTML='<p class=\"mini\">Guardado localmente.</p>';
}

/* Marketplace */
function renderMarketplace(){
  const root = document.querySelector('#marketRows'); if(!root) return;
  if(DATA && safeArr(DATA.marketplace).length){
    renderMarketplaceItems(safeArr(DATA.marketplace)); return;
  }
  apiGet('/api/marketplace','data/marketplace.json').then(j=>{
    renderMarketplaceItems(safeArr(j.items));
  }).catch(()=>{ root.innerHTML='<p class=\"mini">Sem marketplace.</p>'; });
}
function renderMarketplaceItems(list){
  const root = document.querySelector('#marketRows'); if(!root) return;
  root.innerHTML = list.map(s=>{
    const scoreClass = (Number(s.score)||0)>=80?'buy':(Number(s.score)||0)>=60?'amb':'sell';
    const drawdown = s.max_drawdown!=null ? `${(Number(s.max_drawdown)*100).toFixed(1)}%` : '--';
    const winrate = s.win_rate!=null ? `${(Number(s.win_rate)*100).toFixed(1)}%` : '--';
    return `<div class=\"strategy card\"><div style=\"display:flex;justify-content:space-between\"><div><b>${s.name}</b><br><small class=\"mini\">${s.regime||'any'} · ${s.status||'paper'}</small></div><div style=\"text-align:right\"><span class=\"badge ${scoreClass}\">${s.score}</span><br><strong class=\"cyan\">${s.trust}</strong></div></div><div class=\"metricbar\" style=\"margin-top:10px\"><div><small>Win rate</small><b>${winrate}</b></div><div><small>Drawdown</small><b class=\"bad\">${drawdown}</b></div></div></div>`;
  }).join('') || '<p class=\"mini\">Sem estratégias.</p>';
}
function refreshMarketplace(){ renderMarketplace(); }
function addDemoMarketplaceStrategy(){
  const payload = {name:'Demo', regime:'trend pullback', status:'paper', score:74, trust:'queued', win_rate:0, description:'Demo UI.'};
  apiGet('/api/marketplace').then(()=>refreshMarketplace()).catch(()=>refreshMarketplace());
}

/* Visual */
function renderVisual(){
  const canvas = document.querySelector('#visualEquityCanvas'); if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth; const h = canvas.height = 180;
  ctx.fillStyle='#0b1120'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#22c55e'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke();
  const root = document.querySelector('#visualRecent'); if(!root) return;
  const trades = safeArr(DATA?.recent_trades).slice(-6).reverse();
  root.innerHTML = trades.map(t=>`<div class=\"trade\"><span class=\"badge ${String(t.direction||t.side).toLowerCase().includes('sell')?'sell':'buy'}\">${t.direction||t.side}</span><span class=\"mono\">${t.asset||'paper'}</span><strong class=\"${Number(t.pnl_pct||t.pnl||0)>=0?'ok':'bad'}\">${fmtPct(Number(t.pnl_pct||t.pnl||0))}</strong></div>`).join('') || '<p class=\"mini\">Sem setups.</p>';
}

/* QuantFund */
function renderQuantFund(){
  const root = document.querySelector('#quantfundSummary'); if(!root) return;
  apiGet('/api/quantfund','data/quantfund.json').then(j=>{
    root.innerHTML = `<div class=\"metricbar\"><div><small>Win rate</small><b class=\"amb\">${fmtPct(j.win_rate)}</b></div><div><small>PnL</small><b>${fmtPct(j.total_pnl_pct)}</b></div><div><small>Drawdown</small><b class=\"bad\">${fmtPct(j.max_drawdown_pct)}</b></div><div><small>Regime</small><b class=\"cyan\">${(j.regime_current||'paper-observed').replace('-',' ')}</b></div></div>`;
  }).catch(()=>{ root.innerHTML='<p class=\"mini">Sem dados do QuantFund.</p>'; });
}

/* Helpers placeholders */
function initAutoJournal(){ /* auto-save pode ser activado depois */ }

window.addEventListener('load', load);
window.addEventListener('hashchange', ()=>{});
