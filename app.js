'use strict';
// Com config.js preenchido o app usa o Supabase; sem ele roda em modo demonstração (localStorage).
const CFG = window.CONECTA_CONFIG || {};
const NUVEM = !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase);
const sb = NUVEM ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;

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
function toast(m) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = m; document.body.append(e); setTimeout(() => e.remove(), 3000); }

// ---------- estado ----------
let chamados = [];
let apoiosBase = {};      // proposta -> total de apoios
let meusApoios = {};      // proposta -> true neste aparelho
let ppaStatus = {};       // proposta -> status definido pela Prefeitura
let gestor = false;
let tab = 'inicio';
let sel = { tipo: null, foto: null, lat: null, lng: null };
let ppaF = { area: 'Todas', q: '', local: 'Todas', ord: 'votos' };
let mapObj = null;

const aparelho = (() => {
  let id = load('aparelho', null);
  if (!id) { id = crypto.randomUUID(); save('aparelho', id); }
  return id;
})();

// ---------- camada de dados ----------
const doBanco = r => ({ id: r.id, tipo: r.tipo, local: r.local, desc: r.descricao, lat: r.lat, lng: r.lng, status: r.status,
  criado: new Date(r.criado_em).getTime(), resolvido: r.resolvido_em ? new Date(r.resolvido_em).getTime() : undefined,
  foto: r.foto_path ? `${CFG.supabaseUrl}/storage/v1/object/public/fotos/${r.foto_path}` : null });

const api = {
  async carregar() {
    if (NUVEM) {
      const [c, s, n, m] = await Promise.all([
        sb.from('chamados').select('*').order('criado_em', { ascending: false }).limit(500),
        sb.from('ppa_status').select('*'),
        sb.rpc('ppa_contagem'),
        sb.rpc('ppa_meus_apoios', { p_aparelho: aparelho })
      ]);
      const erro = c.error || s.error || n.error || m.error;
      if (erro) throw erro;
      chamados = c.data.map(doBanco);
      ppaStatus = Object.fromEntries(s.data.map(x => [x.proposta_id, x.status]));
      apoiosBase = Object.fromEntries(n.data.map(x => [x.proposta_id, Number(x.apoios)]));
      meusApoios = Object.fromEntries(m.data.map(id => [id, true]));
    } else {
      chamados = load('chamados', null);
      if (!chamados) {
        const d = n => Date.now() - n * 864e5;
        chamados = [
          { id: 1, tipo: 'Iluminação', local: 'Bairro São João', desc: 'Três postes apagados ao redor da igreja.', lat: -3.9265, lng: -40.8870, status: 'Em andamento', criado: d(6) },
          { id: 2, tipo: 'Estrada / passagem molhada', local: 'Betânia', desc: 'Passagem molhada danificada, carro não passa com chuva.', lat: -3.9040, lng: -40.9120, status: 'Aberto', criado: d(3) },
          { id: 3, tipo: 'Falta de água', local: 'Alto Lindo', desc: 'Ruas do centro sem abastecimento há 4 dias.', lat: -3.9520, lng: -40.9300, status: 'Em análise', criado: d(4) },
          { id: 4, tipo: 'Bueiro / alagamento', local: 'Sede/Centro', desc: 'Alagamento em frente à borracharia na Rua Francisco Correia.', lat: -3.9300, lng: -40.8920, status: 'Resolvido', criado: d(15), resolvido: d(9) },
          { id: 5, tipo: 'Lixo / limpeza', local: 'Pindoba', desc: 'Coleta não passa na rua da escola.', lat: -3.9700, lng: -40.9050, status: 'Aberto', criado: d(1) }
        ];
        save('chamados', chamados);
      }
      ppaStatus = load('ppaStatus', {});
      meusApoios = load('votos', {});
      apoiosBase = load('votosBase', null);
      if (!apoiosBase) { apoiosBase = {}; PPA.forEach(p => apoiosBase[p.id] = Math.floor(Math.random() * 40)); save('votosBase', apoiosBase); }
    }
  },
  async criar(c, contato) {
    if (!NUVEM) {
      const id = Math.max(0, ...chamados.map(x => x.id)) + 1;
      const j = () => (Math.random() - .5) * .02;
      chamados.push({ ...c, id, lat: c.lat ?? CENTRO[0] + j(), lng: c.lng ?? CENTRO[1] + j(), status: 'Aberto', criado: Date.now() });
      save('chamados', chamados); return id;
    }
    let foto_path = null;
    if (c.foto) {
      foto_path = `chamados/${crypto.randomUUID()}.jpg`;
      const blob = await (await fetch(c.foto)).blob();
      const up = await sb.storage.from('fotos').upload(foto_path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
    }
    const r = await sb.from('chamados').insert({ tipo: c.tipo, local: c.local, descricao: c.desc, lat: c.lat, lng: c.lng, foto_path }).select('id').single();
    if (r.error) throw r.error;
    if (contato) await sb.from('chamados_contato').insert({ chamado_id: r.data.id, contato });
    return r.data.id;
  },
  async mudarStatus(id, status) {
    if (!NUVEM) {
      const c = chamados.find(x => x.id == id); c.status = status; c.resolvido = status === 'Resolvido' ? Date.now() : undefined; save('chamados', chamados); return;
    }
    const r = await sb.from('chamados').update({ status }).eq('id', id);
    if (r.error) throw r.error;
  },
  async mudarPpa(id, status) {
    if (!NUVEM) { ppaStatus[id] = status; save('ppaStatus', ppaStatus); return; }
    const r = await sb.from('ppa_status').upsert({ proposta_id: Number(id), status, atualizado_em: new Date().toISOString() });
    if (r.error) throw r.error;
    ppaStatus[id] = status;
  },
  async apoiar(id) {
    if (!NUVEM) { if (meusApoios[id]) delete meusApoios[id]; else meusApoios[id] = true; save('votos', meusApoios); return; }
    const r = await sb.rpc('ppa_alternar_apoio', { p_proposta: Number(id), p_aparelho: aparelho });
    if (r.error) throw r.error;
    if (r.data) { meusApoios[id] = true; apoiosBase[id] = (apoiosBase[id] || 0) + 1; }
    else { delete meusApoios[id]; apoiosBase[id] = Math.max(0, (apoiosBase[id] || 1) - 1); }
  },
  async entrar(email, senha) {
    if (!NUVEM) return senha === 'ibiapina';
    const r = await sb.auth.signInWithPassword({ email, password: senha });
    if (r.error) throw r.error;
    return api.souEquipe();
  },
  async souEquipe() {
    if (!NUVEM) return gestor;
    const { data } = await sb.auth.getSession();
    if (!data.session) return false;
    const r = await sb.from('equipe').select('user_id').maybeSingle();
    return !!r.data;
  },
  async sair() { if (NUVEM) await sb.auth.signOut(); },
  async contatos() {
    if (!NUVEM) return {};
    const r = await sb.from('chamados_contato').select('*');
    return r.error ? {} : Object.fromEntries(r.data.map(x => [x.chamado_id, x.contato]));
  }
};
const apoiosDe = p => (apoiosBase[p.id] || 0) + (NUVEM ? 0 : (meusApoios[p.id] ? 1 : 0));

// ---------- navegação ----------
const TABS = [['inicio', '🏠', 'Início'], ['reportar', '📸', 'Reportar'], ['mapa', '🗺️', 'Mapa'], ['ppa', '📋', 'Painel PPA'], ['gestor', '🛠️', 'Gestor']];
function nav() {
  $('#nav').innerHTML = TABS.map(([k, i, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}"><span>${i}</span>${n}</button>`).join('');
  $('#nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.t); };
}
async function go(t) {
  tab = t; nav(); window.scrollTo(0, 0);
  if (t !== 'reportar') { try { await api.carregar(); } catch (e) { toast('Sem conexão com o servidor'); console.error(e); } }
  render();
}
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
  ${NUVEM ? '' : '<div class="aviso" style="margin-top:12px">Modo demonstração: os chamados e apoios ficam só neste aparelho. As 310 propostas do PPA são reais.</div>'}
  <h2 style="margin-top:12px">Últimos chamados</h2>${chamados.slice().sort((a, b) => b.criado - a.criado).slice(0, 4).map(cardChamado).join('') || '<p class="mut">Nenhum chamado ainda.</p>'}`;
  $('#app').onclick = e => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); };
}
function cardChamado(c) {
  const ic = (TIPOS.find(t => t[0] === c.tipo) || [0, '📍'])[1];
  return `<div class="card"><div class="row"><b>${ic} ${esc(c.tipo)}</b><span class="badge b-${c.status}">${c.status}</span></div>
  <div class="mut">${esc(c.local)} · ${fmt(c.criado)} · #${c.id}</div><p style="margin:6px 0 0">${esc(c.desc)}</p>${c.foto ? `<img class="foto" loading="lazy" src="${esc(c.foto)}" alt="foto do problema">` : ''}</div>`;
}

// ---------- reportar ----------
function vReportar() {
  $('#app').innerHTML = `<div class="card"><h2>Reportar um problema</h2>
  <label>1. O que está acontecendo?</label>
  <div class="tipos">${TIPOS.map(([n, i]) => `<button type="button" class="tipo ${sel.tipo === n ? 'on' : ''}" data-tipo="${esc(n)}"><span>${i}</span>${n}</button>`).join('')}</div>
  <label for="loc">2. Comunidade / bairro</label>
  <select id="loc">${COMUNIDADES.map(c => `<option>${c}</option>`).join('')}</select>
  <label for="desc">3. Descreva e dê uma referência</label>
  <textarea id="desc" maxlength="600" placeholder="Ex.: poste apagado ao lado da igreja"></textarea>
  <label>4. Localização</label>
  <div class="row"><button type="button" class="sec" id="gps">📍 Usar minha localização</button><span class="mut" id="gpsr">${sel.lat ? 'Localização capturada ✔' : 'Opcional'}</span></div>
  <label>5. Foto (opcional)</label>
  <input type="file" id="foto" accept="image/*" capture="environment">
  <img id="prev" class="foto ${sel.foto ? '' : 'hide'}" src="${sel.foto || ''}" alt="">
  <label for="nome">Seu telefone ou e-mail (opcional, só a Prefeitura vê)</label>
  <input id="nome" maxlength="120" autocomplete="off">
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
async function enviar() {
  const desc = $('#desc').value.trim();
  if (!sel.tipo) return toast('Escolha o tipo do problema');
  if (desc.length < 5) return toast('Descreva o problema');
  const btn = $('#env'); btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const id = await api.criar({ tipo: sel.tipo, local: $('#loc').value, desc, foto: sel.foto, lat: sel.lat, lng: sel.lng }, $('#nome').value.trim());
    sel = { tipo: null, foto: null, lat: null, lng: null };
    $('#app').innerHTML = `<div class="card"><h2>✅ Chamado #${id} enviado!</h2><p>A Secretaria de Infraestrutura foi avisada. Guarde o número e acompanhe o andamento no mapa e na tela inicial.</p><button data-go="mapa">Ver no mapa</button></div>`;
    $('#app').onclick = e => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); };
  } catch (e) { console.error(e); toast('Não foi possível enviar. Tente de novo.'); btn.disabled = false; btn.textContent = 'Enviar para a Prefeitura'; }
}

// ---------- mapa ----------
function vMapa() {
  $('#app').innerHTML = `<div class="chips" id="ch"></div><div id="map"></div><p class="mut">Cada ponto é um chamado com localização. Vermelho = aberto, azul = em andamento, verde = resolvido.</p><div id="lista"></div>`;
  let filtro = 'Todos';
  const cor = s => s === 'Resolvido' ? '#15803d' : s === 'Aberto' ? '#b91c1c' : '#1d4ed8';
  const draw = () => {
    $('#ch').innerHTML = ['Todos', ...STATUS].map(s => `<button class="${s === filtro ? 'on' : ''}">${s}</button>`).join('');
    const ls = chamados.filter(c => filtro === 'Todos' || c.status === filtro);
    $('#lista').innerHTML = ls.slice().sort((a, b) => b.criado - a.criado).map(cardChamado).join('');
    if (!window.L) { $('#map').innerHTML = '<p style="padding:16px" class="mut">Mapa indisponível sem internet. A lista abaixo funciona offline.</p>'; return; }
    if (mapObj) mapObj.remove();
    mapObj = L.map('map').setView(CENTRO, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapObj);
    ls.filter(c => c.lat != null && c.lng != null).forEach(c => L.circleMarker([c.lat, c.lng], { radius: 9, color: '#fff', weight: 2, fillColor: cor(c.status), fillOpacity: 1 }).addTo(mapObj).bindPopup(`<b>${esc(c.tipo)}</b><br>${esc(c.local)}<br>${esc(c.desc)}<br><i>${c.status}</i>`));
  };
  $('#ch').onclick = e => { if (e.target.tagName === 'BUTTON') { filtro = e.target.textContent; draw(); } };
  draw();
}

// ---------- painel PPA ----------
function vPpa() {
  const areas = ['Todas', ...new Set(PPA.map(p => p.area))];
  const locs = ['Todas', ...new Set(PPA.map(p => p.local).filter(Boolean))].sort();
  $('#app').innerHTML = `<div class="card"><h2>Propostas do PPA 2026-2029</h2>
  <p class="mut">As ${PPA.length} propostas que a população apresentou na consulta pública. Apoie as que considera prioridade (1 apoio por proposta neste aparelho).</p>
  <input id="q" placeholder="🔎 Buscar (ex.: água, asfalto, UBS...)" value="${esc(ppaF.q)}">
  <div class="row" style="margin-top:8px"><select id="fa" style="flex:1">${areas.map(a => `<option ${a === ppaF.area ? 'selected' : ''}>${a}</option>`).join('')}</select>
  <select id="fl" style="flex:1">${locs.map(a => `<option ${a === ppaF.local ? 'selected' : ''}>${a}</option>`).join('')}</select>
  <select id="fo" style="flex:1"><option value="votos" ${ppaF.ord === 'votos' ? 'selected' : ''}>Mais apoiadas</option><option value="id" ${ppaF.ord === 'id' ? 'selected' : ''}>Ordem original</option></select></div></div>
  <div id="res"></div>`;
  const draw = () => {
    const q = ppaF.q.toLowerCase();
    let ls = PPA.filter(p => (ppaF.area === 'Todas' || p.area === ppaF.area) && (ppaF.local === 'Todas' || p.local === ppaF.local) && (!q || p.texto.toLowerCase().includes(q) || p.tema.toLowerCase().includes(q)));
    ls = ppaF.ord === 'votos' ? ls.sort((a, b) => apoiosDe(b) - apoiosDe(a) || a.id - b.id) : ls.sort((a, b) => a.id - b.id);
    $('#res').innerHTML = `<p class="mut">${ls.length} propostas</p>` + ls.slice(0, 60).map(p => {
      const st = ppaStatus[p.id] || p.status;
      return `<div class="card"><div class="row"><span class="mut">${esc(p.area)} · ${esc(p.tema)}${p.local ? ' · ' + esc(p.local) : ''}</span><span class="badge b-${st}">${st}</span></div>
      <p style="margin:6px 0">${esc(p.texto)}</p><button class="sm ${meusApoios[p.id] ? '' : 'sec'}" data-v="${p.id}">👍 ${apoiosDe(p)} ${meusApoios[p.id] ? 'Você apoiou' : 'Apoiar'}</button></div>`;
    }).join('') + (ls.length > 60 ? `<p class="mut">Mostrando 60 de ${ls.length}. Use os filtros para refinar.</p>` : '');
  };
  $('#q').oninput = e => { ppaF.q = e.target.value; draw(); };
  $('#fa').onchange = e => { ppaF.area = e.target.value; draw(); };
  $('#fl').onchange = e => { ppaF.local = e.target.value; draw(); };
  $('#fo').onchange = e => { ppaF.ord = e.target.value; draw(); };
  $('#res').onclick = async e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    try { await api.apoiar(b.dataset.v); draw(); } catch (err) { console.error(err); toast('Não foi possível registrar o apoio'); }
  };
  draw();
}

// ---------- gestor ----------
async function vGestor() {
  if (!gestor && NUVEM) gestor = await api.souEquipe();
  if (!gestor) {
    $('#app').innerHTML = `<div class="card"><h2>Painel do gestor</h2><p class="mut">Acesso da equipe da Prefeitura.${NUVEM ? '' : ' No modo demonstração, a senha é <b>ibiapina</b>.'}</p>
    ${NUVEM ? '<label for="em">E-mail</label><input id="em" type="email" autocomplete="username">' : ''}
    <label for="pw">Senha</label><input id="pw" type="password" autocomplete="current-password"><p><button id="ok">Entrar</button></p></div>`;
    $('#ok').onclick = async () => {
      try {
        gestor = await api.entrar($('#em')?.value.trim(), $('#pw').value);
        if (!gestor) { if (NUVEM) await api.sair(); toast(NUVEM ? 'Sem permissão de equipe' : 'Senha incorreta'); return; }
        await go('gestor');
      } catch { toast('E-mail ou senha incorretos'); }
    };
    return;
  }
  const contatos = await api.contatos();
  const m = metricas();
  const porTipo = {}; chamados.forEach(c => porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1);
  const porLocal = {}; chamados.forEach(c => porLocal[c.local] = (porLocal[c.local] || 0) + 1);
  const max = Math.max(1, ...Object.values(porTipo));
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topPpa = PPA.slice().sort((a, b) => apoiosDe(b) - apoiosDe(a)).slice(0, 5);
  $('#app').innerHTML = `<div class="grid"><div class="stat"><b>${m.total}</b><small>chamados</small></div><div class="stat"><b>${m.abertos}</b><small>em aberto</small></div><div class="stat"><b>${m.res}</b><small>resolvidos</small></div><div class="stat"><b>${m.media}</b><small>dias p/ resolver</small></div></div>
  <div class="card" style="margin-top:12px"><h2>Problemas por tipo</h2>${top(porTipo).map(([k, n]) => `<div class="row"><span>${esc(k)}</span><b>${n}</b></div><div class="bar"><i style="width:${n / max * 100}%"></i></div>`).join('')}
  <h2 style="margin-top:14px">Comunidades com mais chamados</h2>${top(porLocal).map(([k, n]) => `<div class="row"><span>${esc(k)}</span><b>${n}</b></div>`).join('')}</div>
  <div class="card"><h2>Propostas do PPA mais apoiadas</h2>${topPpa.map(p => `<p style="margin:4px 0">👍 ${apoiosDe(p)} · ${esc(p.texto)}</p>`).join('')}</div>
  <div class="card"><div class="row"><h2>Chamados</h2><button class="sm sec" id="csv">⬇ Exportar CSV</button></div>
  <table><tr><th>#</th><th>Problema</th><th>Local</th><th>Status</th></tr>${chamados.slice().sort((a, b) => b.criado - a.criado).map(c => `<tr><td>${c.id}</td><td>${esc(c.tipo)}<br><span class="mut">${esc(c.desc)}</span>${contatos[c.id] ? `<br><span class="mut">☎ ${esc(contatos[c.id])}</span>` : ''}</td><td>${esc(c.local)}</td>
  <td><select data-c="${c.id}">${STATUS.map(s => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table></div>
  <div class="card"><h2>Status de proposta do PPA</h2><select id="pp">${PPA.map(p => `<option value="${p.id}">#${p.id} ${esc(p.texto.slice(0, 70))}</option>`).join('')}</select>
  <select id="ps" style="margin-top:8px">${PPA_STATUS.map(s => `<option>${s}</option>`).join('')}</select><p><button id="pset">Atualizar proposta</button></p></div>
  <button class="sec" id="sair">Sair do painel</button>`;
  $('#app').onchange = async e => {
    const s = e.target.closest('[data-c]'); if (!s) return;
    try { await api.mudarStatus(s.dataset.c, s.value); await api.carregar(); toast('Status atualizado'); render(); } catch (err) { console.error(err); toast('Não foi possível atualizar'); }
  };
  $('#pset').onclick = async () => { try { await api.mudarPpa($('#pp').value, $('#ps').value); toast('Proposta atualizada'); } catch (err) { console.error(err); toast('Não foi possível atualizar'); } };
  $('#sair').onclick = async () => { await api.sair(); gestor = false; render(); };
  $('#csv').onclick = () => {
    const rows = [['id', 'tipo', 'local', 'descricao', 'status', 'criado', 'lat', 'lng', 'contato'], ...chamados.map(c => [c.id, c.tipo, c.local, c.desc, c.status, new Date(c.criado).toISOString(), c.lat ?? '', c.lng ?? '', contatos[c.id] ?? ''])];
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'chamados.csv'; a.click();
  };
}

nav();
go('inicio');
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
