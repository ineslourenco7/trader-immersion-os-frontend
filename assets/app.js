const fmtPct = v => `${((Number(v)||0)*100).toFixed(2)}%`;
const API = window.location.origin;
let DATA = null;
let TWIN = null;
let ACTIVE_SESSION = null;
let MT5 = null;
let API_ON = false;
const SIDEBAR_KEY = 'tr-sidebar-collapsed-8129';
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

const routes = {
 dashboard:{title:'Trading Room', sub:'Sala central: mercado, estratégia, paper worker, risco e decisões num só cockpit.'},
 connect:{title:'Ligar conta', sub:'Escolhe a forma mais simples de acompanhar os teus trades: iPhone, importação ou MT5 automático.'},
 session:{title:'Session Room', sub:'Entra na sala, valida mente/mercado/risco e deixa o Trader Twin decidir se podes operar.'},
 engine:{title:'AlphaForge Engine', sub:'O motor interno do Trading Room: worker, estratégia ativa, trades paper, heartbeat e hipóteses.'},
 gps:{title:'Trading GPS', sub:'Filtro de oportunidade antes de procurar entradas. Analisa condições e devolve uma nota de 0 a 100.'},
 copilot:{title:'Trading Copilot', sub:'Antes de executar, confirma checklist, risco e notícias.'},
 quantfund:{title:'QuantFund AI', sub:'Gera estatísticas, planos de melhoria diários, disciplina e scores emocionais/técnicos — papel primeiro.'},
 coach:{title:'Trading Memory Coach', sub:'Um espaço mental: identifica sabotagem, revenge trading e regras pessoais de proteção.'},
 psychology:{title:'IA de Psicologia do Trader', sub:'Lê os teus padrões emocionais e transforma-os em regras: pausa, tamanho, estratégia e foco.'},
 regime:{title:'Market Regime AI', sub:'Antes de qualquer estratégia: que tipo de mercado estamos a viver agora?'},
 capital:{title:'Capital Allocation AI', sub:'A pergunta principal deixa de ser “entro?” e passa a ser “posso arriscar hoje?”'},
 marketplace:{title:'Marketplace auditável', sub:'Estratégias com histórico, regime score, drawdown e trust — sem gurus sem provas.'},
 journal:{title:'Journal & Reflexão', sub:'Escreve o que aconteceu, identifica padrões e melhora a tua disciplina sessão após sessão.'},
 profile:{title:'Perfil individual', sub:'Histórico, métricas e regras pessoais do trading.'},
 ideas:{title:'O que o Trading Room faz por ti', sub:'Funcionalidades pensadas para acompanhar trades, proteger capital e melhorar disciplina.'}
};

const IDEAS = [
 {name:'Conta ligada', tag:'métricas', status:'ativo', text:'Guarda sessões, trades, reflexões e estratégias para acompanhares a tua evolução num só lugar.'},
 {name:'Trader Twin', tag:'disciplina', status:'ativo', text:'Aprende com os teus padrões: FOMO, ansiedade, revenge trading, perdas seguidas e boas decisões.'},
 {name:'Sessão de trading', tag:'rotina', status:'ativo', text:'Ajuda-te a preparar, iniciar, acompanhar e rever cada sessão com mais controlo.'},
 {name:'AlphaForge', tag:'estratégia', status:'ativo', text:'Acompanha testes e ideias de estratégia em modo paper-first, antes de qualquer risco real.'},
 {name:'Trading GPS', tag:'filtro', status:'ativo', text:'Avalia condições de mercado e dá uma nota de 0 a 100 antes de entrares.'},
 {name:'Trading Copilot', tag:'checklist', status:'ativo', text:'Valida checklist, risco e notícias antes de executar um trade.'},
 {name:'IA de Psicologia do Trader', tag:'mente', status:'ativo', text:'Lê os teus padrões emocionais e gera regras de proteção personalizadas.'},
 {name:'Market Regime AI', tag:'mercado', status:'ativo', text:'Ajuda a perceber se o mercado está em tendência, range, alta volatilidade ou baixa liquidez.'},
 {name:'Capital Allocation AI', tag:'risco', status:'ativo', text:'Ajuda a definir limites de risco, pausas e proteção contra overtrading.'},
 {name:'Marketplace auditável', tag:'estratégias', status:'ativo', text:'Compara estratégias com métricas, contexto de mercado, risco e histórico de resultados.'},
 {name:'QuantFund AI', tag:'estatísticas', status:'ativo', text:'Gera estatísticas, planos de melhoria diários, disciplina e scores emocionais/técnicos — papel primeiro.'},
 {name:'Journal & Reflexão', tag:'coach', status:'ativo', text:'Escreve o que aconteceu, identifica padrões e melhora a tua disciplina sessão após sessão.'},
 {name:'Perfil individual', tag:'conta', status:'ativo', text:'Histórico, métricas e regras pessoais do trading.'},
 {name:'Análise visual', tag:'gráfico', status:'em breve', text:'Ajuda a rever setups, contexto e razões para entrar ou não entrar numa operação.'}
];

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
function toggleSidebar(){
  const sidebar = document.querySelector('.sidebar');
  const collapsed = sidebar && sidebar.classList.toggle('collapsed');
  localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  const btn = document.querySelector('#menuToggle');
  if (btn) btn.setAttribute('aria-label', collapsed ? 'Mostrar menu' : 'Ocultar menu');
}

function collapseSidebar(){
  const sidebar = document.querySelector('.sidebar');
  const btn = document.querySelector('#collapseSidebarBtn');
  if (!sidebar || !btn) return;

  const toCollapse = !sidebar.classList.contains('collapsed');
  sidebar.classList.toggle('collapsed', toCollapse);
  localStorage.setItem(SIDEBAR_KEY, toCollapse ? '1' : '0');
  btn.textContent = toCollapse ? 'Expandir' : 'Recolher';
}

async function load(){
  DATA = await apiGet('/api/room-engine', 'data/alphaforge-snapshot.json?v=5.0');
  TWIN = await apiGet('/api/trader-twin', 'data/trader-twin.json?v=5.0');
  if (!TWIN && typeof compute_twin === 'function') TWIN = compute_twin();
  if (!TWIN) TWIN = {};
  ACTIVE_SESSION = (await apiGet('/api/session/active')).active;
  MT5 = await apiGet('/api/mt5/accounts').catch(()=>({accounts:[], recent_trades:[], metrics:{}}));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  setInterval(refreshLiveData, 15000);
  setInterval(renderActiveSessionPulse, 1000);
  await runGps();
  await runPsychology();
  await initAutoJournal();
  route();
  renderAll();
  applySidebarState();
  updateApiPill();
  const menuBtn = document.querySelector('#menuToggle');
  if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);
}

async function refreshLiveData(){
 try{
  const r = await fetch(`${API}/api/room-engine`, {cache:'no-store'});
  if (!r.ok) throw new Error('refresh failed');
  const j = await r.json();
  DATA = j;
  TWIN = (await fetch(`${API}/api/trader-twin`, {cache:'no-store'}).then(r2=>r2.json()).catch(()=>({}))) || TWIN;
  if (!TWIN && typeof compute_twin === 'function') TWIN = compute_twin() || TWIN;
  if (!TWIN) TWIN = {};
  ACTIVE_SESSION = (await fetch(`${API}/api/session/active`, {cache:'no-store'}).then(r2=>r2.json()).catch(()=>({active:null}))).active;
  MT5 = (await fetch(`${API}/api/mt5/accounts`, {cache:'no-store'}).then(r2=>r2.json()).catch(()=>({accounts:[], recent_trades:[], metrics:{}}))) || MT5;
  API_ON = true;
 }catch(e){ console.warn('refresh failed', e); }
}
function updateApiPill(){
 const hint=document.querySelector('#routeHint');
 if(hint) hint.textContent = API_ON ? 'api vivo' : 'paper';
}
function currentRoute(){ return (location.hash||'#dashboard').slice(1).split('?')[0]; }
function setHeader(key){ const r=routes[key]||routes.dashboard; document.querySelector('#pageTitle').textContent=r.title; document.querySelector('#pageSub').textContent=r.sub; document.querySelector('#assetPill').textContent=DATA?.asset||DATA?.goal?.asset||'XAU/USD'; }
function navActive(key){
  document.querySelectorAll('[data-route]').forEach(a=>a.classList.toggle('active', a.dataset.route===key));
  const pageId = `page-${key}`;
  document.querySelectorAll('.nav-cat').forEach(cat=>{
    const has = cat.querySelector(`a[href="#${pageId}"]`);
    if(!has) return;
    [...cat.querySelectorAll('a')].forEach(a=>a.classList.toggle('active', a.getAttribute('href')===`#${pageId}`));
  });
}
function route(){
  const key=currentRoute();
  const k=routes[key]?key:'dashboard';
  setHeader(k);
  navActive(k);
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active', p.id===`page-${k}`));
  if(k==='gps') renderGps();
  if(k==='copilot') renderCopilot();
  if(k==='quantfund') renderQuantFund();
  if(k==='regime') renderRegime();
  if(k==='capital') renderCapital();
  if(k==='journal') renderJournal();
  if(k==='profile') renderProfile();
  renderAll();
}
function renderAll(){
  if(!DATA || !TWIN) return;
  const m=DATA.metrics||{};
  document.querySelector('#metricTrades').textContent=m.trade_count||0;
  document.querySelector('#metricWinrate').textContent=fmtPct(m.win_rate);
  document.querySelector('#metricPnl').textContent=fmtPct(m.total_pnl_pct);
  document.querySelector('#metricDD').textContent=fmtPct(m.max_drawdown_pct);
  document.querySelector('#strategyJson').textContent=JSON.stringify(DATA.strategy||{}, null, 2);
  document.querySelector('#regimeName').textContent=DATA.regime?.current || 'paper-observed';
  document.querySelector('#regimeConf').textContent=fmtPct(DATA.regime?.confidence || 0);
  document.querySelector('#coachState').textContent=DATA.coach?.state || `Twin risk ${fmtPct(TWIN.adaptive_emotional_risk || TWIN.emotional_risk_base)}`;
  document.querySelector('#revengeRisk').textContent=fmtPct(DATA.coach?.revenge_risk || TWIN.revenge_risk_base || 0);
  document.querySelector('#riskBudget').textContent=fmtPct(DATA.capital?.today_risk_budget_pct || 0);
  document.querySelector('#liveCapital').textContent=DATA.capital?.live_capital_enabled?'ON':'OFF';
  renderTrades(); renderLists(); renderMarketplace(); renderEngine(); renderSession(); renderIdeas(); renderConnectAccount();
}
function safeArr(x){ return Array.isArray(x) ? x : []; }
function renderTrades(){ const rows=safeArr(DATA.recent_trades).slice(-8).reverse(); const html = rows.length?rows.map(t=>{const side=String(t.direction||t.side||'Buy'); const klass=side.toLowerCase().includes('sell')?'sell':'buy'; const pnl=Number(t.pnl_pct||t.pnl||0); return `<div class="trade"><span class="badge ${klass}">${side}</span><span class="mono">${t.timestamp||t.asset||'paper'}</span><strong class="${pnl>=0?'ok':'bad'}">${fmtPct(pnl)}</strong></div>`}).join(''):'<p class="mini">Ainda sem trades suficientes.</p>'; ['#recentTrades','#engineRecentTrades'].forEach(sel=>{ const el=document.querySelector(sel); if(el) el.innerHTML=html; }); }
function renderLists(){
 const regime=DATA.regime||{}; const coach=DATA.coach||{};
 document.querySelector('#regimeDrivers').innerHTML = safeArr(regime.drivers).map(x=>`<span class="chip hot">${x}</span>`).join('') || '<span class="chip hot">api snapshot</span>';
 document.querySelector('#allowedStrategies').innerHTML = safeArr(regime.allowed_strategies).map(x=>`<div class="row"><span>${x}</span><b class="ok">permitida</b></div>`).join('') || '<div class="row"><span>paper worker</span><b class="ok">permitida</b></div>';
 document.querySelector('#blockedStrategies').innerHTML = safeArr(regime.blocked_strategies).map(x=>`<div class="row"><span>${x}</span><b class="bad">bloqueada</b></div>`).join('') || '<div class="row"><span>live capital</span><b class="bad">bloqueada</b></div>';
 const rules = safeArr(coach.rules).concat(safeArr(TWIN.next_guardrail_suggestions)).slice(0,5);
 document.querySelector('#coachRules').innerHTML = rules.map(x=>`<div class="row"><span>${x}</span><b class="amb">regra</b></div>`).join('');
}
function renderMarketplace(){
 const root=document.querySelector('#marketRows'); if(!root) return;
 if(DATA && safeArr(DATA.marketplace).length){ root.innerHTML=safeArr(DATA.marketplace).map(s=>`<div class="strategy"><span class="badge buy">${s.score}</span><span><b>${s.name}</b><br><small class="mini">${s.regime} · ${s.status}</small></span><strong class="cyan">${s.trust}</strong></div>`).join(''); return; }
 apiGet('/api/marketplace','data/marketplace.json').then(j=>{ const list=j.items||[]; root.innerHTML=list.length?list.map(s=>`<div class="strategy"><span class="badge buy">${s.score}</span><span><b>${s.name}</b><br><small class="mini">${s.regime} · ${s.status}</small></span><strong class="cyan">${s.trust}</strong></div>`).join(''):'<p class="mini">As estratégias auditáveis aparecem aqui quando houver histórico comparável.</p>'; }).catch(()=>{ root.innerHTML='<p class="mini">As estratégias auditáveis aparecem aqui quando houver histórico comparável.</p>'; });
}
function renderQuantFund(){
 const root=document.querySelector('#quantfundSummary'); if(!root) return;
 const plan=document.querySelector('#quantfundPlan'); if(!plan) return;
 const history=document.querySelector('#quantfundHistory'); if(!history) return;
 apiGet('/api/quantfund','data/quantfund.json').then(j=>{
  root.innerHTML=`
   <div class="metricbar">
     <div><small>Win rate</small><b class="amb">${fmtPct(j.win_rate)}</b></div>
     <div><small>PnL</small><b>${fmtPct(j.total_pnl_pct)}</b></div>
     <div><small>Drawdown</small><b class="bad">${fmtPct(j.max_drawdown_pct)}</b></div>
     <div><small>Regime</small><b class="cyan">${(j.regime_current||'paper-observed').replace('-',' ')}</b></div>
   </div>
   <div class="metricbar">
     <div><small>Paper trades</small><b id="quantTrades">${j.paper_trades}</b></div>
     <div><small>Sessoes</small><b>${j.sessions_count??0}</b></div>
     <div><small>Disciplina</small><b class="amb">${fmtPct(j.discipline_score||0)}</b></div>
     <div><small>Regime conf.</small><b class="amb">${fmtPct(j.regime_confidence||0)}</b></div>
   </div>`;
  apiGet('/api/quantfund/equity').then(eq=>drawEquity(eq)).catch(()=>{});
  apiGet('/api/edge-tracking').then(edge=>renderEdgeTracking(edge)).catch(()=>{});
  const items=safeArr(j.daily_plan?.actions).concat(safeArr(j.plan_items)).slice(0,6);
  plan.innerHTML=items.length?items.map(x=>`<div class="row"><span>${x}</span><b class="amb">acao</b></div>`).join(''):'<p class="mini">Plano diario ainda nao definido.</p>';
  history.innerHTML=`<div class="row"><span>Atualizado · ${String(j.updated_at||'').slice(0,19).replace('T',' ')}</span><b class="ok">snapshot</b></div>`;
 }).catch(()=>{
  root.innerHTML='<p class="mini">Sem dados do QuantFund AI agora.</p>';
 });
}
function drawEquity(payload){
 const canvas=document.querySelector('#equityCanvas'); if(!canvas) return;
 const points=safeArr(payload?.points);
 if(!points.length){ const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#7a8599'; ctx.fillText('Sem pontos para o gráfico.', 12, 20); return; }
 const rect=canvas.getBoundingClientRect(); canvas.width=Math.max(1, Math.floor(rect.width)); canvas.height=220;
 const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
 const values=points.map(p=>Number(p.equity)||0);
 const min=Math.min(...values); const max=Math.max(...values); const range=max-min||1;
 const pad={t:20, b:28, l:50, r:18}; const w=canvas.width-pad.l-pad.r; const h=canvas.height-pad.t-pad.b;
 const x=i=>pad.l + (points.length>1 ? (i/(points.length-1))*w : w/2);
 const y=v=>pad.t + h - ((v-min)/range)*h;
 ctx.beginPath(); ctx.moveTo(x(0), y(values[0]));
 for(let i=1;i<values.length;i++){ ctx.lineTo(x(i), y(values[i])); }
 ctx.strokeStyle='#3b82f6'; ctx.lineWidth=2; ctx.stroke();
 ctx.fillStyle='rgba(59,130,246,0.2)'; ctx.lineTo(x(values.length-1), pad.t+h); ctx.lineTo(x(0), pad.t+h); ctx.closePath(); ctx.fill();
 ctx.fillStyle='#c7cdd6'; ctx.font='11px Inter, sans-serif'; ctx.textAlign='right';
 ctx.fillText(max.toFixed(2), pad.l-8, pad.t+12); ctx.fillText(min.toFixed(2), pad.l-8, pad.t+h+4);
 ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.moveTo(pad.l, pad.t+h/2); ctx.lineTo(pad.l+w, pad.t+h/2); ctx.stroke();
}
function renderRegime(){
 const name=document.querySelector('#regimeName2'); const conf=document.querySelector('#regimeConf2');
 const drivers=document.querySelector('#regimeDrivers'); const allowed=document.querySelector('#regimeAllowed'); const blocked=document.querySelector('#regimeBlocked'); if(!name||!conf||!drivers||!allowed||!blocked) return;
 apiGet('/api/regime','data/regime.json').then(j=>{
  name.textContent=j.current||'paper-observed';
  conf.textContent=fmtPct(j.confidence);
  drivers.innerHTML=safeArr(j.drivers).map(x=>`<span class="chip hot">${x}</span>`).join('') || '<span class="chip hot">api snapshot</span>';
  allowed.innerHTML=safeArr(j.allowed_strategies).map(x=>`<div class="row"><span>${x}</span><b class="ok">permitida</b></div>`).join('') || '<div class="row"><span>paper worker</span><b class="ok">permitida</b></div>';
  blocked.innerHTML=safeArr(j.blocked_strategies).map(x=>`<div class="row"><span>${x}</span><b class="bad">bloqueada</b></div>`).join('') || '<div class="row"><span>live capital</span><b class="bad">bloqueada</b></div>';
 }).catch(()=>{ drivers.innerHTML='<p class="mini">Sem dados de regime.</p>'; });
}
function renderCapital(){
 const risk=document.querySelector('#capitalRiskToday'); const live=document.querySelector('#capitalLive'); const mode=document.querySelector('#capitalMode'); const guards=document.querySelector('#capitalGuards'); if(!risk||!live||!mode||!guards) return;
 apiGet('/api/capital','data/capital.json').then(j=>{
  risk.textContent=fmtPct(j.today_risk_budget_pct);
  live.textContent=j.live_capital_enabled?'ON':'OFF';
  mode.textContent=j.mode||'paper';
  guards.innerHTML=safeArr(j.guards).map(x=>`<div class="row"><span>${x}</span><b class="amb">guard</b></div>`).join('');
 }).catch(()=>{ guards.innerHTML='<p class="mini">Sem dados de capital.</p>'; });
}
function renderEngine(){
 const heartbeat=DATA.heartbeat||{}; const strategy=DATA.strategy||{}; const goal=DATA.goal||{}; const metrics=DATA.metrics||{};
 const state=document.querySelector('#engineState'); if(!state) return;
 const last=heartbeat.timestamp||heartbeat.updated_at||heartbeat.time||DATA.generated_at||'sem heartbeat ainda';
 const age=DATA.heartbeat_age_seconds==null?'--':`${Math.floor(DATA.heartbeat_age_seconds/60)}m`;
 const found=DATA.engine_state_found;
 const live=DATA.engine_live;
 state.innerHTML=`<span class="dot"></span><b>${live?'Engine vivo · worker a escrever heartbeat':'Engine encontrado · heartbeat antigo/snapshot'}</b><small>${found?'state ligado':'snapshot'} · ${age}</small>`;
 document.querySelector('#engineMode').textContent=DATA.mode||goal.mode||'paper';
 document.querySelector('#engineAsset').textContent=DATA.asset||goal.asset||'XAU/USD';
 document.querySelector('#engineTrades').textContent=metrics.trade_count||0;
 document.querySelector('#engineWinrate').textContent=fmtPct(metrics.win_rate||0);
 const priceEl=document.querySelector('#enginePrice'); if(priceEl) priceEl.textContent=heartbeat.last_price||DATA.last_price||'--';
 const freshEl=document.querySelector('#engineFreshness'); if(freshEl){ freshEl.textContent=live?'LIVE':'STALE'; freshEl.className=`value ${live?'ok':'amb'}`; }
 const hbEl=document.querySelector('#engineHeartbeat'); if(hbEl) hbEl.textContent=String(last).slice(0,19).replace('T',' ');
 document.querySelector('#engineStrategy').textContent=JSON.stringify(strategy, null, 2);
 const hypotheses=safeArr(DATA.hypotheses).concat(safeArr(DATA.reflections)).slice(0,6);
 document.querySelector('#engineHypotheses').innerHTML=hypotheses.length?hypotheses.map(x=>`<div class="row"><span>${typeof x==='string'?x:(x.title||x.hypothesis||JSON.stringify(x))}</span><b class="amb">teste</b></div>`).join(''):'<div class="row"><span>Sem hipóteses registadas ainda</span><b class="amb">aguardar dados</b></div>';
 const events=document.querySelector('#engineEvents');
 if(events) events.innerHTML=safeArr(DATA.engine_events).map(e=>`<div class="journalEntry"><span><b>${e.type||'evento'}</b><br><small class="mini">${e.message||''}</small></span><time>${String(e.timestamp||'').slice(0,16).replace('T',' ')}</time></div>`).join('') || '<p class="mini">Sem eventos do motor ainda.</p>';
}
function renderIdeas(){
 const el=document.querySelector('#ideaGrid'); if(!el) return;
 el.innerHTML=IDEAS.map((x,i)=>`<div class="ideaCard"><div class="ideaTop"><span class="badge ${x.status==='feito'?'buy':x.status==='visual'?'amb':x.status==='futuro'?'sell':'amb'}">${String(i+1).padStart(2,'0')}</span><b>${x.name}</b></div><p>${x.text}</p><small>${x.tag} · ${x.status}</small></div>`).join('');
}
function elapsedLabel(iso){
 if(!iso) return '00:00';
 const diff=Math.max(0, Date.now()-new Date(iso).getTime());
 const mins=Math.floor(diff/60000); const hrs=Math.floor(mins/60); const rem=mins%60;
 return hrs>0 ? `${hrs}h ${String(rem).padStart(2,'0')}m` : `${rem}m`;
}
function renderActiveSessionPulse(){
 const status=document.querySelector('#sessionStatus');
 if(!status || !TWIN || !DATA) return;
 if(ACTIVE_SESSION){
   const s=sessionScore();
   const liveRisk=s.risk>=0.70?'bad':s.risk>=0.50?'amb':'ok';
   status.innerHTML=`<span class="dot"></span><b>Sessão ativa · ${elapsedLabel(ACTIVE_SESSION.started_at)}</b><small>${ACTIVE_SESSION.allowed?'paper autorizada':'modo protegido'} · <span class="${liveRisk}">risco ${fmtPct(s.risk)}</span></small>`;
   return;
 }
 const s=sessionScore();
 status.innerHTML=`<span class="dot"></span><b>${s.allowed?'Pronta para sessão paper':'Aguardar check-in'}</b><small>${s.complete}/${s.total} · risco ${fmtPct(s.risk)}</small>`;
}
function renderSession(){
 document.querySelector('#twinProfile').textContent=TWIN.profile_label || 'trader twin ativo';
 document.querySelector('#twinThesis').textContent=TWIN.thesis || 'O sistema aprende com sessões, journal e trades paper.';
 document.querySelector('#sessionRegime').textContent=DATA.regime?.current || 'paper-observed';
 document.querySelector('#sessionRegimeConf').textContent=fmtPct(DATA.regime?.confidence || 0);
 document.querySelector('#sessionRiskBudget').textContent=fmtPct(DATA.capital?.today_risk_budget_pct || 0);
 const rules=safeArr(TWIN.hard_rules).concat(safeArr(TWIN.next_guardrail_suggestions)).slice(0,5);
 document.querySelector('#twinRules').innerHTML=rules.map(x=>`<div class="row"><span>${x}</span><b class="amb">gate</b></div>`).join('');
 document.querySelectorAll('#mentalState,#lossesToday,[data-check]').forEach(el=>{ el.onchange=evaluateSession; });
 evaluateSession();
}
function sessionScore(){
 const mental=document.querySelector('#mentalState')?.value||'normal';
 const losses=Number(document.querySelector('#lossesToday')?.value||0);
 const checks=[...document.querySelectorAll('[data-check]')];
 const complete=checks.filter(c=>c.checked).length;
 let risk=Number(TWIN.adaptive_emotional_risk ?? TWIN.emotional_risk_base ?? 0.38);
 if(mental==='ansioso') risk+=0.22;
 if(mental==='revenge') risk+=0.48;
 if(mental==='calmo') risk-=0.12;
 if(losses>=1) risk+=0.12;
 if(losses>=2) risk+=0.30;
 risk=Math.max(0, Math.min(1, risk));
 const regimeOK=(DATA.regime?.confidence||0)>=0.65;
 const checklistOK=complete===checks.length;
 const allowed = checklistOK && regimeOK && risk < 0.70 && losses < 2 && !DATA.capital?.live_capital_enabled;
 return {mental, losses, complete, total:checks.length, risk, regimeOK, checklistOK, allowed};
}
function evaluateSession(){
 if(!TWIN || !DATA || !document.querySelector('#sessionDecision')) return;
 const s=sessionScore(); const box=document.querySelector('#sessionDecision'); const status=document.querySelector('#sessionStatus');
 let title='Aguardar check-in', text=`Checklist ${s.complete}/${s.total}. Risco emocional ${fmtPct(s.risk)}.`; let cls='decision wait';
 if(s.allowed){ title='Sessão paper autorizada'; text='Podes operar em modo paper com risco controlado. Mantém regra de paragem e fecha com reflexão.'; cls='decision allow'; }
 else if(s.losses>=2 || s.mental==='revenge' || s.risk>=0.70){ title='Bloquear / reduzir risco'; text='O Trader Twin detetou risco comportamental elevado. Melhor decisão: não operar ou reduzir para treino paper sem execução.'; cls='decision block'; }
 else if(!s.regimeOK){ title='Esperar regime mais claro'; text='A confiança de regime ainda não é suficiente para permitir operação disciplinada.'; cls='decision wait'; }
 else if(!s.checklistOK){ title='Completar checklist'; text='Faltam confirmações antes de abrir sessão paper.'; cls='decision wait'; }
 box.className=cls; box.innerHTML=`<strong>${title}</strong><span>${text}</span>`;
 renderActiveSessionPulse();
 return {title, ...s};
}
async function startTradingSession(){
 const s=evaluateSession();
 const item={allowed:s.allowed, mental:s.mental, losses:s.losses, risk:s.risk, regime:DATA.regime?.current||'unknown', note:s.allowed?'sessão paper iniciada':'sessão bloqueada/pendente', payload:{checklist:`${s.complete}/${s.total}`}};
 try{ const res=await apiPost('/api/session/start', item); ACTIVE_SESSION=res.session; await refreshLiveData(); }
 catch(e){ const arr=JSON.parse(localStorage.getItem('traderSessions')||'[]'); arr.unshift({at:new Date().toISOString(), action:'start', ...item}); localStorage.setItem('traderSessions', JSON.stringify(arr.slice(0,30))); await renderSessionHistory(); }
 if(!s.allowed) alert('Sessão não autorizada: completa checklist ou reduz risco.');
}
async function initAutoJournal(){
 const last = safeArr(DATA?.recent_trades||[]).slice(-1)[0];
 if(!last) return;
 const pnl = Number(last.pnl_pct||last.pnl||0);
 const side = String(last.direction||last.side||'trade');
 const asset = String(last.asset||last.symbol||'');
 const regime = String(DATA?.regime?.current||'unknown');
 const text = [`Auto trade review: ${side} ${asset}`, `Regime ${regime}`, `Resultado ${pnl>=0?'positivo':'negativo'} (${fmtPct(pnl)})`, `Review automática: registar padrões, disciplina e aprendizagem.`].join('\n');
 try{ const res = await apiPost('/api/journal', {text}); if(res?.id){ console.log('auto journal id', res.id); } }catch(e){ console.warn('auto journal failed', e); }
}
async function renderSessionHistory(){
 const el=document.querySelector('#sessionHistory'); if(!el) return;
 let arr=[];
 try{ const res=await apiGet('/api/sessions'); arr=res.items.map(x=>({at:x.started_at, action:x.action, allowed:x.allowed, note:x.note, regime:x.regime, risk:x.risk, active:x.active, ended_at:x.ended_at})); }
 catch(e){ arr=JSON.parse(localStorage.getItem('traderSessions')||'[]'); }
 el.innerHTML=arr.length?arr.map(x=>`<div class="journalEntry"><span><b>${x.active?'Ativa':(x.ended_at?'Fechada':'Start')} · ${x.allowed?'autorizada':'protegida'}</b><br><small class="mini">${x.note} · ${x.regime} · risco ${fmtPct(x.risk)}${x.active?' · '+elapsedLabel(x.at):''}</small></span><time>${String(x.at||'').slice(0,16).replace('T',' ')}</time></div>`).join(''):'<p class="mini">Sem sessões ainda. Agora ficam guardadas no servidor.</p>';
}
 async function saveJournal(){
 const txt=document.querySelector('#journalText').value.trim(); if(!txt){ alert('Escreve uma reflexão primeiro.'); return; }
 try{ const res=await apiPost('/api/journal', {text:txt}); if(res.insight){ alert(res.insight); const insightsEl=document.querySelector('#journalInsights'); if(insightsEl) insightsEl.innerHTML=`<div class="row"><span>${res.insight}</span><b class="amb">insight</b></div>`; } }
 catch(e){ const item={at:new Date().toISOString(), text:txt}; const arr=JSON.parse(localStorage.getItem('traderJournal')||'[]'); arr.unshift(item); localStorage.setItem('traderJournal', JSON.stringify(arr.slice(0,20))); }
 document.querySelector('#journalText').value=''; await refreshLiveData(); await renderJournal();
}
async function renderJournal(){
 const el=document.querySelector('#journalEntries'); if(!el) return;
 let arr=[];
 try{ const res=await apiGet('/api/journal'); arr=res.items.map(x=>({at:x.created_at, text:x.text, insight:x.insight, tags:x.tags})); }
 catch(e){ arr=JSON.parse(localStorage.getItem('traderJournal')||'[]'); }
 el.innerHTML=arr.length?arr.map(x=>`<div class="journalEntry"><span>${x.text}<br><small class="mini">${x.insight||''} ${safeArr(x.tags).map(t=>'#'+t).join(' ')}</small></span><time>${String(x.at||'').slice(0,16).replace('T',' ')}</time></div>`).join(''):'<p class="mini">Ainda sem notas. A próxima reflexão já entra na memória real do Trader Twin.</p>';
 renderJournalDailyReport();
 }
 async function renderJournalDailyReport(){
 const el=document.querySelector('#journalDailyReport'); if(!el) return;
 const historyEl=document.querySelector('#journalEntries');
 const insightEl=document.querySelector('#journalInsights');
 const items=[];
 const histText = historyEl ? historyEl.textContent || '' : '';
 const local = JSON.parse(localStorage.getItem('traderJournal')||'[]');
 const insightText = insightEl ? (insightEl.textContent || '') : '';
 const summary = `Relatório diário automático (offline). Total em cache: ${local.length}. Insight recente: ${insightText || 'Sem insight automático.'}`;
 el.innerHTML = `
  <div class="card span12">
   <h2 class="sectionTitle">Relatório diário automático</h2>
   <p class="subtitle" style="margin-top:0">Modo offline: usa registos em cache enquanto o backend não tiver a rota.</p>
   <p>${summary}</p>
   <div class="stack">
    <div class="row"><span>Estado</span><b class="amb">cliente</b></div>
   </div>
  </div>`;
}
async function renderStrategyBlueprints(){
 const el=document.querySelector('#strategyBlueprints'); if(!el) return;
 let items=[];
 try{ const res=await apiGet('/api/strategies'); items=safeArr(res.blueprints); }
 catch(e){ items=JSON.parse(localStorage.getItem('strategyBlueprints')||'[]'); }
 el.innerHTML=items.length?items.map(s=>`<div class="journalEntry"><span><b>${s.name}</b> <small class="mini">${s.market||'mercado livre'} · ${s.uses_indicators?'com indicadores':'sem indicadores'} · ${s.status||'draft'}</small><br><small class="mini">${s.description}</small>${s.entry_rules?`<br><small class="mini"><b>Entrada:</b> ${s.entry_rules}</small>`:''}${s.invalidation?`<br><small class="mini"><b>Não operar:</b> ${s.invalidation}</small>`:''}</span><time>${String(s.created_at||'').slice(0,16).replace('T',' ')}</time></div>`).join(''):'<p class="mini">Ainda sem estratégias guardadas. Escreve a primeira acima — pode ser só leitura de preço/liquidez, sem indicadores.</p>';
}
async function saveStrategyBlueprint(){
 const item={
   name:document.querySelector('#strategyName')?.value.trim()||'Estratégia sem nome',
   market:document.querySelector('#strategyMarket')?.value.trim()||'',
   description:document.querySelector('#strategyDescription')?.value.trim()||'',
   entry_rules:document.querySelector('#strategyEntry')?.value.trim()||'',
   exit_rules:document.querySelector('#strategyExit')?.value.trim()||'',
   invalidation:document.querySelector('#strategyInvalidation')?.value.trim()||'',
   risk_rules:document.querySelector('#strategyRisk')?.value.trim()||'',
   uses_indicators:!!document.querySelector('#strategyUsesIndicators')?.checked,
   status:'draft'
 };
 if(!item.description){ alert('Escreve pelo menos a descrição da estratégia.'); return; }
 try{ await apiPost('/api/strategies', item); }
 catch(e){ const arr=JSON.parse(localStorage.getItem('strategyBlueprints')||'[]'); arr.unshift({...item, created_at:new Date().toISOString()}); localStorage.setItem('strategyBlueprints', JSON.stringify(arr.slice(0,50))); }
 ['#strategyName','#strategyMarket','#strategyDescription','#strategyEntry','#strategyExit','#strategyInvalidation','#strategyRisk'].forEach(sel=>{ const el=document.querySelector(sel); if(el) el.value=''; });
 const chk=document.querySelector('#strategyUsesIndicators'); if(chk) chk.checked=false;
 await renderStrategyBlueprints();
 alert('Estratégia guardada. Agora o Trading Room já aceita estratégias sem indicadores.');
}
async function renderConnectAccount(){
 const root=document.querySelector('#connectAccounts'); if(!root) return;
 if(!MT5){ MT5 = await apiGet('/api/mt5/accounts').catch(()=>({accounts:[], recent_trades:[], metrics:{}})); }
 const metrics=MT5.metrics||{};
 const accounts=safeArr(MT5.accounts);
 const trades=safeArr(MT5.recent_trades);
 const accountHtml=accounts.length?accounts.map(a=>`<div class="journalEntry"><span><b>${a.label}</b> <small class="mini">${a.mode} · ${a.status}</small><br><small class="mini">Token: <span class="mono">${a.token}</span>${a.broker?' · '+a.broker:''}</small></span><time>${String(a.created_at||'').slice(0,16).replace('T',' ')}</time></div>`).join(''):'<p class="mini">Ainda sem contas ligadas. Começa pelo modo iPhone/manual se quiseres evitar configurações técnicas.</p>';
 const tradeHtml=trades.length?trades.map(t=>`<div class="trade"><span class="badge ${String(t.side).toLowerCase().includes('sell')?'sell':'buy'}">${t.side||'trade'}</span><span class="mono">${t.symbol} · ${t.strategy||t.source}</span><strong class="${Number(t.pnl)>=0?'ok':'bad'}">${Number(t.pnl||0).toFixed(2)}</strong></div>`).join(''):'<p class="mini">Ainda não tens trades guardados.</p>';
 root.innerHTML=`<div class="metricbar"><div><small>Trades</small><b>${metrics.trade_count||0}</b></div><div><small>Win rate</small><b>${fmtPct(metrics.win_rate||0)}</b></div><div><small>PnL</small><b class="${Number(metrics.total_pnl||0)>=0?'ok':'bad'}">${Number(metrics.total_pnl||0).toFixed(2)}</b></div><div><small>Drawdown</small><b>${Number(metrics.max_drawdown||0).toFixed(2)}</b></div></div><h3>Contas criadas</h3>${accountHtml}<h3>Trades guardados</h3>${tradeHtml}`;
}
async function createMT5Connection(mode='iphone_manual'){
 const label=document.querySelector('#mt5Label')?.value.trim()||'Conta MT5';
 const broker=document.querySelector('#mt5Broker')?.value.trim()||'';
 const account_login=document.querySelector('#mt5Login')?.value.trim()||'';
 try{ const res=await apiPost('/api/mt5/accounts', {label, broker, account_login, mode}); MT5=await apiGet('/api/mt5/accounts'); await renderConnectAccount(); alert(`Conta criada. Token: ${res.account.token}`); }
 catch(e){ alert('Não consegui criar a ligação agora.'); }
}
async function saveManualTrade(){
 const item={
   connection_id:Number(document.querySelector('#manualConnectionId')?.value||0)||null,
   source:'manual_iphone',
   symbol:document.querySelector('#manualSymbol')?.value.trim()||'XAUUSD',
   side:document.querySelector('#manualSide')?.value||'buy',
   lot:Number(document.querySelector('#manualLot')?.value||0),
   entry:Number(document.querySelector('#manualEntry')?.value||0),
   exit:Number(document.querySelector('#manualExit')?.value||0),
   pnl:Number(document.querySelector('#manualPnl')?.value||0),
   strategy:document.querySelector('#manualStrategy')?.value.trim()||'',
   note:document.querySelector('#manualNote')?.value.trim()||''
 };
 if(!item.symbol){ alert('Falta o símbolo.'); return; }
 try{ await apiPost('/api/mt5/trades', item); MT5=await apiGet('/api/mt5/accounts'); ['#manualPnl','#manualNote','#manualEntry','#manualExit'].forEach(sel=>{const el=document.querySelector(sel); if(el) el.value='';}); await renderConnectAccount(); alert('Trade guardado. As tuas métricas já foram atualizadas.'); }
 catch(e){ alert('Não consegui guardar o trade.'); }
}
window.addEventListener('load', load);
window.addEventListener('hashchange', route);

// ROTA: GPS
function renderGps(){
  const el=document.querySelector('#gpsScore'); if(!el) return;
  el.textContent='--';
  const v=document.querySelector('#gpsVerdict'); if(v) v.textContent='Sem avaliação ainda.';
}
async function runGps(){
 try{
  const r=await fetch('/api/trading-gps', {cache:'no-store'});
  const j=await r.json();
  const el=document.querySelector('#gpsScore'); if(el) el.textContent='--';
  const v=document.querySelector('#gpsVerdict'); if(v) v.textContent=j.verdict==='go'?'Operar':'Aguardar';
  if(j.regime_confidence==null){ alert('GPS não conseguiu avaliar agora.'); return; }
  const score=Math.round((j.regime_confidence||0)*100);
  const out=document.querySelector('#gpsScore'); if(out) out.textContent=`${score}/100`;
  const txt=['regime',j.regime,'trades',j.trades_count,'win rate',Math.round((j.win_rate||0)*100)+'%'].join(' · ');
  if(v) v.textContent=txt;
 }catch(e){ console.warn('gps failed', e); }
}

// ROTA: COPILOT
function renderCopilot(){ if(!DATA || !TWIN) return; const risks = [document.querySelector('#copilotRisk'), document.querySelector('#copilotRR'), document.querySelector('#copilotRulesPass'), document.querySelector('#copilotDecision')].filter(Boolean); risks.forEach(el => el.textContent = el?.textContent || '--'); const riskBudget = Number(DATA?.capital?.today_risk_budget_pct || 0); const emotional = Number(TWIN?.adaptive_emotional_risk || TWIN?.emotional_risk_base || 0); const rr = document.querySelector('#copilotRRInput')?.value ? fmtPct(Number(document.querySelector('#copilotRRInput').value)) : '1.6'; document.querySelector('#copilotRulesPass').textContent = '4/5'; document.querySelector('#copilotDecision').innerHTML = '<strong>Aguardar checklist</strong><span>Confirma as condições para validar o trade.</span>'; }

async function runCopilot(){
 try {
  const checks = [
    !!document.querySelector('#copilotTrend')?.checked,
    !!document.querySelector('#copilotLiquidity')?.checked,
    !!document.querySelector('#copilotStructure')?.checked,
    !!document.querySelector('#copilotNews')?.checked,
    !!document.querySelector('#copilotRiskOk')?.checked];
  const rrRaw = Number(document.querySelector('#copilotRRInput')?.value || 1.6);
  const riskBudget = Number(DATA?.capital?.today_risk_budget_pct || 0);
  const emotional = Number(TWIN?.adaptive_emotional_risk || TWIN?.emotional_risk_base || 0);
  const passed = String(checks.filter(Boolean).length) + '/' + String(checks.length);
  const canTrade = checks.every(Boolean) && rrRaw >= 1.2 && riskBudget > 0 && emotional <= 0.75;
  document.querySelector('#copilotRulesPass').textContent = passed;
  document.querySelector('#copilotRR').textContent = '1:' + String(rrRaw);
  document.querySelector('#copilotRisk').textContent = fmtPct(emotional);
  const out = document.querySelector('#copilotOutput');
  if (!out) return;
  out.innerHTML = canTrade
   ? '<div class="ok">Trade permitido</div><p class="mini">Checklist cumprida. Confirma risco e executa.</p>'
   : '<div class="bad">Bloqueado</div><p class="mini">Falta confirmações ou risco emocional elevado.</p>';
 } catch (e) { console.warn('copilot failed', e); }
}

// ROTA: PSYCHOLOGY COACH
function renderPsychology(){}

async function runPsychology(){
 try {
  const twin = TWIN || compute_twin ? (typeof compute_twin === "function" ? compute_twin() : TWIN) : TWIN;
  const score = Number(twin?.adaptive_emotional_risk || twin?.emotional_risk_base || 0);
  const normalizedScore = Math.round((1 - Math.min(1, Math.max(0, score))) * 100);
  const coachState = document.querySelector('#coachState');
  const revengeRisk = document.querySelector('#revengeRisk');
  const coachRules = document.querySelector('#coachRules');
  if (coachState) coachState.textContent = String(normalizedScore);
  if (revengeRisk) revengeRisk.textContent = fmtPct(score);
  if (coachRules && twin?.next_guardrail_suggestions) {
   coachRules.innerHTML = twin.next_guardrail_suggestions.map((rule) => `<div class="row"><span>${rule}</span><b class="amb">regra</b></div>`).join('');
  }
 } catch (e) { console.warn('psychology failed', e); }
}

// ROTA: EDGE TRACKING
function renderEdgeTracking(j){
 const el=document.querySelector('#edgeTracking'); if(!el) return;
 const items = safeArr(j?.items);
 const alerts = safeArr(j?.alerts);
 const renderItems = () => items.length
  ? items.map(x=>`<div class="row"><span>${x.setup} · ${x.asset} · ${x.session} · ${x.weekday}</span><b class="${x.status==='alert'?'bad':'amb'}">${x.win_rate?fmtPct(x.win_rate):'--'}</b></div>`).join('')
  : '<p class="mini">Sem dados suficientes para edge tracking ainda. Usa GPS, Copilot ou trades MT5 para alimentar.</p>';
 const alertsHtml = alerts.length ? alerts.map(a=>`<div class="row"><span>${a.setup} · ${a.asset} · ${a.session} · ${a.weekday}</span><b class="bad">degradar</b></div>`).join('') : '<p class="mini">Nenhum alerta de degradação agora.</p>';
 el.innerHTML = `<div class="card span12" style="margin-top:10px"><h2 class="sectionTitle">Alertas de degradação</h2>${alertsHtml}</div>
 <div class="card span12" style="margin-top:10px"><h2 class="sectionTitle">Top setups</h2>${renderItems()}</div>
 <div class="row"><span>Atualizado · ${String(j?.updated_at||'').slice(0,19).replace('T',' ')}</span><b class="ok">snapshot</b></div>`;
}

// ROTA: PERFIL
function renderProfile(){
 const summary=document.querySelector('#profileSummary'); if(!summary) return;
 const rules=document.querySelector('#profileRules'); if(!rules) return;
 apiGet('/api/profile').then(j=>{
  const s=j?.summary||{};
  summary.innerHTML=`
   <div class="metricbar">
     <div><small>Papel</small><b>${s.papel||'trader'}</b></div>
     <div><small>Modo</small><b class="amb">${s.modo||'paper'}</b></div>
     <div><small>Ativo</small><b class="cyan">${s.ativo||'XAU/USD'}</b></div>
     <div><small>Sessoes recentes</small><b>${s.sessoes_ultimas??0}</b></div>
   </div>`;
  const items=safeArr(j?.rules).slice(0,8);
  rules.innerHTML=items.length?items.map(x=>`<div class="row"><span>${x}</span><b class="amb">regra</b></div>`).join(''):'<p class="mini">Sem regras guardadas.</p>';
 }).catch(()=>{
  if(summary) summary.innerHTML='<p class="mini">Sem dados de perfil agora.</p>';
 });
}

