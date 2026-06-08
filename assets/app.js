const API = window.location.origin;
const BACKEND = 'http://127.0.0.1:8128';
let DATA = null, TWIN = null, ACTIVE_SESSION = null, MT5 = null, API_ON = false;

function backendUrl(path){ return BACKEND + path; }
function originUrl(path){ return API + path; }
function set(sel, value){ const el=document.querySelector(sel); if(el) el.textContent=value; }
function setHtml(sel, html){ const el=document.querySelector(sel); if(el) el.innerHTML=html; }

async function apiSafe(path, fallback){
  try{
    const r = await fetch(backendUrl(path), {cache:'no-store'});
    if(!r.ok) throw new Error(`${path} ${r.status}`);
    API_ON = true;
    return await r.json();
  }catch(e){
    if(fallback){
      try{ return await fetch(originUrl(fallback), {cache:'reload'}).then(r=>r.json()); }catch(e){ return null; }
    }
    return null;
  }
}

const TV_SYMBOLS = [
  { tv:'BINANCE:BTCUSDT', label:'BTCUSD', group:'CRIPTO' },
  { tv:'BINANCE:ETHUSDT', label:'ETHUSD', group:'CRIPTO' },
  { tv:'BINANCE:SOLUSDT', label:'SOLUSD', group:'CRIPTO' },
  { tv:'BINANCE:BNBUSDT', label:'BNBUSD', group:'CRIPTO' },
  { tv:'BINANCE:XRPUSDT', label:'XRPUSD', group:'CRIPTO' },
  { tv:'OANDA:XAUUSD', label:'XAUUSD', group:'COMMODITIES' },
  { tv:'OANDA:XAGUSD', label:'XAGUSD', group:'COMMODITIES' },
  { tv:'OANDA:WTI', label:'USOIL', group:'COMMODITIES' },
  { tv:'OANDA:EURUSD', label:'EURUSD', group:'FOREX' },
  { tv:'OANDA:GBPUSD', label:'GBPUSD', group:'FOREX' },
  { tv:'OANDA:USDJPY', label:'USDJPY', group:'FOREX' },
  { tv:'OANDA:AUDUSD', label:'AUDUSD', group:'FOREX' },
  { tv:'OANDA:NZDUSD', label:'NZDUSD', group:'FOREX' },
  { tv:'OANDA:USDCAD', label:'USDCAD', group:'FOREX' },
  { tv:'OANDA:USDCHF', label:'USDCHF', group:'FOREX' },
  { tv:'OANDA:EURJPY', label:'EURJPY', group:'FOREX' },
  { tv:'OANDA:GBPJPY', label:'GBPJPY', group:'FOREX' },
  { tv:'OANDA:EURGBP', label:'EURGBP', group:'FOREX' },
  { tv:'TVC:US30', label:'US30', group:'INDICES' },
  { tv:'TVC:NAS100', label:'NAS100', group:'INDICES' },
  { tv:'TVC:SPX500', label:'SPX500', group:'INDICES' },
  { tv:'TVC:UK100', label:'UK100', group:'INDICES' },
  { tv:'TVC:GER40', label:'GER40', group:'INDICES' },
  { tv:'TVC:JPN225', label:'JPN225', group:'INDICES' },
];

let ACTIVE_TV_SYMBOL = TV_SYMBOLS[0].tv;

function renderSymbolStrip(){
  const root = document.querySelector('#symbolStrip');
  if(!root) return;
  root.innerHTML = TV_SYMBOLS.map(s=>`<button class="symbolChip ${s.tv===ACTIVE_TV_SYMBOL?'active':''}" data-tv="${s.tv}" data-label="${s.label}">${s.label}</button>`).join('');
  root.querySelectorAll('.symbolChip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      ACTIVE_TV_SYMBOL = btn.getAttribute('data-tv') || btn.getAttribute('data-tv');
      const label = btn.getAttribute('data-label');
      set('#chartSymbol', label);
      setChartSymbol(ACTIVE_TV_SYMBOL);
      renderSymbolStrip();
    });
  });
}
function setChartSymbol(tvSymbol){
  const container = document.getElementById('tradingview_widget');
  if(!container) return;
  container.innerHTML = '';
  window._tvWidget = null;
  if(window.TradingView && window.TradingView.widget){
    try {
      window._tvWidget = new TradingView.widget({
        autosize: true,
        symbol: tvSymbol || 'BINANCE:BTCUSDT',
        interval: '15',
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'pt',
        enable_publishing: false,
        hide_top_toolbar: false,
        container_id: 'tradingview_widget'
      });
    } catch (e) { console.warn(e); }
  }
}

async function load(){
  DATA   = await apiSafe('/api/room-engine', 'data/alphaforge-snapshot.json') || {};
  TWIN   = await apiSafe('/api/trader-twin',   'data/trader-twin.json') || {};
  ACTIVE_SESSION = (await apiSafe('/api/session/active'))?.active ?? null;
  MT5    = await apiSafe('/api/mt5/accounts') || {accounts:[], recent_trades:[], metrics:{}};

  renderAll();
  renderNotifications();
  renderSentiment();
  renderScenario();
  renderTopSetups();
  renderDiaryHeat();
  renderPerformance();
  renderChat();
  renderSymbolStrip();
  initNav();
  initLotCalc();
}

function initNav(){
  document.querySelectorAll('.nav-link').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const page = a.getAttribute('data-page');
      document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
      a.classList.add('active');
      document.querySelectorAll('.page').forEach(p=>p.style.display='none');
      const target = document.getElementById(page === 'cockpit' ? 'cockpit' : `${page}Page`);
      if (target) target.style.display='block';
    });
  });
}

function renderAll(){
  const m = (DATA && DATA.metrics) || {};
  set('#perfNet', `${Number((m.total_pnl_pct||0))>=0?'+':''}${((Number(m.total_pnl_pct||0))*100).toFixed(2)}€`);
  set('#perfWin', `${(Number(m.win_rate||0)*100).toFixed(2)}%`);
  set('#perfPf', m.profit_factor != null ? Number(m.profit_factor).toFixed(2) : '0.00');
  set('#perfTrades', m.trade_count || 0);
  const asset = (DATA.asset || DATA.goal?.asset || 'BTCUSD').toString();
  set('#chartSymbol', asset);
  set('#manipAsset', asset);
  ACTIVE_TV_SYMBOL = TV_SYMBOLS.find(s => (s.label||'').toUpperCase() === asset.toUpperCase())?.tv || TV_SYMBOLS[0].tv;
}

function renderNotifications(){
  const el = document.querySelector('#notifBadge'); if(!el) return;
  el.style.display = (API_ON ? 'inline-block' : 'none');
}
function sizeCanvas(c){
  const parent = c.parentElement;
  const w = (parent && parent.clientWidth) || 500;
  const h = c.height || 150;
  c.width = w; c.height = h;
  return { ctx: c.getContext('2d'), w, h };
}
function renderSentiment(){
  const c = document.querySelector('#sentimentCanvas'); if(!c) return;
  const {ctx,w,h} = sizeCanvas(c);
  ctx.fillStyle='#0f1726'; ctx.fillRect(0,0,w,h/2);
  ctx.strokeStyle='#22d3ee'; ctx.lineWidth=1.5; ctx.beginPath();
  for(let i=0;i<w;i+=4) ctx.lineTo(i, (h/2) + (Math.sin(i/35)*36));
  ctx.stroke();
  ctx.strokeStyle='#ef4444'; ctx.beginPath();
  for(let i=0;i<w;i+=4) ctx.lineTo(i, (h/2) + (Math.cos(i/42)*28));
  ctx.stroke();
}
function renderScenario(){
  const c = document.querySelector('#scenarioCanvas'); if(!c) return;
  const {ctx,w,h} = sizeCanvas(c);
  ctx.fillStyle='#0b1221'; ctx.fillRect(0,0,w,h);
  ctx.font='12px Inter, ui-sans-serif, system-ui';
  ctx.fillStyle='#cbd5e1'; ctx.fillText('Sem historial suficiente para simular cenário.', 12, 24);
  ctx.strokeStyle='#14303d'; ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke();
  const root = document.querySelector('#scenarioStats'); if(!root) return;
  root.innerHTML = `<div class="statRow" style="display:flex;justify-content:space-between;background:#0b1221;border:1px solid var(--border);padding:8px;border-radius:10px"><span>Chance TP</span><b class="ok mono">62%</b></div><div class="statRow" style="display:flex;justify-content:space-between;background:#0b1221;border:1px solid var(--border);padding:8px;border-radius:10px;margin-top:8px"><span>Chance SL</span><b class="bad mono">38%</b></div><div class="statRow" style="display:flex;justify-content:space-between;background:#0b1221;border:1px solid var(--border);padding:8px;border-radius:10px;margin-top:8px"><span>Profit esperado</span><b class="ok mono">1.65</b></div>`;
}
function renderTopSetups(){
  const root = document.querySelector('#topSetupsList'); if(!root) return;
  if(!root.innerHTML.trim()){
    const setups = [
      {n:'Liquidity Sweep + BOS', w:'78%'},
      {n:'FVG + Order Block', w:'72%'},
      {n:'Rejeição de Liquidez + EMA 34', w:'68%'},
    ];
    root.innerHTML = setups.map(s=>`<div class="setupItem"><span>${s.n}</span><b class="mono">${s.w}</b></div>`).join('');
  }
}
function renderDiaryHeat(){
  const root = document.querySelector('#calendarHeatmap'); if(!root) return;
  if(!root.innerHTML.trim()){
    const levels = ['ok','ok','warn','bad','ok','hot','ok','ok','ok','warn','bad','ok','ok','hot','ok','ok','warn'];
    root.innerHTML = levels.map(l=>`<div class="cell ${l}"></div>`).join('');
  }
}
function renderPerformance(){
  const c = document.querySelector('#miniEquity'); if(!c) return;
  const {ctx,w,h} = sizeCanvas(c);
  ctx.fillStyle='#0b1221'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#22b87b'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(0,h/2);
  for(let i=1;i<w;i++) ctx.lineTo(i, h/2 - (Math.sin(i/28)*22 + Math.sin(i/11)*10));
  ctx.stroke();
}
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
function renderChat(){
  const box = document.querySelector('#chatBox'); if(!box) return;
  if(!box.innerHTML.trim()) box.innerHTML = `<div class="chatBubble"><strong>Sistema:</strong> Bem-vindo à Sala de Trading.</div>`;
}
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

window.addEventListener('load', load);
