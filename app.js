// =====================================================================
// JOPEC · Controle de Legalização
// =====================================================================
const CFG = window.LEG_CONFIG || {};
const MODO_DEMO = !CFG.SUPABASE_URL;
const T = { presets: 'leg_presets', processos: 'leg_processos', etapas: 'leg_etapas', atual: 'leg_atualizacoes', config: 'leg_config' };

const SITUACOES = {
  andamento:   { nome: 'Em andamento', ic: '▶', cor: 'azul' },
  pausado:     { nome: 'Pausados', ic: '⏸', cor: 'amarelo' },
  finalizado:  { nome: 'Finalizados', ic: '✔', cor: 'verde' },
  desistencia: { nome: 'Desistências', ic: '✕', cor: 'vermelho' },
  arquivado:   { nome: 'Arquivados', ic: '🗄', cor: '' },
};
const AGUARDANDO = { jopec: 'Com a JOPEC', cliente: 'Aguardando cliente', orgao: 'Aguardando órgão', chefes: 'Aguardando chefes' };
const TIPOS_CLIENTE = ['EMPRESA', 'MEI', 'AUTÔNOMO', 'PESSOA FÍSICA', 'ASSOCIAÇÃO / INSTITUTO'];
const ST_ETAPA = { pendente: 'Pendente', andamento: 'Em andamento', concluida: 'Concluída', dispensada: 'Dispensada' };
const CONFIG_PADRAO = {
  modo_padrao: 'repetir',          // 'repetir' | 'sem_movimentacao'
  so_dias_uteis: true,
  alerta_dias: 5,
  avancar_etapa: true,             // ao concluir etapa, a próxima vira "em andamento"
  responsaveis: ['João', 'Cris', 'Mateus'],
  triagem: {},
  email_para: 'jotapec2020@gmail.com, cristiano.jopec@gmail.com',
  email_cc: 'legaliza@jopec.com.br',
  email_remetente: 'mateus.jopec@gmail.com',
  frases: ['Orçamento enviado', 'Aguardando assinatura dos sócios', 'Documentos enviados para assinatura', 'CPL em análise', 'CPL deferida',
    'Cumprindo exigência', 'DBE feito', 'DBE em análise', 'Processo em análise na JUCERJA', 'Processo em exigência na JUCERJA',
    'Processo em análise no RCPJ', 'Guia enviada ao cliente', 'Aguardando pagamento da taxa', 'Aguardando retorno do cliente', 'Aguardando João/Cris confirmar'],
};

// ---------------------------------------------------------------- utilidades
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const pad = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => isoLocal(new Date());
const parseD = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = s => s ? parseD(s).toLocaleDateString('pt-BR') : '—';
const DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const moedaReal = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const valoresOcultos = () => localStorage.getItem('leg_ocultar_valores') === '1';
const moeda = v => valoresOcultos() ? 'R$ •••••' : moedaReal(v);
const botaoOlho = () => `<button type="button" class="btn-olho" data-olho title="${valoresOcultos() ? 'Mostrar valores' : 'Esconder valores'}">${valoresOcultos() ? '🙈' : '👁'}</button>`;
function ligarOlho(el) { $$('[data-olho]', el).forEach(b => b.onclick = ev => { ev.stopPropagation(); localStorage.setItem('leg_ocultar_valores', valoresOcultos() ? '0' : '1'); render(); }); }
const fimDeSemana = d => d.getDay() === 0 || d.getDay() === 6;
function toast(msg, tipo = 'ok') { const t = $('#toast'); t.textContent = msg; t.className = 'on ' + tipo; clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), tipo === 'erro' ? 4200 : 2400); }
function diasEntre(a, b, uteis) { // dias contados de a (exclusivo) até b (inclusivo)
  let n = 0; const d = parseD(a), fim = parseD(b);
  while (d < fim) { d.setDate(d.getDate() + 1); if (!uteis || !fimDeSemana(d)) n++; }
  return n;
}

// ---------------------------------------------------------------- dados
let sb = null;
const DB = {
  async init() {
    if (MODO_DEMO) return;
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  },
  demo() { try { return JSON.parse(localStorage.getItem('leg_demo_db')) || {}; } catch { return {}; } },
  salvaDemo(db) { localStorage.setItem('leg_demo_db', JSON.stringify(db)); },
  async todos(t) {
    if (MODO_DEMO) return this.demo()[t] || [];
    const out = []; let de = 0;
    while (true) {
      const { data, error } = await sb.from(t).select('*').range(de, de + 999);
      if (error) throw error; out.push(...data); if (data.length < 1000) break; de += 1000;
    }
    return out;
  },
  async ins(t, rows) {
    rows = Array.isArray(rows) ? rows : [rows]; if (!rows.length) return;
    rows.forEach(r => { if (!r.id && t !== T.config) r.id = uid(); });
    if (MODO_DEMO) { const db = this.demo(); db[t] = [...(db[t] || []), ...rows]; this.salvaDemo(db); return; }
    const { error } = await sb.from(t).insert(rows); if (error) throw error;
  },
  async upd(t, id, patch) {
    if (MODO_DEMO) { const db = this.demo(); db[t] = (db[t] || []).map(r => r.id === id ? { ...r, ...patch } : r); this.salvaDemo(db); return; }
    const { error } = await sb.from(t).update(patch).eq('id', id); if (error) throw error;
  },
  async del(t, col, val) {
    if (MODO_DEMO) { const db = this.demo(); db[t] = (db[t] || []).filter(r => r[col] !== val); this.salvaDemo(db); return; }
    const { error } = await sb.from(t).delete().eq(col, val); if (error) throw error;
  },
  async salvaChave(chave, valor) {
    if (MODO_DEMO) { const db = this.demo(); db[T.config] = [...(db[T.config] || []).filter(r => r.chave !== chave), { chave, valor }]; this.salvaDemo(db); return; }
    const { error } = await sb.from(T.config).upsert({ chave, valor }); if (error) throw error;
  },
  async salvaConfig(valor) {
    if (MODO_DEMO) { const db = this.demo(); db[T.config] = [...(db[T.config] || []).filter(r => r.chave !== 'geral'), { chave: 'geral', valor }]; this.salvaDemo(db); return; }
    const { error } = await sb.from(T.config).upsert({ chave: 'geral', valor }); if (error) throw error;
  },
};


// ---------------------------------------------------------------- ícones (traço fino, estilo Lucide)
const IC_PATH = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  processos: '<path d="M3 6h.01M3 12h.01M3 18h.01"/><path d="M8 6h13M8 12h13M8 18h13"/>',
  cardapio: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  relatorio: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
  triagem: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  auto: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
};
const ic = (k, sz = 18) => `<svg class="svg-ic" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC_PATH[k] || ''}</svg>`;

// ---------------------------------------------------------------- preferências deste aparelho (tema, densidade…)
const PREF_PADRAO = { tema: 'auto', densidade: 'normal', inicio: 'painel', ordem: 'parados', filtroAg: '', filtroPreset: '' };
const pref = k => { try { return { ...PREF_PADRAO, ...JSON.parse(localStorage.getItem('leg_pref') || '{}') }[k]; } catch { return PREF_PADRAO[k]; } };
const setPref = (k, v) => { let o = {}; try { o = JSON.parse(localStorage.getItem('leg_pref') || '{}'); } catch {} o[k] = v; localStorage.setItem('leg_pref', JSON.stringify(o)); };
const MQ_ESCURO = matchMedia('(prefers-color-scheme: dark)');
function aplicarTema() {
  const t = pref('tema'), escuro = t === 'escuro' || (t === 'auto' && MQ_ESCURO.matches);
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
  document.documentElement.dataset.densidade = pref('densidade');
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = escuro ? '#4e1619' : '#a23133';
}
MQ_ESCURO.addEventListener?.('change', () => { if (pref('tema') === 'auto') { aplicarTema(); } });
aplicarTema();
const TEMAS = { auto: ['auto', 'Automático (segue o aparelho)'], claro: ['sol', 'Claro'], escuro: ['lua', 'Escuro'] };
function botaoTema() { const t = pref('tema'); return `<button class="btn-tema" id="b-tema" title="Tema: ${TEMAS[t][1]} — clique para trocar" aria-label="Trocar tema (atual: ${TEMAS[t][1]})">${ic(TEMAS[t][0], 17)}</button>`; }
function ligarTema(raiz = document) { const b = $('#b-tema', raiz); if (b) b.onclick = () => { const ord = ['auto', 'claro', 'escuro']; const n = ord[(ord.indexOf(pref('tema')) + 1) % 3]; setPref('tema', n); aplicarTema(); b.outerHTML = botaoTema(); ligarTema(raiz); toast('Tema: ' + TEMAS[n][1]); }; }

// ---------------------------------------------------------------- diálogos no visual do app (substituem os pop-ups cinza do navegador)
function dialogo({ titulo, msg, ok = 'OK', cancelar = 'Cancelar', perigo = false, so_ok = false }) {
  return new Promise(res => {
    const box = document.createElement('div'); box.className = 'fundo dlg-fundo';
    box.innerHTML = `<div class="dlg ${perigo ? 'perigo' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
      <div class="dlg-ic">${perigo ? '!' : so_ok ? 'i' : '?'}</div>
      <h3 id="dlg-t">${h(titulo)}</h3>${msg ? `<p>${h(msg).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="dlg-bts">${so_ok ? '' : `<button class="btn" data-r="0">${h(cancelar)}</button>`}<button class="btn ${perigo ? 'dang-forte' : 'pri'}" data-r="1">${h(ok)}</button></div></div>`;
    document.body.appendChild(box);
    const fim = v => { box.remove(); document.removeEventListener('keydown', tec, true); res(v); };
    const tec = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); fim(false); } };
    document.addEventListener('keydown', tec, true);
    box.onmousedown = e => { if (e.target === box) fim(false); };
    $$('[data-r]', box).forEach(b => b.onclick = () => fim(b.dataset.r === '1'));
    setTimeout(() => $('[data-r="1"]', box).focus(), 30);
  });
}
function confirmar(texto) {
  const t = String(texto), q = t.search(/\?(\s|$)/), titulo = q > 0 ? t.slice(0, q + 1) : t.split('\n\n')[0];
  const resto = [t.slice(titulo.length).trim().replace(/^\(|\)$/g, '')];
  const m = /^(Excluir|Apagar|Remover|Desativar)/.exec(titulo);
  return dialogo({ titulo, msg: resto.join('\n\n'), ok: m ? m[1] : 'Confirmar', perigo: !!m });
}
function avisar(texto) { const [titulo, ...resto] = String(texto).split(/\n\n|: /); return dialogo({ titulo: resto.length ? titulo : 'Atenção', msg: resto.length ? resto.join(': ') : titulo, so_ok: true, ok: 'Entendi', perigo: true }); }
const S = { papel: null, email: '', view: pref('inicio'), aba: 'andamento', busca: '', presets: [], processos: [], etapas: [], atual: [], config: { ...CONFIG_PADRAO }, mesRel: hoje().slice(0, 7) };
const admin = () => S.papel === 'admin';
// Logos da Jopec (os mesmos do app de certidões). Se não carregarem, aparece o nome em texto.
const LOGO_BASE = 'https://certidoes-jopec.vercel.app/';
const LOGO_MARCA = `<img class="mark" src="${LOGO_BASE}logo-mark.png" alt="" onerror="this.style.display='none'">`;
const LOGO_NOME = `<img class="word" src="${LOGO_BASE}logo-jopec.png" alt="Jopec" onerror="this.outerHTML='<span class=&quot;alt&quot;>Jopec</span>'">`;

async function carregar() {
  const [p, pr, e, a, c] = await Promise.all([DB.todos(T.presets), DB.todos(T.processos), DB.todos(T.etapas), DB.todos(T.atual), DB.todos(T.config)]);
  S.presets = p.sort((x, y) => (x.ordem ?? 0) - (y.ordem ?? 0) || x.nome.localeCompare(y.nome));
  S.processos = pr; S.etapas = e; S.atual = a;
  const g = c.find(x => x.chave === 'geral'); S.config = { ...CONFIG_PADRAO, ...(g ? g.valor : {}) };
  const pe = c.find(x => x.chave === 'pendencias'); S.pendencias = pe ? pe.valor : (window.LEG_PENDENCIAS || []);
}
async function acao(fn, msg) {
  if (!admin()) { toast('Perfil de visualização: sem permissão para alterar.'); return false; }
  try { await fn(); await carregar(); render(); if (msg) toast(msg); return true; }
  catch (err) { console.error(err); avisar('Não foi possível salvar: ' + (err.message || err) + '\n\nConfira a internet e tente de novo. Nada foi perdido do que já estava salvo.'); return false; }
}

// ---------------------------------------------------------------- regras do processo
const etapasDe = id => S.etapas.filter(e => e.processo_id === id).sort((a, b) => a.ordem - b.ordem);
const atualDe = id => S.atual.filter(a => a.processo_id === id).sort((a, b) => (a.data + a.criado_em).localeCompare(b.data + b.criado_em));
const presetDe = p => S.presets.find(x => x.id === p.preset_id);
const corDe = p => presetDe(p)?.cor || '#a23133';
const modoDe = p => p.modo_diario && p.modo_diario !== 'padrao' ? p.modo_diario : S.config.modo_padrao;

function progresso(p) {
  const es = etapasDe(p.id).filter(e => e.status !== 'dispensada');
  const ok = es.filter(e => e.status === 'concluida').length;
  const atual = es.find(e => e.status === 'andamento') || es.find(e => e.status === 'pendente');
  return { total: es.length, ok, pct: es.length ? Math.round(ok / es.length * 100) : 0, atual, idx: atual ? es.indexOf(atual) + 1 : es.length };
}
function ultimoRegistro(p) { const a = atualDe(p.id); return a[a.length - 1]; }
function ultimoMovimento(p) { const a = atualDe(p.id).filter(x => x.tipo !== 'sistema'); return a[a.length - 1]; }
function diasParado(p) {
  const u = ultimoMovimento(p); const base = u ? u.data : p.data_inicio || hoje();
  return diasEntre(base, hoje(), S.config.so_dias_uteis);
}
function statusAtual(p) {
  const u = ultimoRegistro(p);
  if (p.situacao === 'pausado') return { txt: '⏸ Pausado' + (p.pausa_motivo ? ' — ' + p.pausa_motivo : ''), auto: false };
  if (!u) return { txt: 'Sem movimentação', auto: true };
  if (u.data === hoje()) return { txt: u.texto, auto: false };
  return modoDe(p) === 'repetir' ? { txt: u.texto, auto: true, rep: true } : { txt: 'Sem movimentação', auto: true };
}
// Diário: um item por dia (úteis ou corridos), do início até hoje/conclusão.
function diario(p, limite = 45) {
  const regs = atualDe(p.id); const porDia = {};
  regs.forEach(r => (porDia[r.data] = porDia[r.data] || []).push(r));
  const ini = p.data_inicio || (regs[0] && regs[0].data) || hoje();
  const fimS = ['finalizado', 'desistencia', 'arquivado'].includes(p.situacao) ? (p.data_conclusao || regs.at(-1)?.data || hoje()) : hoje();
  const dias = []; const d = parseD(ini); const fim = parseD(fimS < ini ? ini : fimS);
  let ultimo = null, pausado = false;
  while (d <= fim) {
    const k = isoLocal(d);
    if (porDia[k]) {
      porDia[k].forEach(r => { ultimo = r; if (r.tipo === 'pausa') pausado = true; if (r.tipo === 'retomada' || r.tipo === 'registro' || r.tipo === 'etapa') pausado = r.tipo === 'pausa'; });
      dias.push({ data: k, regs: porDia[k] });
    } else if (!S.config.so_dias_uteis || !fimDeSemana(d)) {
      let txt = 'Sem movimentação';
      if (pausado) txt = '⏸ Processo pausado';
      else if (ultimo && modoDe(p) === 'repetir') txt = ultimo.texto;
      dias.push({ data: k, auto: true, txt, rep: !pausado && ultimo && modoDe(p) === 'repetir' });
    }
    d.setDate(d.getDate() + 1);
  }
  return { dias: dias.reverse(), total: dias.length, limite };
}
async function registrar(pid, texto, extra = {}) {
  await DB.ins(T.atual, { processo_id: pid, data: extra.data || hoje(), texto, tipo: extra.tipo || 'registro', etapa_nome: extra.etapa_nome || null, autor: S.email || S.papel, criado_em: new Date().toISOString() });
  await DB.upd(T.processos, pid, { atualizado_em: new Date().toISOString() });
}

// ---------------------------------------------------------------- login
function telaLogin(erro = '', emailAnt = '') {
  document.body.className = '';
  const perfil = sessionStorage.getItem('leg_perfil_sel') || 'equipe';
  $('#app').innerHTML = `
  <div class="login"><form class="login-box" id="f-login">
    <div style="display:flex;align-items:center;gap:10px;background:linear-gradient(120deg,#a23133,#75232a);margin:-32px -32px 18px;padding:18px 24px;border-radius:20px 20px 0 0">${LOGO_MARCA}${LOGO_NOME}</div>
    <h1 style="font-family:var(--f-display)">Controle de Legalização</h1>
    <p>Departamento de Legalização · JOPEC</p>
    ${MODO_DEMO ? `<div class="perfis">
      <button type="button" class="perfil ${perfil === 'equipe' ? 'on' : ''}" data-p="equipe"><b>👁 Equipe</b><span>Somente visualizar</span></button>
      <button type="button" class="perfil ${perfil === 'admin' ? 'on' : ''}" data-p="admin"><b>🔑 Administrador</b><span>Acesso total</span></button>
    </div>` : `<div class="campo c6" style="margin-bottom:12px"><label>E-mail</label><input type="email" id="email" autocomplete="username" required value="${h(emailAnt || localStorage.getItem('leg_ultimo_email') || '')}"></div>`}
    <div class="campo c6"><label>Senha</label><div class="senha-box"><input type="password" id="senha" autocomplete="current-password" required><button type="button" class="ver-senha" id="ver-senha" aria-label="Mostrar senha">Mostrar</button></div></div>
    ${erro ? `<div class="aviso vermelho" style="margin-top:12px">${h(erro)}</div>` : ''}
    <button class="btn pri" id="b-entrar" style="width:100%;justify-content:center;margin-top:16px;padding:11px">Entrar</button>
    ${MODO_DEMO ? `<div class="demo-aviso">Modo demonstração (Supabase ainda não configurado). Senhas: equipe = <b>${h(CFG.DEMO_SENHA_EQUIPE)}</b>, administrador = <b>${h(CFG.DEMO_SENHA_ADMIN)}</b>. Os dados ficam só neste navegador.</div>` : ''}
  </form></div>`;
  $$('.perfil').forEach(b => b.onclick = () => { sessionStorage.setItem('leg_perfil_sel', b.dataset.p); $$('.perfil').forEach(x => x.classList.toggle('on', x === b)); });
  const foco = $('#email') && !$('#email').value ? $('#email') : $('#senha'); foco.focus();
  const vs = $('#ver-senha'); if (vs) vs.onclick = () => { const i = $('#senha'), mostrar = i.type === 'password'; i.type = mostrar ? 'text' : 'password'; vs.textContent = mostrar ? 'Ocultar' : 'Mostrar'; vs.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha'); i.focus(); };
  $('#f-login').onsubmit = async ev => {
    ev.preventDefault();
    const senha = $('#senha').value;
    if (MODO_DEMO) {
      const p = $('.perfil.on').dataset.p;
      if (senha !== (p === 'admin' ? CFG.DEMO_SENHA_ADMIN : CFG.DEMO_SENHA_EQUIPE)) return telaLogin('Senha incorreta.');
      sessionStorage.setItem('leg_demo_papel', p); return iniciar();
    }
    const email = $('#email').value.trim().toLowerCase();
    const be = $('#b-entrar'); be.disabled = true; be.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) return telaLogin('E-mail ou senha incorretos.', email);
    localStorage.setItem('leg_ultimo_email', email);
    iniciar();
  };
}
async function sair() {
  if (MODO_DEMO) sessionStorage.removeItem('leg_demo_papel'); else await sb.auth.signOut();
  telaLogin();
}

// ---------------------------------------------------------------- casca
const NAV = [
  ['painel', 'painel', 'Painel do dia'], ['processos', 'processos', 'Processos'], ['cardapio', 'cardapio', 'Cardápio de etapas'],
  ['relatorio', 'relatorio', 'Relatório mensal'], ['triagem', 'triagem', 'Triagem da planilha'], ['config', 'config', 'Configurações'],
];
function render() {
  document.body.className = 'papel-' + S.papel;
  const nAnd = S.processos.filter(p => p.situacao === 'andamento').length;
  $('#app').innerHTML = `
  <div class="shell">
    <header class="band">
      <div class="wrap topbar">
        <div class="brand">${LOGO_MARCA}<div>${LOGO_NOME}<h1>Legalização · Controle de Processos</h1></div></div>
        <div class="usr"><span class="papel">${admin() ? '🔑 Administrador' : '👁 Somente leitura'}</span>${S.email ? `<span class="mail">${h(S.email)}</span>` : ''}${MODO_DEMO ? '<span class="papel">demonstração</span>' : ''}${botaoTema()}<button class="btn-sair" id="b-sair">Sair</button></div>
      </div>
      <nav class="wrap navtop">${NAV.filter(n => admin() || n[0] !== 'triagem').filter(n => n[0] !== 'triagem' || pendTriagem().length).map(([k, icn, nm]) => `<button class="nav ${S.view === k ? 'on' : ''}" data-v="${k}"><span class="ic">${ic(icn, 16)}</span>${nm}${k === 'processos' ? `<span class="n">${nAnd}</span>` : ''}${k === 'triagem' ? `<span class="n">${pendTriagem().length}</span>` : ''}</button>`).join('')}</nav>
    </header>
    <main class="main wrap" id="main"></main>
  </div>
  <nav class="mobnav">${NAV.filter(n => admin() || n[0] !== 'triagem').filter(n => n[0] !== 'triagem' || pendTriagem().length).map(([k, icn, nm]) => `<button class="${S.view === k ? 'on' : ''}" data-v="${k}" aria-label="${nm}"><span class="ic">${ic(icn, 21)}</span>${({ painel: 'Painel', processos: 'Processos', cardapio: 'Cardápio', relatorio: 'Relatório', triagem: 'Triagem', config: 'Ajustes' })[k]}</button>`).join('')}</nav>`;
  $$('[data-v]').forEach(b => b.onclick = () => { S.view = b.dataset.v; render(); window.scrollTo(0, 0); });
  $('#b-sair').onclick = sair; ligarTema();
  acessivel($('#main'));
  ({ painel: vPainel, processos: vProcessos, cardapio: vCardapio, relatorio: vRelatorio, config: vConfig, triagem: vTriagem }[S.view] || vPainel)($('#main'));
}

// ---------------------------------------------------------------- cartão de processo
function cartao(p) {
  const pr = progresso(p), st = statusAtual(p), dp = diasParado(p), sit = SITUACOES[p.situacao];
  const alerta = p.situacao === 'andamento' && dp >= S.config.alerta_dias;
  return `<div class="card proc" style="--cor:${h(corDe(p))}" data-proc="${p.id}">
    <div class="l1"><div style="flex:1"><div class="nome">${h(p.cliente)}</div><div class="serv">${h(p.servico || presetDe(p)?.nome || '')}</div></div>
      ${p.prioridade && p.prioridade !== 'normal' ? `<span class="chip ${p.prioridade === 'baixa' ? '' : 'vermelho'}">${h(p.prioridade)}</span>` : ''}
      ${p.situacao !== 'andamento' ? `<span class="chip ${sit.cor}">${sit.ic} ${sit.nome.replace(/s$/, '')}</span>` : ''}</div>
    ${pr.total ? `<div class="etapa-atual"><span>Etapa ${Math.min(pr.idx, pr.total)}/${pr.total}: <b>${h(pr.atual ? pr.atual.nome : 'Todas concluídas')}</b></span><span>${pr.pct}%</span></div><div class="barra"><div style="width:${pr.pct}%"></div></div>` : ''}
    <div class="status">${st.auto ? `<i>${h(st.txt)}${st.rep ? ' (mantido)' : ''}</i>` : h(st.txt)}</div>
    <div class="l3">
      <span class="chip">${h(p.tipo_cliente || '')}</span>
      ${p.situacao === 'andamento' ? `<span class="chip ${p.aguardando === 'cliente' ? 'amarelo' : p.aguardando === 'orgao' ? 'roxo' : p.aguardando === 'chefes' ? 'azul' : ''}">${h(AGUARDANDO[p.aguardando] || AGUARDANDO.jopec)}</span>` : ''}
      ${p.situacao === 'andamento' ? `<span class="chip ${alerta ? 'vermelho' : ''}">${dp === 0 ? 'movimentado hoje' : dp + (dp === 1 ? ' dia' : ' dias') + ' sem movimento'}</span>` : ''}
      ${p.situacao === 'pausado' && p.retomar_em ? `<span class="chip ${p.retomar_em <= hoje() ? 'vermelho' : 'amarelo'}">retomar ${fmtD(p.retomar_em)}</span>` : ''}
      ${p.situacao === 'finalizado' ? `<span class="chip verde">finalizado ${fmtD(p.data_conclusao)}</span>` : ''}
      ${chipFin(p)}
    </div></div>`;
}
function acessivel(raiz) { setTimeout(() => $$('[data-proc]:not(a):not(button),[data-ir],[data-rel],[data-relfin]', raiz).forEach(x => { x.tabIndex = 0; x.setAttribute('role', 'button'); }), 0); }
document.addEventListener('keydown', e => { const t = e.target; if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute?.('role') === 'button' && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) { e.preventDefault(); t.click(); } });
function ligarCartoes(el) { $$('[data-proc]', el).forEach(c => c.onclick = () => abrirDetalhe(c.dataset.proc)); }

// ---------------------------------------------------------------- PAINEL
function vPainel(el) {
  const and = S.processos.filter(p => p.situacao === 'andamento');
  const pausados = S.processos.filter(p => p.situacao === 'pausado');
  const pausaVencida = pausados.filter(p => p.retomar_em && p.retomar_em <= hoje());
  const mes = hoje().slice(0, 7);
  const fimMes = S.processos.filter(p => p.situacao === 'finalizado' && (p.data_conclusao || '').startsWith(mes));
  const movHoje = p => atualDe(p.id).some(a => a.data === hoje() && a.tipo !== 'sistema');
  const fin = finTotais(finAtivos());
  const d = new Date();
  const ALERTA = S.config.alerta_dias;

  // ---- o que pede atenção (uma lista só, do mais grave para o mais leve)
  const atencao = [];
  and.filter(p => diasParado(p) >= ALERTA).sort((a, b) => diasParado(b) - diasParado(a))
    .forEach(p => atencao.push({ p, cor: 'vermelho', txt: `${diasParado(p)} dias sem movimento` }));
  S.processos.filter(p => ['andamento', 'pausado'].includes(p.situacao) && calcFin(p).status === 'atrasado')
    .forEach(p => atencao.push({ p, cor: 'vermelho', txt: `pagamento atrasado · ${valoresOcultos() ? '•••' : moeda(calcFin(p).atrasado)}` }));
  pausaVencida.forEach(p => atencao.push({ p, cor: 'amarelo', txt: `pausa venceu em ${fmtD(p.retomar_em)} · retomar ou remarcar` }));
  and.filter(p => p.aguardando === 'chefes').forEach(p => atencao.push({ p, cor: 'azul', txt: 'aguardando decisão dos chefes' }));

  // ---- rotina: primeiro quem ainda não foi atualizado hoje (mais parados no topo)
  const rot = [...and].sort((a, b) => (movHoje(a) - movHoje(b)) || diasParado(b) - diasParado(a) || a.cliente.localeCompare(b.cliente, 'pt-BR'));
  const feitos = and.filter(movHoje).length;
  const AGCOR = { cliente: 'amarelo', orgao: 'roxo', chefes: 'azul' };

  const kpi = (n, l, { cor = '', ir = '', extra = '', zero = true, attr = '' } = {}) =>
    `<div class="pd-k ${cor} ${zero && !n ? 'zero' : ''}" ${ir ? `data-ir="${ir}"` : ''} ${attr}><b>${n}</b><span>${l}${extra}</span></div>`;

  el.innerHTML = `
  <div class="topo"><h2>Painel do dia</h2>
    <button class="btn adm" id="b-alerta">✉ Enviar alerta do dia</button>
    <button class="btn pri adm" id="b-novo">＋ Novo processo</button>
    <div class="sub">${(t => t[0].toUpperCase() + t.slice(1))(d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</div></div>

  <div class="card pd-resumo">
    ${kpi(and.length, 'em andamento', { ir: 'andamento', zero: false })}
    ${kpi(and.filter(p => p.aguardando === 'cliente').length, 'aguardando cliente', { cor: 'amarelo', ir: 'andamento' })}
    ${kpi(pausados.length, 'pausados', { cor: 'amarelo', ir: 'pausado' })}
    ${fin.valor ? kpi(fin.nAberto, 'a receber', { cor: fin.nAtraso ? 'vermelho' : '', attr: 'data-relfin="1"', extra: `<em>${valoresOcultos() ? '•••' : moeda(fin.falta)}${fin.nAtraso ? ` · ${fin.nAtraso} atrasado${fin.nAtraso > 1 ? 's' : ''}` : ''}</em>` }) : ''}
    ${kpi(fimMes.length, 'finalizados no mês', { cor: 'verde', attr: 'data-rel="1"', extra: `<em>${moeda(fimMes.reduce((s, p) => s + (+p.gratificacao || 0), 0))} ${botaoOlho()}</em>` })}
  </div>

  <div class="secao"><h3>Pede atenção</h3>${atencao.length ? `<span class="dica">${atencao.length} ${atencao.length === 1 ? 'item' : 'itens'}</span>` : ''}</div>
  ${atencao.length ? `<div class="card pd-aten">${atencao.map(x => `<button class="pd-al" data-proc="${x.p.id}"><i class="pt ${x.cor}"></i><b>${h(x.p.cliente)}</b><span>${h(x.txt)}</span><span class="seta">›</span></button>`).join('')}</div>`
    : `<div class="card pd-tudo-ok">✓ Nada urgente hoje. Nenhum processo parado há ${ALERTA}+ dias, sem pausas vencidas nem pagamentos atrasados.</div>`}

  <div class="secao pd-rot-cab"><h3>Rotina de hoje</h3>
    ${and.length ? `<div class="pd-prog"><span><b id="pd-n">${feitos}</b> de ${and.length} atualizados hoje</span><div class="barra"><div id="pd-bar" style="width:${Math.round(feitos / and.length * 100)}%"></div></div></div>` : ''}</div>
  ${admin() && and.length ? `<p class="pd-dica">Escreva só a novidade de hoje. Campo em branco = ${S.config.modo_padrao === 'repetir' ? 'mantém o último status' : 'fica como “sem movimentação”'}. <kbd>Enter</kbd> pula para o próximo.</p>` : ''}
  <div class="pd-lista">
    ${rot.length ? rot.map(p => {
      const feito = atualDe(p.id).filter(a => a.data === hoje() && a.tipo === 'registro').at(-1);
      const ok = movHoje(p), pr = progresso(p), ult = ultimoMovimento(p), dp = diasParado(p);
      const ag = p.aguardando || 'jopec';
      return `<div class="card pd-rt ${ok ? 'ok' : ''} ${dp >= ALERTA ? 'parado' : ''}">
        <div class="pd-info">
          <div class="pd-l1"><a href="#" class="pd-nome" data-proc="${p.id}">${h(p.cliente)}</a>
            ${ok ? '<span class="chip verde">✓ hoje</span>' : `<span class="chip ${dp >= ALERTA ? 'vermelho' : ''}">${dp === 0 ? 'hoje' : dp === 1 ? 'há 1 dia' : `há ${dp} dias`}</span>`}
            ${ag !== 'jopec' ? `<span class="chip ${AGCOR[ag] || ''}">${h(AGUARDANDO[ag])}</span>` : ''}</div>
          ${pr.total ? `<div class="pd-et"><span>Etapa ${Math.min(pr.idx, pr.total)}/${pr.total} · <b>${h(pr.atual ? pr.atual.nome : 'todas concluídas')}</b></span><div class="barra"><div style="width:${pr.pct}%"></div></div></div>` : `<div class="pd-et"><span>${h(p.servico || '')}</span></div>`}
          <div class="pd-ult">${ult ? `<span>${ult.data === hoje() ? 'Hoje' : fmtD(ult.data).slice(0, 5)}:</span> ${h(ult.texto)}` : '<i>Nenhum status registrado ainda</i>'}</div>
        </div>
        ${admin() ? `<div class="pd-in">
          <input data-rot="${p.id}" placeholder="Novidade de hoje…" value="${feito ? h(feito.texto) : ''}" ${feito ? 'data-ja="1"' : ''} list="dl-frases" aria-label="Novidade de hoje para ${h(p.cliente)}">
          ${ult && !feito ? `<button class="btn sm ghost" data-rep="${p.id}" title="Copiar o último status para hoje">↺ Repetir último</button>` : ''}
        </div>` : ''}
      </div>`;
    }).join('') : '<div class="card vazio">Nenhum processo em andamento.</div>'}
  </div>
  ${admin() && and.length ? `<div class="pd-salvar"><span id="pd-pend">Nenhuma alteração</span><button class="btn pri" id="b-rotina" disabled>Salvar rotina do dia</button></div>` : ''}
  <datalist id="dl-frases">${S.config.frases.map(f => `<option value="${h(f)}">`).join('')}</datalist>`;

  $$('[data-ir]', el).forEach(k => k.onclick = () => { S.view = 'processos'; S.aba = k.dataset.ir; render(); });
  $$('[data-rel]', el).forEach(k => k.onclick = () => { S.view = 'relatorio'; S.relAba = 'mes'; render(); });
  $$('[data-relfin]', el).forEach(k => k.onclick = () => { S.view = 'relatorio'; S.relAba = 'financeiro'; render(); });
  ligarOlho(el);
  $$('[data-proc]', el).forEach(a => a.onclick = e => { e.preventDefault(); abrirDetalhe(a.dataset.proc); });
  const bn = $('#b-novo', el); if (bn) bn.onclick = () => formProcesso();
  const bal = $('#b-alerta', el); if (bal) bal.onclick = () => escolherAlerta();

  const ins = $$('[data-rot]', el);
  const mudou = inp => inp.value.trim() && inp.value.trim() !== (inp.defaultValue || '').trim();
  const contar = () => {
    const n = ins.filter(mudou).length, b = $('#b-rotina', el); if (!b) return;
    b.disabled = !n; $('#pd-pend', el).textContent = n ? `${n} ${n === 1 ? 'atualização' : 'atualizações'} para salvar` : 'Nenhuma alteração';
    $('.pd-salvar', el).classList.toggle('tem', !!n);
    ins.forEach(i => i.closest('.pd-rt').classList.toggle('editando', !!mudou(i)));
  };
  ins.forEach((inp, i) => {
    inp.oninput = contar;
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const nx = ins[i + 1]; if (nx) nx.focus(); else $('#b-rotina', el)?.focus(); } };
  });
  $$('[data-rep]', el).forEach(b => b.onclick = () => {
    const inp = $(`[data-rot="${b.dataset.rep}"]`, el); const u = ultimoMovimento(S.processos.find(p => p.id === b.dataset.rep));
    if (inp && u) { inp.value = u.texto.replace(/^[✔✓▶⏸✕]\s*/, ''); contar(); inp.focus(); }
  });
  const br = $('#b-rotina', el); if (br) br.onclick = () => acao(async () => {
    for (const inp of ins) {
      const v = inp.value.trim(); const pid = inp.dataset.rot;
      const hojeRegs = atualDe(pid).filter(a => a.data === hoje() && a.tipo === 'registro');
      if (!v) continue;
      if (hojeRegs.length && hojeRegs.at(-1).texto === v) continue;
      if (hojeRegs.length && inp.dataset.ja) await DB.upd(T.atual, hojeRegs.at(-1).id, { texto: v });
      else await registrar(pid, v);
    }
  }, 'Rotina do dia salva');
}

// ---------------------------------------------------------------- PROCESSOS
function vProcessos(el) {
  const cont = k => S.processos.filter(p => p.situacao === k).length;
  const ORD = { parados: 'Mais tempo parados', cliente: 'Cliente (A–Z)', progresso: 'Menor progresso', recentes: 'Movimentados por último', prioridade: 'Prioridade' };
  const presetsUsados = S.presets.filter(x => S.processos.some(p => p.preset_id === x.id));
  el.innerHTML = `
  <div class="topo"><h2>Processos</h2>
    <button class="btn nao-imprimir" id="b-imp">🖨 Controle para os chefes</button>
    <button class="btn pri adm" id="b-novo">＋ Novo processo</button></div>
  <div class="tabs">${Object.entries(SITUACOES).map(([k, v]) => `<button class="tab ${S.aba === k ? 'on' : ''}" data-aba="${k}">${v.ic} ${v.nome}<span class="n">${cont(k)}</span></button>`).join('')}</div>
  <div class="filtros">
    <div class="busca-box"><input class="busca busca-proc" id="busca" type="search" placeholder="Buscar cliente, CNPJ, serviço, responsável…" value="${h(S.busca)}" aria-label="Buscar processos"></div>
    <select id="fl-ord" aria-label="Ordenar">${Object.entries(ORD).map(([k, v]) => `<option value="${k}" ${pref('ordem') === k ? 'selected' : ''}>↕ ${v}</option>`).join('')}</select>
    <select id="fl-ag" aria-label="Filtrar por com quem está"><option value="">Com quem está: todos</option>${Object.entries(AGUARDANDO).map(([k, v]) => `<option value="${k}" ${pref('filtroAg') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${presetsUsados.length > 1 ? `<select id="fl-pr" aria-label="Filtrar por serviço"><option value="">Serviço: todos</option>${presetsUsados.map(x => `<option value="${x.id}" ${pref('filtroPreset') === x.id ? 'selected' : ''}>${h(x.nome)}</option>`).join('')}</select>` : ''}
    <button class="btn ghost sm" id="fl-limpar" hidden>Limpar filtros</button>
  </div>
  <div id="lista-proc"></div>`;
  const desenhar = () => {
    const q = S.busca.toLowerCase().trim(), ag = pref('filtroAg'), pr = pref('filtroPreset'), ord = pref('ordem');
    const PRI = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
    const ultimo = p => (ultimoMovimento(p)?.data || p.atualizado_em || '');
    let lista = S.processos.filter(p => p.situacao === S.aba
      && (!q || [p.cliente, p.cnpj, p.servico, p.responsavel].join(' ').toLowerCase().includes(q))
      && (!ag || (p.aguardando || 'jopec') === ag) && (!pr || p.preset_id === pr));
    const fns = {
      parados: (a, b) => S.aba === 'andamento' ? diasParado(b) - diasParado(a) : (b.data_conclusao || b.atualizado_em || '').localeCompare(a.data_conclusao || a.atualizado_em || ''),
      cliente: (a, b) => a.cliente.localeCompare(b.cliente, 'pt-BR'),
      progresso: (a, b) => progresso(a).pct - progresso(b).pct,
      recentes: (a, b) => ultimo(b).localeCompare(ultimo(a)),
      prioridade: (a, b) => (PRI[a.prioridade] ?? 2) - (PRI[b.prioridade] ?? 2) || diasParado(b) - diasParado(a),
    };
    lista.sort(fns[ord] || fns.parados);
    const filtrando = q || ag || pr;
    $('#fl-limpar', el).hidden = !filtrando;
    $('#lista-proc', el).innerHTML = lista.length
      ? `${filtrando ? `<div class="contagem">${lista.length} de ${cont(S.aba)} ${cont(S.aba) === 1 ? 'processo' : 'processos'}</div>` : ''}<div class="grade">${lista.map(cartao).join('')}</div>`
      : `<div class="card vazio"><div class="vazio-ic">${filtrando ? '🔍' : SITUACOES[S.aba].ic}</div><b>${filtrando ? 'Nenhum processo encontrado' : `Nenhum processo ${({ andamento: 'em andamento', pausado: 'pausado', finalizado: 'finalizado', desistencia: 'com desistência', arquivado: 'arquivado' })[S.aba]}`}</b><span>${filtrando ? 'Tente outra palavra ou limpe os filtros.' : S.aba === 'andamento' && admin() ? 'Clique em “Novo processo” para colocar um cliente na esteira.' : ''}</span></div>`;
    ligarCartoes($('#lista-proc', el)); acessivel($('#lista-proc', el));
  };
  desenhar();
  $$('[data-aba]', el).forEach(b => b.onclick = () => { S.aba = b.dataset.aba; render(); });
  let tm; $('#busca', el).oninput = e => { S.busca = e.target.value; clearTimeout(tm); tm = setTimeout(desenhar, 120); };
  $('#fl-ord', el).onchange = e => { setPref('ordem', e.target.value); desenhar(); };
  $('#fl-ag', el).onchange = e => { setPref('filtroAg', e.target.value); desenhar(); };
  const fp = $('#fl-pr', el); if (fp) fp.onchange = e => { setPref('filtroPreset', e.target.value); desenhar(); };
  $('#fl-limpar', el).onclick = () => { S.busca = ''; setPref('filtroAg', ''); setPref('filtroPreset', ''); render(); };
  const bn = $('#b-novo', el); if (bn) bn.onclick = () => formProcesso();
  $('#b-imp', el).onclick = imprimirChefes;
}
function imprimirChefes() {
  const and = S.processos.filter(p => ['andamento', 'pausado'].includes(p.situacao)).sort((a, b) => a.cliente.localeCompare(b.cliente));
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Legalização em andamento</title><style>body{font-family:Segoe UI,Arial;padding:24px;color:#231a1b}h1{font-size:18px;margin:0}p{color:#5b6b80;margin:4px 0 16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #d5dbe3;padding:6px 8px;text-align:left;vertical-align:top}th{background:#a23133;color:#fff}</style></head><body>
  <h1>LEGALIZAÇÃO EM ANDAMENTO</h1><p>Atualizado em ${new Date().toLocaleDateString('pt-BR')} · ${and.length} processos</p>
  <table><tr><th>#</th><th>Nome</th><th>Tipo</th><th>Serviço</th><th>Etapa atual</th><th>Situação atual</th><th>Último movimento</th></tr>
  ${and.map((p, i) => { const pr = progresso(p), u = ultimoMovimento(p); return `<tr><td>${i + 1}</td><td>${h(p.cliente)}</td><td>${h(p.tipo_cliente)}</td><td>${h(p.servico)}</td><td>${pr.total ? `${Math.min(pr.idx, pr.total)}/${pr.total} · ${h(pr.atual?.nome || 'concluídas')}` : ''}</td><td>${h(statusAtual(p).txt)}</td><td>${u ? fmtD(u.data) : '—'}</td></tr>`; }).join('')}
  </table><script>window.print()<\/script></body></html>`);
  w.document.close();
}

// ---------------------------------------------------------------- FINANCEIRO (orçamento, pagamentos, previsões, taxas)
const FIN_TAXAS = { cliente: 'Por conta do cliente', inclusas: 'Inclusas no orçamento', reembolso: 'JOPEC paga e cobra depois', isento: 'Sem taxas / isento' };
const FIN_COND = { a_vista: 'À vista', entrada: 'Entrada + restante', parcelado: 'Parcelado', final: 'Na entrega', combinar: 'A combinar' };
const FIN_FORMAS = ['PIX', 'Boleto', 'Transferência', 'Cartão', 'Dinheiro'];
const FIN_NF = { pendente: 'A emitir', emitida: 'Emitida', na: 'Não se aplica' };
const r2 = v => Math.round((+v || 0) * 100) / 100;
const finDe = p => { const f = (p && typeof p.financeiro === 'object' && p.financeiro) || {}; return { reajustes: [], pagamentos: [], previsoes: [], ...f }; };
function calcFin(p) {
  const f = finDe(p);
  const original = f.orcamento != null && f.orcamento !== '' ? +f.orcamento : (p.honorarios != null && p.honorarios !== '' ? +p.honorarios : null);
  const ultR = f.reajustes.at(-1);
  const servico = ultR ? +ultR.para : original;
  const taxasReemb = f.taxas === 'reembolso' ? r2(f.taxas_valor) : 0;
  const tem = servico != null;
  const valor = tem ? r2(servico + taxasReemb) : null;
  const pago = r2(f.pagamentos.reduce((a, x) => a + (+x.valor || 0), 0));
  const restante = tem ? Math.max(0, r2(valor - pago)) : 0;
  // previsões = datas e valores combinados para o que AINDA falta (cada pagamento registrado abate das mais antigas)
  let atrasado = 0, proximo = null, programado = 0, teto = restante;
  [...f.previsoes].sort((a, b) => (a.data || '').localeCompare(b.data || '')).forEach(x => {
    const pend = Math.min(r2(x.valor), r2(teto)); if (pend <= 0.004) return; teto = r2(teto - pend); programado = r2(programado + pend);
    if (x.data && x.data < hoje()) atrasado = r2(atrasado + pend); else if (!proximo) proximo = { data: x.data, valor: pend };
  });
  const semData = tem ? Math.max(0, r2(restante - programado)) : 0;
  const status = !tem ? 'sem' : restante <= 0.004 ? 'quitado' : atrasado > 0 ? 'atrasado' : pago > 0 ? 'parcial' : 'aberto';
  return { f, tem, original, servico, reajustado: !!ultR && +ultR.para !== original, taxasReemb, valor, pago, restante, pct: tem && valor > 0 ? Math.min(100, Math.round(pago / valor * 100)) : 0, atrasado, proximo, semData, status };
}
const FIN_ST = { sem: ['Sem orçamento', ''], aberto: ['A receber', ''], parcial: ['Pago em parte', 'amarelo'], quitado: ['Quitado', 'verde'], atrasado: ['Pagamento atrasado', 'vermelho'] };
function chipFin(p) {
  const c = calcFin(p); if (!c.tem) return '';
  const [nm, cor] = FIN_ST[c.status];
  return `<span class="chip ${cor}" title="Financeiro">💰 ${nm}${c.status !== 'quitado' ? ' · falta ' + moeda(c.restante) : ''}</span>`;
}
function blocoFin(p) {
  const c = calcFin(p), f = c.f, [nm, cor] = FIN_ST[c.status];
  const hist = [...f.pagamentos.map(x => ({ ...x, t: 'pag' })), ...f.reajustes.map(x => ({ ...x, t: 'rea' }))].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const prevAbertas = [...f.previsoes].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  return `<div class="card fin" style="padding:14px;margin-top:12px">
    <div class="fin-cab"><h4>💰 Financeiro</h4><span class="chip ${cor}">${nm}</span></div>
    ${!c.tem ? `<p class="fin-vazio">Orçamento ainda não informado.</p>` : `
    <div class="fin-valor">${moeda(c.valor)}${botaoOlho()}</div>
    <div class="fin-sub">${c.reajustado ? `Reajustado · original ${moeda(c.original)}` : 'Valor do orçamento'}${c.taxasReemb ? ` · inclui ${moeda(c.taxasReemb)} de taxas a reembolsar` : ''}</div>
    <div class="fin-bl"><div class="barra fin-barra"><div style="width:${c.pct}%"></div></div><span>${c.pct}% recebido</span></div>
    <div class="fin-linhas"><div><small>Pago</small><b class="ok">${moeda(c.pago)}</b></div><div><small>Falta receber</small><b class="${c.restante > 0 ? 'falta' : 'ok'}">${moeda(c.restante)}</b></div></div>
    ${c.atrasado > 0 ? `<div class="aviso vermelho fin-av">⚠ ${moeda(c.atrasado)} vencido e não pago</div>` : ''}
    ${c.proximo ? `<div class="fin-prox">Próximo: <b>${moeda(c.proximo.valor)}</b> em <b>${fmtD(c.proximo.data)}</b></div>` : ''}
    ${c.semData > 0 ? `<div class="aviso amarelo fin-av">${moeda(c.semData)} ainda sem data prevista de pagamento</div>` : ''}`}
    <dl class="fin-dl">
      <dt>Taxas</dt><dd>${f.taxas ? h(FIN_TAXAS[f.taxas]) : '—'}${f.taxas_valor ? ` <small>(${f.taxas === 'cliente' ? 'estimado ' : ''}${moeda(f.taxas_valor)})</small>` : ''}</dd>
      ${f.condicao ? `<dt>Condição</dt><dd>${h(FIN_COND[f.condicao] || f.condicao)}</dd>` : ''}
      ${f.forma ? `<dt>Forma</dt><dd>${h(f.forma)}</dd>` : ''}
      ${f.nf ? `<dt>Nota fiscal</dt><dd>${h(FIN_NF[f.nf] || f.nf)}${f.nf_numero ? ' nº ' + h(f.nf_numero) : ''}</dd>` : ''}
    </dl>
    ${f.obs ? `<div class="fin-obs">${h(f.obs)}</div>` : ''}
    ${prevAbertas.length ? `<details class="fin-det"><summary>Previsões de pagamento (${prevAbertas.length})</summary>${prevAbertas.map(x => `<div class="fin-it"><span>${fmtD(x.data)}</span><b>${moeda(x.valor)}</b></div>`).join('')}</details>` : ''}
    ${hist.length ? `<details class="fin-det" open><summary>Histórico (${hist.length})</summary>${hist.map(x => x.t === 'pag'
      ? `<div class="fin-it"><span>${fmtD(x.data)} · recebido${x.forma ? ' via ' + h(x.forma) : ''}${x.obs ? ` <small>${h(x.obs)}</small>` : ''}</span><b class="ok">+${moeda(x.valor)}</b>${admin() ? `<button class="fin-x adm" data-delpag="${x.id}" aria-label="Apagar pagamento" title="Apagar">×</button>` : ''}</div>`
      : `<div class="fin-it"><span>${fmtD(x.data)} · reajuste${x.motivo ? ` <small>${h(x.motivo)}</small>` : ''}</span><b>${moeda(x.de)} → ${moeda(x.para)}</b></div>`).join('')}</details>` : ''}
    <div class="fin-bts adm">${c.tem && c.restante > 0 ? `<button class="btn ok sm" id="fin-pag">＋ Registrar pagamento</button>` : ''}${c.tem ? `<button class="btn sm" id="fin-rea">↕ Reajustar valor</button>` : ''}<button class="btn sm ${c.tem ? '' : 'pri'}" id="fin-ed">${c.tem ? '✎ Editar' : '＋ Informar orçamento'}</button></div>
  </div>`;
}
async function salvarFin(p, f, msg) {
  const servico = f.reajustes.length ? +f.reajustes.at(-1).para : (f.orcamento != null && f.orcamento !== '' ? +f.orcamento : null);
  const ok = await acao(() => DB.upd(T.processos, p.id, { financeiro: f, honorarios: servico, atualizado_em: new Date().toISOString() }), msg);
  if (ok) abrirDetalhe(p.id);
}
const numBR = v => { const t = String(v ?? '').trim().replace(/\s|R\$/g, ''); if (!t) return null; const n = +(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return isFinite(n) ? r2(n) : NaN; };
const campoValor = (id, v, extra = '') => `<input id="${id}" inputmode="decimal" placeholder="0,00" value="${v != null && v !== '' ? String(r2(v)).replace('.', ',') : ''}" ${extra}>`;
function formPagamento(p) {
  const c = calcFin(p), sug = c.atrasado > 0 ? c.atrasado : c.proximo ? c.proximo.valor : c.restante;
  modal(`<div class="cab"><h3>＋ Pagamento — ${h(p.cliente)}</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo"><div class="fin-resumo"><span>Valor <b>${moedaReal(c.valor)}</b></span><span>Pago <b>${moedaReal(c.pago)}</b></span><span>Falta <b>${moedaReal(c.restante)}</b></span></div>
  <div class="form">
    <div class="campo c2"><label>Valor recebido (R$)</label>${campoValor('pg-v', sug)}<button type="button" class="link-btn" id="pg-tudo">Quitar tudo (${moedaReal(c.restante)})</button></div>
    <div class="campo c2"><label>Data</label><input type="date" id="pg-d" value="${hoje()}"></div>
    <div class="campo c2"><label>Forma</label><select id="pg-f"><option value="">—</option>${FIN_FORMAS.map(x => `<option ${x === c.f.forma ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="campo c6"><label>Observação (opcional)</label><input id="pg-o" placeholder="Ex.: entrada de 50%"></div>
  </div><div class="fin-calc" id="pg-calc"></div></div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn ok" id="pg-ok">Registrar pagamento</button></div>`, '', 2);
  const calc = () => { const v = numBR($('#pg-v').value); $('#pg-calc').innerHTML = v > 0 ? (v - c.restante > 0.004 ? `<span class="falta">⚠ Valor maior que o que falta (${moedaReal(c.restante)}).</span>` : `Depois deste pagamento falta <b>${moedaReal(Math.max(0, c.restante - v))}</b>${c.restante - v <= 0.004 ? ' — <b class="ok">quitado ✔</b>' : ''}.`) : ''; };
  $('#pg-v').oninput = calc; calc();
  $('#pg-tudo').onclick = () => { $('#pg-v').value = String(c.restante).replace('.', ','); calc(); };
  $('#pg-ok').onclick = async () => {
    const v = numBR($('#pg-v').value); if (!(v > 0)) { $('#pg-v').focus(); return toast('Informe o valor recebido', 'erro'); }
    if (v - c.restante > 0.004 && !(await confirmar(`O valor é maior do que falta receber (${moedaReal(c.restante)}). Registrar mesmo assim?`))) return;
    const f = finDe(p); f.pagamentos = [...f.pagamentos, { id: uid(), data: $('#pg-d').value || hoje(), valor: v, forma: $('#pg-f').value || null, obs: $('#pg-o').value.trim() || null }];
    let resta = v; f.previsoes = [...f.previsoes].sort((a, b) => (a.data || '').localeCompare(b.data || '')).map(x => { const usa = Math.min(r2(x.valor), resta); resta = r2(resta - usa); return { ...x, valor: r2(x.valor - usa) }; }).filter(x => x.valor > 0.004);
    fecharModal(2); salvarFin(p, f, 'Pagamento registrado');
  };
}
function formReajuste(p) {
  const c = calcFin(p);
  modal(`<div class="cab"><h3>↕ Reajustar valor — ${h(p.cliente)}</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo"><div class="fin-resumo"><span>Valor atual do serviço <b>${moedaReal(c.servico)}</b></span><span>Já pago <b>${moedaReal(c.pago)}</b></span></div>
  <div class="form">
    <div class="campo c2"><label>Novo valor do serviço (R$)</label>${campoValor('rj-v', c.servico)}</div>
    <div class="campo c2"><label>Data do reajuste</label><input type="date" id="rj-d" value="${hoje()}"></div>
    <div class="campo c2"><label>Diferença</label><input id="rj-dif" readonly tabindex="-1"></div>
    <div class="campo c6"><label>Motivo</label><input id="rj-m" placeholder="Ex.: inclusão de mais uma atividade"></div>
    ${c.f.previsoes.length ? `<div class="campo c6"><label class="chk"><input type="checkbox" id="rj-prev" checked> Ajustar a última previsão de pagamento com a diferença</label></div>` : ''}
  </div><div class="fin-calc" id="rj-calc"></div></div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="rj-ok">Salvar reajuste</button></div>`, '', 2);
  const calc = () => { const v = numBR($('#rj-v').value); if (!(v >= 0)) { $('#rj-dif').value = ''; $('#rj-calc').innerHTML = ''; return; } const d = r2(v - c.servico); $('#rj-dif').value = (d > 0 ? '+' : '') + moedaReal(d); $('#rj-calc').innerHTML = `Novo total a receber: <b>${moedaReal(v + c.taxasReemb)}</b> · falta <b>${moedaReal(Math.max(0, v + c.taxasReemb - c.pago))}</b>`; };
  $('#rj-v').oninput = calc; calc(); setTimeout(() => $('#rj-v').select(), 50);
  $('#rj-ok').onclick = () => {
    const v = numBR($('#rj-v').value); if (!(v >= 0)) { $('#rj-v').focus(); return toast('Informe o novo valor', 'erro'); }
    const d = r2(v - c.servico); if (Math.abs(d) < 0.005) return toast('O valor é o mesmo de antes', 'erro');
    const f = finDe(p); f.reajustes = [...f.reajustes, { data: $('#rj-d').value || hoje(), de: c.servico, para: v, motivo: $('#rj-m').value.trim() || null }];
    const cx = $('#rj-prev'); if (cx && cx.checked && f.previsoes.length) { const ps = [...f.previsoes].sort((a, b) => (a.data || '').localeCompare(b.data || '')); const u = ps.at(-1); u.valor = Math.max(0, r2(+u.valor + d)); f.previsoes = ps.filter(x => x.valor > 0); }
    fecharModal(2); salvarFin(p, f, 'Valor reajustado');
  };
}
// editor de previsões (usado no detalhe e no cadastro)
function edPrevisoes(box, lista, totalFn) {
  const desenha = () => {
    const falta = totalFn(), prog = r2(lista.reduce((a, x) => a + (+x.valor || 0), 0)), dif = r2(falta - prog);
    box.innerHTML = `${lista.map((x, i) => `<div class="prev-l"><input type="date" data-pd="${i}" value="${h(x.data || '')}"><input inputmode="decimal" data-pv="${i}" placeholder="0,00" value="${x.valor ? String(x.valor).replace('.', ',') : ''}"><button type="button" class="btn sm ghost" data-px="${i}" aria-label="Tirar previsão">✕</button></div>`).join('') || '<div class="fin-vazio">Nenhuma previsão. Use os botões abaixo.</div>'}
      <div class="prev-bar"><button type="button" class="btn sm" id="pv-add">＋ Data de pagamento</button><span class="prev-div">Dividir o restante em <select id="pv-n">${[1, 2, 3, 4, 5, 6, 10, 12].map(n => `<option>${n}</option>`).join('')}</select>× mensais a partir de <input type="date" id="pv-ini" value="${h(lista[0]?.data || hoje())}"> <button type="button" class="btn sm" id="pv-div">Dividir</button></span></div>
      <div class="fin-calc">${falta > 0 ? `Falta receber <b>${moedaReal(falta)}</b> · programado <b>${moedaReal(prog)}</b>${Math.abs(dif) > 0.004 ? ` · <span class="${dif > 0 ? 'falta' : 'falta'}">${dif > 0 ? moedaReal(dif) + ' sem data' : moedaReal(-dif) + ' a mais que o restante'}</span>` : ' · <b class="ok">tudo programado ✔</b>'}` : 'Nada a receber.'}</div>`;
    $$('[data-pd]', box).forEach(i => i.onchange = () => { lista[+i.dataset.pd].data = i.value; });
    $$('[data-pv]', box).forEach(i => i.onchange = () => { lista[+i.dataset.pv].valor = numBR(i.value) || 0; desenha(); });
    $$('[data-px]', box).forEach(b => b.onclick = () => { lista.splice(+b.dataset.px, 1); desenha(); });
    $('#pv-add', box).onclick = () => { const prog2 = lista.reduce((a, x) => a + (+x.valor || 0), 0); lista.push({ id: uid(), data: '', valor: Math.max(0, r2(totalFn() - prog2)) }); desenha(); $$('[data-pd]', box).at(-1)?.focus(); };
    $('#pv-div', box).onclick = () => {
      const n = +$('#pv-n', box).value, ini = $('#pv-ini', box).value || hoje(), tot = totalFn(); if (!(tot > 0)) return toast('Não há valor a receber', 'erro');
      const parc = Math.floor(tot / n * 100) / 100; lista.length = 0;
      for (let i = 0; i < n; i++) { const d = parseD(ini); d.setMonth(d.getMonth() + i); lista.push({ id: uid(), data: isoLocal(d), valor: i === n - 1 ? r2(tot - parc * (n - 1)) : parc }); }
      desenha();
    };
  };
  desenha();
}
function formFinanceiro(p) {
  const c = calcFin(p), f = finDe(p), prev = f.previsoes.map(x => ({ ...x }));
  const optS = (o, v) => `<option value="">—</option>` + Object.entries(o).map(([k, n]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${n}</option>`).join('');
  modal(`<div class="cab"><h3>💰 Financeiro — ${h(p.cliente)}</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo"><div class="form">
    <div class="campo c2"><label>Valor do orçamento (R$)</label>${campoValor('fn-orc', c.reajustado ? c.original : c.servico, c.f.reajustes.length ? 'readonly title="Para mudar, use Reajustar valor"' : '')}${c.f.reajustes.length ? `<span class="ajuda">Reajustado para ${moedaReal(c.servico)}. Use “Reajustar valor”.</span>` : ''}</div>
    <div class="campo c2"><label>Data do orçamento</label><input type="date" id="fn-od" value="${h(f.orcamento_data || p.data_inicio || '')}"></div>
    <div class="campo c2"><label>Condição de pagamento</label><select id="fn-cond">${optS(FIN_COND, f.condicao)}</select></div>
    <div class="campo c2"><label>Taxas e emolumentos</label><select id="fn-tax">${optS(FIN_TAXAS, f.taxas)}</select></div>
    <div class="campo c2"><label id="fn-taxl">Valor das taxas (R$)</label>${campoValor('fn-taxv', f.taxas_valor)}<span class="ajuda" id="fn-taxa"></span></div>
    <div class="campo c2"><label>Forma de pagamento</label><select id="fn-forma"><option value="">—</option>${FIN_FORMAS.map(x => `<option ${x === f.forma ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="campo c2"><label>Nota fiscal</label><select id="fn-nf">${optS(FIN_NF, f.nf)}</select></div>
    <div class="campo c2"><label>Nº da nota</label><input id="fn-nfn" value="${h(f.nf_numero || '')}"></div>
    <div class="campo c2"></div>
    <div class="campo c6"><label>Previsão de pagamento do restante</label><div id="fn-prev" class="prev-box"></div></div>
    <div class="campo c6"><label>Observações financeiras</label><textarea id="fn-obs" placeholder="Ex.: cliente pediu para pagar o restante após o registro na JUCERJA">${h(f.obs || '')}</textarea></div>
  </div></div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="fn-ok">Salvar financeiro</button></div>`, 'lg', 2);
  const total = () => { const o = c.f.reajustes.length ? c.servico : (numBR($('#fn-orc').value) || 0); const t = $('#fn-tax').value === 'reembolso' ? (numBR($('#fn-taxv').value) || 0) : 0; return Math.max(0, r2(o + t - c.pago)); };
  const taxaInfo = () => { const t = $('#fn-tax').value; $('#fn-taxa').textContent = ({ cliente: 'Estimativa — o cliente paga direto as guias.', inclusas: 'Já estão dentro do valor do orçamento.', reembolso: 'Somado ao total a receber do cliente.', isento: '' })[t] || ''; $('#fn-taxl').textContent = t === 'cliente' ? 'Taxas estimadas (R$)' : 'Valor das taxas (R$)'; ed(); };
  const ed = () => edPrevisoes($('#fn-prev'), prev, total);
  ['fn-orc', 'fn-taxv'].forEach(id => $('#' + id).addEventListener('change', ed)); $('#fn-tax').onchange = taxaInfo; taxaInfo();
  $('#fn-ok').onclick = () => {
    const orc = numBR($('#fn-orc').value), tv = numBR($('#fn-taxv').value);
    if (Number.isNaN(orc) || Number.isNaN(tv)) return toast('Confira os valores digitados', 'erro');
    const g = finDe(p);
    Object.assign(g, { orcamento: c.f.reajustes.length ? g.orcamento ?? c.original : orc, orcamento_data: $('#fn-od').value || null, condicao: $('#fn-cond').value || null, taxas: $('#fn-tax').value || null, taxas_valor: tv,
      forma: $('#fn-forma').value || null, nf: $('#fn-nf').value || null, nf_numero: $('#fn-nfn').value.trim() || null, obs: $('#fn-obs').value.trim() || null,
      previsoes: prev.filter(x => x.data && +x.valor > 0).map(x => ({ id: x.id || uid(), data: x.data, valor: r2(x.valor) })) });
    fecharModal(2); salvarFin(p, g, 'Financeiro salvo');
  };
}
function ligarFin(p, m) {
  ligarOlho(m);
  if (!admin()) return;
  const a = $('#fin-pag', m); if (a) a.onclick = () => formPagamento(p);
  const b = $('#fin-rea', m); if (b) b.onclick = () => formReajuste(p);
  const e = $('#fin-ed', m); if (e) e.onclick = () => formFinanceiro(p);
  $$('[data-delpag]', m).forEach(x => x.onclick = async () => {
    const f = finDe(p), pg = f.pagamentos.find(y => y.id === x.dataset.delpag);
    if (!(await confirmar(`Apagar o pagamento de ${moedaReal(pg.valor)} de ${fmtD(pg.data)}?`))) return;
    f.pagamentos = f.pagamentos.filter(y => y.id !== pg.id); salvarFin(p, f, 'Pagamento apagado');
  });
}
const finTotais = lista => lista.reduce((t, p) => { const c = calcFin(p); if (!c.tem) return t; t.valor += c.valor; t.pago += c.pago; t.falta += c.restante; t.atraso += c.atrasado; if (c.atrasado > 0) t.nAtraso++; if (c.restante > 0) t.nAberto++; return t; }, { valor: 0, pago: 0, falta: 0, atraso: 0, nAtraso: 0, nAberto: 0 });
const finAtivos = () => S.processos.filter(p => !['desistencia'].includes(p.situacao));

// ---------------------------------------------------------------- DETALHE
function abrirDetalhe(id, mostrarTudo = false) {
  const p = S.processos.find(x => x.id === id); if (!p) return;
  const es = etapasDe(id), pr = progresso(p), dr = diario(p), sit = SITUACOES[p.situacao];
  const dias = mostrarTudo ? dr.dias : dr.dias.slice(0, dr.limite);
  modal(`
  <div class="cab"><div style="flex:1"><h3>${h(p.cliente)}</h3><div class="sub">${h(p.servico || presetDe(p)?.nome || '')} · <span class="chip ${sit.cor}">${sit.ic} ${sit.nome.replace(/s$/, '')}</span></div></div><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo">
    ${p.situacao === 'pausado' ? `<div class="aviso amarelo">⏸ Pausado${p.pausa_motivo ? ': ' + h(p.pausa_motivo) : ''}${p.retomar_em ? ` · retomar em ${fmtD(p.retomar_em)}` : ''}</div>` : ''}
    ${p.situacao === 'desistencia' ? `<div class="aviso vermelho">✕ Desistência${p.desistencia_motivo ? ': ' + h(p.desistencia_motivo) : ''}</div>` : ''}
    <div class="secao" style="margin-top:0"><h3>Esteira</h3><span class="dica">${pr.ok}/${pr.total} etapas concluídas${admin() ? ' · clique numa etapa para mudar o status' : ''}</span></div>
    ${es.length ? `<div class="esteira">${es.map((e, i) => `<div class="passo ${e.status} ${admin() ? 'clic' : ''}" data-et="${e.id}" title="${h(e.descricao || '')}${e.prazo ? ' · ' + h(e.prazo) : ''}"><div class="bola">${e.status === 'concluida' ? '✓' : i + 1}</div><div class="nm">${h(e.nome)}</div><div class="dt">${e.status === 'concluida' ? fmtD(e.concluida_em) : e.status === 'andamento' ? 'em andamento' : (e.prazo || '')}</div></div>`).join('')}</div>` : '<div class="vazio">Sem etapas. Edite o processo para montar a esteira.</div>'}
    <div class="detalhe-grid" style="margin-top:12px">
      <div>
        <div class="secao" style="margin-top:6px"><h3>Diário</h3><span class="dica">Modo: ${modoDe(p) === 'repetir' ? 'repete o último status' : 'sem movimentação'}${p.modo_diario === 'padrao' ? ' (padrão)' : ''}</span></div>
        ${admin() && ['andamento', 'pausado'].includes(p.situacao) ? `
        <div class="card" style="padding:12px;margin-bottom:10px">
          <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="n-txt" class="busca" style="max-width:none;flex:3 1 220px" placeholder="O que aconteceu? (ex.: DBE feito)" list="dl-frases2"><input type="date" id="n-data" class="busca" style="flex:0 0 150px;min-width:0" value="${hoje()}"><button class="btn pri" id="b-reg">Registrar</button></div>
          ${frasesHTML('n-txt')}
          <datalist id="dl-frases2">${S.config.frases.map(f => `<option value="${h(f)}">`).join('')}</datalist></div>` : ''}
        <div class="diario">${dias.map(d => d.auto
          ? `<div class="dia auto ${d.data === hoje() ? 'hoje' : ''}"><div class="d"><b>${fmtD(d.data).slice(0, 5)}</b>${DS[parseD(d.data).getDay()]}</div><div class="t">${h(d.txt)}${d.rep ? ' <span class="chip">mantido</span>' : ''}</div></div>`
          : `<div class="dia ${d.data === hoje() ? 'hoje' : ''}"><div class="d"><b>${fmtD(d.data).slice(0, 5)}</b>${DS[parseD(d.data).getDay()]}</div><div class="t">${d.regs.map(r => `<div class="reg">${r.tipo !== 'registro' ? `<span class="chip ${({ etapa: 'verde', pausa: 'amarelo', desistencia: 'vermelho', finalizado: 'verde', retomada: 'azul' })[r.tipo] || ''}">${h(r.tipo)}</span> ` : ''}${h(r.texto)} ${admin() ? `<button class="btn sm ghost adm" data-delreg="${r.id}" title="Apagar registro">🗑</button>` : ''}</div>`).join('')}</div></div>`).join('')}
          ${!mostrarTudo && dr.total > dr.limite ? `<button class="btn sm" id="b-tudo" style="margin:10px auto">Ver os ${dr.total} dias</button>` : ''}</div>
      </div>
      <div class="info">
        <div class="card" style="padding:14px"><dl>
          <dt>Tipo</dt><dd>${h(p.tipo_cliente || '—')}</dd>
          <dt>CNPJ/CPF</dt><dd>${h(p.cnpj || '—')}</dd>
          <dt>Preset</dt><dd>${h(presetDe(p)?.nome || '—')}</dd>
          <dt>Solicitado por</dt><dd>${h(p.responsavel || '—')}</dd>
          <dt>Contato</dt><dd>${h(p.contato || '—')}</dd>
          <dt>Com quem</dt><dd>${h(AGUARDANDO[p.aguardando] || '—')}</dd>
          <dt>Início</dt><dd>${fmtD(p.data_inicio)}</dd>
          <dt>Previsão</dt><dd>${fmtD(p.previsao)}</dd>
          ${p.data_conclusao ? `<dt>Conclusão</dt><dd>${fmtD(p.data_conclusao)}</dd>` : ''}
          <dt>Gratificação</dt><dd>${p.gratificacao != null && p.gratificacao !== '' ? moeda(p.gratificacao) : '—'}</dd>
          <dt>Parado há</dt><dd>${diasParado(p)} dia(s)</dd>
        </dl>${p.observacoes ? `<div style="margin-top:10px;font-size:13px;white-space:pre-wrap;background:var(--bg);padding:8px 10px;border-radius:8px">${h(p.observacoes)}</div>` : ''}</div>
        ${blocoFin(p)}
      </div>
    </div>
  </div>
  <div class="rod adm">
    <button class="btn dang" id="b-excluir" style="margin-right:auto">Excluir</button>
    ${p.situacao === 'andamento' ? `<button class="btn warn" id="b-pausar">⏸ Pausar</button><button class="btn dang" id="b-desist">✕ Desistência</button><button class="btn ok" id="b-final">✔ Finalizar</button>` : ''}
    ${['pausado', 'desistencia', 'arquivado', 'finalizado'].includes(p.situacao) ? `<button class="btn" id="b-reativar">▶ ${p.situacao === 'pausado' ? 'Retomar' : 'Reativar'}</button>` : ''}
    ${['finalizado', 'desistencia'].includes(p.situacao) ? `<button class="btn" id="b-arq">🗄 Arquivar</button>` : ''}
    <button class="btn" id="b-email">✉ Enviar alerta</button>
    <button class="btn pri" id="b-editar">✎ Editar</button>
  </div>`, 'lg');
  const m = $('#modal-root');
  const bt = $('#b-tudo', m); if (bt) bt.onclick = () => abrirDetalhe(id, true);
  ligarFin(p, m);
  if (!admin()) return;
  ligarFrases('n-txt');
  const br = $('#b-reg', m); if (br) br.onclick = async () => { const t = $('#n-txt').value.trim(); if (!t) return $('#n-txt').focus(); if (await acao(() => registrar(id, t, { data: $('#n-data').value || hoje() }), 'Registrado')) abrirDetalhe(id); };
  const nt = $('#n-txt', m); if (nt) nt.onkeydown = e => { if (e.key === 'Enter') br.click(); };
  $$('[data-delreg]', m).forEach(b => b.onclick = async () => { if (await confirmar('Apagar este registro do diário?') && await acao(() => DB.del(T.atual, 'id', b.dataset.delreg), 'Registro apagado')) abrirDetalhe(id); });
  $$('[data-et]', m).forEach(pa => pa.onclick = ev => menuEtapa(ev, p, es.find(e => e.id === pa.dataset.et)));
  $('#b-editar', m).onclick = () => formProcesso(p);
  $('#b-email', m).onclick = () => formAlerta([p], `Atualização: ${p.cliente}`);
  $('#b-excluir', m).onclick = async () => { if (await confirmar(`Excluir definitivamente o processo de ${p.cliente}? (Para tirar da lista sem apagar, use Arquivar.)`) && await acao(() => DB.del(T.processos, 'id', id), 'Processo excluído')) fecharModal(); };
  const bp = $('#b-pausar', m); if (bp) bp.onclick = () => formPausa(p);
  const bd = $('#b-desist', m); if (bd) bd.onclick = () => formDesistencia(p);
  const bf = $('#b-final', m); if (bf) bf.onclick = () => formFinalizar(p);
  const bre = $('#b-reativar', m); if (bre) bre.onclick = async () => { if (await acao(async () => { await DB.upd(T.processos, id, { situacao: 'andamento', retomar_em: null, data_conclusao: p.situacao === 'pausado' ? p.data_conclusao : null }); await registrar(id, p.situacao === 'pausado' ? '▶ Processo retomado' : '▶ Processo reativado', { tipo: 'retomada' }); }, 'Processo em andamento')) abrirDetalhe(id); };
  const ba = $('#b-arq', m); if (ba) ba.onclick = async () => { if (await acao(() => DB.upd(T.processos, id, { situacao: 'arquivado' }), 'Arquivado')) abrirDetalhe(id); };
}
function menuEtapa(ev, p, e) {
  ev.stopPropagation(); document.querySelectorAll('.menu-pop').forEach(x => x.remove());
  const mp = document.createElement('div'); mp.className = 'menu-pop';
  mp.innerHTML = `<div style="padding:6px 10px;font-weight:600;font-size:13px">${h(e.nome)}</div>` + Object.entries(ST_ETAPA).filter(([k]) => k !== e.status).map(([k, v]) => `<button data-s="${k}">${({ concluida: '✓', andamento: '▶', pendente: '○', dispensada: '⊘' })[k]} Marcar como ${v.toLowerCase()}</button>`).join('');
  document.body.appendChild(mp);
  const r = ev.currentTarget.getBoundingClientRect(); mp.style.left = Math.min(r.left, innerWidth - 230) + 'px'; mp.style.top = (r.bottom + 4) + 'px';
  setTimeout(() => document.addEventListener('click', function f() { mp.remove(); document.removeEventListener('click', f); }), 0);
  $$('button', mp).forEach(b => b.onclick = async () => {
    const s = b.dataset.s; mp.remove();
    const ok = await acao(async () => {
      await DB.upd(T.etapas, e.id, { status: s, concluida_em: s === 'concluida' ? hoje() : null });
      if (s === 'concluida') {
        await registrar(p.id, `✔ Etapa concluída: ${e.nome}`, { tipo: 'etapa', etapa_nome: e.nome });
        if (S.config.avancar_etapa) {
          const prox = etapasDe(p.id).find(x => x.ordem > e.ordem && x.status === 'pendente');
          if (prox && !etapasDe(p.id).some(x => x.status === 'andamento' && x.id !== e.id)) await DB.upd(T.etapas, prox.id, { status: 'andamento' });
        }
      } else if (s === 'andamento') await registrar(p.id, `▶ Iniciada a etapa: ${e.nome}`, { tipo: 'etapa', etapa_nome: e.nome });
    }, 'Etapa atualizada');
    if (!ok) return;
    const pr = progresso(S.processos.find(x => x.id === p.id));
    if (pr.total && pr.ok === pr.total && p.situacao === 'andamento') { abrirDetalhe(p.id); if (await confirmar('Todas as etapas foram concluídas. Finalizar o processo agora?')) formFinalizar(p); }
    else abrirDetalhe(p.id);
  });
}
function formPausa(p) {
  modal(`<div class="cab"><h3>⏸ Pausar — ${h(p.cliente)}</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo"><div class="form">
    <div class="campo c6"><label>Motivo da pausa</label><input id="pm" placeholder="Ex.: Cris pediu para pausar; cliente viajando…"></div>
    <div class="campo"><label>Retomar em (lembrete, opcional)</label><input type="date" id="pr"></div>
  </div><p class="dica" style="color:var(--sub);font-size:12.5px">Enquanto estiver pausado, o diário mostra "Processo pausado" e ele sai da rotina do dia e dos alertas.</p></div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn warn" id="ok">Pausar processo</button></div>`);
  $('#ok').onclick = async () => { const mo = $('#pm').value.trim(), re = $('#pr').value || null;
    if (await acao(async () => { await DB.upd(T.processos, p.id, { situacao: 'pausado', pausa_motivo: mo || null, retomar_em: re }); await registrar(p.id, '⏸ Processo pausado' + (mo ? ': ' + mo : '') + (re ? ` (retomar em ${fmtD(re)})` : ''), { tipo: 'pausa' }); }, 'Processo pausado')) abrirDetalhe(p.id); };
}
function formDesistencia(p) {
  modal(`<div class="cab"><h3>✕ Desistência — ${h(p.cliente)}</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo"><div class="form"><div class="campo c6"><label>Motivo</label><input id="dm" placeholder="Ex.: cliente desistiu após o orçamento; CPL indeferida…"></div>
  <div class="campo"><label>Data</label><input type="date" id="dd" value="${hoje()}"></div></div></div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn dang" id="ok">Registrar desistência</button></div>`);
  $('#ok').onclick = async () => { const mo = $('#dm').value.trim(), d = $('#dd').value || hoje();
    if (await acao(async () => { await DB.upd(T.processos, p.id, { situacao: 'desistencia', desistencia_motivo: mo || null, data_conclusao: d }); await registrar(p.id, '✕ Desistência' + (mo ? ': ' + mo : ''), { tipo: 'desistencia', data: d }); }, 'Desistência registrada')) abrirDetalhe(p.id); };
}
function formFinalizar(p) {
  modal(`<div class="cab"><h3>✔ Finalizar — ${h(p.cliente)}</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo">${(() => { const c = calcFin(p); return c.tem && c.restante > 0 ? `<div class="aviso amarelo">💰 Ainda falta receber <b>${moedaReal(c.restante)}</b> deste cliente${c.proximo ? ` (próximo previsto para ${fmtD(c.proximo.data)})` : ''}. O financeiro continua aberto depois de finalizar.</div>` : ''; })()}<div class="form">
    <div class="campo c2"><label>Data de conclusão</label><input type="date" id="fd" value="${hoje()}"></div>
    <div class="campo c2"><label>Gratificação (R$)</label><input type="number" step="0.01" id="fg" value="${p.gratificacao ?? ''}"></div>
    <div class="campo c2"><label>Marcar etapas restantes</label><select id="fe"><option value="concluida">como concluídas</option><option value="dispensada">como dispensadas</option><option value="">não mexer</option></select></div>
    <div class="campo c6"><label>Observação final (opcional)</label><input id="fo" placeholder="Ex.: documentos enviados ao cliente por e-mail"></div>
  </div></div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn ok" id="ok">Finalizar processo</button></div>`);
  $('#ok').onclick = async () => { const d = $('#fd').value || hoje(), g = $('#fg').value, fe = $('#fe').value, o = $('#fo').value.trim();
    if (await acao(async () => {
      if (fe) for (const e of etapasDe(p.id).filter(x => x.status === 'pendente' || x.status === 'andamento')) await DB.upd(T.etapas, e.id, { status: fe, concluida_em: fe === 'concluida' ? d : null });
      await DB.upd(T.processos, p.id, { situacao: 'finalizado', data_conclusao: d, gratificacao: g === '' ? null : +g });
      await registrar(p.id, '✔ Processo finalizado' + (o ? ': ' + o : ''), { tipo: 'finalizado', data: d });
    }, 'Processo finalizado')) abrirDetalhe(p.id); };
}


// ---------------------------------------------------------------- comparação de esteiras (evita presets duplicados)
const normEt = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const assinatura = etapas => (etapas || []).filter(e => (e.nome || '').trim()).map(e => normEt(e.nome)).join(' | ');
const presetIgual = (etapas, ignorarId = null) => { const a = assinatura(etapas); return a ? S.presets.find(x => x.id !== ignorarId && assinatura(x.etapas) === a) : null; };
function diffEtapas(base, nova) {
  const b = (base || []).map(e => normEt(e.nome)), n = nova.map(e => normEt(e.nome));
  const add = nova.filter(e => !b.includes(normEt(e.nome))).map(e => e.nome);
  const rem = (base || []).filter(e => !n.includes(normEt(e.nome))).map(e => e.nome);
  const ordem = !add.length && !rem.length && b.join('|') !== n.join('|');
  return { add, rem, ordem };
}
// Pergunta se a esteira modificada vira um preset novo. Resolve {acao:'novo', id} | {acao:'usar', id} | {acao:'nao'}
function perguntarNovoPreset(lista, base, { forcar = false, cliente = '' } = {}) {
  return new Promise(resolve => {
    const igual = presetIgual(lista);
    const d = base ? diffEtapas(base.etapas, lista) : null;
    modal(`<div class="cab"><div style="flex:1"><h3>${forcar ? '💾 Salvar esteira como preset' : '✨ Esta esteira ficou diferente do preset'}</h3>
      <div class="sub">${base ? `Preset escolhido: <b>${h(base.nome)}</b> — ele não será alterado.` : 'Nenhum preset escolhido.'}</div></div><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
    <div class="corpo">
      ${d ? `<div class="aviso azul">${[d.add.length ? `➕ Adicionadas: ${d.add.map(h).join(', ')}` : '', d.rem.length ? `➖ Removidas: ${d.rem.map(h).join(', ')}` : '', d.ordem ? '↕ Ordem das etapas mudou' : ''].filter(Boolean).join('<br>') || 'Nomes ou prazos alterados.'}</div>` : ''}
      ${igual ? `<div class="aviso amarelo">Essa esteira é <b>igual</b> ao preset <b>${h(igual.nome)}</b> (mesmas etapas, mesma ordem). Para não duplicar, use esse preset.</div>` : `
      <div class="form"><div class="campo c6"><label>Nome do novo preset</label><input id="np-nome" placeholder="Ex.: Alteração Contratual RCPJ - Sócio" value="${h(base ? base.nome + ' (variação)' : '')}"></div></div>
      <ol style="font-size:13px;color:var(--sub2);margin:12px 0 0">${lista.map(e => `<li>${h(e.nome)}${e.prazo ? ` <small style="color:var(--sub)">· ${h(e.prazo)}</small>` : ''}</li>`).join('')}</ol>`}
    </div>
    <div class="rod">
      <button class="btn" id="np-nao">${forcar ? 'Cancelar' : 'Não, só salvar o processo'}</button>
      ${igual ? `<button class="btn pri" id="np-usar">Usar o preset "${h(igual.nome)}"</button>` : `<button class="btn pri" id="np-criar">Criar novo preset</button>`}
    </div>`, 'lg', 2);
    const fim = r => { fecharModal(2); resolve(r); };
    $$('#modal-root2 [data-fechar]').forEach(b => b.onclick = () => fim({ acao: 'nao' }));
    $('#np-nao').onclick = () => fim({ acao: 'nao' });
    const bu = $('#np-usar'); if (bu) bu.onclick = () => fim({ acao: 'usar', id: igual.id });
    const bc = $('#np-criar'); if (bc) bc.onclick = async () => {
      const nome = $('#np-nome').value.trim(); if (!nome) { $('#np-nome').focus(); return toast('Dê um nome ao preset'); }
      if (S.presets.some(x => normEt(x.nome) === normEt(nome))) return toast('Já existe um preset com esse nome');
      const id = uid();
      try {
        await DB.ins(T.presets, { id, nome, cor: base?.cor || '#a23133', descricao: cliente ? `Criado a partir da esteira de ${cliente}` : null, ordem: S.presets.length, etapas: lista.map(e => ({ nome: e.nome.trim(), descricao: e.descricao || '', prazo: e.prazo || '' })), criado_em: new Date().toISOString() });
        S.presets.push({ id, nome, cor: base?.cor || '#a23133', etapas: lista.map(e => ({ nome: e.nome.trim(), descricao: e.descricao || '', prazo: e.prazo || '' })) });
        toast(`Preset "${nome}" criado`); fim({ acao: 'novo', id });
      } catch (err) { avisar('Não foi possível criar o preset: ' + (err.message || err)); }
    };
  });
}


// ---------------------------------------------------------------- opções de status (frases rápidas) — criar/remover na hora
function frasesHTML(id) {
  return `<div class="frases" data-frases-for="${id}"><button type="button" class="fr-add" data-fradd="${id}" title="Guardar o texto digitado como opção para os próximos">⭐ Salvar o que digitei como opção</button>${S.config.frases.map(f => `<span class="fr"><button type="button" data-fr="${h(f)}" title="Usar este status">${h(f)}</button><button type="button" class="fr-x" data-frx="${h(f)}" title="Remover esta opção">×</button></span>`).join('')}</div>`;
}
async function salvarFrases(lista) {
  const antes = S.config.frases; S.config.frases = lista;
  try { await DB.salvaConfig({ ...S.config, frases: lista }); } catch (e) { S.config.frases = antes; avisar('Não foi possível salvar a opção: ' + (e.message || e)); return false; }
  $$('datalist[id^="dl-frases"]').forEach(dl => dl.innerHTML = lista.map(f => `<option value="${h(f)}">`).join(''));
  return true;
}
function ligarFrases(id) {
  const box = document.querySelector(`[data-frases-for="${id}"]`); const inp = document.getElementById(id); if (!box || !inp) return;
  const redesenha = () => { box.outerHTML = frasesHTML(id); ligarFrases(id); };
  $$('[data-fr]', box).forEach(b => b.onclick = () => { inp.value = b.dataset.fr; inp.focus(); });
  $$('[data-frx]', box).forEach(b => b.onclick = async () => {
    if (!(await confirmar(`Remover "${b.dataset.frx}" das opções de status?`))) return;
    if (await salvarFrases(S.config.frases.filter(f => f !== b.dataset.frx))) { toast('Opção removida'); redesenha(); }
  });
  const add = box.querySelector('[data-fradd]');
  const marca = () => { const t = inp.value.trim(); add.classList.toggle('novo', !!t && !S.config.frases.some(f => normEt(f) === normEt(t))); };
  inp.addEventListener('input', marca); marca();
  add.onclick = async () => {
    const t = inp.value.trim(); if (!t) { inp.focus(); return toast('Digite o status no campo e clique em ⭐ para salvar'); }
    if (S.config.frases.some(f => normEt(f) === normEt(t))) return toast('Essa opção já existe');
    if (await salvarFrases([t, ...S.config.frases])) { toast('Nova opção de status salva'); redesenha(); }
  };
}

// ---------------------------------------------------------------- formulário de processo (novo / editar)
async function formProcesso(p = null, opts = {}) {
  // sempre busca o cardápio atualizado antes de abrir (e semeia os sugeridos se estiver vazio)
  try {
    S.presets = (await DB.todos(T.presets)).sort((x, y) => (x.ordem ?? 0) - (y.ordem ?? 0) || x.nome.localeCompare(y.nome));
    if (!S.presets.length && admin()) { await carregarSugeridos(); }
  } catch (e) { console.warn(e); }
  const novo = !p; p = p || { situacao: 'andamento', tipo_cliente: 'EMPRESA', data_inicio: hoje(), modo_diario: 'padrao', prioridade: 'normal', aguardando: 'jopec', ...(opts.prefill || {}) };
  let etapas = novo ? [] : etapasDe(p.id).map(e => ({ ...e }));
  const opt = (arr, v) => arr.map(([k, n]) => `<option value="${h(k)}" ${k === v ? 'selected' : ''}>${h(n)}</option>`).join('');
  modal(`
  <div class="cab"><h3>${novo ? 'Novo processo na esteira' : 'Editar — ' + h(p.cliente)}</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo">
    <div class="form">
      <div class="campo c4"><label>Cliente *</label><input id="f-cliente" value="${h(p.cliente || '')}" list="dl-clientes" placeholder="Nome da empresa ou pessoa"></div>
      <div class="campo c2"><label>Tipo de cliente</label><select id="f-tipo">${opt(TIPOS_CLIENTE.map(t => [t, t]), p.tipo_cliente)}</select></div>
      <div class="campo c2"><label>CNPJ / CPF</label><input id="f-cnpj" value="${h(p.cnpj || '')}"></div>
      <div class="campo c4"><label>Serviço (como aparece no controle)</label><input id="f-serv" value="${h(p.servico || '')}" placeholder="Ex.: Alteração de endereço e inclusão de atividades"></div>
      <div class="campo c6"><label>Preset do cardápio</label>
        <div class="linha-preset" style="display:flex;gap:6px"><select id="f-preset" style="flex:1"><option value="">— escolher preset —</option>${S.presets.map(x => `<option value="${x.id}" ${x.id === p.preset_id ? 'selected' : ''}>${h(x.nome)} (${(x.etapas || []).length} etapas)</option>`).join('')}</select>
        <button class="btn" id="b-aplicar" type="button">Carregar etapas</button><button class="btn" id="b-novopreset" type="button" title="Criar um preset novo sem sair daqui">＋ Novo preset</button></div>
        <span class="ajuda">Carregar substitui a esteira abaixo pelas etapas do preset. Depois você marca, reordena, tira ou junta etapas de outros presets.</span></div>
    </div>
    <div class="secao"><h3>Esteira deste cliente</h3><span class="dica">Marque o que já foi feito, ou clique em 📍 na etapa onde o processo está agora (as anteriores viram concluídas)</span></div>
    <div class="ed-etapas" id="ed-etapas"></div>
    <div class="secao"><h3>Detalhes</h3></div>
    <div class="form">
      <div class="campo c2"><label>Situação</label><select id="f-sit">${opt(Object.entries(SITUACOES).map(([k, v]) => [k, v.nome.replace(/s$/, '')]), p.situacao)}</select></div>
      <div class="campo c2"><label>Com quem está</label><select id="f-ag">${opt(Object.entries(AGUARDANDO), p.aguardando || 'jopec')}</select></div>
      <div class="campo c2"><label>Prioridade</label><select id="f-pri">${opt([['baixa', 'Baixa'], ['normal', 'Normal'], ['alta', 'Alta'], ['urgente', 'Urgente']], p.prioridade || 'normal')}</select></div>
      <div class="campo c2"><label>Solicitado por</label><input id="f-resp" value="${h(p.responsavel || '')}" list="dl-resp"></div>
      <div class="campo c2"><label>Contato do cliente</label><input id="f-cont" value="${h(p.contato || '')}" placeholder="Nome / telefone / e-mail"></div>
      <div class="campo c2"><label>Diário quando não registrar nada</label><select id="f-modo">${opt([['padrao', 'Usar o padrão (' + (S.config.modo_padrao === 'repetir' ? 'repetir' : 'sem movimentação') + ')'], ['repetir', 'Repetir o último status'], ['sem_movimentacao', 'Mostrar "Sem movimentação"']], p.modo_diario || 'padrao')}</select></div>
      <div class="campo c2"><label>Data de início</label><input type="date" id="f-ini" value="${h(p.data_inicio || '')}"></div>
      <div class="campo c2"><label>Previsão de conclusão</label><input type="date" id="f-prev" value="${h(p.previsao || '')}"></div>
      <div class="campo c2"><label>Data de conclusão</label><input type="date" id="f-conc" value="${h(p.data_conclusao || '')}"></div>
      <div class="campo c2"><label>Gratificação (R$)</label><input type="number" step="0.01" id="f-grat" value="${h(p.gratificacao ?? '')}"></div>
    </div>
    <div class="secao"><h3>💰 Financeiro</h3><span class="dica">${novo ? 'Pode preencher depois. Pagamentos, reajustes e datas do restante também ficam no detalhe do processo.' : 'Pagamentos, reajustes e datas do restante ficam no detalhe do processo → Financeiro.'}</span></div>
    <div class="form">
      <div class="campo c2"><label>Valor do orçamento (R$)</label>${campoValor('f-orc', calcFin(p).servico)}${!novo && calcFin(p).tem ? '<span class="ajuda">Se mudar, fica registrado como reajuste.</span>' : ''}</div>
      <div class="campo c2"><label>Taxas e emolumentos</label><select id="f-tax"><option value="">—</option>${Object.entries(FIN_TAXAS).map(([k, n]) => `<option value="${k}" ${k === finDe(p).taxas ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="campo c2"><label>Valor das taxas (R$)</label>${campoValor('f-taxv', finDe(p).taxas_valor)}</div>
      ${novo ? `<div class="campo c2"><label>Já recebido / entrada (R$)</label>${campoValor('f-entr', '')}</div>
      <div class="campo c2"><label>Previsão de pagamento do restante</label><input type="date" id="f-prevpag"></div>
      <div class="campo c2"><label>Forma de pagamento</label><select id="f-forma"><option value="">—</option>${FIN_FORMAS.map(x => `<option>${x}</option>`).join('')}</select></div>
      <div class="campo c6 fin-calc" id="f-fincalc"></div>` : ''}
      ${novo ? `<div class="campo c6"><label>Status atual (vai para o diário de hoje)</label><input id="f-st0" list="dl-frases3" placeholder="Ex.: Orçamento enviado" value="${h(opts.status || '')}">${frasesHTML('f-st0')}</div>` : ''}
      <div class="campo c6"><label>Observações</label><textarea id="f-obs">${h(p.observacoes || '')}</textarea></div>
    </div>
    <datalist id="dl-clientes">${[...new Set(S.processos.map(x => x.cliente))].sort().map(c => `<option value="${h(c)}">`).join('')}</datalist>
    <datalist id="dl-resp">${S.config.responsaveis.map(r => `<option value="${h(r)}">`).join('')}</datalist>
    <datalist id="dl-frases3">${S.config.frases.map(f => `<option value="${h(f)}">`).join('')}</datalist>
  </div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="b-salvar">${novo ? 'Colocar na esteira' : 'Salvar alterações'}</button></div>`, 'lg');

  const fcalc = $('#f-fincalc'); if (fcalc) { const up = () => { const o = numBR($('#f-orc').value) || 0, t = $('#f-tax').value === 'reembolso' ? (numBR($('#f-taxv').value) || 0) : 0, e = numBR($('#f-entr').value) || 0, tot = r2(o + t); fcalc.innerHTML = tot > 0 ? `Total a receber <b>${moedaReal(tot)}</b>${t ? ' (com taxas a reembolsar)' : ''} · entrada <b>${moedaReal(e)}</b> · falta <b class="${tot - e > 0 ? 'falta' : 'ok'}">${moedaReal(Math.max(0, tot - e))}</b>${tot - e > 0 && !$('#f-prevpag').value ? ' · <span class="falta">informe a data prevista do restante</span>' : ''}` : ''; }; ['f-orc', 'f-taxv', 'f-entr', 'f-prevpag', 'f-tax'].forEach(i => $('#' + i).addEventListener('input', up)); $('#f-tax').addEventListener('change', up); up(); }
  const todasEtapasCardapio = [...new Map(S.presets.flatMap(x => (x.etapas || []).map(e => [e.nome, e]))).values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const desenha = () => {
    $('#ed-etapas').innerHTML = (etapas.length ? etapas.map((e, i) => `
      <div class="ed-et ${e.status}">
        <span class="num">${i + 1}</span>
        <select data-i="${i}" data-k="status" class="opc">${Object.entries(ST_ETAPA).map(([k, v]) => `<option value="${k}" ${k === e.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input data-i="${i}" data-k="nome" value="${h(e.nome)}" placeholder="Nome da etapa">
        <input data-i="${i}" data-k="prazo" value="${h(e.prazo || '')}" placeholder="Prazo" class="opc">
        <div class="mv"><button class="btn sm ghost aqui" data-aqui="${i}" title="O processo está nesta etapa agora">📍</button><button class="btn sm ghost" data-up="${i}" title="Subir">↑</button><button class="btn sm ghost" data-dn="${i}" title="Descer">↓</button><button class="btn sm ghost" data-rm="${i}" title="Remover">✕</button></div>
      </div>`).join('') : '<div class="vazio" style="padding:18px">Escolha um preset e clique em "Carregar etapas", ou adicione etapas abaixo.</div>') + `
      <div class="ed-barra"><button class="btn sm" id="b-add" type="button">＋ Etapa em branco</button>
        <button class="btn sm" id="b-salvapreset" type="button" title="Guardar esta esteira no cardápio como um preset novo">💾 Salvar como preset</button>
        <select id="s-add" class="btn sm" style="max-width:280px"><option value="">＋ Adicionar etapa do cardápio…</option>${todasEtapasCardapio.map((e, i) => `<option value="${i}">${h(e.nome)}</option>`).join('')}</select>
        <select id="s-junta" class="btn sm" style="max-width:280px"><option value="">⊕ Juntar etapas de outro preset…</option>${S.presets.map(x => `<option value="${x.id}">${h(x.nome)}</option>`).join('')}</select></div>`;
    $$('#ed-etapas [data-k]').forEach(inp => inp.oninput = inp.onchange = () => { etapas[+inp.dataset.i][inp.dataset.k] = inp.value; if (inp.dataset.k === 'status') { const e = etapas[+inp.dataset.i]; if (inp.value === 'concluida' && !e.concluida_em) e.concluida_em = hoje(); desenha(); } });
    $$('#ed-etapas [data-aqui]').forEach(b => b.onclick = () => { const a = +b.dataset.aqui; etapas.forEach((e, i) => { if (e.status === 'dispensada' && i !== a) return; if (i < a) { e.status = 'concluida'; e.concluida_em = e.concluida_em || hoje(); } else if (i === a) { e.status = 'andamento'; e.concluida_em = null; } else { e.status = 'pendente'; e.concluida_em = null; } }); desenha(); });
    $$('#ed-etapas [data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) [etapas[i - 1], etapas[i]] = [etapas[i], etapas[i - 1]]; desenha(); });
    $$('#ed-etapas [data-dn]').forEach(b => b.onclick = () => { const i = +b.dataset.dn; if (i < etapas.length - 1) [etapas[i + 1], etapas[i]] = [etapas[i], etapas[i + 1]]; desenha(); });
    $$('#ed-etapas [data-rm]').forEach(b => b.onclick = () => { etapas.splice(+b.dataset.rm, 1); desenha(); });
    $('#b-add').onclick = () => { etapas.push({ nome: '', status: 'pendente' }); desenha(); $$('#ed-etapas [data-k="nome"]').at(-1).focus(); };
    $('#b-salvapreset').onclick = async () => {
      const lista = etapas.filter(e => e.nome.trim()); if (lista.length < 2) return toast('Monte pelo menos 2 etapas');
      const r = await perguntarNovoPreset(lista, S.presets.find(x => x.id === $('#f-preset').value), { forcar: true, cliente: $('#f-cliente').value.trim() });
      if (r.acao !== 'nao') atualizarSelectPreset(r.id);
    };
    $('#s-add').onchange = ev => { const e = todasEtapasCardapio[+ev.target.value]; if (e) { etapas.push({ nome: e.nome, descricao: e.descricao, prazo: e.prazo, status: 'pendente' }); desenha(); } };
    $('#s-junta').onchange = ev => { const pr = S.presets.find(x => x.id === ev.target.value); if (pr) { const nomes = new Set(etapas.map(e => e.nome)); (pr.etapas || []).forEach(e => { if (!nomes.has(e.nome)) etapas.push({ nome: e.nome, descricao: e.descricao, prazo: e.prazo, status: 'pendente' }); }); desenha(); toast('Etapas juntadas (sem repetir as que já existiam)'); } };
  };
  desenha();
  if ($('#f-st0')) ligarFrases('f-st0');
  $('#b-aplicar').onclick = async () => {
    const pr = S.presets.find(x => x.id === $('#f-preset').value); if (!pr) return toast('Escolha um preset');
    if (etapas.length && !(await confirmar('Substituir a esteira atual pelas etapas do preset?'))) return;
    etapas = (pr.etapas || []).map(e => ({ nome: e.nome, descricao: e.descricao, prazo: e.prazo, status: 'pendente' }));
    if (!$('#f-serv').value) $('#f-serv').value = pr.nome;
    desenha();
  };
  $('#f-preset').onchange = () => { if (!etapas.length) $('#b-aplicar').click(); };
  const atualizarSelectPreset = sel => { $('#f-preset').innerHTML = `<option value="">— escolher preset —</option>` + S.presets.map(x => `<option value="${x.id}">${h(x.nome)} (${(x.etapas || []).length} etapas)</option>`).join(''); $('#f-preset').value = sel || ''; };
  $('#b-novopreset').onclick = () => formPreset(null, async novoId => {
    $('#f-preset').innerHTML = `<option value="">— escolher preset —</option>` + S.presets.map(x => `<option value="${x.id}">${h(x.nome)} (${(x.etapas || []).length} etapas)</option>`).join('');
    $('#f-preset').value = novoId; desenha();
    if (!etapas.length || await confirmar('Carregar as etapas do preset novo nesta esteira?')) { etapas = []; $('#b-aplicar').click(); }
  });
  $('#b-salvar').onclick = async () => {
    const cliente = $('#f-cliente').value.trim(); if (!cliente) { $('#f-cliente').focus(); return toast('Informe o cliente'); }
    const lista = etapas.filter(e => e.nome.trim());
    if (lista.length && !lista.some(e => e.status === 'andamento')) { const pe = lista.find(e => e.status === 'pendente'); if (pe && $('#f-sit').value === 'andamento') pe.status = 'andamento'; }
    // ✨ esteira diferente do preset escolhido? sugere criar um preset novo (sem mexer no original)
    let presetFinal = $('#f-preset').value || null;
    const base = S.presets.find(x => x.id === presetFinal);
    const chaveNP = 'leg_np_' + (novo ? 'novo' : p.id);
    if (lista.length >= 2 && assinatura(lista) !== assinatura(base?.etapas) && localStorage.getItem(chaveNP) !== assinatura(lista)) {
      const r = await perguntarNovoPreset(lista, base, { cliente });
      if (r.acao === 'nao') { if (!novo) localStorage.setItem(chaveNP, assinatura(lista)); }
      else presetFinal = r.id;
    }
    const num = v => v === '' ? null : +v;
    const dados = {
      cliente, tipo_cliente: $('#f-tipo').value, cnpj: $('#f-cnpj').value.trim() || null, servico: $('#f-serv').value.trim() || null,
      preset_id: presetFinal, situacao: $('#f-sit').value, aguardando: $('#f-ag').value, prioridade: $('#f-pri').value,
      responsavel: $('#f-resp').value.trim() || null, contato: $('#f-cont').value.trim() || null, modo_diario: $('#f-modo').value,
      data_inicio: $('#f-ini').value || hoje(), previsao: $('#f-prev').value || null, data_conclusao: $('#f-conc').value || null,
      gratificacao: num($('#f-grat').value), observacoes: $('#f-obs').value.trim() || null, atualizado_em: new Date().toISOString(),
    };
    if (['finalizado', 'desistencia'].includes(dados.situacao) && !dados.data_conclusao) dados.data_conclusao = hoje();
    { // financeiro
      const orc = numBR($('#f-orc').value), tv = numBR($('#f-taxv').value);
      if (Number.isNaN(orc) || Number.isNaN(tv)) return toast('Confira os valores do financeiro', 'erro');
      const f = finDe(p), c0 = calcFin(p);
      if (c0.tem && orc != null && Math.abs(orc - c0.servico) > 0.004) f.reajustes = [...f.reajustes, { data: hoje(), de: c0.servico, para: orc, motivo: 'Alterado ao editar o processo' }];
      else if (!c0.tem) { f.orcamento = orc; if (orc != null) f.orcamento_data = f.orcamento_data || hoje(); }
      f.taxas = $('#f-tax').value || null; f.taxas_valor = tv;
      if (novo) {
        const en = numBR($('#f-entr').value), dp = $('#f-prevpag').value, fo = $('#f-forma').value || null;
        if (Number.isNaN(en)) return toast('Confira o valor da entrada', 'erro');
        if (fo) f.forma = fo;
        if (en > 0) { f.pagamentos = [{ id: uid(), data: hoje(), valor: en, forma: fo, obs: 'Entrada' }]; f.condicao = f.condicao || 'entrada'; }
        const tot = (orc || 0) + (f.taxas === 'reembolso' ? (tv || 0) : 0), resto = r2(tot - (en > 0 ? en : 0));
        if (dp && resto > 0) f.previsoes = [{ id: uid(), data: dp, valor: resto }];
      }
      dados.financeiro = f; dados.honorarios = f.reajustes.length ? +f.reajustes.at(-1).para : (f.orcamento ?? null);
    }
    const id = novo ? uid() : p.id;
    const ok = await acao(async () => {
      if (novo) await DB.ins(T.processos, { id, ...dados, criado_em: new Date().toISOString() });
      else { await DB.upd(T.processos, id, dados); await DB.del(T.etapas, 'processo_id', id); }
      await DB.ins(T.etapas, lista.map((e, i) => ({ id: uid(), processo_id: id, ordem: i, nome: e.nome.trim(), descricao: e.descricao || null, prazo: e.prazo || null, status: e.status || 'pendente', concluida_em: e.status === 'concluida' ? (e.concluida_em || hoje()) : null })));
      if (novo) {
        const s0 = $('#f-st0').value.trim();
        if (opts.status && dados.data_inicio < hoje()) await registrar(id, `Processo aberto na esteira${dados.servico ? ': ' + dados.servico : ''}`, { tipo: 'sistema', data: dados.data_inicio });
        await registrar(id, s0 || `Processo aberto na esteira${dados.servico ? ': ' + dados.servico : ''}`, { tipo: s0 ? 'registro' : 'sistema', data: opts.status ? hoje() : (dados.data_inicio > hoje() ? hoje() : dados.data_inicio) });
      }
      if (opts.antesDeSalvar) await opts.antesDeSalvar(id);
    }, novo ? 'Processo colocado na esteira' : 'Alterações salvas');
    if (ok) { if (opts.depois) opts.depois(id); else abrirDetalhe(id); }
  };
}

// ---------------------------------------------------------------- CARDÁPIO DE ETAPAS (presets)
function vCardapio(el) {
  el.innerHTML = `
  <div class="topo"><h2>Cardápio de etapas</h2>
    ${!S.presets.length ? `<button class="btn adm" id="b-sug">⤓ Carregar presets sugeridos</button>` : ''}
    <button class="btn pri adm" id="b-novo">＋ Novo preset</button>
    <div class="sub">Cada preset é o roteiro padrão de um serviço. Ao colocar um cliente na esteira você escolhe o preset e ajusta as etapas para aquele caso.</div></div>
  ${S.presets.length ? `<div class="grade">${S.presets.map(x => `
    <div class="card preset" style="--cor:${h(x.cor || '#a23133')}">
      <h4>${h(x.nome)}</h4><div class="desc">${h(x.descricao || '')}</div>
      <ol>${(x.etapas || []).map(e => `<li>${h(e.nome)}${e.prazo ? ` <small style="color:var(--sub)">· ${h(e.prazo)}</small>` : ''}</li>`).join('')}</ol>
      <div class="acoes adm"><button class="btn sm" data-ed="${x.id}">✎ Editar</button><button class="btn sm" data-dup="${x.id}">⧉ Duplicar</button><button class="btn sm dang" data-del="${x.id}">Excluir</button>
      <span class="chip" style="margin-left:auto">${S.processos.filter(p => p.preset_id === x.id).length} processos</span></div>
    </div>`).join('')}</div>` : `<div class="card vazio">Nenhum preset ainda. ${admin() ? 'Clique em "Carregar presets sugeridos" para começar com os serviços mais comuns e depois ajuste do seu jeito.' : ''}</div>`}`;
  const bs = $('#b-sug', el); if (bs) bs.onclick = carregarSugeridos;
  const bn = $('#b-novo', el); if (bn) bn.onclick = () => formPreset();
  $$('[data-ed]', el).forEach(b => b.onclick = () => formPreset(S.presets.find(x => x.id === b.dataset.ed)));
  $$('[data-dup]', el).forEach(b => b.onclick = () => { const x = S.presets.find(y => y.id === b.dataset.dup); formPreset({ ...x, id: null, nome: x.nome + ' (cópia)' }); });
  $$('[data-del]', el).forEach(b => b.onclick = async () => { const x = S.presets.find(y => y.id === b.dataset.del); if (await confirmar(`Excluir o preset "${x.nome}"? Os processos que já usam ele continuam com as etapas deles.`)) acao(() => DB.del(T.presets, 'id', x.id), 'Preset excluído'); });
}
function carregarSugeridos() {
  const sug = window.LEG_PRESETS_SUGERIDOS || [];
  return acao(() => DB.ins(T.presets, sug.map((x, i) => ({ id: uid(), nome: x.nome, descricao: x.descricao || null, cor: x.cor, ordem: i, etapas: x.etapas.map(e => ({ nome: e.nome, descricao: e.descricao || '', prazo: e.prazo || '' })), criado_em: new Date().toISOString() }))), `${sug.length} presets carregados`);
}
function formPreset(x = null, aoSalvar = null) {
  const novo = !x || !x.id; x = x || { nome: '', cor: '#a23133', etapas: [] }; const L = aoSalvar ? 2 : 1; const R = L === 2 ? '#modal-root2 ' : '#modal-root ';
  let etapas = (x.etapas || []).map(e => ({ ...e })); let aposDesenhar = () => {};
  modal(`<div class="cab"><h3>${novo ? 'Novo preset' : 'Editar preset'}</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo"><div class="form">
    <div class="campo c4"><label>Nome do serviço *</label><input id="p-nome" value="${h(x.nome)}" placeholder="Ex.: Alteração de Endereço"></div>
    <div class="campo c2"><label>Cor</label><input type="color" id="p-cor" list="paleta-jopec" value="${h(x.cor || '#a23133')}" style="height:40px;padding:3px"><datalist id="paleta-jopec">${['#a23133', '#75232a', '#c2611f', '#b08100', '#2f7d4f', '#1f6f78', '#2d5a9b', '#6a4c93', '#8a5a44', '#5b5f66'].map(c => `<option value="${c}">`).join('')}</datalist></div>
    <div class="campo c6"><label>Descrição</label><input id="p-desc" value="${h(x.descricao || '')}"></div>
    ${novo ? `<div class="campo c6"><label>Começar a partir de outro preset (esqueleto)</label>
      <select id="p-base"><option value="">— começar do zero —</option>${S.presets.map(y => `<option value="${y.id}">${h(y.nome)} (${(y.etapas || []).length} etapas)</option>`).join('')}</select>
      <span class="ajuda">Copia as etapas do preset escolhido para você só ajustar. O preset original não muda.</span></div>` : ''}
  </div>
  <div class="secao"><h3>Etapas (na ordem em que são feitas)</h3><span class="dica" id="p-dup"></span></div>
  <div class="ed-etapas" id="ed-p"></div></div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="bp-salvar">Salvar preset</button></div>`, 'lg', L);
  const desenha = () => {
    $(R + '#ed-p').innerHTML = etapas.map((e, i) => `<div class="ed-et preset-ed"><span class="num">${i + 1}</span>
      <input data-i="${i}" data-k="nome" value="${h(e.nome)}" placeholder="Nome da etapa">
      <input data-i="${i}" data-k="descricao" value="${h(e.descricao || '')}" placeholder="Descrição (opcional)" class="opc">
      <input data-i="${i}" data-k="prazo" value="${h(e.prazo || '')}" placeholder="Prazo" class="opc">
      <div class="mv"><button class="btn sm ghost" data-up="${i}">↑</button><button class="btn sm ghost" data-dn="${i}">↓</button><button class="btn sm ghost" data-rm="${i}">✕</button></div></div>`).join('')
      + `<div class="ed-barra"><button class="btn sm" id="b-add">＋ Adicionar etapa</button></div>`;
    $$(R + '#ed-p [data-k]').forEach(inp => inp.oninput = () => etapas[+inp.dataset.i][inp.dataset.k] = inp.value);
    $$(R + '#ed-p [data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) [etapas[i - 1], etapas[i]] = [etapas[i], etapas[i - 1]]; desenha(); });
    $$(R + '#ed-p [data-dn]').forEach(b => b.onclick = () => { const i = +b.dataset.dn; if (i < etapas.length - 1) [etapas[i + 1], etapas[i]] = [etapas[i], etapas[i + 1]]; desenha(); });
    $$(R + '#ed-p [data-rm]').forEach(b => b.onclick = () => { etapas.splice(+b.dataset.rm, 1); desenha(); });
    $(R + '#b-add').onclick = () => { etapas.push({ nome: '', descricao: '', prazo: '' }); desenha(); $$(R + '#ed-p [data-k="nome"]').at(-1).focus(); };
    aposDesenhar();
  };
  const checaDup = () => { const el = $(R + '#p-dup'); if (!el) return; const ig = presetIgual(etapas, novo ? null : x.id); el.innerHTML = ig ? `<span class="chip amarelo">⚠ Igual ao preset "${h(ig.nome)}"</span>` : ''; };
  aposDesenhar = () => { checaDup(); $$(R + '#ed-p [data-k="nome"]').forEach(i => i.addEventListener('input', checaDup)); };
  const desenha2 = desenha;
  desenha2();
  const pb = $(R + '#p-base'); if (pb) pb.onchange = async () => {
    const y = S.presets.find(z => z.id === pb.value); if (!y) return;
    if (etapas.some(e => e.nome.trim()) && !(await confirmar('Substituir as etapas atuais pelas do preset escolhido?'))) { pb.value = ''; return; }
    etapas = (y.etapas || []).map(e => ({ ...e })); if (!$(R + '#p-cor').dataset.mexeu) $(R + '#p-cor').value = y.cor || '#a23133';
    desenha2(); toast('Esqueleto carregado: agora é só ajustar');
  };
  $(R + '#p-cor').oninput = e => e.target.dataset.mexeu = '1';
  $(R + '#bp-salvar').onclick = async () => {
    const nome = $(R + '#p-nome').value.trim(); if (!nome) return toast('Informe o nome do serviço');
    if (S.presets.some(y => y.id !== x.id && normEt(y.nome) === normEt(nome))) return toast('Já existe um preset com esse nome');
    const ig = presetIgual(etapas, novo ? null : x.id);
    if (ig && !(await confirmar(`O preset "${ig.nome}" já tem exatamente essas etapas, na mesma ordem.\n\nSalvar mesmo assim (vai ficar duplicado)?`))) return;
    const dados = { nome, cor: $(R + '#p-cor').value, descricao: $(R + '#p-desc').value.trim() || null, etapas: etapas.filter(e => e.nome.trim()).map(e => ({ nome: e.nome.trim(), descricao: e.descricao || '', prazo: e.prazo || '' })) };
    const nid = novo ? uid() : x.id;
    if (await acao(() => novo ? DB.ins(T.presets, { id: nid, ...dados, ordem: S.presets.length, criado_em: new Date().toISOString() }) : DB.upd(T.presets, x.id, dados), 'Preset salvo')) { fecharModal(L); if (aoSalvar) aoSalvar(nid); }
  };
}

// ---------------------------------------------------------------- RELATÓRIO MENSAL
function abasRel() { return `<div class="tabs"><button class="tab ${S.relAba !== 'financeiro' ? 'on' : ''}" data-rela="mes">✔ Finalizados do mês</button><button class="tab ${S.relAba === 'financeiro' ? 'on' : ''}" data-rela="financeiro">💰 Financeiro</button></div>`; }
function ligarAbasRel(el) { $$('[data-rela]', el).forEach(b => b.onclick = () => { S.relAba = b.dataset.rela; render(); }); }
function vRelatorio(el) {
  if (S.relAba === 'financeiro') return vRelFin(el);
  const meses = [...new Set([hoje().slice(0, 7), ...S.processos.filter(p => p.data_conclusao).map(p => p.data_conclusao.slice(0, 7))])].sort().reverse();
  const fin = S.processos.filter(p => p.situacao !== 'desistencia' && ['finalizado', 'arquivado'].includes(p.situacao) && (p.data_conclusao || '').startsWith(S.mesRel)).sort((a, b) => a.data_conclusao.localeCompare(b.data_conclusao));
  const des = S.processos.filter(p => p.situacao === 'desistencia' && (p.data_conclusao || '').startsWith(S.mesRel));
  const tot = fin.reduce((s, p) => s + (+p.gratificacao || 0), 0);
  const nomeMes = m => parseD(m + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  el.innerHTML = `
  <div class="topo"><h2>Trabalhos finalizados</h2>
    <select id="mes" class="btn">${meses.map(m => `<option value="${m}" ${m === S.mesRel ? 'selected' : ''}>${nomeMes(m)}</option>`).join('')}</select>
    <button class="btn" data-olho title="Esconder ou mostrar os valores">${valoresOcultos() ? '🙈 Mostrar valores' : '👁 Esconder valores'}</button><button class="btn" id="b-csv">⤓ Exportar CSV</button><button class="btn" onclick="window.print()">🖨 Imprimir</button></div>
  ${abasRel()}
  <div class="card" style="overflow:auto">
    <div style="padding:14px 16px;font-weight:700;text-transform:uppercase">Trabalhos finalizados em ${nomeMes(S.mesRel)}</div>
    <table class="tb"><thead><tr><th>#</th><th>Nome</th><th>Tipo de cliente</th><th>Serviço executado</th><th>Concluído</th><th class="num">Gratificação</th></tr></thead>
    <tbody>${fin.map((p, i) => `<tr data-proc="${p.id}" style="cursor:pointer"><td>${i + 1}</td><td>${h(p.cliente)}</td><td>${h(p.tipo_cliente)}</td><td>${h(p.servico)}</td><td>${fmtD(p.data_conclusao)}</td><td class="num">${p.gratificacao != null ? moeda(p.gratificacao) : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum trabalho finalizado neste mês.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="5">TOTAL (${fin.length} trabalhos)</td><td class="num">${moeda(tot)}</td></tr></tfoot></table>
  </div>
  ${des.length ? `<div class="secao"><h3>Desistências no mês</h3></div><div class="card"><table class="tb"><tbody>${des.map(p => `<tr data-proc="${p.id}" style="cursor:pointer"><td>${h(p.cliente)}</td><td>${h(p.servico)}</td><td>${h(p.desistencia_motivo || '')}</td><td>${fmtD(p.data_conclusao)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  $('#mes', el).onchange = e => { S.mesRel = e.target.value; render(); };
  ligarAbasRel(el);
  ligarOlho(el);
  $$('[data-proc]', el).forEach(r => r.onclick = () => abrirDetalhe(r.dataset.proc));
  $('#b-csv', el).onclick = () => {
    const linhas = [['Nome', 'Tipo de cliente', 'Serviço executado', 'Conclusão', 'Gratificação'], ...fin.map(p => [p.cliente, p.tipo_cliente, p.servico || '', fmtD(p.data_conclusao), (p.gratificacao ?? '').toString().replace('.', ',')]), ['TOTAL', '', '', '', tot.toFixed(2).replace('.', ',')]];
    baixar(`finalizados-${S.mesRel}.csv`, '﻿' + linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
  };
}
function vRelFin(el) {
  const FILT = { aberto: 'Em aberto', atrasado: 'Atrasados', quitado: 'Quitados', sem: 'Sem orçamento', todos: 'Todos' };
  const f0 = S.finFiltro || 'aberto';
  const base = finAtivos(), t = finTotais(base);
  const mes = hoje().slice(0, 7);
  const recMes = r2(base.reduce((a, p) => a + finDe(p).pagamentos.filter(x => (x.data || '').startsWith(mes)).reduce((b, x) => b + (+x.valor || 0), 0), 0));
  const prev30 = (() => { const lim = new Date(); lim.setDate(lim.getDate() + 30); const L = isoLocal(lim); return r2(base.reduce((a, p) => { const c = calcFin(p); return a + (c.proximo && c.proximo.data && c.proximo.data <= L ? c.proximo.valor : 0); }, 0)); })();
  const linhas = base.map(p => ({ p, c: calcFin(p) })).filter(({ c }) => f0 === 'todos' || (f0 === 'aberto' ? c.tem && c.restante > 0 : c.status === f0))
    .sort((a, b) => b.c.atrasado - a.c.atrasado || (a.c.proximo?.data || '9').localeCompare(b.c.proximo?.data || '9') || b.c.restante - a.c.restante);
  const cnt = k => base.filter(p => { const c = calcFin(p); return k === 'todos' || (k === 'aberto' ? c.tem && c.restante > 0 : c.status === k); }).length;
  el.innerHTML = `
  <div class="topo"><h2>Financeiro</h2>
    <button class="btn" data-olho>${valoresOcultos() ? '🙈 Mostrar valores' : '👁 Esconder valores'}</button><button class="btn" id="b-csvf">⤓ Exportar CSV</button><button class="btn" onclick="window.print()">🖨 Imprimir</button></div>
  ${abasRel()}
  <div class="kpis">
    <div class="card kpi"><div class="v fin-k">${moeda(t.valor)}</div><div class="l">Total orçado (processos ativos e finalizados)</div></div>
    <div class="card kpi bom"><div class="v fin-k">${moeda(t.pago)}</div><div class="l">Já recebido</div></div>
    <div class="card kpi atenc"><div class="v fin-k">${moeda(t.falta)}</div><div class="l">Falta receber · ${t.nAberto} ${t.nAberto === 1 ? 'processo' : 'processos'}</div></div>
    <div class="card kpi ${t.atraso > 0 ? 'alerta' : 'bom'}"><div class="v fin-k">${moeda(t.atraso)}</div><div class="l">Em atraso · ${t.nAtraso} ${t.nAtraso === 1 ? 'cliente' : 'clientes'}</div></div>
    <div class="card kpi"><div class="v fin-k">${moeda(recMes)}</div><div class="l">Recebido neste mês · previsto p/ 30 dias: ${moeda(prev30)}</div></div>
  </div>
  <div class="tabs">${Object.entries(FILT).map(([k, n]) => `<button class="tab ${f0 === k ? 'on' : ''}" data-ff="${k}">${n}<span class="n">${cnt(k)}</span></button>`).join('')}</div>
  <div class="card" style="overflow:auto"><table class="tb tb-fin"><thead><tr><th>Cliente</th><th>Serviço</th><th>Situação</th><th>Taxas</th><th class="num">Valor</th><th class="num">Pago</th><th class="num">Falta</th><th>Próximo pagamento</th></tr></thead>
  <tbody>${linhas.map(({ p, c }) => `<tr data-proc="${p.id}" style="cursor:pointer"><td><b>${h(p.cliente)}</b><div class="tb-m">${chipFin(p) || '<span class="chip">sem orçamento</span>'}</div></td><td>${h(p.servico || '')}</td><td>${h(SITUACOES[p.situacao]?.nome.replace(/s$/, '') || '')}</td><td>${h(FIN_TAXAS[c.f.taxas] || '—')}</td>
    <td class="num">${c.tem ? moeda(c.valor) + (c.reajustado ? ' <small title="Valor reajustado">↕</small>' : '') : '—'}</td><td class="num">${c.tem ? moeda(c.pago) : '—'}</td><td class="num ${c.restante > 0 ? 'falta' : ''}">${c.tem ? moeda(c.restante) : '—'}</td>
    <td>${c.atrasado > 0 ? `<span class="falta">⚠ ${moeda(c.atrasado)} vencido</span>` : c.proximo ? `${fmtD(c.proximo.data)} · ${moeda(c.proximo.valor)}` : c.semData > 0 ? '<span class="falta">sem data</span>' : c.status === 'quitado' ? '✔' : '—'}</td></tr>`).join('') || '<tr><td colspan="8" class="vazio">Nada aqui.</td></tr>'}</tbody></table></div>`;
  ligarAbasRel(el); ligarOlho(el);
  $$('[data-ff]', el).forEach(b => b.onclick = () => { S.finFiltro = b.dataset.ff; render(); });
  $$('[data-proc]', el).forEach(r => r.onclick = () => abrirDetalhe(r.dataset.proc)); acessivel(el);
  $('#b-csvf', el).onclick = () => {
    const br = v => v == null ? '' : r2(v).toFixed(2).replace('.', ',');
    const L = [['Cliente', 'Serviço', 'Situação', 'Status financeiro', 'Taxas', 'Valor orçado original', 'Valor atual', 'Pago', 'Falta', 'Em atraso', 'Próximo pagamento', 'Valor próximo'],
      ...linhas.map(({ p, c }) => [p.cliente, p.servico || '', SITUACOES[p.situacao]?.nome || '', FIN_ST[c.status][0], FIN_TAXAS[c.f.taxas] || '', br(c.original), br(c.valor), br(c.pago), br(c.restante), br(c.atrasado), c.proximo ? fmtD(c.proximo.data) : '', c.proximo ? br(c.proximo.valor) : ''])];
    baixar(`financeiro-${hoje()}.csv`, '﻿' + L.map(l => l.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
  };
}
function baixar(nome, conteudo, tipo) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; a.click(); }

// ---------------------------------------------------------------- CONFIGURAÇÕES
function blocoAparencia() {
  const op = (id, atual, lista) => `<div class="seg" role="radiogroup" id="${id}">${lista.map(([v, rot, i]) => `<button type="button" role="radio" aria-checked="${atual === v}" class="${atual === v ? 'on' : ''}" data-v="${v}">${i ? ic(i, 15) : ''}${rot}</button>`).join('')}</div>`;
  return `<div class="secao"><h3>Aparência</h3><span class="dica">Vale só para este aparelho. Cada pessoa escolhe a sua.</span></div>
  <div class="card prefs">
    <div class="pref"><div><b>Tema</b><small>O automático acompanha o modo claro/escuro do celular ou computador.</small></div>${op('pf-tema', pref('tema'), [['auto', 'Automático', 'auto'], ['claro', 'Claro', 'sol'], ['escuro', 'Escuro', 'lua']])}</div>
    <div class="pref"><div><b>Densidade</b><small>Compacta mostra mais processos por tela.</small></div>${op('pf-dens', pref('densidade'), [['normal', 'Confortável'], ['compacta', 'Compacta']])}</div>
    <div class="pref"><div><b>Abrir o app em</b><small>Tela que aparece ao entrar.</small></div>${op('pf-ini', pref('inicio'), [['painel', 'Painel do dia'], ['processos', 'Processos']])}</div>
  </div>`;
}
function ligarAparencia(el) {
  const liga = (id, k, depois) => $$(`#${id} [data-v]`, el).forEach(b => b.onclick = () => { setPref(k, b.dataset.v); $$(`#${id} [data-v]`, el).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); depois?.(); toast('Preferência salva'); });
  liga('pf-tema', 'tema', () => { aplicarTema(); const bt = $('#b-tema'); if (bt) { bt.outerHTML = botaoTema(); ligarTema(); } });
  liga('pf-dens', 'densidade', aplicarTema);
  liga('pf-ini', 'inicio');
}
function vConfig(el) {
  if (!admin()) { el.innerHTML = `<div class="topo"><h2>Ajustes</h2></div>${blocoAparencia()}`; return ligarAparencia(el); }
  const c = S.config;
  el.innerHTML = `
  <div class="topo"><h2>Configurações</h2></div>
  ${blocoAparencia()}
  <div class="secao"><h3>Regras do controle</h3><span class="dica">Valem para todo mundo.</span></div>
  <div class="card" style="padding:18px;max-width:820px">
    <div class="form">
      <div class="campo c6"><label>Quando eu não escrever nada no dia, o diário deve…</label>
        <select id="c-modo"><option value="repetir" ${c.modo_padrao === 'repetir' ? 'selected' : ''}>Repetir o último status até eu mudar</option><option value="sem_movimentacao" ${c.modo_padrao === 'sem_movimentacao' ? 'selected' : ''}>Mostrar "Sem movimentação"</option></select>
        <span class="ajuda">Este é o padrão. Cada processo pode ter o seu próprio modo (em Editar processo).</span></div>
      <div class="campo c2"><label>Contar só dias úteis</label><select id="c-uteis"><option value="1" ${c.so_dias_uteis ? 'selected' : ''}>Sim (pula sáb/dom)</option><option value="0" ${!c.so_dias_uteis ? 'selected' : ''}>Não (todos os dias)</option></select></div>
      <div class="campo c2"><label>Alerta de processo parado após</label><input type="number" min="1" id="c-alerta" value="${c.alerta_dias}"><span class="ajuda">dias sem movimento real</span></div>
      <div class="campo c2"><label>Ao concluir uma etapa</label><select id="c-av"><option value="1" ${c.avancar_etapa ? 'selected' : ''}>Iniciar a próxima automaticamente</option><option value="0" ${!c.avancar_etapa ? 'selected' : ''}>Não mexer na próxima</option></select></div>
      <div class="campo c6"><label>E-mail de alerta — destinatários (separe por vírgula)</label><input id="c-para" value="${h(c.email_para)}"></div>
      <div class="campo c4"><label>Com cópia (CC)</label><input id="c-cc" value="${h(c.email_cc)}"></div>
      <div class="campo c2"><label>Remetente</label><input id="c-rem" value="${h(c.email_remetente)}"><span class="ajuda">O envio automático sai da conta configurada no Supabase (GMAIL_USER).</span></div>
      <div class="campo c6"><label>Quem solicita os processos (um por linha)</label><textarea id="c-resp">${h(c.responsaveis.join('\n'))}</textarea></div>
      <div class="campo c6"><label>Frases rápidas do diário (uma por linha)</label><textarea id="c-fr" style="min-height:180px">${h(c.frases.join('\n'))}</textarea></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn pri" id="c-salvar">Salvar configurações</button></div>
  </div>
  <div class="secao"><h3>🔗 Link público (sem senha)</h3><span class="dica">Quem tiver o link vê o andamento e as esteiras (em andamento, pausados, finalizados e desistências), sem poder mudar nada. Valores, contatos e observações não aparecem.</span></div>
  <div class="card" style="padding:18px;max-width:820px" id="c-link">Carregando…</div>
  <div class="secao"><h3>Dados</h3></div>
  <div class="card" style="padding:18px;max-width:820px;display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn" id="c-bkp">⤓ Baixar backup (JSON)</button>
    <label class="btn">⤒ Restaurar backup<input type="file" id="c-rest" accept=".json" hidden></label>
    <button class="btn" id="c-sug">⤓ Adicionar presets sugeridos</button>
  </div>`;
  $('#c-salvar', el).onclick = () => acao(() => DB.salvaConfig({
    modo_padrao: $('#c-modo').value, so_dias_uteis: $('#c-uteis').value === '1', alerta_dias: Math.max(1, +$('#c-alerta').value || 5), avancar_etapa: $('#c-av').value === '1',
    email_para: $('#c-para').value.trim(), email_cc: $('#c-cc').value.trim(), email_remetente: $('#c-rem').value.trim(),
    responsaveis: $('#c-resp').value.split('\n').map(s => s.trim()).filter(Boolean), frases: $('#c-fr').value.split('\n').map(s => s.trim()).filter(Boolean),
  }), 'Configurações salvas');
  ligarAparencia(el);
  desenharLinkPublico();
  $('#c-bkp', el).onclick = () => baixar(`legalizacao-backup-${hoje()}.json`, JSON.stringify({ presets: S.presets, processos: S.processos, etapas: S.etapas, atualizacoes: S.atual, config: S.config }, null, 1), 'application/json');
  $('#c-sug', el).onclick = carregarSugeridos;
  $('#c-rest', el).onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    const b = JSON.parse(await f.text());
    if (!(await confirmar(`Restaurar backup com ${b.processos?.length || 0} processos? Itens com o mesmo ID serão ignorados.`))) return;
    acao(async () => {
      const ids = t => new Set(S[t].map(x => x.id));
      const novos = (arr, t) => (arr || []).filter(x => !ids(t).has(x.id));
      await DB.ins(T.presets, novos(b.presets, 'presets')); await DB.ins(T.processos, novos(b.processos, 'processos'));
      await DB.ins(T.etapas, novos(b.etapas, 'etapas')); await DB.ins(T.atual, novos(b.atualizacoes, 'atual'));
    }, 'Backup restaurado');
  };
}



// ---------------------------------------------------------------- TRIAGEM DA PLANILHA
const PEND = () => S.pendencias || [];
const pendTriagem = () => PEND().filter(x => !(S.config.triagem || {})[x.chave]);
async function marcarTriado(chave, info) {
  const tri = { ...(S.config.triagem || {}), [chave]: { ...info, em: hoje() } };
  await DB.salvaConfig({ ...S.config, triagem: tri });
}
function vTriagem(el) {
  if (!admin()) { S.view = 'painel'; return render(); }
  const tri = S.config.triagem || {}; const lista = PEND(); const falta = pendTriagem();
  const ROT = { finalizado: ['verde', '✔ Finalizado'], historico: ['verde', '✔ Já estava no histórico'], esteira: ['azul', '▶ Na esteira'], pausado: ['amarelo', '⏸ Pausado'], desistencia: ['vermelho', '✕ Desistência'], ignorado: ['', 'Ignorado'] };
  el.innerHTML = `
  <div class="topo"><h2>Triagem da planilha</h2><span class="chip ${falta.length ? 'amarelo' : 'verde'}">${falta.length} de ${lista.length} para decidir</span>
    <div class="sub">Itens que estavam abertos na aba "controle para os chefes". Para cada um: marque se já foi finalizado, se houve desistência, ou monte a esteira com os presets e indique onde ele está agora.</div></div>
  ${lista.length ? `<div style="display:flex;flex-direction:column;gap:10px">${lista.map(x => { const t = tri[x.chave]; const proc = t && t.pid && S.processos.find(p => p.id === t.pid); return `
    <div class="card tri ${t ? 'feito' : ''}">
      <div><div class="nome">${h(x.cliente)} <span class="chip">${h(x.tipo)}</span> ${x.dica ? `<span class="chip verde">${h(x.dica)}</span>` : ''}</div>
        <div class="serv">${h(x.servico)}</div>
        <div class="st">Último status na planilha: <b>${h(x.status || '—')}</b>${x.data ? ` · ${fmtD(x.data)}` : ''}</div></div>
      <div class="bts">${t ? `<span class="chip ${ROT[t.acao]?.[0] || ''}">${ROT[t.acao]?.[1] || t.acao}</span>${proc ? `<button class="btn sm" data-ver="${proc.id}">Abrir</button>` : ''}<button class="btn sm ghost" data-desfaz="${x.chave}">Desfazer</button><button class="btn sm ghost" data-exc="${x.chave}" title="Tirar da lista de triagem">🗑</button>` : `
        <button class="btn sm ok" data-fin="${x.chave}">✔ Já finalizado</button>
        <button class="btn sm pri" data-est="${x.chave}">▶ Montar esteira</button>
        <button class="btn sm warn" data-pau="${x.chave}">⏸ Pausado</button>
        <button class="btn sm dang" data-des="${x.chave}">✕ Desistiu</button>
        <button class="btn sm ghost" data-ign="${x.chave}">Ignorar</button>
        <button class="btn sm dang" data-exc="${x.chave}" title="Tirar este item da lista de triagem de vez">🗑 Excluir</button>`}</div>
    </div>`; }).join('')}</div>` : '<div class="card vazio">Nenhuma pendência para triar.</div>'}`;
  const item = k => lista.find(x => x.chave === k);
  const pref = x => ({ cliente: x.cliente, tipo_cliente: TIPOS_CLIENTE.includes(x.tipo) ? x.tipo : 'EMPRESA', servico: x.servico, data_inicio: x.data || hoje(), observacoes: `Vindo da planilha. Último status: ${x.status || '—'}` });
  $$('[data-ver]', el).forEach(b => b.onclick = () => abrirDetalhe(b.dataset.ver));
  $$('[data-desfaz]', el).forEach(b => b.onclick = () => { const t = { ...(S.config.triagem || {}) }; const pid = t[b.dataset.desfaz]?.pid; delete t[b.dataset.desfaz];
    acao(async () => { await DB.salvaConfig({ ...S.config, triagem: t }); if (pid && await confirmar('Excluir também o processo que foi criado nesta triagem?')) await DB.del(T.processos, 'id', pid); }, 'Triagem desfeita'); });
  $$('[data-ign]', el).forEach(b => b.onclick = () => acao(() => marcarTriado(b.dataset.ign, { acao: 'ignorado' }), 'Ignorado'));
  $$('[data-exc]', el).forEach(b => b.onclick = async () => { const x = item(b.dataset.exc);
    if (!(await confirmar(`Excluir "${x.cliente}" da lista de triagem?\n\nO item some da triagem de vez. Processos que você já criou a partir dele continuam no app.`))) return;
    acao(async () => {
      await DB.salvaChave('pendencias', PEND().filter(y => y.chave !== x.chave));
      const t = { ...(S.config.triagem || {}) }; if (t[x.chave]) { delete t[x.chave]; await DB.salvaConfig({ ...S.config, triagem: t }); }
    }, 'Excluído da triagem'); });
  $$('[data-est]', el).forEach(b => b.onclick = () => { const x = item(b.dataset.est);
    formProcesso(null, { prefill: pref(x), status: x.status, antesDeSalvar: pid => marcarTriado(x.chave, { acao: 'esteira', pid }), depois: () => { fecharModal(); toast(`${x.cliente} na esteira`); } }); });
  $$('[data-fin]', el).forEach(b => b.onclick = () => { const x = item(b.dataset.fin);
    modal(`<div class="cab"><h3>✔ ${h(x.cliente)} já foi finalizado</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
    <div class="corpo">${x.dica ? `<div class="aviso azul">${h(x.dica)}: se você importou o histórico, ele já está lá. Escolha "Só marcar como resolvido" para não duplicar.</div>` : ''}
    <div class="form">
      <div class="campo c6"><label>O que fazer</label><select id="t-modo"><option value="criar" ${x.dica ? '' : 'selected'}>Registrar como finalizado no app (entra no relatório do mês)</option><option value="historico" ${x.dica ? 'selected' : ''}>Só marcar como resolvido (já está no histórico)</option></select></div>
      <div class="campo c2"><label>Data de conclusão</label><input type="date" id="t-data" value="${hoje()}"></div>
      <div class="campo c2"><label>Gratificação (R$)</label><input type="number" step="0.01" id="t-grat"></div>
      <div class="campo c2"><label>Serviço</label><input id="t-serv" value="${h(x.servico)}"></div>
    </div></div>
    <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn ok" id="t-ok">Confirmar</button></div>`);
    $('#t-ok').onclick = async () => {
      const modo = $('#t-modo').value, d = $('#t-data').value || hoje(), g = $('#t-grat').value;
      if (await acao(async () => {
        if (modo === 'historico') return marcarTriado(x.chave, { acao: 'historico' });
        const pid = uid();
        await DB.ins(T.processos, { id: pid, ...pref(x), servico: $('#t-serv').value.trim() || x.servico, situacao: 'finalizado', data_conclusao: d, gratificacao: g === '' ? null : +g, modo_diario: 'padrao', prioridade: 'normal', aguardando: 'jopec', criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() });
        await registrar(pid, '✔ Processo finalizado (triagem da planilha)', { tipo: 'finalizado', data: d });
        await marcarTriado(x.chave, { acao: 'finalizado', pid });
      }, 'Marcado como finalizado')) fecharModal();
    }; });
  const simples = (attr, sit, titulo, campoMotivo, campoData) => $$(`[${attr}]`, el).forEach(b => b.onclick = () => { const x = item(b.getAttribute(attr));
    modal(`<div class="cab"><h3>${titulo} — ${h(x.cliente)}</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
    <div class="corpo"><div class="form"><div class="campo c4"><label>Motivo</label><input id="t-mot" value="${sit === 'pausado' ? h(x.status) : ''}"></div>
    <div class="campo c2"><label>${campoData}</label><input type="date" id="t-dt" ${sit === 'desistencia' ? `value="${hoje()}"` : ''}></div></div>
    <p style="color:var(--sub);font-size:12.5px">${sit === 'pausado' ? 'Dica: depois você pode abrir o processo em Editar e montar a esteira com o preset, para retomar já no ponto certo.' : ''}</p></div>
    <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn ${sit === 'pausado' ? 'warn' : 'dang'}" id="t-ok">Confirmar</button></div>`);
    $('#t-ok').onclick = async () => { const mot = $('#t-mot').value.trim() || null, dt = $('#t-dt').value || null;
      if (await acao(async () => {
        const pid = uid();
        await DB.ins(T.processos, { id: pid, ...pref(x), situacao: sit, pausa_motivo: sit === 'pausado' ? mot : null, retomar_em: sit === 'pausado' ? dt : null, desistencia_motivo: sit === 'desistencia' ? mot : null, data_conclusao: sit === 'desistencia' ? (dt || hoje()) : null, modo_diario: 'padrao', prioridade: 'normal', aguardando: 'jopec', criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() });
        await registrar(pid, (sit === 'pausado' ? '⏸ Processo pausado' : '✕ Desistência') + (mot ? ': ' + mot : ''), { tipo: sit === 'pausado' ? 'pausa' : 'desistencia', data: sit === 'desistencia' ? (dt || hoje()) : hoje() });
        await marcarTriado(x.chave, { acao: sit, pid });
      }, 'Registrado')) fecharModal();
    }; });
  simples('data-pau', 'pausado', '⏸ Pausado', 'Motivo', 'Retomar em (opcional)');
  simples('data-des', 'desistencia', '✕ Desistência', 'Motivo', 'Data');
}

// ---------------------------------------------------------------- E-MAIL DE ALERTA
function escolherAlerta() {
  const and = S.processos.filter(p => ['andamento', 'pausado'].includes(p.situacao));
  const hojeMov = S.processos.filter(p => atualDe(p.id).some(a => a.data === hoje() && a.tipo !== 'sistema'));
  const parados = and.filter(p => p.situacao === 'andamento' && diasParado(p) >= S.config.alerta_dias);
  modal(`<div class="cab"><h3>✉ Enviar alerta</h3><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo"><p style="margin-top:0">O que entra no e-mail?</p>
    <div style="display:grid;gap:8px">
      <button class="btn" data-op="hoje" style="justify-content:space-between">Só o que teve atualização hoje <span class="chip azul">${hojeMov.length}</span></button>
      <button class="btn" data-op="todos" style="justify-content:space-between">Resumo de todos em andamento e pausados <span class="chip">${and.length}</span></button>
      <button class="btn" data-op="parados" style="justify-content:space-between">Só os parados há ${S.config.alerta_dias}+ dias <span class="chip vermelho">${parados.length}</span></button>
    </div></div>`);
  $$('[data-op]').forEach(b => b.onclick = () => {
    const op = b.dataset.op, lista = op === 'hoje' ? hojeMov : op === 'parados' ? parados : and;
    if (!lista.length) return toast('Nenhum processo nessa opção');
    formAlerta(lista, op === 'hoje' ? `Atualizações de ${new Date().toLocaleDateString('pt-BR')}` : op === 'parados' ? 'Processos parados' : `Resumo dos processos — ${new Date().toLocaleDateString('pt-BR')}`);
  });
}
function montarEmail(lista, titulo, { recado = '', link = '' } = {}) {
  const dataBR = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const hr = new Date().getHours(), saud = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
  const itens = [...lista].sort((a, b) => {
    const peso = p => (p.aguardando === 'chefes' ? 0 : 2) + (atualDe(p.id).some(x => x.data === hoje() && x.tipo !== 'sistema') ? 0 : 1);
    return peso(a) - peso(b) || a.cliente.localeCompare(b.cliente);
  }).map(p => {
    const pr = progresso(p), st = statusAtual(p), hj = atualDe(p.id).filter(a => a.data === hoje() && a.tipo !== 'sistema'), ult = ultimoMovimento(p);
    return { p, pr, hoje: hj.map(a => a.texto.replace(/^[✔▶⏸✕]\s*/, '')).join(' · '), ult, st, parado: diasParado(p),
      etapa: pr.total ? (pr.atual ? pr.atual.nome : 'Todas as etapas concluídas') : '' };
  });
  const and = S.processos.filter(p => p.situacao === 'andamento');
  const k = { and: and.length, hoje: and.filter(p => atualDe(p.id).some(x => x.data === hoje() && x.tipo !== 'sistema')).length,
    chefes: and.filter(p => p.aguardando === 'chefes').length, parados: and.filter(p => diasParado(p) >= S.config.alerta_dias).length };
  const assunto = `Legalização JOPEC · ${new Date().toLocaleDateString('pt-BR')} — ${k.and} em andamento` + (k.hoje ? `, ${k.hoje} com novidade hoje` : '') + (k.chefes ? ` · ${k.chefes} dependem de vocês` : '');
  const situ = it => it.p.situacao === 'pausado' ? '⏸ Pausado' + (it.p.pausa_motivo ? ` (${it.p.pausa_motivo})` : '') : it.p.situacao === 'andamento' ? (it.p.aguardando === 'chefes' ? '⚑ Depende de vocês' : AGUARDANDO[it.p.aguardando] || '') : SITUACOES[it.p.situacao]?.nome.replace(/s$/, '');

  // ---------- texto simples (Gmail / celular)
  const t = [];
  t.push(`${saud}! Segue o resumo da Legalização — ${dataBR}.`);
  if (recado) t.push('', recado);
  t.push('', `▸ ${k.and} processos em andamento · ${k.hoje} com novidade hoje · ${k.parados} parados há ${S.config.alerta_dias}+ dias` + (k.chefes ? ` · ${k.chefes} aguardando decisão de vocês` : ''));
  itens.forEach(it => {
    t.push('', `■ ${it.p.cliente}${it.p.servico ? ' — ' + it.p.servico : ''}`);
    if (it.pr.total) t.push(`  Etapa ${Math.min(it.pr.idx, it.pr.total)} de ${it.pr.total} (${it.pr.pct}%): ${it.etapa}`);
    t.push(it.hoje ? `  Hoje: ${it.hoje}` : `  Último status${it.ult ? ' (' + fmtD(it.ult.data).slice(0, 5) + ')' : ''}: ${it.st.txt}`);
    const extra = [situ(it), it.p.situacao === 'andamento' && it.parado >= S.config.alerta_dias ? `${it.parado} dias sem movimento` : ''].filter(Boolean).join(' · ');
    if (extra) t.push(`  ${extra}`);
    const fc = calcFin(it.p); if (fc.tem) t.push(`  Financeiro: ${FIN_ST[fc.status][0]} · pago ${moedaReal(fc.pago)} de ${moedaReal(fc.valor)}${fc.restante > 0 ? ` · falta ${moedaReal(fc.restante)}` : ''}${fc.atrasado > 0 ? ` (${moedaReal(fc.atrasado)} vencido)` : fc.proximo ? ` · próximo ${fmtD(fc.proximo.data).slice(0, 5)}` : ''}${fc.f.taxas ? ` · taxas: ${FIN_TAXAS[fc.f.taxas].toLowerCase()}` : ''}`);
  });
  { const ft = finTotais(lista); if (ft.valor) t.splice(recado ? 5 : 3, 0, `▸ Financeiro destes processos: ${moedaReal(ft.pago)} recebidos de ${moedaReal(ft.valor)} · falta ${moedaReal(ft.falta)}${ft.atraso ? ` · ${moedaReal(ft.atraso)} em atraso` : ''}`); }
  if (link) t.push('', `Andamento completo, atualizado em tempo real: ${link}`);
  t.push('', 'Qualquer dúvida, estou à disposição.', 'Mateus · Departamento de Legalização · JOPEC');
  const texto = t.join('\n');

  // ---------- HTML (compatível com Gmail, Outlook e celular)
  const V = '#a23133', TX = '#231a1b', SB = '#6b6162', BD = '#e6dfdf';
  const kpi = (n, l, cor) => `<td width="25%" style="padding:4px"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid ${BD};border-radius:10px"><tr><td style="padding:10px 8px;text-align:center"><div style="font:800 24px/1 Arial,sans-serif;color:${cor}">${n}</div><div style="font:600 11px/1.3 Arial,sans-serif;color:${SB};margin-top:4px">${l}</div></td></tr></table></td>`;
  const card = it => {
    const alerta = it.p.situacao === 'andamento' && it.parado >= S.config.alerta_dias;
    const tag = (txt, bg, fg) => `<span style="display:inline-block;background:${bg};color:${fg};border-radius:20px;padding:2px 9px;font:600 11px Arial,sans-serif;margin:2px 4px 0 0">${h(txt)}</span>`;
    return `<tr><td style="padding:6px 0"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid ${BD};border-left:4px solid ${it.p.aguardando === 'chefes' ? '#bf8700' : V};border-radius:10px"><tr><td style="padding:14px 16px">
      <div style="font:700 15px/1.3 Arial,sans-serif;color:${TX}">${h(it.p.cliente)}</div>
      ${it.p.servico ? `<div style="font:13px/1.4 Arial,sans-serif;color:${SB}">${h(it.p.servico)}</div>` : ''}
      ${it.pr.total ? `<div style="font:12px Arial,sans-serif;color:${SB};margin-top:10px">Etapa ${Math.min(it.pr.idx, it.pr.total)} de ${it.pr.total} · <b style="color:${TX}">${h(it.etapa)}</b></div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:5px"><tr><td style="background:#efe9e9;border-radius:6px;height:7px;line-height:7px;font-size:0"><table width="${Math.max(it.pr.pct, 3)}%" cellpadding="0" cellspacing="0"><tr><td style="background:#1a7f37;border-radius:6px;height:7px;line-height:7px;font-size:0">&nbsp;</td></tr></table></td><td width="38" style="font:700 11px Arial,sans-serif;color:${SB};text-align:right">${it.pr.pct}%</td></tr></table>` : ''}
      <div style="font:13px/1.45 Arial,sans-serif;color:${TX};background:#f7f4f4;border-radius:8px;padding:8px 10px;margin-top:10px">${it.hoje ? `<b style="color:#1a7f37">Hoje:</b> ${h(it.hoje)}` : `<b>Último status${it.ult ? ' (' + fmtD(it.ult.data).slice(0, 5) + ')' : ''}:</b> ${h(it.st.txt)}`}</div>
      <div style="margin-top:6px">${it.p.aguardando === 'chefes' && it.p.situacao === 'andamento' ? tag('⚑ Depende de vocês', '#fff4d4', '#8a5a00') : tag(situ(it) || '—', '#f2eded', SB)}${alerta ? tag(`${it.parado} dias sem movimento`, '#fbdcd8', '#b3261e') : ''}</div>
      ${(() => { const fc = calcFin(it.p); if (!fc.tem) return ''; const cor = { quitado: '#1a7f37', atrasado: '#b3261e', parcial: '#8a5a00' }[fc.status] || SB; return `<div style="font:12.5px/1.5 Arial,sans-serif;color:${TX};border-top:1px dashed ${BD};margin-top:10px;padding-top:8px">💰 <b style="color:${cor}">${FIN_ST[fc.status][0]}</b> · pago <b>${moedaReal(fc.pago)}</b> de ${moedaReal(fc.valor)}${fc.restante > 0 ? ` · falta <b>${moedaReal(fc.restante)}</b>` : ''}${fc.atrasado > 0 ? ` · <b style="color:#b3261e">${moedaReal(fc.atrasado)} vencido</b>` : fc.proximo ? ` · próximo em ${fmtD(fc.proximo.data)}` : ''}${fc.f.taxas ? `<br><span style="color:${SB}">Taxas: ${h(FIN_TAXAS[fc.f.taxas])}${fc.f.taxas_valor ? ' (' + moedaReal(fc.f.taxas_valor) + ')' : ''}</span>` : ''}</div>`; })()}
    </td></tr></table></td></tr>`;
  };
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f0f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0f0"><tr><td align="center" style="padding:20px 10px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px">
    <tr><td style="background:${V};background-image:linear-gradient(120deg,#a23133,#75232a);border-radius:14px 14px 0 0;padding:20px 22px">
      <div style="font:800 22px Arial,sans-serif;color:#fff;letter-spacing:.3px">JOPEC</div>
      <div style="font:600 13px Arial,sans-serif;color:#f2cfd0;margin-top:2px">Legalização · ${h(titulo)}</div></td></tr>
    <tr><td style="background:#faf8f8;padding:18px 18px 8px;border:1px solid ${BD};border-top:0">
      <div style="font:15px/1.5 Arial,sans-serif;color:${TX}">${saud}! Segue o resumo da Legalização de <b>${h(dataBR)}</b>.</div>
      ${recado ? `<div style="font:14px/1.5 Arial,sans-serif;color:${TX};background:#fff4d4;border-radius:8px;padding:10px 12px;margin-top:10px">${h(recado).replace(/\n/g, '<br>')}</div>` : ''}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px"><tr>${kpi(k.and, 'Em andamento', TX)}${kpi(k.hoje, 'Novidade hoje', '#1a7f37')}${kpi(k.chefes, 'Dependem de vocês', '#8a5a00')}${kpi(k.parados, `Parados ${S.config.alerta_dias}+ dias`, '#b3261e')}</tr></table>
      ${(() => { const ft = finTotais(lista); return ft.valor ? `<div style="font:13px/1.5 Arial,sans-serif;color:${TX};background:#fff;border:1px solid ${BD};border-radius:10px;padding:10px 12px;margin-top:8px">💰 <b>Financeiro:</b> ${moedaReal(ft.pago)} recebidos de ${moedaReal(ft.valor)} · falta <b>${moedaReal(ft.falta)}</b>${ft.atraso ? ` · <b style="color:#b3261e">${moedaReal(ft.atraso)} em atraso</b>` : ''}</div>` : ''; })()}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${itens.map(card).join('')}</table>
      ${link ? `<table cellpadding="0" cellspacing="0" style="margin:14px auto 6px"><tr><td style="background:${V};border-radius:10px"><a href="${h(link)}" style="display:inline-block;padding:12px 22px;font:700 14px Arial,sans-serif;color:#fff;text-decoration:none">Ver andamento completo →</a></td></tr></table>` : ''}
      <div style="font:13px/1.5 Arial,sans-serif;color:${SB};margin:16px 0 8px">Qualquer dúvida, estou à disposição.<br><b style="color:${TX}">Mateus</b> · Departamento de Legalização · JOPEC</div>
    </td></tr>
    <tr><td style="font:11px Arial,sans-serif;color:#9a8f90;text-align:center;padding:12px">Enviado pelo Controle de Legalização JOPEC</td></tr>
  </table></td></tr></table></body></html>`;
  return { assunto, texto, html };
}
async function formAlerta(lista, titulo) {
  let link = '';
  try { if (!MODO_DEMO) { const r = await sb.from('leg_link_publico').select('token').eq('ativo', true).limit(1); if (r.data && r.data[0]) link = urlPublica(r.data[0].token); } } catch {}
  let { assunto, texto, html } = montarEmail(lista, titulo, { link });
  modal(`<div class="cab"><div style="flex:1"><h3>✉ Alerta por e-mail</h3><div class="sub">De ${h(S.config.email_remetente)} · ${lista.length} processo(s)</div></div><button class="btn ghost" data-fechar aria-label="Fechar">✕</button></div>
  <div class="corpo"><div class="form">
    <div class="campo c6"><label>Para</label><input id="e-para" value="${h(S.config.email_para)}"></div>
    <div class="campo c6"><label>Cópia (CC)</label><input id="e-cc" value="${h(S.config.email_cc)}"></div>
    <div class="campo c6"><label>Assunto</label><input id="e-ass" value="${h(assunto)}"></div>
    <div class="campo c6"><label>Recado no topo (opcional)</label><textarea id="e-rec" style="min-height:60px" placeholder="Ex.: Preciso de um retorno sobre a Marmo até amanhã."></textarea></div>
  </div>
  <div class="tabs" style="margin-top:14px"><button class="tab on" data-ev="ver">👁 Como vai chegar</button><button class="tab" data-ev="txt">✎ Texto simples</button></div>
  <iframe id="e-prev" style="width:100%;height:520px;border:1px solid var(--borda);border-radius:12px;background:#f3f0f0"></iframe>
  <textarea id="e-txt" style="display:none;width:100%;min-height:360px;padding:10px;border:1px solid var(--borda);border-radius:12px;font-family:inherit">${h(texto)}</textarea>
  ${MODO_DEMO ? '<div class="aviso amarelo" style="margin-top:10px">Modo demonstração: o envio automático só funciona com o Supabase ligado. Use "Abrir no Gmail".</div>' : ''}</div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn" id="e-gmail">Abrir no Gmail</button><button class="btn pri" id="e-env" ${MODO_DEMO ? 'disabled' : ''}>Enviar agora</button></div>`, 'lg');
  let textoEditado = false;
  const atualiza = () => { const r = montarEmail(lista, titulo, { recado: $('#e-rec').value.trim(), link }); html = r.html; if (!textoEditado) { texto = r.texto; $('#e-txt').value = texto; } $('#e-prev').srcdoc = html; };
  atualiza();
  $('#e-rec').oninput = atualiza;
  $('#e-txt').oninput = () => textoEditado = true;
  $$('[data-ev]').forEach(b => b.onclick = () => { $$('[data-ev]').forEach(x => x.classList.toggle('on', x === b)); const v = b.dataset.ev === 'ver'; $('#e-prev').style.display = v ? '' : 'none'; $('#e-txt').style.display = v ? 'none' : ''; });
  const editado = () => textoEditado;
  $('#e-gmail').onclick = () => {
    const u = new URL('https://mail.google.com/mail/'); u.searchParams.set('authuser', S.config.email_remetente); u.searchParams.set('view', 'cm'); u.searchParams.set('fs', '1');
    u.searchParams.set('to', $('#e-para').value); u.searchParams.set('cc', $('#e-cc').value); u.searchParams.set('su', $('#e-ass').value); u.searchParams.set('body', $('#e-txt').value);
    window.open(u.toString(), '_blank');
  };
  $('#e-env').onclick = async () => {
    const b = $('#e-env'); b.disabled = true; b.textContent = 'Enviando…';
    try {
      const { data, error } = await sb.functions.invoke('enviar-alerta', { body: { para: $('#e-para').value, cc: $('#e-cc').value, assunto: $('#e-ass').value, texto: $('#e-txt').value, html: editado() ? `<pre style="font-family:Segoe UI,Arial;white-space:pre-wrap">${h($('#e-txt').value)}</pre>` : html } });
      if (error || data?.erro) {
        let msg = data?.erro || error.message;
        try { const corpo = await error?.context?.json(); if (corpo?.erro) msg = corpo.erro; } catch {}
        if (/credentials|username and password|535|PLAIN|auth/i.test(msg)) msg = 'O Gmail recusou o login. Falta cadastrar (ou está errada) a senha de app do Gmail no Supabase: Edge Functions → Secrets → GMAIL_APP_PASSWORD.';
        else if (/permiss/i.test(msg)) msg = 'Só o administrador pode enviar alertas.';
        throw new Error(msg);
      }
      fecharModal(); toast('E-mail enviado para os chefes ✔');
    } catch (err) { b.disabled = false; b.textContent = 'Enviar agora'; avisar('Não foi possível enviar: ' + err.message + '\n\nUse "Abrir no Gmail" enquanto isso.'); }
  };
}


// ---------------------------------------------------------------- link público
const urlPublica = t => `${location.origin}${location.pathname}?p=${encodeURIComponent(t)}`;
async function desenharLinkPublico() {
  const box = $('#c-link'); if (!box) return;
  let ativo = null;
  try { ativo = MODO_DEMO ? (DB.demo().leg_link_publico || []).find(r => r.ativo) : ((await sb.from('leg_link_publico').select('*').eq('ativo', true).limit(1)).data || [])[0]; } catch (e) { console.warn(e); }
  box.innerHTML = ativo ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input class="busca" style="max-width:none;flex:1" readonly value="${h(urlPublica(ativo.token))}" id="lk-url">
      <button class="btn pri" id="lk-copiar">Copiar link</button><a class="btn" href="${h(urlPublica(ativo.token))}" target="_blank">Abrir</a></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" id="lk-novo">↻ Gerar link novo (o atual para de funcionar)</button><button class="btn dang" id="lk-off">Desativar link</button></div>`
    : `<p style="margin-top:0">Nenhum link público ativo.</p><button class="btn pri" id="lk-novo">Gerar link público</button>`;
  if (!box.isConnected) return; // a pessoa já saiu da tela de Configurações
  const novoToken = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  const salvar = async (fn) => { try { await fn(); desenharLinkPublico(); } catch (e) { avisar('Não foi possível: ' + (e.message || e)); } };
  const bc = $('#lk-copiar'); if (bc) bc.onclick = async () => { try { await navigator.clipboard.writeText($('#lk-url').value); toast('Link copiado'); } catch { $('#lk-url').select(); document.execCommand('copy'); toast('Link copiado'); } };
  const bn = $('#lk-novo', box); if (bn) bn.onclick = () => salvar(async () => {
    const t = novoToken();
    if (MODO_DEMO) { const db = DB.demo(); db.leg_link_publico = [{ token: t, ativo: true }]; DB.salvaDemo(db); return; }
    await sb.from('leg_link_publico').update({ ativo: false }).eq('ativo', true);
    const { error } = await sb.from('leg_link_publico').insert({ token: t, ativo: true }); if (error) throw error;
    toast('Link novo gerado');
  });
  const bo = $('#lk-off'); if (bo) bo.onclick = async () => { if (await confirmar('Desativar o link público? Quem tiver o link não verá mais nada.')) salvar(async () => {
    if (MODO_DEMO) { const db = DB.demo(); db.leg_link_publico = []; DB.salvaDemo(db); return; }
    const { error } = await sb.from('leg_link_publico').update({ ativo: false }).eq('ativo', true); if (error) throw error; toast('Link desativado'); }); };
}

// Página pública (somente leitura, sem login): ?p=TOKEN
async function telaPublica(token) {
  document.body.className = 'publico';
  $('#app').innerHTML = `<div class="carregando">Carregando andamento…</div>`;
  let dados = null;
  try {
    if (MODO_DEMO) {
      const db = DB.demo(); if (!(db.leg_link_publico || []).some(r => r.ativo && r.token === token)) throw new Error('x');
      const et = db[T.etapas] || [], at = db[T.atual] || [];
      dados = { gerado: new Date().toISOString(), processos: (db[T.processos] || []).filter(p => ['andamento', 'pausado', 'finalizado', 'desistencia'].includes(p.situacao)).map(p => ({ ...p,
        etapas: et.filter(e => e.processo_id === p.id).sort((a, b) => a.ordem - b.ordem), ultimo: at.filter(a => a.processo_id === p.id && a.tipo !== 'sistema').sort((a, b) => (b.data + b.criado_em).localeCompare(a.data + a.criado_em))[0] || null })) };
    } else {
      const { data, error } = await sb.rpc('leg_painel_publico', { p_token: token }); if (error) throw error; dados = data;
    }
  } catch (e) { console.warn(e); }
  if (!dados) { $('#app').innerHTML = `<div class="login"><div class="login-box" style="text-align:center"><h1 style="font-family:var(--f-display)">Link inválido ou desativado</h1><p>Peça um link novo ao Departamento de Legalização da JOPEC.</p></div></div>`; return; }
  const PS = { aba: 'andamento', busca: '', abertos: new Set() };
  const lista = dados.processos || [];
  const AGCOR = { cliente: 'amarelo', orgao: 'roxo', chefes: 'azul' };
  const diasDesde = d => d ? Math.max(0, Math.round((parseD(hoje()) - parseD(d)) / 864e5)) : null;
  const desenhar = () => {
    const q = normEt(PS.busca);
    const n = k => lista.filter(p => p.situacao === k).length;
    const abas = ['andamento', 'pausado', 'finalizado', 'desistencia'].filter(k => k === 'andamento' || n(k));
    if (!abas.includes(PS.aba)) PS.aba = 'andamento';
    const vis = lista.filter(p => p.situacao === PS.aba && (!q || normEt(p.cliente + ' ' + (p.servico || '')).includes(q)))
      .sort((a, b) => PS.aba === 'andamento' ? a.cliente.localeCompare(b.cliente, 'pt-BR') : (b.data_conclusao || '').localeCompare(a.data_conclusao || ''));
    $('#app').innerHTML = `
    <div class="shell"><header class="band"><div class="wrap topbar"><div class="brand">${LOGO_MARCA}<div>${LOGO_NOME}<h1>Legalização · Andamento dos processos</h1></div></div>
      <div class="usr"><span class="papel">👁 Somente leitura</span>${botaoTema()}</div></div></header>
    <main class="main wrap pub">
      <div class="topo"><h2>Andamento dos processos</h2>
        <div class="sub">Atualizado às ${new Date(dados.gerado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} de ${new Date(dados.gerado).toLocaleDateString('pt-BR')} · a página se atualiza sozinha</div></div>
      <div class="pub-barra">
        <div class="tabs">${abas.map(k => `<button class="tab ${PS.aba === k ? 'on' : ''}" data-pa="${k}">${SITUACOES[k].nome}<span class="n">${n(k)}</span></button>`).join('')}</div>
        ${lista.length > 6 ? `<input class="busca busca-proc" id="pb" type="search" placeholder="Buscar empresa…" value="${h(PS.busca)}" aria-label="Buscar empresa">` : ''}
      </div>
      ${vis.length ? `<div class="pub-lista">${vis.map(p => {
        const es = (p.etapas || []).filter(e => e.status !== 'dispensada'); const ok = es.filter(e => e.status === 'concluida').length;
        const at = es.find(e => e.status === 'andamento') || es.find(e => e.status === 'pendente');
        const pct = es.length ? Math.round(ok / es.length * 100) : 0;
        const ag = p.aguardando || 'jopec', dd = p.ultimo ? diasDesde(p.ultimo.data) : null, aberto = PS.abertos.has(p.id);
        const chips = [
          p.situacao === 'andamento' && ag !== 'jopec' ? `<span class="chip ${AGCOR[ag] || ''}">${h(AGUARDANDO[ag])}</span>` : '',
          p.situacao === 'pausado' ? `<span class="chip amarelo">⏸ pausado${p.retomar_em ? ' até ' + fmtD(p.retomar_em).slice(0, 5) : ''}</span>` : '',
          p.situacao === 'finalizado' ? `<span class="chip verde">✓ finalizado em ${fmtD(p.data_conclusao)}</span>` : '',
          p.situacao === 'desistencia' && p.data_conclusao ? `<span class="chip">desistiu em ${fmtD(p.data_conclusao)}</span>` : '',
        ].join('');
        return `<article class="card pub-card ${p.situacao}">
          <div class="pub-l1"><div class="pub-nm"><b>${h(p.cliente)}</b>${p.servico ? `<span>${h(p.servico)}</span>` : ''}</div>${chips ? `<div class="pub-chips">${chips}</div>` : ''}</div>
          ${es.length && p.situacao !== 'desistencia' ? `<div class="pub-et"><div><span>${p.situacao === 'finalizado' ? 'Todas as etapas concluídas' : at ? `Etapa ${es.indexOf(at) + 1} de ${es.length} · <b>${h(at.nome)}</b>` : `${ok} de ${es.length} etapas`}</span><span class="pct">${pct}%</span></div><div class="barra"><div style="width:${pct}%"></div></div></div>` : ''}
          ${p.situacao === 'pausado' && p.pausa_motivo ? `<div class="pub-mot">Motivo da pausa: ${h(p.pausa_motivo)}</div>` : ''}
          ${p.situacao === 'desistencia' && p.desistencia_motivo ? `<div class="pub-mot">Motivo: ${h(p.desistencia_motivo)}</div>` : ''}
          ${p.ultimo && p.situacao !== 'desistencia' ? `<div class="pub-ult"><span>${dd === 0 ? 'Hoje' : dd === 1 ? 'Ontem' : fmtD(p.ultimo.data).slice(0, 5)}</span>${h(p.ultimo.texto)}</div>` : ''}
          ${es.length && p.situacao !== 'desistencia' ? `<button class="pub-ver" data-ver="${p.id}" aria-expanded="${aberto}">${aberto ? 'Ocultar etapas ▴' : `Ver as ${es.length} etapas ▾`}</button>
            ${aberto ? `<ol class="pub-passos">${es.map(e => `<li class="${e.status}"><i>${e.status === 'concluida' ? '✓' : ''}</i><span>${h(e.nome)}</span><small>${e.status === 'concluida' ? fmtD(e.concluida_em) : e.status === 'andamento' ? 'em andamento' : ''}</small></li>`).join('')}</ol>` : ''}` : ''}
        </article>`; }).join('')}</div>` : `<div class="card vazio">${q ? 'Nenhuma empresa encontrada.' : 'Nada por aqui.'}</div>`}
    </main></div>`;
    $$('[data-pa]').forEach(b => b.onclick = () => { PS.aba = b.dataset.pa; desenhar(); });
    $$('[data-ver]').forEach(b => b.onclick = () => { const id = b.dataset.ver; PS.abertos.has(id) ? PS.abertos.delete(id) : PS.abertos.add(id); desenhar(); });
    ligarTema();
    const pb = $('#pb'); if (pb) pb.oninput = () => { PS.busca = pb.value; const pos = pb.selectionStart; desenhar(); const n = $('#pb'); n.focus(); n.setSelectionRange(pos, pos); };
  };
  desenhar();
  // atualiza sozinho a cada 5 minutos
  setInterval(async () => { try { if (MODO_DEMO) return; const { data } = await sb.rpc('leg_painel_publico', { p_token: token }); if (data) { dados = data; lista.splice(0, lista.length, ...(data.processos || [])); desenhar(); } } catch {} }, 5 * 60 * 1000);
}

// ---------------------------------------------------------------- modal
function modal(html, cls = '', camada = 1) {
  const R = camada === 2 ? '#modal-root2' : '#modal-root';
  if (camada === 1) $('#modal-root2').innerHTML = '';
  $(R).innerHTML = `<div class="fundo"><div class="modal ${cls}">${html}</div></div>`;
  $$(R + ' [data-fechar]').forEach(b => b.onclick = () => fecharModal(camada));
  $(R + ' .fundo').onmousedown = e => { if (e.target.classList.contains('fundo')) fecharModal(camada); };
  document.body.classList.add('com-modal');
  $(R + ' .modal').setAttribute('role', 'dialog'); $(R + ' .modal').setAttribute('aria-modal', 'true');
}
function fecharModal(camada = 1) { if (camada === 2) $('#modal-root2').innerHTML = ''; else { $('#modal-root').innerHTML = ''; $('#modal-root2').innerHTML = ''; } if (!$('#modal-root').innerHTML) document.body.classList.remove('com-modal'); }
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if ($('#modal-root2').innerHTML) fecharModal(2); else if ($('#modal-root').innerHTML) fecharModal(); });

// ---------------------------------------------------------------- início
async function iniciar() {
  try {
    if (MODO_DEMO) {
      S.papel = sessionStorage.getItem('leg_demo_papel'); if (!S.papel) return telaLogin();
    } else {
      const { data } = await sb.auth.getSession();
      if (!data.session) return telaLogin();
      S.email = data.session.user.email;
      S.papel = (CFG.EMAILS_ADMIN || [CFG.EMAIL_ADMIN]).map(e => String(e).toLowerCase()).includes(S.email.toLowerCase()) ? 'admin' : 'equipe';
    }
    await carregar(); render();
  } catch (err) { console.error(err); $('#app').innerHTML = `<div class="vazio">Erro ao carregar: ${h(err.message || err)}<br><br><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`; }
}
(async () => {
  await DB.init();
  const tk = new URLSearchParams(location.search).get('p');
  if (tk) return telaPublica(tk);
  iniciar();
})();
// atualiza sozinho a cada 5 min (para quem deixa aberto o dia todo)
setInterval(async () => { if (S.papel && !document.body.classList.contains('publico') && !$('#modal-root').innerHTML) { await carregar(); render(); } }, 5 * 60 * 1000);
