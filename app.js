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
const moeda = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fimDeSemana = d => d.getDay() === 0 || d.getDay() === 6;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2400); }
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
  async salvaConfig(valor) {
    if (MODO_DEMO) { const db = this.demo(); db[T.config] = [{ chave: 'geral', valor }]; this.salvaDemo(db); return; }
    const { error } = await sb.from(T.config).upsert({ chave: 'geral', valor }); if (error) throw error;
  },
};

const S = { papel: null, email: '', view: 'painel', aba: 'andamento', busca: '', presets: [], processos: [], etapas: [], atual: [], config: { ...CONFIG_PADRAO }, mesRel: hoje().slice(0, 7) };
const admin = () => S.papel === 'admin';

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
  catch (err) { console.error(err); alert('Não foi possível salvar: ' + (err.message || err)); return false; }
}

// ---------------------------------------------------------------- regras do processo
const etapasDe = id => S.etapas.filter(e => e.processo_id === id).sort((a, b) => a.ordem - b.ordem);
const atualDe = id => S.atual.filter(a => a.processo_id === id).sort((a, b) => (a.data + a.criado_em).localeCompare(b.data + b.criado_em));
const presetDe = p => S.presets.find(x => x.id === p.preset_id);
const corDe = p => presetDe(p)?.cor || '#1f6feb';
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
    <img src="icons/icon.svg" width="52" height="52" alt="">
    <h1>Controle de Legalização</h1>
    <p>JOPEC Serviços Administrativos</p>
    ${MODO_DEMO ? `<div class="perfis">
      <button type="button" class="perfil ${perfil === 'equipe' ? 'on' : ''}" data-p="equipe"><b>👁 Equipe</b><span>Somente visualizar</span></button>
      <button type="button" class="perfil ${perfil === 'admin' ? 'on' : ''}" data-p="admin"><b>🔑 Administrador</b><span>Acesso total</span></button>
    </div>` : `<div class="campo c6" style="margin-bottom:12px"><label>E-mail</label><input type="email" id="email" autocomplete="username" required value="${h(emailAnt || localStorage.getItem('leg_ultimo_email') || '')}"></div>`}
    <div class="campo c6"><label>Senha</label><input type="password" id="senha" autocomplete="current-password" required></div>
    ${erro ? `<div class="aviso vermelho" style="margin-top:12px">${h(erro)}</div>` : ''}
    <button class="btn pri" style="width:100%;justify-content:center;margin-top:16px;padding:11px">Entrar</button>
    ${MODO_DEMO ? `<div class="demo-aviso">Modo demonstração (Supabase ainda não configurado). Senhas: equipe = <b>${h(CFG.DEMO_SENHA_EQUIPE)}</b>, administrador = <b>${h(CFG.DEMO_SENHA_ADMIN)}</b>. Os dados ficam só neste navegador.</div>` : ''}
  </form></div>`;
  $$('.perfil').forEach(b => b.onclick = () => { sessionStorage.setItem('leg_perfil_sel', b.dataset.p); $$('.perfil').forEach(x => x.classList.toggle('on', x === b)); });
  const foco = $('#email') && !$('#email').value ? $('#email') : $('#senha'); foco.focus();
  $('#f-login').onsubmit = async ev => {
    ev.preventDefault();
    const senha = $('#senha').value;
    if (MODO_DEMO) {
      const p = $('.perfil.on').dataset.p;
      if (senha !== (p === 'admin' ? CFG.DEMO_SENHA_ADMIN : CFG.DEMO_SENHA_EQUIPE)) return telaLogin('Senha incorreta.');
      sessionStorage.setItem('leg_demo_papel', p); return iniciar();
    }
    const email = $('#email').value.trim().toLowerCase();
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
  ['painel', '◉', 'Painel do dia'], ['processos', '☰', 'Processos'], ['cardapio', '▤', 'Cardápio de etapas'],
  ['relatorio', '₿', 'Relatório mensal'], ['triagem', '⇄', 'Triagem da planilha'], ['config', '⚙', 'Configurações'],
];
function render() {
  document.body.className = 'papel-' + S.papel;
  const nAnd = S.processos.filter(p => p.situacao === 'andamento').length;
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="marca"><img src="icons/icon.svg" alt=""><div><b>Legalização</b><small>JOPEC</small></div></div>
      ${NAV.map(([k, ic, nm]) => `<button class="nav ${S.view === k ? 'on' : ''} ${k === 'config' || k === 'triagem' ? 'adm' : ''}" data-v="${k}"><span class="ic">${ic}</span>${nm}${k === 'processos' ? `<span class="n">${nAnd}</span>` : ''}${k === 'triagem' && pendTriagem().length ? `<span class="n">${pendTriagem().length}</span>` : ''}</button>`).join('')}
      <div class="side-rodape"><span class="papel">${admin() ? '🔑 Administrador' : '👁 Somente leitura'}</span>${S.email ? `<div style="word-break:break-all;margin-bottom:4px">${h(S.email)}</div>` : ''}${MODO_DEMO ? '<div>Modo demonstração</div>' : ''}<div><button class="btn sm ghost" style="color:#cfdbea;padding-left:0" id="b-sair">Sair</button></div></div>
    </aside>
    <main class="main" id="main"></main>
  </div>
  <nav class="mobnav">${NAV.filter(n => admin() || !['config', 'triagem'].includes(n[0])).filter(n => n[0] !== 'triagem' || pendTriagem().length).map(([k, ic, nm]) => `<button class="${S.view === k ? 'on' : ''}" data-v="${k}"><span class="ic">${ic}</span>${nm.split(' ')[0]}</button>`).join('')}</nav>`;
  $$('[data-v]').forEach(b => b.onclick = () => { S.view = b.dataset.v; render(); window.scrollTo(0, 0); });
  $('#b-sair').onclick = sair;
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
    </div></div>`;
}
function ligarCartoes(el) { $$('[data-proc]', el).forEach(c => c.onclick = () => abrirDetalhe(c.dataset.proc)); }

// ---------------------------------------------------------------- PAINEL
function vPainel(el) {
  const and = S.processos.filter(p => p.situacao === 'andamento');
  const parados = and.filter(p => diasParado(p) >= S.config.alerta_dias).sort((a, b) => diasParado(b) - diasParado(a));
  const pausaVencida = S.processos.filter(p => p.situacao === 'pausado' && p.retomar_em && p.retomar_em <= hoje());
  const mes = hoje().slice(0, 7);
  const fimMes = S.processos.filter(p => p.situacao === 'finalizado' && (p.data_conclusao || '').startsWith(mes));
  const semHoje = and.filter(p => !atualDe(p.id).some(a => a.data === hoje()));
  const d = new Date();
  el.innerHTML = `
  <div class="topo"><h2>Painel do dia</h2>
    <button class="btn adm" id="b-alerta">✉ Enviar alerta do dia</button>
    <button class="btn pri adm" id="b-novo">＋ Novo processo</button>
    <div class="sub">${d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} · modo padrão do diário: <b>${S.config.modo_padrao === 'repetir' ? 'repetir o último status' : 'sem movimentação'}</b></div></div>
  <div class="kpis">
    <div class="card kpi" data-ir="andamento"><div class="v">${and.length}</div><div class="l">Em andamento</div></div>
    <div class="card kpi alerta" data-ir="andamento"><div class="v">${parados.length}</div><div class="l">Parados há ${S.config.alerta_dias}+ dias</div></div>
    <div class="card kpi atenc" data-ir="andamento"><div class="v">${and.filter(p => p.aguardando === 'cliente').length}</div><div class="l">Aguardando cliente</div></div>
    <div class="card kpi atenc" data-ir="pausado"><div class="v">${S.processos.filter(p => p.situacao === 'pausado').length}</div><div class="l">Pausados${pausaVencida.length ? ` · ${pausaVencida.length} para retomar` : ''}</div></div>
    <div class="card kpi bom" data-rel="1"><div class="v">${fimMes.length}</div><div class="l">Finalizados no mês · ${moeda(fimMes.reduce((s, p) => s + (+p.gratificacao || 0), 0))}</div></div>
  </div>
  ${pausaVencida.length ? `<div class="aviso amarelo">⏰ Pausas com data de retomada vencida: ${pausaVencida.map(p => `<a href="#" data-proc="${p.id}">${h(p.cliente)}</a>`).join(', ')}</div>` : ''}
  <div class="secao"><h3>Rotina de hoje</h3><span class="dica">Escreva o status do dia. Se ficar em branco, o processo segue o modo dele (${S.config.modo_padrao === 'repetir' ? 'repete o último status' : 'fica sem movimentação'}).</span></div>
  <div class="card">
    ${and.length ? and.sort((a, b) => a.cliente.localeCompare(b.cliente)).map(p => {
      const feito = atualDe(p.id).filter(a => a.data === hoje()).at(-1); const st = statusAtual(p); const pr = progresso(p);
      return `<div class="rotina-linha ${feito ? 'feito' : ''}">
        <div class="nm"><b><a href="#" data-proc="${p.id}" style="color:inherit">${h(p.cliente)}</a></b><small>${h(pr.atual ? pr.atual.nome : (p.servico || ''))}</small></div>
        ${admin() ? `<input data-rot="${p.id}" placeholder="${h(st.txt)}${st.rep ? ' (mantido)' : ''}" value="${feito ? h(feito.texto) : ''}" ${feito ? 'data-ja="1"' : ''} list="dl-frases">` : `<div>${st.auto ? `<i style="color:var(--sub)">${h(st.txt)}</i>` : h(st.txt)}</div>`}
        <span class="chip ${feito ? 'verde' : ''}">${feito ? '✔ registrado' : (modoDe(p) === 'repetir' ? 'repete' : 'sem mov.')}</span></div>`;
    }).join('') : '<div class="vazio">Nenhum processo em andamento.</div>'}
    ${admin() && and.length ? `<div class="ed-barra" style="justify-content:flex-end"><span class="dica" style="margin-right:auto;color:var(--sub);font-size:12px">${semHoje.length} sem registro hoje</span><button class="btn pri" id="b-rotina">Salvar rotina do dia</button></div>` : ''}
  </div>
  <datalist id="dl-frases">${S.config.frases.map(f => `<option value="${h(f)}">`).join('')}</datalist>
  ${parados.length ? `<div class="secao"><h3>⚠ Precisam de atenção</h3><span class="dica">Sem movimento real há ${S.config.alerta_dias} dias ou mais</span></div><div class="grade">${parados.map(cartao).join('')}</div>` : ''}`;
  $$('[data-ir]', el).forEach(k => k.onclick = () => { S.view = 'processos'; S.aba = k.dataset.ir; render(); });
  $$('[data-rel]', el).forEach(k => k.onclick = () => { S.view = 'relatorio'; render(); });
  $$('a[data-proc]', el).forEach(a => a.onclick = e => { e.preventDefault(); abrirDetalhe(a.dataset.proc); });
  ligarCartoes(el);
  const bn = $('#b-novo', el); if (bn) bn.onclick = () => formProcesso();
  const bal = $('#b-alerta', el); if (bal) bal.onclick = () => escolherAlerta();
  const br = $('#b-rotina', el); if (br) br.onclick = () => acao(async () => {
    for (const inp of $$('[data-rot]', el)) {
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
  const q = S.busca.toLowerCase();
  let lista = S.processos.filter(p => p.situacao === S.aba && (!q || [p.cliente, p.cnpj, p.servico, p.responsavel].join(' ').toLowerCase().includes(q)));
  lista.sort((a, b) => S.aba === 'andamento' ? diasParado(b) - diasParado(a) : (b.data_conclusao || b.atualizado_em || '').localeCompare(a.data_conclusao || a.atualizado_em || ''));
  el.innerHTML = `
  <div class="topo"><h2>Processos</h2><input class="busca" id="busca" placeholder="Buscar cliente, CNPJ, serviço…" value="${h(S.busca)}">
    <button class="btn nao-imprimir" id="b-imp">🖨 Controle para os chefes</button>
    <button class="btn pri adm" id="b-novo">＋ Novo processo</button></div>
  <div class="tabs">${Object.entries(SITUACOES).map(([k, v]) => `<button class="tab ${S.aba === k ? 'on' : ''}" data-aba="${k}">${v.ic} ${v.nome}<span class="n">${cont(k)}</span></button>`).join('')}</div>
  ${lista.length ? `<div class="grade">${lista.map(cartao).join('')}</div>` : `<div class="card vazio">Nada por aqui.</div>`}`;
  $$('[data-aba]', el).forEach(b => b.onclick = () => { S.aba = b.dataset.aba; render(); });
  const bu = $('#busca', el); bu.oninput = () => { S.busca = bu.value; const pos = bu.selectionStart; render(); const n = $('#busca'); n.focus(); n.setSelectionRange(pos, pos); };
  ligarCartoes(el);
  const bn = $('#b-novo', el); if (bn) bn.onclick = () => formProcesso();
  $('#b-imp', el).onclick = imprimirChefes;
}
function imprimirChefes() {
  const and = S.processos.filter(p => ['andamento', 'pausado'].includes(p.situacao)).sort((a, b) => a.cliente.localeCompare(b.cliente));
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Legalização em andamento</title><style>body{font-family:Segoe UI,Arial;padding:24px;color:#1c2533}h1{font-size:18px;margin:0}p{color:#5b6b80;margin:4px 0 16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #d5dbe3;padding:6px 8px;text-align:left;vertical-align:top}th{background:#0f2a4a;color:#fff}</style></head><body>
  <h1>LEGALIZAÇÃO EM ANDAMENTO</h1><p>Atualizado em ${new Date().toLocaleDateString('pt-BR')} · ${and.length} processos</p>
  <table><tr><th>#</th><th>Nome</th><th>Tipo</th><th>Serviço</th><th>Etapa atual</th><th>Situação atual</th><th>Último movimento</th></tr>
  ${and.map((p, i) => { const pr = progresso(p), u = ultimoMovimento(p); return `<tr><td>${i + 1}</td><td>${h(p.cliente)}</td><td>${h(p.tipo_cliente)}</td><td>${h(p.servico)}</td><td>${pr.total ? `${Math.min(pr.idx, pr.total)}/${pr.total} · ${h(pr.atual?.nome || 'concluídas')}` : ''}</td><td>${h(statusAtual(p).txt)}</td><td>${u ? fmtD(u.data) : '—'}</td></tr>`; }).join('')}
  </table><script>window.print()<\/script></body></html>`);
  w.document.close();
}

// ---------------------------------------------------------------- DETALHE
function abrirDetalhe(id, mostrarTudo = false) {
  const p = S.processos.find(x => x.id === id); if (!p) return;
  const es = etapasDe(id), pr = progresso(p), dr = diario(p), sit = SITUACOES[p.situacao];
  const dias = mostrarTudo ? dr.dias : dr.dias.slice(0, dr.limite);
  modal(`
  <div class="cab"><div style="flex:1"><h3>${h(p.cliente)}</h3><div class="sub">${h(p.servico || presetDe(p)?.nome || '')} · <span class="chip ${sit.cor}">${sit.ic} ${sit.nome.replace(/s$/, '')}</span></div></div><button class="btn ghost" data-fechar>✕</button></div>
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
          <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="n-txt" class="busca" style="max-width:none;flex:3" placeholder="O que aconteceu? (ex.: DBE feito)" list="dl-frases2"><input type="date" id="n-data" class="busca" style="flex:0 0 150px;min-width:0" value="${hoje()}"><button class="btn pri" id="b-reg">Registrar</button></div>
          <div class="frases">${S.config.frases.slice(0, 10).map(f => `<button data-fr="${h(f)}">${h(f)}</button>`).join('')}</div>
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
          <dt>Honorários</dt><dd>${p.honorarios != null && p.honorarios !== '' ? moeda(p.honorarios) : '—'}</dd>
          <dt>Gratificação</dt><dd>${p.gratificacao != null && p.gratificacao !== '' ? moeda(p.gratificacao) : '—'}</dd>
          <dt>Parado há</dt><dd>${diasParado(p)} dia(s)</dd>
        </dl>${p.observacoes ? `<div style="margin-top:10px;font-size:13px;white-space:pre-wrap;background:var(--bg);padding:8px 10px;border-radius:8px">${h(p.observacoes)}</div>` : ''}</div>
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
  if (!admin()) return;
  $$('[data-fr]', m).forEach(b => b.onclick = () => { $('#n-txt').value = b.dataset.fr; $('#n-txt').focus(); });
  const br = $('#b-reg', m); if (br) br.onclick = async () => { const t = $('#n-txt').value.trim(); if (!t) return $('#n-txt').focus(); if (await acao(() => registrar(id, t, { data: $('#n-data').value || hoje() }), 'Registrado')) abrirDetalhe(id); };
  const nt = $('#n-txt', m); if (nt) nt.onkeydown = e => { if (e.key === 'Enter') br.click(); };
  $$('[data-delreg]', m).forEach(b => b.onclick = async () => { if (confirm('Apagar este registro do diário?') && await acao(() => DB.del(T.atual, 'id', b.dataset.delreg), 'Registro apagado')) abrirDetalhe(id); });
  $$('[data-et]', m).forEach(pa => pa.onclick = ev => menuEtapa(ev, p, es.find(e => e.id === pa.dataset.et)));
  $('#b-editar', m).onclick = () => formProcesso(p);
  $('#b-email', m).onclick = () => formAlerta([p], `Atualização: ${p.cliente}`);
  $('#b-excluir', m).onclick = async () => { if (confirm(`Excluir definitivamente o processo de ${p.cliente}? (Para tirar da lista sem apagar, use Arquivar.)`) && await acao(() => DB.del(T.processos, 'id', id), 'Processo excluído')) fecharModal(); };
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
    if (pr.total && pr.ok === pr.total && p.situacao === 'andamento') { abrirDetalhe(p.id); if (confirm('Todas as etapas foram concluídas. Finalizar o processo agora?')) formFinalizar(p); }
    else abrirDetalhe(p.id);
  });
}
function formPausa(p) {
  modal(`<div class="cab"><h3>⏸ Pausar — ${h(p.cliente)}</h3><button class="btn ghost" data-fechar>✕</button></div>
  <div class="corpo"><div class="form">
    <div class="campo c6"><label>Motivo da pausa</label><input id="pm" placeholder="Ex.: Cris pediu para pausar; cliente viajando…"></div>
    <div class="campo"><label>Retomar em (lembrete, opcional)</label><input type="date" id="pr"></div>
  </div><p class="dica" style="color:var(--sub);font-size:12.5px">Enquanto estiver pausado, o diário mostra "Processo pausado" e ele sai da rotina do dia e dos alertas.</p></div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn warn" id="ok">Pausar processo</button></div>`);
  $('#ok').onclick = async () => { const mo = $('#pm').value.trim(), re = $('#pr').value || null;
    if (await acao(async () => { await DB.upd(T.processos, p.id, { situacao: 'pausado', pausa_motivo: mo || null, retomar_em: re }); await registrar(p.id, '⏸ Processo pausado' + (mo ? ': ' + mo : '') + (re ? ` (retomar em ${fmtD(re)})` : ''), { tipo: 'pausa' }); }, 'Processo pausado')) abrirDetalhe(p.id); };
}
function formDesistencia(p) {
  modal(`<div class="cab"><h3>✕ Desistência — ${h(p.cliente)}</h3><button class="btn ghost" data-fechar>✕</button></div>
  <div class="corpo"><div class="form"><div class="campo c6"><label>Motivo</label><input id="dm" placeholder="Ex.: cliente desistiu após o orçamento; CPL indeferida…"></div>
  <div class="campo"><label>Data</label><input type="date" id="dd" value="${hoje()}"></div></div></div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn dang" id="ok">Registrar desistência</button></div>`);
  $('#ok').onclick = async () => { const mo = $('#dm').value.trim(), d = $('#dd').value || hoje();
    if (await acao(async () => { await DB.upd(T.processos, p.id, { situacao: 'desistencia', desistencia_motivo: mo || null, data_conclusao: d }); await registrar(p.id, '✕ Desistência' + (mo ? ': ' + mo : ''), { tipo: 'desistencia', data: d }); }, 'Desistência registrada')) abrirDetalhe(p.id); };
}
function formFinalizar(p) {
  modal(`<div class="cab"><h3>✔ Finalizar — ${h(p.cliente)}</h3><button class="btn ghost" data-fechar>✕</button></div>
  <div class="corpo"><div class="form">
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

// ---------------------------------------------------------------- formulário de processo (novo / editar)
function formProcesso(p = null, opts = {}) {
  const novo = !p; p = p || { situacao: 'andamento', tipo_cliente: 'EMPRESA', data_inicio: hoje(), modo_diario: 'padrao', prioridade: 'normal', aguardando: 'jopec', ...(opts.prefill || {}) };
  let etapas = novo ? [] : etapasDe(p.id).map(e => ({ ...e }));
  const opt = (arr, v) => arr.map(([k, n]) => `<option value="${h(k)}" ${k === v ? 'selected' : ''}>${h(n)}</option>`).join('');
  modal(`
  <div class="cab"><h3>${novo ? 'Novo processo na esteira' : 'Editar — ' + h(p.cliente)}</h3><button class="btn ghost" data-fechar>✕</button></div>
  <div class="corpo">
    <div class="form">
      <div class="campo c4"><label>Cliente *</label><input id="f-cliente" value="${h(p.cliente || '')}" list="dl-clientes" placeholder="Nome da empresa ou pessoa"></div>
      <div class="campo c2"><label>Tipo de cliente</label><select id="f-tipo">${opt(TIPOS_CLIENTE.map(t => [t, t]), p.tipo_cliente)}</select></div>
      <div class="campo c2"><label>CNPJ / CPF</label><input id="f-cnpj" value="${h(p.cnpj || '')}"></div>
      <div class="campo c4"><label>Serviço (como aparece no controle)</label><input id="f-serv" value="${h(p.servico || '')}" placeholder="Ex.: Alteração de endereço e inclusão de atividades"></div>
      <div class="campo c6"><label>Preset do cardápio</label>
        <div style="display:flex;gap:6px"><select id="f-preset" style="flex:1"><option value="">— escolher preset —</option>${S.presets.map(x => `<option value="${x.id}" ${x.id === p.preset_id ? 'selected' : ''}>${h(x.nome)} (${(x.etapas || []).length} etapas)</option>`).join('')}</select>
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
      <div class="campo c2"><label>Honorários (R$)</label><input type="number" step="0.01" id="f-hon" value="${h(p.honorarios ?? '')}"></div>
      <div class="campo c2"><label>Gratificação (R$)</label><input type="number" step="0.01" id="f-grat" value="${h(p.gratificacao ?? '')}"></div>
      <div class="campo c2"></div>
      ${novo ? `<div class="campo c6"><label>Status atual (vai para o diário de hoje)</label><input id="f-st0" list="dl-frases3" placeholder="Ex.: Orçamento enviado" value="${h(opts.status || '')}"></div>` : ''}
      <div class="campo c6"><label>Observações</label><textarea id="f-obs">${h(p.observacoes || '')}</textarea></div>
    </div>
    <datalist id="dl-clientes">${[...new Set(S.processos.map(x => x.cliente))].sort().map(c => `<option value="${h(c)}">`).join('')}</datalist>
    <datalist id="dl-resp">${S.config.responsaveis.map(r => `<option value="${h(r)}">`).join('')}</datalist>
    <datalist id="dl-frases3">${S.config.frases.map(f => `<option value="${h(f)}">`).join('')}</datalist>
  </div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="b-salvar">${novo ? 'Colocar na esteira' : 'Salvar alterações'}</button></div>`, 'lg');

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
        <select id="s-add" class="btn sm" style="max-width:280px"><option value="">＋ Adicionar etapa do cardápio…</option>${todasEtapasCardapio.map((e, i) => `<option value="${i}">${h(e.nome)}</option>`).join('')}</select>
        <select id="s-junta" class="btn sm" style="max-width:280px"><option value="">⊕ Juntar etapas de outro preset…</option>${S.presets.map(x => `<option value="${x.id}">${h(x.nome)}</option>`).join('')}</select></div>`;
    $$('#ed-etapas [data-k]').forEach(inp => inp.oninput = inp.onchange = () => { etapas[+inp.dataset.i][inp.dataset.k] = inp.value; if (inp.dataset.k === 'status') { const e = etapas[+inp.dataset.i]; if (inp.value === 'concluida' && !e.concluida_em) e.concluida_em = hoje(); desenha(); } });
    $$('#ed-etapas [data-aqui]').forEach(b => b.onclick = () => { const a = +b.dataset.aqui; etapas.forEach((e, i) => { if (e.status === 'dispensada' && i !== a) return; if (i < a) { e.status = 'concluida'; e.concluida_em = e.concluida_em || hoje(); } else if (i === a) { e.status = 'andamento'; e.concluida_em = null; } else { e.status = 'pendente'; e.concluida_em = null; } }); desenha(); });
    $$('#ed-etapas [data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) [etapas[i - 1], etapas[i]] = [etapas[i], etapas[i - 1]]; desenha(); });
    $$('#ed-etapas [data-dn]').forEach(b => b.onclick = () => { const i = +b.dataset.dn; if (i < etapas.length - 1) [etapas[i + 1], etapas[i]] = [etapas[i], etapas[i + 1]]; desenha(); });
    $$('#ed-etapas [data-rm]').forEach(b => b.onclick = () => { etapas.splice(+b.dataset.rm, 1); desenha(); });
    $('#b-add').onclick = () => { etapas.push({ nome: '', status: 'pendente' }); desenha(); $$('#ed-etapas [data-k="nome"]').at(-1).focus(); };
    $('#s-add').onchange = ev => { const e = todasEtapasCardapio[+ev.target.value]; if (e) { etapas.push({ nome: e.nome, descricao: e.descricao, prazo: e.prazo, status: 'pendente' }); desenha(); } };
    $('#s-junta').onchange = ev => { const pr = S.presets.find(x => x.id === ev.target.value); if (pr) { const nomes = new Set(etapas.map(e => e.nome)); (pr.etapas || []).forEach(e => { if (!nomes.has(e.nome)) etapas.push({ nome: e.nome, descricao: e.descricao, prazo: e.prazo, status: 'pendente' }); }); desenha(); toast('Etapas juntadas (sem repetir as que já existiam)'); } };
  };
  desenha();
  $('#b-aplicar').onclick = () => {
    const pr = S.presets.find(x => x.id === $('#f-preset').value); if (!pr) return toast('Escolha um preset');
    if (etapas.length && !confirm('Substituir a esteira atual pelas etapas do preset?')) return;
    etapas = (pr.etapas || []).map(e => ({ nome: e.nome, descricao: e.descricao, prazo: e.prazo, status: 'pendente' }));
    if (!$('#f-serv').value) $('#f-serv').value = pr.nome;
    desenha();
  };
  $('#f-preset').onchange = () => { if (!etapas.length) $('#b-aplicar').click(); };
  $('#b-novopreset').onclick = () => formPreset(null, novoId => {
    $('#f-preset').innerHTML = `<option value="">— escolher preset —</option>` + S.presets.map(x => `<option value="${x.id}">${h(x.nome)} (${(x.etapas || []).length} etapas)</option>`).join('');
    $('#f-preset').value = novoId; desenha();
    if (!etapas.length || confirm('Carregar as etapas do preset novo nesta esteira?')) { etapas = []; $('#b-aplicar').click(); }
  });
  $('#b-salvar').onclick = async () => {
    const cliente = $('#f-cliente').value.trim(); if (!cliente) { $('#f-cliente').focus(); return toast('Informe o cliente'); }
    const lista = etapas.filter(e => e.nome.trim());
    if (lista.length && !lista.some(e => e.status === 'andamento')) { const pe = lista.find(e => e.status === 'pendente'); if (pe && $('#f-sit').value === 'andamento') pe.status = 'andamento'; }
    const num = v => v === '' ? null : +v;
    const dados = {
      cliente, tipo_cliente: $('#f-tipo').value, cnpj: $('#f-cnpj').value.trim() || null, servico: $('#f-serv').value.trim() || null,
      preset_id: $('#f-preset').value || null, situacao: $('#f-sit').value, aguardando: $('#f-ag').value, prioridade: $('#f-pri').value,
      responsavel: $('#f-resp').value.trim() || null, contato: $('#f-cont').value.trim() || null, modo_diario: $('#f-modo').value,
      data_inicio: $('#f-ini').value || hoje(), previsao: $('#f-prev').value || null, data_conclusao: $('#f-conc').value || null,
      honorarios: num($('#f-hon').value), gratificacao: num($('#f-grat').value), observacoes: $('#f-obs').value.trim() || null, atualizado_em: new Date().toISOString(),
    };
    if (['finalizado', 'desistencia'].includes(dados.situacao) && !dados.data_conclusao) dados.data_conclusao = hoje();
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
    <div class="card preset" style="--cor:${h(x.cor || '#1f6feb')}">
      <h4>${h(x.nome)}</h4><div class="desc">${h(x.descricao || '')}</div>
      <ol>${(x.etapas || []).map(e => `<li>${h(e.nome)}${e.prazo ? ` <small style="color:var(--sub)">· ${h(e.prazo)}</small>` : ''}</li>`).join('')}</ol>
      <div class="acoes adm"><button class="btn sm" data-ed="${x.id}">✎ Editar</button><button class="btn sm" data-dup="${x.id}">⧉ Duplicar</button><button class="btn sm dang" data-del="${x.id}">Excluir</button>
      <span class="chip" style="margin-left:auto">${S.processos.filter(p => p.preset_id === x.id).length} processos</span></div>
    </div>`).join('')}</div>` : `<div class="card vazio">Nenhum preset ainda. ${admin() ? 'Clique em "Carregar presets sugeridos" para começar com os serviços mais comuns e depois ajuste do seu jeito.' : ''}</div>`}`;
  const bs = $('#b-sug', el); if (bs) bs.onclick = carregarSugeridos;
  const bn = $('#b-novo', el); if (bn) bn.onclick = () => formPreset();
  $$('[data-ed]', el).forEach(b => b.onclick = () => formPreset(S.presets.find(x => x.id === b.dataset.ed)));
  $$('[data-dup]', el).forEach(b => b.onclick = () => { const x = S.presets.find(y => y.id === b.dataset.dup); formPreset({ ...x, id: null, nome: x.nome + ' (cópia)' }); });
  $$('[data-del]', el).forEach(b => b.onclick = () => { const x = S.presets.find(y => y.id === b.dataset.del); if (confirm(`Excluir o preset "${x.nome}"? Os processos que já usam ele continuam com as etapas deles.`)) acao(() => DB.del(T.presets, 'id', x.id), 'Preset excluído'); });
}
function carregarSugeridos() {
  const sug = window.LEG_PRESETS_SUGERIDOS || [];
  return acao(() => DB.ins(T.presets, sug.map((x, i) => ({ id: uid(), nome: x.nome, descricao: x.descricao || null, cor: x.cor, ordem: i, etapas: x.etapas.map(e => ({ nome: e.nome, descricao: e.descricao || '', prazo: e.prazo || '' })), criado_em: new Date().toISOString() }))), `${sug.length} presets carregados`);
}
function formPreset(x = null, aoSalvar = null) {
  const novo = !x || !x.id; x = x || { nome: '', cor: '#1f6feb', etapas: [] }; const L = aoSalvar ? 2 : 1; const R = L === 2 ? '#modal-root2 ' : '#modal-root ';
  let etapas = (x.etapas || []).map(e => ({ ...e }));
  modal(`<div class="cab"><h3>${novo ? 'Novo preset' : 'Editar preset'}</h3><button class="btn ghost" data-fechar>✕</button></div>
  <div class="corpo"><div class="form">
    <div class="campo c4"><label>Nome do serviço *</label><input id="p-nome" value="${h(x.nome)}" placeholder="Ex.: Alteração de Endereço"></div>
    <div class="campo c2"><label>Cor</label><input type="color" id="p-cor" value="${h(x.cor || '#1f6feb')}" style="height:40px;padding:3px"></div>
    <div class="campo c6"><label>Descrição</label><input id="p-desc" value="${h(x.descricao || '')}"></div>
  </div>
  <div class="secao"><h3>Etapas (na ordem em que são feitas)</h3></div>
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
  };
  desenha();
  $(R + '#bp-salvar').onclick = async () => {
    const nome = $(R + '#p-nome').value.trim(); if (!nome) return toast('Informe o nome do serviço');
    const dados = { nome, cor: $(R + '#p-cor').value, descricao: $(R + '#p-desc').value.trim() || null, etapas: etapas.filter(e => e.nome.trim()).map(e => ({ nome: e.nome.trim(), descricao: e.descricao || '', prazo: e.prazo || '' })) };
    const nid = novo ? uid() : x.id;
    if (await acao(() => novo ? DB.ins(T.presets, { id: nid, ...dados, ordem: S.presets.length, criado_em: new Date().toISOString() }) : DB.upd(T.presets, x.id, dados), 'Preset salvo')) { fecharModal(L); if (aoSalvar) aoSalvar(nid); }
  };
}

// ---------------------------------------------------------------- RELATÓRIO MENSAL
function vRelatorio(el) {
  const meses = [...new Set([hoje().slice(0, 7), ...S.processos.filter(p => p.data_conclusao).map(p => p.data_conclusao.slice(0, 7))])].sort().reverse();
  const fin = S.processos.filter(p => p.situacao !== 'desistencia' && ['finalizado', 'arquivado'].includes(p.situacao) && (p.data_conclusao || '').startsWith(S.mesRel)).sort((a, b) => a.data_conclusao.localeCompare(b.data_conclusao));
  const des = S.processos.filter(p => p.situacao === 'desistencia' && (p.data_conclusao || '').startsWith(S.mesRel));
  const tot = fin.reduce((s, p) => s + (+p.gratificacao || 0), 0);
  const nomeMes = m => parseD(m + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  el.innerHTML = `
  <div class="topo"><h2>Trabalhos finalizados</h2>
    <select id="mes" class="btn">${meses.map(m => `<option value="${m}" ${m === S.mesRel ? 'selected' : ''}>${nomeMes(m)}</option>`).join('')}</select>
    <button class="btn" id="b-csv">⤓ Exportar CSV</button><button class="btn" onclick="window.print()">🖨 Imprimir</button></div>
  <div class="card" style="overflow:auto">
    <div style="padding:14px 16px;font-weight:700;text-transform:uppercase">Trabalhos finalizados em ${nomeMes(S.mesRel)}</div>
    <table class="tb"><thead><tr><th>#</th><th>Nome</th><th>Tipo de cliente</th><th>Serviço executado</th><th>Concluído</th><th class="num">Gratificação</th></tr></thead>
    <tbody>${fin.map((p, i) => `<tr data-proc="${p.id}" style="cursor:pointer"><td>${i + 1}</td><td>${h(p.cliente)}</td><td>${h(p.tipo_cliente)}</td><td>${h(p.servico)}</td><td>${fmtD(p.data_conclusao)}</td><td class="num">${p.gratificacao != null ? moeda(p.gratificacao) : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum trabalho finalizado neste mês.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="5">TOTAL (${fin.length} trabalhos)</td><td class="num">${moeda(tot)}</td></tr></tfoot></table>
  </div>
  ${des.length ? `<div class="secao"><h3>Desistências no mês</h3></div><div class="card"><table class="tb"><tbody>${des.map(p => `<tr data-proc="${p.id}" style="cursor:pointer"><td>${h(p.cliente)}</td><td>${h(p.servico)}</td><td>${h(p.desistencia_motivo || '')}</td><td>${fmtD(p.data_conclusao)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  $('#mes', el).onchange = e => { S.mesRel = e.target.value; render(); };
  $$('[data-proc]', el).forEach(r => r.onclick = () => abrirDetalhe(r.dataset.proc));
  $('#b-csv', el).onclick = () => {
    const linhas = [['Nome', 'Tipo de cliente', 'Serviço executado', 'Conclusão', 'Gratificação'], ...fin.map(p => [p.cliente, p.tipo_cliente, p.servico || '', fmtD(p.data_conclusao), (p.gratificacao ?? '').toString().replace('.', ',')]), ['TOTAL', '', '', '', tot.toFixed(2).replace('.', ',')]];
    baixar(`finalizados-${S.mesRel}.csv`, '﻿' + linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
  };
}
function baixar(nome, conteudo, tipo) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; a.click(); }

// ---------------------------------------------------------------- CONFIGURAÇÕES
function vConfig(el) {
  if (!admin()) { S.view = 'painel'; return render(); }
  const c = S.config;
  el.innerHTML = `
  <div class="topo"><h2>Configurações</h2></div>
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
  $('#c-bkp', el).onclick = () => baixar(`legalizacao-backup-${hoje()}.json`, JSON.stringify({ presets: S.presets, processos: S.processos, etapas: S.etapas, atualizacoes: S.atual, config: S.config }, null, 1), 'application/json');
  $('#c-sug', el).onclick = carregarSugeridos;
  $('#c-rest', el).onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    const b = JSON.parse(await f.text());
    if (!confirm(`Restaurar backup com ${b.processos?.length || 0} processos? Itens com o mesmo ID serão ignorados.`)) return;
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
      <div class="bts">${t ? `<span class="chip ${ROT[t.acao]?.[0] || ''}">${ROT[t.acao]?.[1] || t.acao}</span>${proc ? `<button class="btn sm" data-ver="${proc.id}">Abrir</button>` : ''}<button class="btn sm ghost" data-desfaz="${x.chave}">Desfazer</button>` : `
        <button class="btn sm ok" data-fin="${x.chave}">✔ Já finalizado</button>
        <button class="btn sm pri" data-est="${x.chave}">▶ Montar esteira</button>
        <button class="btn sm warn" data-pau="${x.chave}">⏸ Pausado</button>
        <button class="btn sm dang" data-des="${x.chave}">✕ Desistiu</button>
        <button class="btn sm ghost" data-ign="${x.chave}">Ignorar</button>`}</div>
    </div>`; }).join('')}</div>` : '<div class="card vazio">Nenhuma pendência para triar.</div>'}`;
  const item = k => lista.find(x => x.chave === k);
  const pref = x => ({ cliente: x.cliente, tipo_cliente: TIPOS_CLIENTE.includes(x.tipo) ? x.tipo : 'EMPRESA', servico: x.servico, data_inicio: x.data || hoje(), observacoes: `Vindo da planilha. Último status: ${x.status || '—'}` });
  $$('[data-ver]', el).forEach(b => b.onclick = () => abrirDetalhe(b.dataset.ver));
  $$('[data-desfaz]', el).forEach(b => b.onclick = () => { const t = { ...(S.config.triagem || {}) }; const pid = t[b.dataset.desfaz]?.pid; delete t[b.dataset.desfaz];
    acao(async () => { await DB.salvaConfig({ ...S.config, triagem: t }); if (pid && confirm('Excluir também o processo que foi criado nesta triagem?')) await DB.del(T.processos, 'id', pid); }, 'Triagem desfeita'); });
  $$('[data-ign]', el).forEach(b => b.onclick = () => acao(() => marcarTriado(b.dataset.ign, { acao: 'ignorado' }), 'Ignorado'));
  $$('[data-est]', el).forEach(b => b.onclick = () => { const x = item(b.dataset.est);
    formProcesso(null, { prefill: pref(x), status: x.status, antesDeSalvar: pid => marcarTriado(x.chave, { acao: 'esteira', pid }), depois: () => { fecharModal(); toast(`${x.cliente} na esteira`); } }); });
  $$('[data-fin]', el).forEach(b => b.onclick = () => { const x = item(b.dataset.fin);
    modal(`<div class="cab"><h3>✔ ${h(x.cliente)} já foi finalizado</h3><button class="btn ghost" data-fechar>✕</button></div>
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
    modal(`<div class="cab"><h3>${titulo} — ${h(x.cliente)}</h3><button class="btn ghost" data-fechar>✕</button></div>
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
  modal(`<div class="cab"><h3>✉ Enviar alerta</h3><button class="btn ghost" data-fechar>✕</button></div>
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
function montarEmail(lista, titulo) {
  const linhas = lista.sort((a, b) => a.cliente.localeCompare(b.cliente)).map(p => {
    const pr = progresso(p), st = statusAtual(p), hj = atualDe(p.id).filter(a => a.data === hoje() && a.tipo !== 'sistema');
    return { p, etapa: pr.total ? `${Math.min(pr.idx, pr.total)}/${pr.total} · ${pr.atual ? pr.atual.nome : 'todas concluídas'}` : '—',
      status: hj.length ? hj.map(a => a.texto).join(' | ') : st.txt + (st.rep ? ' (sem novidade hoje)' : ''),
      com: p.situacao === 'pausado' ? 'Pausado' : (SITUACOES[p.situacao]?.nome.replace(/s$/, '') + ' · ' + (AGUARDANDO[p.aguardando] || '')), parado: diasParado(p) };
  });
  const texto = `${titulo}\n\n` + linhas.map((l, i) => `${i + 1}. ${l.p.cliente} — ${l.p.servico || ''}\n   Etapa: ${l.etapa}\n   Status: ${l.status}\n   ${l.com}${l.p.situacao === 'andamento' ? ` · ${l.parado} dia(s) sem movimento` : ''}`).join('\n\n') + `\n\n— Controle de Legalização JOPEC`;
  const td = 'style="border:1px solid #d5dbe3;padding:7px 9px;vertical-align:top;font-size:13px"';
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1c2533"><h2 style="color:#0f2a4a;font-size:18px;margin:0 0 4px">${h(titulo)}</h2><p style="color:#5b6b80;margin:0 0 14px">Controle de Legalização · JOPEC Serviços Administrativos</p>
  <table style="border-collapse:collapse;width:100%"><tr>${['Cliente', 'Serviço', 'Etapa', 'Status', 'Situação'].map(x => `<th style="background:#0f2a4a;color:#fff;padding:7px 9px;text-align:left;font-size:12px">${x}</th>`).join('')}</tr>
  ${linhas.map(l => `<tr><td ${td}><b>${h(l.p.cliente)}</b></td><td ${td}>${h(l.p.servico || '')}</td><td ${td}>${h(l.etapa)}</td><td ${td}>${h(l.status)}</td><td ${td}>${h(l.com)}${l.p.situacao === 'andamento' && l.parado >= S.config.alerta_dias ? `<br><span style="color:#cf222e">${l.parado} dias sem movimento</span>` : ''}</td></tr>`).join('')}</table></div>`;
  return { texto, html };
}
function formAlerta(lista, titulo) {
  const { texto, html } = montarEmail(lista, titulo);
  modal(`<div class="cab"><div style="flex:1"><h3>✉ Alerta por e-mail</h3><div class="sub">De: ${h(S.config.email_remetente)} · ${lista.length} processo(s)</div></div><button class="btn ghost" data-fechar>✕</button></div>
  <div class="corpo"><div class="form">
    <div class="campo c6"><label>Para</label><input id="e-para" value="${h(S.config.email_para)}"></div>
    <div class="campo c6"><label>Cópia (CC)</label><input id="e-cc" value="${h(S.config.email_cc)}"></div>
    <div class="campo c6"><label>Assunto</label><input id="e-ass" value="${h('[Legalização JOPEC] ' + titulo)}"></div>
    <div class="campo c6"><label>Mensagem (pode editar)</label><textarea id="e-txt" style="min-height:260px;font-family:inherit">${h(texto)}</textarea></div>
  </div>${MODO_DEMO ? '<div class="aviso amarelo">Modo demonstração: o envio automático só funciona com o Supabase ligado. Use "Abrir no Gmail".</div>' : ''}</div>
  <div class="rod"><button class="btn" data-fechar>Cancelar</button><button class="btn" id="e-gmail">Abrir no Gmail</button><button class="btn pri" id="e-env" ${MODO_DEMO ? 'disabled' : ''}>Enviar automaticamente</button></div>`, 'lg');
  const editado = () => $('#e-txt').value !== texto;
  $('#e-gmail').onclick = () => {
    const u = new URL('https://mail.google.com/mail/'); u.searchParams.set('authuser', S.config.email_remetente); u.searchParams.set('view', 'cm'); u.searchParams.set('fs', '1');
    u.searchParams.set('to', $('#e-para').value); u.searchParams.set('cc', $('#e-cc').value); u.searchParams.set('su', $('#e-ass').value); u.searchParams.set('body', $('#e-txt').value);
    window.open(u.toString(), '_blank');
  };
  $('#e-env').onclick = async () => {
    const b = $('#e-env'); b.disabled = true; b.textContent = 'Enviando…';
    try {
      const { data, error } = await sb.functions.invoke('enviar-alerta', { body: { para: $('#e-para').value, cc: $('#e-cc').value, assunto: $('#e-ass').value, texto: $('#e-txt').value, html: editado() ? `<pre style="font-family:Segoe UI,Arial;white-space:pre-wrap">${h($('#e-txt').value)}</pre>` : html } });
      if (error || data?.erro) throw new Error(data?.erro || error.message);
      fecharModal(); toast('E-mail enviado ✔');
    } catch (err) { b.disabled = false; b.textContent = 'Enviar automaticamente'; alert('Não foi possível enviar: ' + err.message + '\n\nUse "Abrir no Gmail" enquanto isso.'); }
  };
}

// ---------------------------------------------------------------- modal
function modal(html, cls = '', camada = 1) {
  const R = camada === 2 ? '#modal-root2' : '#modal-root';
  if (camada === 1) $('#modal-root2').innerHTML = '';
  $(R).innerHTML = `<div class="fundo"><div class="modal ${cls}">${html}</div></div>`;
  $$(R + ' [data-fechar]').forEach(b => b.onclick = () => fecharModal(camada));
  $(R + ' .fundo').onmousedown = e => { if (e.target.classList.contains('fundo')) fecharModal(camada); };
}
function fecharModal(camada = 1) { if (camada === 2) $('#modal-root2').innerHTML = ''; else { $('#modal-root').innerHTML = ''; $('#modal-root2').innerHTML = ''; } }
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
(async () => { await DB.init(); iniciar(); })();
// atualiza sozinho a cada 5 min (para quem deixa aberto o dia todo)
setInterval(async () => { if (S.papel && !$('#modal-root').innerHTML) { await carregar(); render(); } }, 5 * 60 * 1000);
