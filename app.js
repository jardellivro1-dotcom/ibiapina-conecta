'use strict';
// Protótipo: dados ficam no navegador (localStorage). Em produção: Supabase.
const CENTRO = [-3.9292, -40.8914];
const TIPOS = [
  ['Iluminação', '💡'], ['Buraco / rua', '🕳️'], ['Estrada / passagem molhada', '🛣️'],
  ['Falta de água', '🚰'], ['Lixo / limpeza', '🗑️'], ['Praça / quadra', '⛲'],
  ['Bueiro / alagamento', '🌧️'], ['Esgoto', '🚽'], ['Outro', '📍']
];
const COMUNIDADES = ['Sede/Centro', 'Bairro São João', 'Pedrinhas', 'Alto Lindo', 'Pindoba', 'Betânia', 'Jurema Norte', 'Jurema Sul',
  'Taguaratis', 'Santa Tereza', 'Araçás', 'Brejo', 'Agudo', 'Pejuaba', 'Jacobina', 'Pituba', 'Paratibe', 'São José', 'Sítio Janeiro',
  'Tauá de Baixo', 'Cacimbas', 'Várzea', 'Sítio América', 'Outra'];
const STATUS = ['Aberto', 'Em análise', 'Em andamento', 'Resolvido'];
const PPA_STATUS = ['Recebida', 'Em análise', 'Em andamento', 'Concluída'];

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Sem espaço para salvar'); } };
const fmt = t => new Date(t).toLocaleDateString('pt-BR');
function toast(m) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = m; document.body.append(e); setTimeout(() => e.remove(), 2500); }

// ---------- estado ----------
let chamados = load('chamados', null);
if (!chamados) {
  const d = n => Date.now() - n * 864e5;
  chamados = [
    { id: 1, tipo: 'Iluminação', local: 'Bairro São João', desc: 'Três postes apagados ao redor da igreja.', lat: -3.9265, lng: -40.8870, status: 'Em andamento', criado: d(6), hist: [] },
    { id: 2, tipo: 'Estrada / passagem molhada', local: 'Betânia', desc: 'Passagem molhada danificada, carro não passa com chuva.', lat: -3.9040, lng: -40.9120, status: 'Aberto', criado: d(3), hist: [] },
    { id: 3, tipo: 'Falta de água', local: 'Alto Lindo', desc: 'Ruas do centro sem abastecimento há 4 dias.', lat: -3.9520, lng: -40.9300, status: 'Em análise', criado: d(4), hist: [] },
    { id: 4, tipo: 'Bueiro / alagamento', local: 'Sede/Centro', desc: 'Alagamento em frente à borracharia na Rua Francisco Correia.', lat: -3.9300, lng: -40.8920, status: 'Resolvido', criado: d(15), resolvido: d(9), hist: [] },
    { id: 5, tipo: 'Lixo / limpeza', local: 'Pindoba', desc: 'Coleta não passa na rua da escola.', lat: -3.9700, lng: -40.9050, status: 'Aberto', criado: d(1), hist: [] }
  ];
  save('chamados', chamados);
}
let votos = load('votos', {});               // id proposta -> true (este aparelho)
let votosBase = load('votosBase', null);
if (!votosBase) { votosBase = {}; PPA.forEach(p => votosBase[p.id] = Math.floor(Math.random() * 40)); save('votosBase', votosBase); }
let ppaStatus = load('ppaStatus', {});
let gestor = false;
let tab = 'inicio';
let sel = { tipo: null, foto: null, lat: null, lng: null };
let ppaF = { area: 'Todas', q: '', local: 'Todas', ord: 'votos' };
let mapObj = null;

// ---------- navegação ----------
const TABS = [['inicio', '🏠', 'Início'], ['reportar', '📸', 'Reportar'], ['mapa', '🗺️', 'Mapa'], ['ppa', '📋', 'Painel PPA'], ['gestor', '🛠️', 'Gestor']];
function nav() {
  $('#nav').innerHTML = TABS.map(([k, i, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}"><span>${i}</span>${n}</button>`).join('');
  $('#nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.t); };
}
function go(t) { tab = t; nav(); render(); window.scrollTo(0, 0); }
function render() {
  if (mapObj) { mapObj.remove(); mapObj = null; }
  ({ inicio: vInicio, reportar: vReportar, mapa: vMapa, ppa: vPpa, gestor: vGestor })[tab]();
}

// ---------- métricas ----------
function metricas() {
  const res = chamados.filter(c => c.status === 'Resolvido');
  const dias = res.filter(c => c.resolvido).map(c => (c.resolvido - c.criado) / 864e5);
  return { total: chamados.length, abertos: chamados.length - res.length, res: res.length, media: dias.length ? (dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(1) : '–' };
}

// ---------- início ----------
function vInicio() {
  const m = metricas();
  const comAnd = PPA.filter(p => (ppaStatus[p.id] || p.status) === 'Em andamento').length;
  $('#app').innerHTML = `
  <div class="card"><h2>Sua voz melhora Ibiapina</h2>
    <p>Avise a Prefeitura sobre um problema perto de você e acompanhe até a solução. Veja também o andamento das propostas do Plano Plurianual (PPA 2026-2029) que a população construiu.</p>
    <div class="row"><button data-go="reportar">📸 Reportar problema</button><button class="sec" data-go="ppa">📋 Ver propostas do PPA</button></div></div>
  <div class="grid">
    <div class="stat"><b>${m.total}</b><small>chamados</small></div>
    <div class="stat"><b>${m.res}</b><small>resolvidos</small></div>
    <div class="stat"><b>${m.media}</b><small>dias p/ resolver (média)</small></div>
    <div class="stat"><b>${PPA.length}</b><small>propostas no PPA (${comAnd} em andamento)</small></div>
  </div>
  <div class="aviso" style="margin-top:12px">Protótipo de demonstração: os 5 chamados e os status são exemplos fictícios. As 310 propostas do PPA são reais, extraídas do Diagnóstico Participativo.</div>
  <h2>Últimos chamados</h2>${chamados.slice().sort((a, b) => b.criado - a.criado).slice(0, 4).map(cardChamado).join('')}`;
  $('#app').onclick = e => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); };
}
function cardChamado(c) {
  const ic = (TIPOS.find(t => t[0] === c.tipo) || [0, '📍'])[1];
  return `<div class="card"><div class="row"><b>${ic} ${esc(c.tipo)}</b><span class="badge b-${c.status}">${c.status}</span></div>
  <div class="mut">${esc(c.local)} · ${fmt(c.criado)} · #${c.id}</div><p style="margin:6px 0 0">${esc(c.desc)}</p>${c.foto ? `<img class="foto" src="${c.foto}" alt="foto do problema">` : ''}</div>`;
}

// ---------- reportar ----------
function vReportar() {
  $('#app').innerHTML = `<div class="card"><h2>Reportar um problema</h2>
  <label>1. O que está acontecendo?</label>
  <div class="tipos">${TIPOS.map(([n, i]) => `<button type="button" class="tipo ${sel.tipo === n ? 'on' : ''}" data-tipo="${esc(n)}"><span>${i}</span>${n}</button>`).join('')}</div>
  <label for="loc">2. Comunidade / bairro</label>
  <select id="loc">${COMUNIDADES.map(c => `<option>${c}</option>`).join('')}</select>
  <label for="ref">3. Descreva e dê uma referência</label>
  <textarea id="desc" placeholder="Ex.: poste apagado ao lado da igreja"></textarea>
  <label>4. Localização</label>
  <div class="row"><button type="button" class="sec" id="gps">📍 Usar minha localização</button><span class="mut" id="gpsr">${sel.lat ? 'Localização capturada ✔' : 'Opcional'}</span></div>
  <label>5. Foto (opcional)</label>
  <input type="file" id="foto" accept="image/*" capture="environment">
  <img id="prev" class="foto ${sel.foto ? '' : 'hide'}" src="${sel.foto || ''}" alt="">
  <label for="nome">Seu nome ou telefone (opcional, para retorno)</label>
  <input id="nome" autocomplete="name">
  <p><button id="env" style="width:100%">Enviar para a Prefeitura</button></p></div>`;
  $('#app').onclick = e => { const b = e.target.closest('[data-tipo]'); if (b) { sel.tipo = b.dataset.tipo; document.querySelectorAll('.tipo').forEach(x => x.classList.toggle('on', x === b)); } };
  $('#gps').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { sel.lat = p.coords.latitude; sel.lng = p.coords.longitude; $('#gpsr').textContent = 'Localização capturada ✔'; }, () => toast('Não foi possível obter a localização')) : toast('GPS indisponível');
  $('#foto').onchange = e => reduzir(e.target.files[0]);
  $('#env').onclick = enviar;
}
function reduzir(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => {
    const k = Math.min(1, 640 / im.width), cv = document.createElement('canvas');
    cv.width = im.width * k; cv.height = im.height * k; cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    sel.foto = cv.toDataURL('image/jpeg', .7); const p = $('#prev'); p.src = sel.foto; p.classList.remove('hide'); };
    im.src = r.result; };
  r.readAsDataURL(f);
}
function enviar() {
  const desc = $('#desc').value.trim();
  if (!sel.tipo) return toast('Escolha o tipo do problema');
  if (desc.length < 5) return toast('Descreva o problema');
  const id = Math.max(0, ...chamados.map(c => c.id)) + 1;
  const jitter = () => (Math.random() - .5) * .02;
  chamados.push({ id, tipo: sel.tipo, local: $('#loc').value, desc, foto: sel.foto, lat: sel.lat ?? CENTRO[0] + jitter(), lng: sel.lng ?? CENTRO[1] + jitter(), contato: $('#nome').value.trim(), status: 'Aberto', criado: Date.now(), hist: [] });
  save('chamados', chamados); sel = { tipo: null, foto: null, lat: null, lng: null };
  $('#app').innerHTML = `<div class="card"><h2>✅ Chamado #${id} enviado!</h2><p>A Secretaria de Infraestrutura foi avisada. Acompanhe o andamento no mapa e na tela inicial.</p><button data-go="mapa">Ver no mapa</button></div>`;
  $('#app').onclick = e => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); };
}

// ---------- mapa ----------
function vMapa() {
  $('#app').innerHTML = `<div class="chips" id="ch"></div><div id="map"></div><p class="mut">Cada ponto é um chamado. Vermelho = aberto, azul = em andamento, verde = resolvido.</p><div id="lista"></div>`;
  let filtro = 'Todos';
  const cor = s => s === 'Resolvido' ? '#15803d' : s === 'Aberto' ? '#b91c1c' : '#1d4ed8';
  const draw = () => {
    $('#ch').innerHTML = ['Todos', ...STATUS].map(s => `<button class="${s === filtro ? 'on' : ''}">${s}</button>`).join('');
    const ls = chamados.filter(c => filtro === 'Todos' || c.status === filtro);
    $('#lista').innerHTML = ls.slice().reverse().map(cardChamado).join('');
    if (!window.L) { $('#map').innerHTML = '<p style="padding:16px" class="mut">Mapa indisponível sem internet. A lista abaixo funciona offline.</p>'; return; }
    if (mapObj) mapObj.remove();
    mapObj = L.map('map').setView(CENTRO, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapObj);
    ls.forEach(c => L.circleMarker([c.lat, c.lng], { radius: 9, color: '#fff', weight: 2, fillColor: cor(c.status), fillOpacity: 1 }).addTo(mapObj).bindPopup(`<b>${esc(c.tipo)}</b><br>${esc(c.local)}<br>${esc(c.desc)}<br><i>${c.status}</i>`));
  };
  $('#ch').onclick = e => { if (e.target.tagName === 'BUTTON') { filtro = e.target.textContent; draw(); } };
  draw();
}

// ---------- painel PPA ----------
function vPpa() {
  const areas = ['Todas', ...new Set(PPA.map(p => p.area))];
  const locs = ['Todas', ...new Set(PPA.map(p => p.local).filter(Boolean))].sort();
  $('#app').innerHTML = `<div class="card"><h2>Propostas do PPA 2026-2029</h2>
  <p class="mut">As ${PPA.length} propostas que a população apresentou na consulta pública. Vote nas que considera prioridade (1 voto por proposta neste aparelho).</p>
  <div class="aviso">Os status são de demonstração; a Prefeitura os atualizará no painel de gestão.</div>
  <input id="q" placeholder="🔎 Buscar (ex.: água, asfalto, UBS...)" value="${esc(ppaF.q)}">
  <div class="row" style="margin-top:8px"><select id="fa" style="flex:1">${areas.map(a => `<option ${a === ppaF.area ? 'selected' : ''}>${a}</option>`).join('')}</select>
  <select id="fl" style="flex:1">${locs.map(a => `<option ${a === ppaF.local ? 'selected' : ''}>${a}</option>`).join('')}</select>
  <select id="fo" style="flex:1"><option value="votos" ${ppaF.ord === 'votos' ? 'selected' : ''}>Mais votadas</option><option value="id" ${ppaF.ord === 'id' ? 'selected' : ''}>Ordem original</option></select></div></div>
  <div id="res"></div>`;
  const draw = () => {
    const q = ppaF.q.toLowerCase();
    let ls = PPA.filter(p => (ppaF.area === 'Todas' || p.area === ppaF.area) && (ppaF.local === 'Todas' || p.local === ppaF.local) && (!q || p.texto.toLowerCase().includes(q) || p.tema.toLowerCase().includes(q)));
    const v = p => (votosBase[p.id] || 0) + (votos[p.id] ? 1 : 0);
    ls = ppaF.ord === 'votos' ? ls.sort((a, b) => v(b) - v(a)) : ls.sort((a, b) => a.id - b.id);
    $('#res').innerHTML = `<p class="mut">${ls.length} propostas</p>` + ls.slice(0, 60).map(p => {
      const st = ppaStatus[p.id] || p.status;
      return `<div class="card"><div class="row"><span class="mut">${esc(p.area)} · ${esc(p.tema)}${p.local ? ' · ' + esc(p.local) : ''}</span><span class="badge b-${st}">${st}</span></div>
      <p style="margin:6px 0">${esc(p.texto)}</p><button class="sm ${votos[p.id] ? '' : 'sec'}" data-v="${p.id}">👍 ${v(p)} ${votos[p.id] ? 'Você apoiou' : 'Apoiar'}</button></div>`;
    }).join('') + (ls.length > 60 ? `<p class="mut">Mostrando 60 de ${ls.length}. Use os filtros para refinar.</p>` : '');
  };
  $('#q').oninput = e => { ppaF.q = e.target.value; draw(); };
  $('#fa').onchange = e => { ppaF.area = e.target.value; draw(); };
  $('#fl').onchange = e => { ppaF.local = e.target.value; draw(); };
  $('#fo').onchange = e => { ppaF.ord = e.target.value; draw(); };
  $('#res').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const id = b.dataset.v; if (votos[id]) delete votos[id]; else votos[id] = true; save('votos', votos); draw(); };
  draw();
}

// ---------- gestor ----------
function vGestor() {
  if (!gestor) {
    $('#app').innerHTML = `<div class="card"><h2>Painel do gestor</h2><p class="mut">Acesso da Prefeitura. No protótipo, a senha de demonstração é <b>ibiapina</b>.</p>
    <input id="pw" type="password" placeholder="Senha" autocomplete="off"><p><button id="ok">Entrar</button></p></div>`;
    $('#ok').onclick = () => { if ($('#pw').value === 'ibiapina') { gestor = true; render(); } else toast('Senha incorreta'); };
    return;
  }
  const m = metricas();
  const porTipo = {}; chamados.forEach(c => porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1);
  const porLocal = {}; chamados.forEach(c => porLocal[c.local] = (porLocal[c.local] || 0) + 1);
  const max = Math.max(1, ...Object.values(porTipo));
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const v = p => (votosBase[p.id] || 0) + (votos[p.id] ? 1 : 0);
  const topPpa = PPA.slice().sort((a, b) => v(b) - v(a)).slice(0, 5);
  $('#app').innerHTML = `<div class="grid"><div class="stat"><b>${m.total}</b><small>chamados</small></div><div class="stat"><b>${m.abertos}</b><small>em aberto</small></div><div class="stat"><b>${m.res}</b><small>resolvidos</small></div><div class="stat"><b>${m.media}</b><small>dias p/ resolver</small></div></div>
  <div class="card" style="margin-top:12px"><h2>Problemas por tipo</h2>${top(porTipo).map(([k, n]) => `<div class="row"><span>${esc(k)}</span><b>${n}</b></div><div class="bar"><i style="width:${n / max * 100}%"></i></div>`).join('')}
  <h2 style="margin-top:14px">Comunidades com mais chamados</h2>${top(porLocal).map(([k, n]) => `<div class="row"><span>${esc(k)}</span><b>${n}</b></div>`).join('')}</div>
  <div class="card"><h2>Propostas do PPA mais apoiadas</h2>${topPpa.map(p => `<p style="margin:4px 0">👍 ${v(p)} · ${esc(p.texto)}</p>`).join('')}</div>
  <div class="card"><div class="row"><h2>Chamados</h2><button class="sm sec" id="csv">⬇ Exportar CSV</button></div>
  <table><tr><th>#</th><th>Problema</th><th>Local</th><th>Status</th></tr>${chamados.slice().sort((a, b) => b.criado - a.criado).map(c => `<tr><td>${c.id}</td><td>${esc(c.tipo)}<br><span class="mut">${esc(c.desc)}</span></td><td>${esc(c.local)}</td>
  <td><select data-c="${c.id}">${STATUS.map(s => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table></div>
  <div class="card"><h2>Status de proposta do PPA</h2><select id="pp">${PPA.map(p => `<option value="${p.id}">#${p.id} ${esc(p.texto.slice(0, 70))}</option>`).join('')}</select>
  <select id="ps" style="margin-top:8px">${PPA_STATUS.map(s => `<option>${s}</option>`).join('')}</select><p><button id="pset">Atualizar proposta</button></p></div>
  <button class="sec" id="sair">Sair do painel</button>`;
  $('#app').onchange = e => { const s = e.target.closest('[data-c]'); if (!s) return; const c = chamados.find(x => x.id == s.dataset.c); c.status = s.value; c.resolvido = s.value === 'Resolvido' ? Date.now() : undefined; save('chamados', chamados); render(); toast('Status atualizado'); };
  $('#pset').onclick = () => { ppaStatus[$('#pp').value] = $('#ps').value; save('ppaStatus', ppaStatus); toast('Proposta atualizada'); };
  $('#sair').onclick = () => { gestor = false; render(); };
  $('#csv').onclick = () => {
    const rows = [['id', 'tipo', 'local', 'descricao', 'status', 'criado', 'lat', 'lng'], ...chamados.map(c => [c.id, c.tipo, c.local, c.desc, c.status, new Date(c.criado).toISOString(), c.lat, c.lng])];
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'chamados.csv'; a.click();
  };
}

nav(); render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
