const API = window.location.origin;
const BACKEND = 'http://127.0.0.1:8128';
let DATA = null;

function backendUrl(path){ return BACKEND + path; }
function originUrl(path){ return API + path; }
function set(sel, value){ const el=document.querySelector(sel); if(el) el.textContent=value; }
function setHtml(sel, html){ const el=document.querySelector(sel); if(el) el.innerHTML=html; }

async function apiSafe(path, fallback){
  try{
    const r = await fetch(backendUrl(path), {cache:'no-store'});
    if(!r.ok) throw new Error(`${path} ${r.status}`);
    return await r.json();
  }catch(e){
    if(fallback){
      try{ return await fetch(originUrl(fallback), {cache:'reload'}).then(r=>r.json()); }catch(e){ return null; }
    }
    return null;
  }
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
function sendChat(){
  const input = document.querySelector('#chatInput'); if(!input) return;
  const v = input.value.trim(); if(!v) return;
  const box = document.querySelector('#chatBox'); if(!box) return;
  box.innerHTML += `<div class="chatBubble"><strong>Inês Traders:</strong> ${v}</div>`;
  input.value = '';
}

window.addEventListener('load', ()=>{
  calcLot();
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
});
