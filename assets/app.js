const fmtPct = v => `${((Number(v)||0)*100).toFixed(2)}%`;
const API = 'http://127.0.0.0:8128';
let DATA = null;
let TWIN = null;
let API_ON = false;

const routes = {
 dashboard:{title:'Dashboard vivo', sub:'A visão central do trader: mercado, estratégia, paper worker e risco num só cockpit.'},
 session:{title:'Trading Session Room', sub:'O novo setor: entra na sala, valida mente/mercado/risco e deixa o Trader Twin decidir se podes operar.'},
 coach:{title:'Trading Memory Coach', sub:'Um espaço mental: identifica sabotagem, revenge trading e regras pessoais de proteção.'},
 regime:{title:'Market Regime AI', sub:'Antes de qualquer estratégia: que tipo de mercado estamos a viver agora?'},
 capital:{title:'Capital Allocation AI', sub:'A pergunta principal deixa de ser “entro?” e passa a ser “posso arriscar hoje?”'},
 marketplace:{title:'Marketplace auditável', sub:'Estratégias com histórico, regime score, drawdown e trust — sem gurus sem provas.'},
 journal:{title:'Journal & Reflexão', sub:'O trader escreve, o agente aprende. Um ciclo muda exatamente uma variável.'}
};

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
async function apiPost(path, body){
 const r = await fetch(`${API}${path}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
 if(!r.ok) throw new Error(`${path} ${r.status}`);
 API_ON = true;
 return r.json();
}

async function load(){
 DATA = await apiGet('/api/alphaforge', 'data/alphaforge-snapshot.json?v=4.0');
 TWIN = await apiGet('/api/trader-twin', 'data/trader-twin.json?v=4.0');
 route();
 await renderJournal();
 await renderSessionHistory();
 updateApiPill();
 if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
 setInterval(refreshLiveData, 15000);
}
async function refreshLiveData(){
 try{
   DATA = await apiGet('/api/alphaforge', 'data/alphaforge-snapshot.json?v=4.0');
   TWIN = await apiGet('/api/trader-twin', 'data/trader-twin.json?v=4.0');
   renderAll(); await renderSessionHistory(); await renderJournal(); updateApiPill();
 }catch(e){ console.warn('refresh failed', e); }
}
function updateApiPill(){
 const hint=document.querySelector('.routehint');
 if(hint) hint.textContent = API_ON ? 'api vivo' : 'paper';
}
function currentRoute(){ return (location.hash||'#dashboard').slice(1).split('?')[0]; }
function setHeader(key){ const r=routes[key]||routes.dashboard; document.querySelector('#pageTitle').textContent=r.title; document.querySelector('#pageSub').textContent=r.sub; document.querySelector('#assetPill').textContent=DATA?.asset||DATA?.goal?.asset||'XAU/USD'; }
function navActive(key){ document.querySelectorAll('[data-route]').forEach(a=>a.classList.toggle('active', a.dataset.route===key)); }
function route(){ const key=currentRoute(); const k=routes[key]?key:'dashboard'; setHeader(k); navActive(k); document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active', p.id===`page-${k}`)); renderAll(); }
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
 renderTrades(); renderLists(); renderMarketplace(); renderSession();
}
function safeArr(x){ return Array.isArray(x) ? x : []; }
function renderTrades(){ const rows=safeArr(DATA.recent_trades).slice(-8).reverse(); document.querySelector('#recentTrades').innerHTML = rows.length?rows.map(t=>{const side=String(t.direction||t.side||'Buy'); const klass=side.toLowerCase().includes('sell')?'sell':'buy'; const pnl=Number(t.pnl_pct||t.pnl||0); return `<div class="trade"><span class="badge ${klass}">${side}</span><span class="mono">${t.timestamp||t.asset||'paper'}</span><strong class="${pnl>=0?'ok':'bad'}">${fmtPct(pnl)}</strong></div>`}).join(''):'<p class="mini">Ainda sem trades suficientes.</p>'; }
function renderLists(){
 const regime=DATA.regime||{}; const coach=DATA.coach||{};
 document.querySelector('#regimeDrivers').innerHTML = safeArr(regime.drivers).map(x=>`<span class="chip hot">${x}</span>`).join('') || '<span class="chip hot">api snapshot</span>';
 document.querySelector('#allowedStrategies').innerHTML = safeArr(regime.allowed_strategies).map(x=>`<div class="row"><span>${x}</span><b class="ok">permitida</b></div>`).join('') || '<div class="row"><span>paper worker</span><b class="ok">permitida</b></div>';
 document.querySelector('#blockedStrategies').innerHTML = safeArr(regime.blocked_strategies).map(x=>`<div class="row"><span>${x}</span><b class="bad">bloqueada</b></div>`).join('') || '<div class="row"><span>live capital</span><b class="bad">bloqueada</b></div>';
 const rules = safeArr(coach.rules).concat(safeArr(TWIN.next_guardrail_suggestions)).slice(0,5);
 document.querySelector('#coachRules').innerHTML = rules.map(x=>`<div class="row"><span>${x}</span><b class="amb">regra</b></div>`).join('');
}
function renderMarketplace(){ document.querySelector('#marketRows').innerHTML = safeArr(DATA.marketplace).map(s=>`<div class="strategy"><span class="badge buy">${s.score}</span><span><b>${s.name}</b><br><small class="mini">${s.regime} · ${s.status}</small></span><strong class="cyan">${s.trust}</strong></div>`).join('') || '<p class="mini">Marketplace auditável pendente: estratégia real será adicionada após métricas suficientes.</p>'; }
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
 status.innerHTML=`<span class="dot"></span><b>${title}</b><small>${s.complete}/${s.total} · risco ${fmtPct(s.risk)}</small>`;
 return {title, ...s};
}
async function startTradingSession(){
 const s=evaluateSession();
 const item={allowed:s.allowed, mental:s.mental, losses:s.losses, risk:s.risk, regime:DATA.regime?.current||'unknown', note:s.allowed?'sessão paper iniciada':'sessão bloqueada/pendente', payload:{checklist:`${s.complete}/${s.total}`}};
 try{ await apiPost('/api/session/start', item); await refreshLiveData(); }
 catch(e){ const arr=JSON.parse(localStorage.getItem('traderSessions')||'[]'); arr.unshift({at:new Date().toISOString(), action:'start', ...item}); localStorage.setItem('traderSessions', JSON.stringify(arr.slice(0,30))); await renderSessionHistory(); }
 if(!s.allowed) alert('Sessão não autorizada: completa checklist ou reduz risco.');
}
async function endTradingSession(){
 const note=prompt('Resumo rápido da sessão: o que aprendeste?');
 const payload={note:note||'sessão fechada', mental:document.querySelector('#mentalState')?.value||'normal', losses:Number(document.querySelector('#lossesToday')?.value||0), risk:sessionScore().risk, regime:DATA.regime?.current||'unknown'};
 try{ await apiPost('/api/session/end', payload); await refreshLiveData(); }
 catch(e){ const item={at:new Date().toISOString(), action:'end', allowed:false, ...payload}; const arr=JSON.parse(localStorage.getItem('traderSessions')||'[]'); arr.unshift(item); localStorage.setItem('traderSessions', JSON.stringify(arr.slice(0,30))); if(note){ const j=JSON.parse(localStorage.getItem('traderJournal')||'[]'); j.unshift({at:item.at, text:`Session review: ${note}`}); localStorage.setItem('traderJournal', JSON.stringify(j.slice(0,20))); } await renderSessionHistory(); await renderJournal(); }
}
async function renderSessionHistory(){
 const el=document.querySelector('#sessionHistory'); if(!el) return;
 let arr=[];
 try{ const res=await apiGet('/api/sessions'); arr=res.items.map(x=>({at:x.started_at, action:x.action, allowed:x.allowed, note:x.note, regime:x.regime, risk:x.risk})); }
 catch(e){ arr=JSON.parse(localStorage.getItem('traderSessions')||'[]'); }
 el.innerHTML=arr.length?arr.map(x=>`<div class="journalEntry"><span><b>${x.action==='start'?'Start':'End'} · ${x.allowed?'autorizada':'bloqueada/fechada'}</b><br><small class="mini">${x.note} · ${x.regime} · risco ${fmtPct(x.risk)}</small></span><time>${String(x.at||'').slice(0,16).replace('T',' ')}</time></div>`).join(''):'<p class="mini">Sem sessões ainda. Agora ficam guardadas no servidor.</p>';
}
async function saveJournal(){
 const txt=document.querySelector('#journalText').value.trim(); if(!txt){ alert('Escreve uma reflexão primeiro.'); return; }
 try{ const res=await apiPost('/api/journal', {text:txt}); if(res.insight) alert(res.insight); }
 catch(e){ const item={at:new Date().toISOString(), text:txt}; const arr=JSON.parse(localStorage.getItem('traderJournal')||'[]'); arr.unshift(item); localStorage.setItem('traderJournal', JSON.stringify(arr.slice(0,20))); }
 document.querySelector('#journalText').value=''; await refreshLiveData();
}
async function renderJournal(){
 const el=document.querySelector('#journalEntries'); if(!el) return;
 let arr=[];
 try{ const res=await apiGet('/api/journal'); arr=res.items.map(x=>({at:x.created_at, text:x.text, insight:x.insight, tags:x.tags})); }
 catch(e){ arr=JSON.parse(localStorage.getItem('traderJournal')||'[]'); }
 el.innerHTML=arr.length?arr.map(x=>`<div class="journalEntry"><span>${x.text}<br><small class="mini">${x.insight||''} ${safeArr(x.tags).map(t=>'#'+t).join(' ')}</small></span><time>${String(x.at||'').slice(0,16).replace('T',' ')}</time></div>`).join(''):'<p class="mini">Ainda sem notas. A próxima reflexão já entra na memória real do Trader Twin.</p>';
}
window.addEventListener('hashchange', route);
window.addEventListener('load', load);
