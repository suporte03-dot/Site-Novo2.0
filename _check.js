
/* CONFIGURAÇÃO */
const USAR_LOGIN = false; 
const USAR_SUPABASE = false; 
const MODO_LOCAL = true;

const supabase = null;
let sessionUser = null;
let currentGroupId = null;
let realtimeChannel = null;

/* ========================================================
   ESTADOS, VARIÁVEIS GLOBAIS E LOCALSTORAGE
   ======================================================== */
function carregarLocal(key, def) { 
  try { 
    const d = localStorage.getItem('financasCasa_' + key); 
    return d ? JSON.parse(d) : def; 
  } catch(e) { 
    console.error("Erro localStorage (carregar)", key, e); 
    return def; 
  } 
}

function salvarLocal(key, val) { 
  try { 
    localStorage.setItem('financasCasa_' + key, JSON.stringify(val)); 
  } catch(e) { 
    console.error("Erro localStorage (salvar)", key, e); 
  } 
}

let dados = carregarLocal('dados', []);
if(!Array.isArray(dados)) dados = [];
let metas = carregarLocal('metas', {});
if(!metas || typeof metas !== 'object') metas = {};
let orcamentos = carregarLocal('orcamentos', {});
if(!orcamentos || typeof orcamentos !== 'object') orcamentos = {};
let futuros = carregarLocal('futuros', []);
if(!Array.isArray(futuros)) futuros = [];
let recorrentes = carregarLocal('recorrentes', []);
if(!Array.isArray(recorrentes)) recorrentes = [];
let parcelamentos = carregarLocal('parcelamentos', []);
if(!Array.isArray(parcelamentos)) parcelamentos = [];
let listaMercado = carregarLocal('listaMercado', []);
if(!Array.isArray(listaMercado)) listaMercado = [];
let historicoCopras = carregarLocal('historicoCopras', []);
if(!Array.isArray(historicoCopras)) historicoCopras = [];
let promocoesMercado = carregarLocal('promocoesMercado', []);
if(!Array.isArray(promocoesMercado)) promocoesMercado = [];
let chatHistorico = carregarLocal('chatHistorico', []);
if(!Array.isArray(chatHistorico)) chatHistorico = [];

let categorias = carregarLocal('categorias', ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Outros']);
let categoriasDetalhes = carregarLocal('categoriasDetalhes', {});
if (!categoriasDetalhes || typeof categoriasDetalhes !== 'object') categoriasDetalhes = {};
if (!Array.isArray(categorias) || categorias.length === 0) {
  categorias = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Outros'];
  salvarLocal('categorias', categorias);
}

let config = carregarLocal('config', { modo: 'auto', inicio: 'dashboard' });
if (!config || typeof config !== 'object') {
  config = { modo: 'auto', inicio: 'dashboard' };
  salvarLocal('config', config);
}
const CONFIG_PADRAO = { modo: 'auto', inicio: 'dashboard', tema: 'claro', densidade: 'normal', moeda: 'BRL', mesInicial: '', mostrarExemplo: false, ultimoBackup: '' };
Object.keys(CONFIG_PADRAO).forEach(k => { if (config[k] === undefined) config[k] = CONFIG_PADRAO[k]; });
salvarLocal('config', config);

let editLancId = null;

function salvarConfigModo() {
  config.modo = document.getElementById('configModo').value;
  salvarLocal('config', config);
  aplicarModoVisualizacao();
}
function salvarConfigInicio() {
  config.inicio = document.getElementById('configInicio').value;
  salvarLocal('config', config);
}

document.addEventListener('DOMContentLoaded', () => {
  aplicarModoVisualizacao();
  window.addEventListener('resize', aplicarModoVisualizacao);
  const hoje = new Date();
  document.getElementById('filtroGlobalMes').value = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  
  // Configs
  const configModoEl = document.getElementById('configModo'); if(configModoEl) configModoEl.value = config.modo || 'auto';
  const configInicioEl = document.getElementById('configInicio'); if(configInicioEl) configInicioEl.value = config.inicio || 'dashboard';
  sincronizarConfigUI();
  if (config.mesInicial) document.getElementById('filtroGlobalMes').value = config.mesInicial;
  document.body.classList.toggle('theme-dark', config.tema === 'escuro');
  document.body.classList.toggle('modo-compacto', config.densidade === 'compacto');

  // Event Listeners for menu-item buttons
  document.querySelectorAll(".menu-item").forEach(item => {
    item.addEventListener("click", function(event) {
      event.preventDefault();
      const modulo = this.dataset.module;
      abrirModulo(modulo);
    });
  });

  if (USAR_LOGIN) {
    if(!supabase || SUPABASE_URL === 'SUA_URL_SUPABASE_AQUI') {
      document.getElementById('authError').innerText = "Supabase não configurado. Verifique SUPABASE_URL e SUPABASE_ANON_KEY no código.";
      const btnEntrar = document.getElementById('btnAuthEntrar'); if(btnEntrar) btnEntrar.disabled = true;
      const btnCriar = document.getElementById('btnAuthCriar'); if(btnCriar) btnCriar.disabled = true;
    } else {
      verificarSessao();
    }
  } else {
    // Entrar direto (Offline / Local)
    document.getElementById('authOverlay').classList.remove('active');
    document.getElementById('groupOverlay').classList.remove('active');
    document.getElementById('lblGrupoId').innerText = "Modo local · offline";
    abrirModulo(config.inicio);
    processarDadosGlobais();
  }
});

/* ========================================================
   AUTENTICAÇÃO E GRUPOS
   ======================================================== */
async function verificarSessao() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if(error) throw error;
    if(session) {
      sessionUser = session.user;
      document.getElementById('authOverlay').classList.remove('active');
      verificarGrupo();
    } else {
      document.getElementById('authOverlay').classList.add('active');
      document.getElementById('groupOverlay').classList.remove('active');
    }
  } catch(err) {
    console.error("Erro ao verificar sessão:", err);
  }
}

async function fazerLogin() {
  console.log("Tentando login...");
  const email = document.getElementById('authEmail').value.trim(); 
  const senha = document.getElementById('authSenha').value;
  const btn = document.getElementById('btnAuthEntrar');
  const errBox = document.getElementById('authError');
  
  errBox.style.color = 'var(--danger)';
  errBox.innerText = "";
  
  if(!email || !senha) return errBox.innerText = "Por favor, preencha e-mail e senha.";
  
  btn.innerText = "Entrando...";
  btn.disabled = true;
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if(error) throw error;
    console.log("Login realizado");
    verificarSessao();
  } catch (error) {
    console.log("Erro no login:", error);
    btn.innerText = "Entrar";
    btn.disabled = false;
    
    if (error.message.includes('Invalid login credentials')) {
      errBox.innerText = "Usuário não encontrado ou senha incorreta.";
    } else if (error.message.includes('Email not confirmed')) {
      errBox.innerText = "E-mail não confirmado. Verifique sua caixa de entrada.";
    } else if (error.message.includes('Failed to fetch')) {
      errBox.innerText = "Erro de conexão. Verifique sua internet ou a URL/Key do Supabase.";
    } else {
      errBox.innerText = "Erro: " + error.message;
    }
  }
}

async function fazerCadastro() {
  const email = document.getElementById('authEmail').value.trim(); 
  const senha = document.getElementById('authSenha').value;
  const btn = document.getElementById('btnAuthCriar');
  const errBox = document.getElementById('authError');
  
  errBox.innerText = "";
  if(!email || !senha) {
    errBox.style.color = 'var(--danger)';
    return errBox.innerText = "Por favor, preencha e-mail e senha.";
  }
  
  btn.innerText = "Criando...";
  btn.disabled = true;
  
  try {
    const { data, error } = await supabase.auth.signUp({ email, password: senha });
    if(error) throw error;
    btn.innerText = "Criar Nova Conta";
    btn.disabled = false;
    errBox.style.color = 'var(--success)';
    errBox.innerText = "Conta criada com sucesso! Verifique seu e-mail para confirmar o cadastro.";
  } catch (error) {
    btn.innerText = "Criar Nova Conta";
    btn.disabled = false;
    errBox.style.color = 'var(--danger)';
    errBox.innerText = "Erro ao criar: " + error.message;
  }
}

async function fazerLogout() {
  if (USAR_SUPABASE && supabase) await supabase.auth.signOut();
  location.reload();
}

async function verificarGrupo() {
  const { data, error } = await supabase.from('membros_grupo').select('grupo_id').eq('usuario_id', sessionUser.id).limit(1);
  if(data && data.length > 0) {
    currentGroupId = data[0].grupo_id;
    document.getElementById('groupOverlay').classList.remove('active');
    document.getElementById('lblGrupoId').innerText = `Grupo ID: ${currentGroupId}`;
    abrirModulo(config.inicio);
    await carregarTudoSupabase();
    configurarRealtime();
  } else {
    document.getElementById('groupOverlay').classList.add('active');
  }
}

async function criarGrupo() {
  const nome = document.getElementById('novoGrupoNome').value || 'Minha Casa';
  const { data: g, error } = await supabase.from('grupos').insert([{ nome, criado_por: sessionUser.id }]).select();
  if(error) return alert("Erro ao criar grupo.");
  await supabase.from('membros_grupo').insert([{ grupo_id: g[0].id, usuario_id: sessionUser.id }]);
  verificarGrupo();
}

async function entrarGrupo() {
  const gId = document.getElementById('joinGrupoId').value.trim();
  if(!gId) return;
  const { error } = await supabase.from('membros_grupo').insert([{ grupo_id: gId, usuario_id: sessionUser.id }]);
  if(error) return alert("Erro ao entrar. Certifique-se de que o ID do grupo está correto.");
  verificarGrupo();
}

function copiarGrupoId() {
  if(!currentGroupId) return;
  navigator.clipboard.writeText(currentGroupId);
  showToast("ID do Grupo copiado! Envie para sua esposa/marido.");
}

/* ========================================================
   BANCO DE DADOS: LEITURA E REALTIME
   ======================================================== */
async function carregarTudoSupabase() {
  if(!currentGroupId) return;
  const [rLanc, rCat, rMetas, rOrc, rFut, rRec, rPar] = await Promise.all([
    supabase.from('lancamentos').select('*').eq('grupo_id', currentGroupId),
    supabase.from('categorias').select('*').eq('grupo_id', currentGroupId),
    supabase.from('metas').select('*').eq('grupo_id', currentGroupId),
    supabase.from('orcamentos_categoria').select('*').eq('grupo_id', currentGroupId),
    supabase.from('planejamentos').select('*').eq('grupo_id', currentGroupId),
    supabase.from('recorrencias').select('*').eq('grupo_id', currentGroupId),
    supabase.from('parcelamentos').select('*').eq('grupo_id', currentGroupId)
  ]);
  
  dados = (rLanc.data||[]).map(i => ({...i, formaPagamento: i.forma_pagamento}));
  categorias = (rCat.data||[]).map(i => i.nome);
  
  metas = {}; (rMetas.data||[]).forEach(i => metas[i.mes_referencia] = Number(i.valor_meta));
  orcamentos = {}; (rOrc.data||[]).forEach(i => {
    if(!orcamentos[i.mes_referencia]) orcamentos[i.mes_referencia] = {};
    orcamentos[i.mes_referencia][i.categoria] = Number(i.limite_valor);
  });
  
  futuros = (rFut.data||[]).map(i => ({...i, valor: Number(i.valor_previsto), data: i.data_prevista}));
  recorrentes = (rRec.data||[]).map(i => ({...i, valor: Number(i.valor), dia: i.dia_vencimento}));
  parcelamentos = (rPar.data||[]).map(i => ({...i, valorTotal: Number(i.valor_total), parcelas: i.quantidade_parcelas, dataCriacao: i.criado_em}));
  
  processarDadosGlobais();
}

function configurarRealtime() {
  if(realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel('grupo_updates')
    .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
      carregarTudoSupabase(); // Recarrega quando a esposa/marido fizer algo
    }).subscribe();
}

/* ========================================================
   BANCO DE DADOS: ESCRITA E LOCALSTORAGE
   ======================================================== */
function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

async function salvarLancamento() {
  const desc = document.getElementById('fDesc').value.trim(); const val = Number(document.getElementById('fValor').value); const venc = document.getElementById('fVenc').value;
  if(!desc||!val||!venc||val<=0) return showToast("Preencha Descrição, Valor e Vencimento.", "error");
  
  const obj = { id: editLancId || generateId(), descricao: desc, valor: val, vencimento: venc, tipo: document.getElementById('fTipo').value, categoria: document.getElementById('fCat').value, status: document.getElementById('fStatus').value, formaPagamento: document.getElementById('fPgto').value, responsavel: document.getElementById('fResp').value, observacao: document.getElementById('fObs').value };
  
  document.getElementById('btnSalvarLanc').disabled = true;
  
  if (USAR_SUPABASE && supabase && currentGroupId) {
    const dbObj = { ...obj, grupo_id: currentGroupId, criado_por: sessionUser.id, forma_pagamento: obj.formaPagamento };
    delete dbObj.id; delete dbObj.formaPagamento;
    if(editLancId) { await supabase.from('lancamentos').update(dbObj).eq('id', editLancId); cancelarEdicaoLancamento(); }
    else { await supabase.from('lancamentos').insert([dbObj]); }
    carregarTudoSupabase();
  } else {
    if(editLancId) {
      const idx = dados.findIndex(d => d.id === editLancId);
      if(idx !== -1) Object.assign(dados[idx], obj);
      cancelarEdicaoLancamento();
    } else { dados.push(obj); }
    salvarLocal('dados', dados); processarDadosGlobais();
  }
  
  document.getElementById('btnSalvarLanc').disabled = false;
  showToast("Lançamento salvo!"); limparFormLanc();
}

async function pagarLancamento(id) { 
  if (USAR_SUPABASE && supabase && currentGroupId) { await supabase.from('lancamentos').update({ status: 'pago' }).eq('id', id); carregarTudoSupabase(); }
  else { const i = dados.find(d=>d.id===id); if(i) { i.status = 'pago'; salvarLocal('dados', dados); processarDadosGlobais(); } }
  showToast("Pago!"); 
}
async function excluirLancamento(id) { 
  if(!confirm("Excluir?")) return;
  if (USAR_SUPABASE && supabase && currentGroupId) { await supabase.from('lancamentos').delete().eq('id', id); carregarTudoSupabase(); }
  else { dados = dados.filter(d=>d.id!==id); salvarLocal('dados', dados); processarDadosGlobais(); }
  showToast("Excluído", "warning"); 
}

const CATEGORIAS_PADRAO = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Outros'];
let editCatOriginal = null;

function statsCategoriaMes(nome) {
  const mes = getMesGlobal();
  const lista = getLancamentosFiltrados(mes).filter(i => i.categoria === nome);
  const qtd = lista.length;
  const totalDesp = lista.filter(i => i.tipo === 'despesa').reduce((s, i) => s + Number(i.valor || 0), 0);
  const totalRec = lista.filter(i => i.tipo === 'receita').reduce((s, i) => s + Number(i.valor || 0), 0);
  return { qtd, totalDesp, totalRec, movimentado: totalDesp + totalRec };
}

function sincronizarBuscaLanc() {
  const b = document.getElementById('buscaLanc');
  const bp = document.getElementById('buscaLancPro');
  if (b && bp) bp.value = b.value;
}

function atualizarChipsLanc() {
  const t = document.getElementById('fLancTipo')?.value || '';
  const s = document.getElementById('fLancStatus')?.value || '';
  let chip = '';
  if (t === 'receita' || t === 'despesa') chip = t;
  else if (['pago', 'pendente', 'atrasado'].includes(s)) chip = s;
  document.querySelectorAll('.lanc-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.chip === chip);
  });
}

function aplicarChipLanc(chip) {
  const tipo = document.getElementById('fLancTipo');
  const status = document.getElementById('fLancStatus');
  if (!tipo || !status) return;
  tipo.value = '';
  status.value = '';
  if (chip === 'receita' || chip === 'despesa') tipo.value = chip;
  else if (['pago', 'pendente', 'atrasado'].includes(chip)) status.value = chip;
  document.querySelectorAll('.lanc-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.chip === chip);
  });
  renderLancamentos();
}

async function adicionarCategoria() {
  const nc = document.getElementById('fNovaCat').value.trim();
  if (!nc) return showToast('Informe o nome da categoria.', 'warning');

  if (editCatOriginal) {
    if (nc !== editCatOriginal && categorias.includes(nc)) return showToast('Categoria já existe.', 'warning');
    const idx = categorias.indexOf(editCatOriginal);
    if (idx === -1) return cancelarEdicaoCategoria();
    dados.forEach(d => { if (d.categoria === editCatOriginal) d.categoria = nc; });
    if (categoriasDetalhes[editCatOriginal]) {
      categoriasDetalhes[nc] = { ...categoriasDetalhes[editCatOriginal] };
      delete categoriasDetalhes[editCatOriginal];
    }
    categorias[idx] = nc;
    if (USAR_SUPABASE && supabase && currentGroupId) { /* offline */ }
    else {
      salvarLocal('dados', dados);
      salvarLocal('categorias', categorias);
      salvarLocal('categoriasDetalhes', categoriasDetalhes);
      processarDadosGlobais();
    }
    cancelarEdicaoCategoria();
    showToast('Categoria atualizada!');
    return;
  }

  if (categorias.includes(nc)) return showToast('Categoria já existe.', 'warning');
  const det = {
    icone: (document.getElementById('fNovaCatIcon')?.value || nc[0]).trim().slice(0, 2).toUpperCase() || nc[0].toUpperCase(),
    cor: document.getElementById('fNovaCatCor')?.value || '#1a5f4a'
  };
  if (USAR_SUPABASE && supabase && currentGroupId) { await supabase.from('categorias').insert([{ grupo_id: currentGroupId, nome: nc }]); carregarTudoSupabase(); }
  else {
    categorias.push(nc);
    categoriasDetalhes[nc] = det;
    salvarLocal('categorias', categorias);
    salvarLocal('categoriasDetalhes', categoriasDetalhes);
    processarDadosGlobais();
  }
  document.getElementById('fNovaCat').value = '';
  const ic = document.getElementById('fNovaCatIcon'); if (ic) ic.value = '';
  showToast('Categoria adicionada!');
}

function editarCategoria(cat) {
  editCatOriginal = cat;
  document.getElementById('fNovaCat').value = cat;
  const ic = document.getElementById('fNovaCatIcon');
  const co = document.getElementById('fNovaCatCor');
  if (ic) ic.value = iconCategoria(cat);
  if (co) co.value = corCategoria(cat);
  const t = document.getElementById('formCatTitle'); if (t) t.innerText = 'Editar categoria';
  const b = document.getElementById('btnSalvarCat'); if (b) b.innerText = 'Salvar alterações';
  document.getElementById('btnCancelCat')?.classList.remove('hidden');
  document.getElementById('fNovaCat')?.focus();
}

function cancelarEdicaoCategoria() {
  editCatOriginal = null;
  document.getElementById('fNovaCat').value = '';
  const ic = document.getElementById('fNovaCatIcon'); if (ic) ic.value = '';
  const co = document.getElementById('fNovaCatCor'); if (co) co.value = '#1a5f4a';
  const t = document.getElementById('formCatTitle'); if (t) t.innerText = 'Nova categoria';
  const b = document.getElementById('btnSalvarCat'); if (b) b.innerText = 'Adicionar categoria';
  document.getElementById('btnCancelCat')?.classList.add('hidden');
}

async function removerCategoria(cat) {
  if (CATEGORIAS_PADRAO.includes(cat)) {
    return showToast('Categorias padrão não podem ser excluídas.', 'warning');
  }
  const usoTotal = dados.filter(d => d.categoria === cat).length;
  const st = statsCategoriaMes(cat);
  let msg = `Excluir a categoria "${cat}"?`;
  if (usoTotal > 0) {
    msg = `A categoria "${cat}" está em ${usoTotal} lançamento(s) no sistema`;
    if (st.qtd > 0) msg += ` (${st.qtd} no mês atual, total ${formatMoeda(st.movimentado)})`;
    msg += '. Deseja excluir mesmo assim? Os lançamentos manterão o nome da categoria até você editá-los.';
  }
  if (!confirm(msg)) return;
  if (USAR_SUPABASE && supabase && currentGroupId) {
    await supabase.from('categorias').delete().eq('grupo_id', currentGroupId).eq('nome', cat);
    carregarTudoSupabase();
  } else {
    categorias = categorias.filter(c => c !== cat);
    delete categoriasDetalhes[cat];
    salvarLocal('categorias', categorias);
    salvarLocal('categoriasDetalhes', categoriasDetalhes);
    processarDadosGlobais();
  }
  if (editCatOriginal === cat) cancelarEdicaoCategoria();
  showToast('Categoria excluída.', 'warning');
}

async function salvarMeta() {
  const mes = getMesGlobal(); if(!mes) return; const v = Number(document.getElementById('fMetaValor').value);
  if(USAR_SUPABASE && supabase && currentGroupId) {
    await supabase.from('metas').delete().eq('grupo_id', currentGroupId).eq('mes_referencia', mes);
    if(v>0) await supabase.from('metas').insert([{ grupo_id: currentGroupId, mes_referencia: mes, valor_meta: v }]);
    carregarTudoSupabase();
  } else {
    if(v>0) metas[mes] = v; else delete metas[mes];
    salvarLocal('metas', metas); processarDadosGlobais();
  }
  showToast("Meta salva!"); 
}

async function salvarOrcamento() {
  const mes = getMesGlobal(); const c = document.getElementById('fOrcCat').value; const v = Number(document.getElementById('fOrcValor').value);
  if(!mes || !c || !v) return;
  if(USAR_SUPABASE && supabase && currentGroupId) {
    await supabase.from('orcamentos_categoria').delete().eq('grupo_id', currentGroupId).eq('mes_referencia', mes).eq('categoria', c);
    await supabase.from('orcamentos_categoria').insert([{ grupo_id: currentGroupId, mes_referencia: mes, categoria: c, limite_valor: v }]);
    carregarTudoSupabase();
  } else {
    if(!orcamentos[mes]) orcamentos[mes] = {}; orcamentos[mes][c] = v;
    salvarLocal('orcamentos', orcamentos); processarDadosGlobais();
  }
  showToast("Limite definido!"); 
}
async function removerOrcamento(cat) { 
  const mes = getMesGlobal(); 
  if(USAR_SUPABASE && supabase && currentGroupId) { await supabase.from('orcamentos_categoria').delete().eq('grupo_id', currentGroupId).eq('mes_referencia', mes).eq('categoria', cat); carregarTudoSupabase(); }
  else { if(orcamentos[mes]) { delete orcamentos[mes][cat]; salvarLocal('orcamentos', orcamentos); processarDadosGlobais(); } }
  showToast("Removido."); 
}

async function salvarFuturo() {
  const obj = { id: generateId(), descricao: document.getElementById('fFutDesc').value, tipo: document.getElementById('fFutTipo').value, categoria: document.getElementById('fFutCat').value, valor: Number(document.getElementById('fFutValor').value), data: document.getElementById('fFutData').value };
  if(!obj.descricao || !obj.valor || !obj.data) return;
  if(USAR_SUPABASE && supabase && currentGroupId) {
    await supabase.from('planejamentos').insert([{ grupo_id: currentGroupId, descricao: obj.descricao, tipo: obj.tipo, categoria: obj.categoria, valor_previsto: obj.valor, data_prevista: obj.data }]); carregarTudoSupabase();
  } else { futuros.push(obj); salvarLocal('futuros', futuros); processarDadosGlobais(); }
  showToast("Plano salvo!"); 
}
async function excluirFuturo(id) { 
  if(USAR_SUPABASE && supabase && currentGroupId) { await supabase.from('planejamentos').delete().eq('id', id); carregarTudoSupabase(); }
  else { futuros = futuros.filter(f=>f.id!==id); salvarLocal('futuros', futuros); processarDadosGlobais(); }
}
async function efetivarFuturo(id) {
  const f = futuros.find(i=>i.id===id) || ((USAR_SUPABASE && supabase) ? await supabase.from('planejamentos').select('*').eq('id',id).single().then(r=>r.data) : null);
  if(!f) return;
  const desc = f.descricao; const tipo = f.tipo; const cat = f.categoria; const val = f.valor || f.valor_previsto; const dta = f.data || f.data_prevista;
  if(USAR_SUPABASE && supabase && currentGroupId) {
    await supabase.from('lancamentos').insert([{ grupo_id: currentGroupId, descricao: desc, tipo: tipo, categoria: cat, valor: val, vencimento: dta, status: 'pendente', criado_por: sessionUser.id }]);
    await supabase.from('planejamentos').delete().eq('id', id); carregarTudoSupabase();
  } else {
    dados.push({ id: generateId(), descricao: desc, tipo: tipo, categoria: cat, valor: val, vencimento: dta, status: 'pendente' });
    futuros = futuros.filter(i=>i.id!==id); salvarLocal('dados', dados); salvarLocal('futuros', futuros); processarDadosGlobais();
  }
  showToast("Efetivado!"); 
}

async function salvarRecorrente() {
  const obj = { id: generateId(), descricao: document.getElementById('fRecDesc').value, categoria: document.getElementById('fRecCat').value, valor: Number(document.getElementById('fRecValor').value), dia: Number(document.getElementById('fRecDia').value) };
  if(!obj.descricao || !obj.valor || !obj.dia) return;
  if(USAR_SUPABASE && supabase && currentGroupId) {
    await supabase.from('recorrencias').insert([{ grupo_id: currentGroupId, descricao: obj.descricao, categoria: obj.categoria, valor: obj.valor, dia_vencimento: obj.dia }]); carregarTudoSupabase();
  } else { recorrentes.push(obj); salvarLocal('recorrentes', recorrentes); processarDadosGlobais(); }
  showToast("Recorrente salva!"); 
}
async function excluirRecorrente(id) { 
  if(USAR_SUPABASE && supabase && currentGroupId) { await supabase.from('recorrencias').delete().eq('id', id); carregarTudoSupabase(); }
  else { recorrentes = recorrentes.filter(r=>r.id!==id); salvarLocal('recorrentes', recorrentes); processarDadosGlobais(); }
}

async function gerarParcelamento() {
  const desc = document.getElementById('fParDesc').value; const valorTotal = Number(document.getElementById('fParValor').value); const qtd = Number(document.getElementById('fParQtd').value); const dataInicio = document.getElementById('fParData').value; const cat = document.getElementById('fParCat').value;
  if(!desc || !valorTotal || !qtd || !dataInicio) return;
  const valorParcela = valorTotal / qtd; let d = new Date(dataInicio);
  const pacotes = []; const dLocais = [];
  for(let i=1; i<=qtd; i++) {
    const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    pacotes.push({ grupo_id: currentGroupId, descricao: `${desc} (${i}/${qtd})`, tipo: 'despesa', categoria: cat, valor: valorParcela, vencimento: dStr, status: 'pendente', criado_por: sessionUser?.id });
    dLocais.push({ id: generateId(), descricao: `${desc} (${i}/${qtd})`, tipo: 'despesa', categoria: cat, valor: valorParcela, vencimento: dStr, status: 'pendente' });
    d.setMonth(d.getMonth()+1);
  }
  if(USAR_SUPABASE && supabase && currentGroupId) {
    await supabase.from('lancamentos').insert(pacotes);
    await supabase.from('parcelamentos').insert([{ grupo_id: currentGroupId, descricao: desc, valor_total: valorTotal, quantidade_parcelas: qtd, categoria: cat }]);
    carregarTudoSupabase();
  } else {
    dLocais.forEach(l => dados.push(l));
    parcelamentos.push({ id: generateId(), descricao: desc, valorTotal: valorTotal, parcelas: qtd, dataCriacao: new Date().toISOString() });
    salvarLocal('dados', dados); salvarLocal('parcelamentos', parcelamentos); processarDadosGlobais();
  }
  showToast("Parcelas geradas!"); 
}

/* ========================================================
   FUNÇÕES GLOBAIS UI E EXIBIÇÃO (Reaproveitadas)
   ======================================================== */
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container'); if(!container) return;
  const toast = document.createElement('div'); toast.className = `toast toast-${type}`; toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast); setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); }, 3000);
}
function formatMoeda(val) {
  const cur = config.moeda || 'BRL';
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: cur });
}
function formatDataHora(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}
function formatData(iso) { if(!iso) return '-'; const p = iso.split('-'); return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; }

function calcularStatus(item) {
  if (!item) return 'pendente';
  if (item.status === 'pago') return 'pago';
  if (!item.vencimento) return 'pendente';
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const p = item.vencimento.split('-');
  if (p.length === 3 && new Date(p[0], p[1]-1, p[2]) < hoje) return 'atrasado';
  return 'pendente';
}
function getBadgeHtml(st) {
  if(st==='pago') return '<span class="badge bg-success">Pago</span>';
  if(st==='atrasado') return '<span class="badge bg-danger">Atrasado</span>';
  return '<span class="badge bg-warning">Pendente</span>';
}

function aplicarModoVisualizacao() {
  const isMobile = window.innerWidth < 768; const modoFinal = config.modo === 'auto' ? (isMobile ? 'celular' : 'pc') : config.modo;
  if (modoFinal === 'celular') { document.body.classList.add('modo-celular'); document.body.classList.remove('modo-pc'); }
  else { document.body.classList.add('modo-pc'); document.body.classList.remove('modo-celular'); document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlayMenu').classList.remove('active'); }
}
const titulosModulos = {
  dashboard: "Dashboard",
  assistente: "Assistente",
  lancamentos: "Lançamentos",
  metas: "Metas do mês",
  gastos: "Controle de gastos",
  planejamento: "Planejamento",
  recorrentes: "Contas recorrentes",
  parcelamentos: "Parcelamentos",
  mercado: "Lista de mercado",
  categorias: "Categorias",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  backup: "Backup"
};

function toggleSidebarPC() { document.getElementById('sidebar').classList.toggle('collapsed-pc'); }
function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('overlayMenu').classList.toggle('active'); }

function abrirModulo(modulo) {
  if(!modulo) return;
  
  // Map old config.inicio fallback
  if(modulo === 'config') modulo = 'configuracoes';
  if(modulo === 'orcamento') modulo = 'gastos';
  if(modulo === 'futuro') modulo = 'planejamento';

  document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active')); 
  const btn = document.querySelector(`.menu-item[data-module="${modulo}"]`); 
  if(btn) btn.classList.add('active');
  
  document.querySelectorAll('.module').forEach(el => { el.classList.add('hidden'); el.classList.remove('active'); });
  const alvo = document.getElementById(`mod-${modulo}`);
  if(alvo) {
    alvo.classList.remove('hidden'); 
    alvo.classList.add('active');
  }
  
  const titulo = titulosModulos[modulo] || "FinançasCasa";
  const pTitle = document.getElementById('pageTitle');
  if(pTitle) pTitle.innerText = titulo;
  
  if(document.body.classList.contains('modo-celular')) { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlayMenu').classList.remove('active'); }
}

function limparFiltroGlobal() { document.getElementById('filtroGlobalMes').value = ''; processarDadosGlobais(); }
function getMesGlobal() { return document.getElementById('filtroGlobalMes').value; }
function getLancamentosFiltrados(mes = getMesGlobal()) { return mes ? dados.filter(i => i.vencimento && i.vencimento.startsWith(mes)) : dados; }

function popularSelectCategorias() {
  const options = [...new Set(categorias)].sort().map(c => `<option value="${c}">${c}</option>`).join('');
  ['fCat', 'fOrcCat', 'fFutCat', 'fRecCat', 'fParCat'].forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = options; });
}
function popularDatalistDescricao() {
  const setDesc = new Set(); dados.forEach(i => setDesc.add(i.descricao));
  const dList = document.getElementById('sugestoesDescricao'); dList.innerHTML = '';
  Array.from(setDesc).sort().forEach(d => { const opt = document.createElement('option'); opt.value = d; dList.appendChild(opt); });
}

function processarDadosGlobais() {
  popularSelectCategorias(); popularDatalistDescricao(); analisarIA();
  renderDashboard(); renderLancamentos(); renderMetas(); renderOrcamento(); renderFuturo(); renderRecorrentes(); renderParcelamentos(); renderCategorias(); renderListaMercado(); gerarRelatorioTela();
  
  const mes = getMesGlobal(); const qtdLanc = getLancamentosFiltrados(mes).length;
  const bLanc = document.getElementById('badgeLanc'); if(qtdLanc > 0) { bLanc.innerText = qtdLanc; bLanc.classList.remove('hidden'); } else bLanc.classList.add('hidden');
  const bIA = document.getElementById('badgeIA'); if(iaContext.qtdAlertas > 0) { bIA.innerText = iaContext.qtdAlertas; bIA.classList.remove('hidden'); bIA.classList.add('badge-alert'); } else bIA.classList.add('hidden');
}

/* RENDERIZADORES */
function renderDashboard() {
  const fDados = getLancamentosFiltrados();
  let rec=0, des=0, pend=0, pg=0, atrasadas=0; let catDesc = {};
  fDados.forEach(i => { if(i.tipo==='receita') rec+=i.valor; else { des+=i.valor; catDesc[i.categoria]=(catDesc[i.categoria]||0)+i.valor; }
    const st = calcularStatus(i); if(st==='pago') pg++; else if(st==='atrasado') atrasadas++; else pend++; });
  const saldo = rec-des;
  document.getElementById('dashReceitas').innerText = formatMoeda(rec); document.getElementById('dashDespesas').innerText = formatMoeda(des);
  document.getElementById('dashSaldo').innerText = formatMoeda(saldo); document.getElementById('dashSaldo').className = saldo>=0 ? 'c-green' : 'c-red';
  document.getElementById('dashPendentes').innerText = pend+atrasadas; document.getElementById('dashPagas').innerText = pg;
  
  const dashSaude = document.getElementById('dashSaudeCard');
  if(fDados.length === 0) { dashSaude.innerText = "-"; dashSaude.style.color = "var(--text)"; }
  else if(saldo >= 0 && atrasadas === 0 && pend === 0) { dashSaude.innerText = "Excelente"; dashSaude.style.color = "var(--success)"; }
  else if(saldo >= 0 && atrasadas === 0 && pend > 0) { dashSaude.innerText = "Boa"; dashSaude.style.color = "var(--success)"; }
  else if(atrasadas > 0) { dashSaude.innerText = "Atenção Crítica"; dashSaude.style.color = "var(--danger)"; }
  else if(saldo < 0) { dashSaude.innerText = "Crítico"; dashSaude.style.color = "var(--danger)"; }
  else { dashSaude.innerText = "Atenção"; dashSaude.style.color = "var(--warning)"; }
  
  const resumoIA = document.getElementById('dashResumoIAHtml');
  if(fDados.length === 0) { resumoIA.innerHTML = `<p>Sem lançamentos neste período.</p>`; } else {
    const maiorCat = Object.entries(catDesc).sort((a,b)=>b[1]-a[1])[0];
    resumoIA.innerHTML = `<strong>Maior Gasto:</strong> ${maiorCat?maiorCat[0]:'N/A'} <br><strong>Atrasadas:</strong> ${atrasadas}<br><em>Mantenha o controle!</em>`;
  }
  
  const hoje = new Date(); hoje.setHours(0,0,0,0); const dataLimite = new Date(hoje); dataLimite.setDate(hoje.getDate() + 7);
  const venc7dias = fDados.filter(i => i.vencimento && i.vencimento.split('-').length===3 && calcularStatus(i)!=='pago' && new Date(i.vencimento.split('-')[0], i.vencimento.split('-')[1]-1, i.vencimento.split('-')[2]) <= dataLimite).sort((a,b)=>(a.vencimento && b.vencimento) ? (new Date(a.vencimento)-new Date(b.vencimento)) : 0);
  let vHtml = ''; venc7dias.forEach(i => vHtml += `<div style="border-bottom:1px solid var(--border); padding:10px 0;"><strong style="font-size:13px;">${i.descricao}</strong><br><span style="font-size:11px; font-weight:bold;">${formatData(i.vencimento)}</span> - <strong>${formatMoeda(i.valor)}</strong></div>`);
  document.getElementById('dashProxVencHtml').innerHTML = vHtml || '<div style="padding:20px;">Tudo em dia!</div>';
  
  let catH = ''; const totalD = des||1;
  Object.keys(catDesc).sort((a,b)=>catDesc[b]-catDesc[a]).forEach(c => { const pct = (catDesc[c]/totalD)*100; catH += `<div class="bar-container"><div class="bar-header"><span>${c} (${pct.toFixed(1)}%)</span><span>${formatMoeda(catDesc[c])}</span></div><div class="bar-track"><div class="bar-fill bg-danger" style="width:${pct}%"></div></div></div>`; });
  document.getElementById('dashCategoriasHtml').innerHTML = catH||'<div style="padding:20px;">Sem gastos.</div>';
  
  let rH = ''; fDados.filter(i=>i.tipo==='despesa').sort((a,b)=>b.valor-a.valor).slice(0,5).forEach((i, idx) => { rH += `<div style="padding:12px 0; border-bottom:1px solid var(--border);"><strong>${idx+1}.</strong> ${i.descricao} - <strong class="c-red">${formatMoeda(i.valor)}</strong><br><span style="font-size:12px;">${i.categoria} | ${getBadgeHtml(calcularStatus(i))}</span></div>`; });
  document.getElementById('dashRankingHtml').innerHTML = rH||'<div style="padding:20px;">Sem gastos.</div>';
}

function editarLancamento(id) {
  const item = dados.find(d => d.id === id);
  if (!item) return;
  editLancId = id;
  const pForm = document.getElementById('panelFormLanc');
  pForm.classList.add('panel-edit-mode');
  document.getElementById('formLancTitle').innerText = 'Editar Lançamento';
  document.getElementById('btnSalvarLanc').innerText = 'Salvar Alterações';
  document.getElementById('btnSalvarLanc').className = 'btn btn-warning';
  document.getElementById('btnCancelLanc').classList.remove('hidden');
  document.getElementById('fDesc').value = item.descricao;
  document.getElementById('fValor').value = item.valor;
  document.getElementById('fVenc').value = item.vencimento;
  document.getElementById('fTipo').value = item.tipo;
  document.getElementById('fCat').value = item.categoria;
  document.getElementById('fStatus').value = item.status;
  document.getElementById('fPgto').value = item.formaPagamento || 'Outro';
  document.getElementById('fResp').value = item.responsavel || '';
  document.getElementById('fObs').value = item.observacao || '';
  pForm.scrollIntoView({ behavior: 'smooth' });
}
function cancelarEdicaoLancamento() {
  editLancId = null;
  document.getElementById('panelFormLanc').classList.remove('panel-edit-mode');
  document.getElementById('formLancTitle').innerText = 'Novo Lançamento';
  document.getElementById('btnSalvarLanc').innerText = 'Salvar Lançamento';
  document.getElementById('btnSalvarLanc').className = 'btn btn-primary';
  document.getElementById('btnCancelLanc').classList.add('hidden');
  limparFormLanc();
}
function limparFormLanc() { ['fDesc','fValor','fVenc','fResp','fObs'].forEach(id => document.getElementById(id).value = ''); document.getElementById('fStatus').value = 'pendente'; }

/* LISTA DE MERCADO — ETAPA 5 */
const SUGESTOES_MERCADO = ['Arroz', 'Feijão', 'Leite', 'Café', 'Açúcar', 'Carne', 'Frango', 'Ovos', 'Detergente', 'Papel higiênico'];
let editMercadoId = null;

const abasMercado = {
  lista: { tab: 'abaLista', panel: 'mkt-panel-lista' },
  'modo-compra': { tab: 'abaModoCompra', panel: 'mkt-panel-modo-compra' },
  historico: { tab: 'abaHistorico', panel: 'mkt-panel-historico' },
  hub: { tab: 'abaHubOfertas', panel: 'mkt-panel-hub' }
};

function escapeHtmlMercado(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizarListaMercado() {
  if (!Array.isArray(listaMercado)) listaMercado = [];
  listaMercado = listaMercado.map(item => {
    const statusCompra = item.statusCompra || (item.marcado ? 'comprado' : 'pendente');
    return {
      id: item.id || generateId(),
      nome: item.nome || item.produto || '',
      qtd: Number(item.qtd || item.quantidade || 1) || 1,
      unidade: item.unidade || 'un',
      preco: Number(item.preco || item.valorEstimado || 0) || 0,
      mercado: item.mercado || '',
      obs: item.obs || item.observacao || '',
      marcado: statusCompra === 'comprado',
      statusCompra,
      valorReal: Number(item.valorReal || 0) || 0,
      obsCompra: item.obsCompra || ''
    };
  }).filter(item => item.nome);
}

function salvarListaMercado() {
  normalizarListaMercado();
  salvarLocal('listaMercado', listaMercado);
}

function totaisMercado() {
  normalizarListaMercado();
  const totalPrevisto = listaMercado.reduce((s, i) => s + (Number(i.preco) || 0), 0);
  const totalReal = listaMercado.reduce((s, i) => s + valorRealItemMercado(i), 0);
  const dif = totalReal - totalPrevisto;
  return { totalPrevisto, totalReal, dif };
}

function valorRealItemMercado(i) {
  if (Number(i.valorReal) > 0) return Number(i.valorReal);
  if (['comprado', 'substituido'].includes(i.statusCompra)) return Number(i.preco) || 0;
  return 0;
}

function labelStatusCompra(st) {
  return { pendente: 'Pendente', comprado: 'Comprado', nao_encontrado: 'Não encontrado', substituido: 'Substituído' }[st] || 'Pendente';
}

function classeCardCompra(st) {
  if (st === 'comprado') return 'comprado';
  if (st === 'nao_encontrado') return 'nao-encontrado';
  if (st === 'substituido') return 'substituido';
  return '';
}

function aplicarSugestaoMercado(nome) {
  const input = document.getElementById('inputItemMercado');
  if (input) { input.value = nome; input.focus(); }
}

function limparFormMercado() {
  ['inputItemMercado', 'inputPrecoMercado', 'inputObsMercado'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const qtd = document.getElementById('inputQtdMercado'); if (qtd) qtd.value = '1';
  const uni = document.getElementById('inputUnidadeMercado'); if (uni) uni.value = 'un';
  const mer = document.getElementById('selectMercadoDestino'); if (mer) mer.value = '';
}

function editarItemMercado(id) {
  const item = listaMercado.find(i => i.id === id);
  if (!item) return;
  editMercadoId = id;
  document.getElementById('inputItemMercado').value = item.nome;
  document.getElementById('inputQtdMercado').value = item.qtd || 1;
  document.getElementById('inputUnidadeMercado').value = item.unidade || 'un';
  document.getElementById('inputPrecoMercado').value = item.preco || '';
  document.getElementById('selectMercadoDestino').value = item.mercado || '';
  document.getElementById('inputObsMercado').value = item.obs || '';
  document.getElementById('formMercadoTitle').innerText = 'Editar item';
  document.getElementById('btnSalvarMercado').innerText = 'Salvar alterações';
  document.getElementById('btnCancelMercado').classList.remove('hidden');
  document.getElementById('panelFormMercado').scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicaoMercado() {
  editMercadoId = null;
  limparFormMercado();
  document.getElementById('formMercadoTitle').innerText = 'Adicionar item';
  document.getElementById('btnSalvarMercado').innerText = 'Adicionar item';
  document.getElementById('btnCancelMercado').classList.add('hidden');
}

function adicionarItemMercado() {
  const nome = document.getElementById('inputItemMercado').value.trim();
  if (!nome) return showToast('Informe o produto.', 'warning');
  normalizarListaMercado();
  const obj = {
    id: editMercadoId || generateId(),
    nome,
    qtd: Number(document.getElementById('inputQtdMercado').value) || 1,
    unidade: document.getElementById('inputUnidadeMercado').value || 'un',
    preco: Number(document.getElementById('inputPrecoMercado').value) || 0,
    mercado: document.getElementById('selectMercadoDestino').value || '',
    obs: document.getElementById('inputObsMercado').value.trim(),
    marcado: false,
    statusCompra: 'pendente',
    valorReal: 0,
    obsCompra: ''
  };
  if (editMercadoId) {
    const idx = listaMercado.findIndex(i => i.id === editMercadoId);
    if (idx !== -1) {
      obj.statusCompra = listaMercado[idx].statusCompra || 'pendente';
      obj.valorReal = listaMercado[idx].valorReal || 0;
      obj.obsCompra = listaMercado[idx].obsCompra || '';
      obj.marcado = listaMercado[idx].statusCompra === 'comprado';
      listaMercado[idx] = obj;
    }
  } else {
    listaMercado.push(obj);
  }
  salvarListaMercado();
  cancelarEdicaoMercado();
  renderListaMercado();
  showToast('Item salvo!');
}

function removerItemMercado(id) {
  if (!confirm('Excluir este item da lista?')) return;
  normalizarListaMercado();
  listaMercado = listaMercado.filter(i => i.id !== id);
  salvarListaMercado();
  if (editMercadoId === id) cancelarEdicaoMercado();
  renderListaMercado();
  showToast('Item excluído.', 'warning');
}

function setStatusCompra(id, status) {
  normalizarListaMercado();
  const item = listaMercado.find(i => i.id === id);
  if (!item) return;
  item.statusCompra = status;
  item.marcado = status === 'comprado';
  salvarListaMercado();
  renderListaMercado();
}

function atualizarValorRealMercado(id, valor) {
  normalizarListaMercado();
  const item = listaMercado.find(i => i.id === id);
  if (!item) return;
  item.valorReal = Number(valor) || 0;
  salvarListaMercado();
  renderListaMercado();
}

function atualizarObsCompraMercado(id, valor) {
  normalizarListaMercado();
  const item = listaMercado.find(i => i.id === id);
  if (!item) return;
  item.obsCompra = String(valor || '').trim();
  salvarListaMercado();
}

function renderItemMercadoCard(i) {
  return `<div class="mkt-item-card ${classeCardCompra(i.statusCompra)}">
    <div class="mkt-item-card-head">
      <div style="flex:1;">
        <strong>${escapeHtmlMercado(i.nome)}</strong>
        <div class="mkt-item-meta">
          <span class="mkt-tag">${escapeHtmlMercado(i.qtd)} ${escapeHtmlMercado(i.unidade)}</span>
          ${i.preco ? `<span class="mkt-tag preco">${formatMoeda(i.preco)}</span>` : ''}
          ${i.mercado ? `<span class="mkt-tag mercado">${escapeHtmlMercado(i.mercado)}</span>` : ''}
          <span class="mkt-tag">${escapeHtmlMercado(labelStatusCompra(i.statusCompra))}</span>
        </div>
        ${i.obs ? `<div class="pro-muted" style="margin-top:6px;">${escapeHtmlMercado(i.obs)}</div>` : ''}
      </div>
      <div class="action-cell">
        <button type="button" class="btn btn-outline btn-sm" onclick="editarItemMercado('${i.id}')">Editar</button>
        <button type="button" class="btn btn-danger btn-sm" onclick="removerItemMercado('${i.id}')">Excluir</button>
      </div>
    </div>
  </div>`;
}

function renderModoCompraItem(i) {
  const st = i.statusCompra || 'pendente';
  return `<div class="mkt-item-card ${classeCardCompra(st)}">
    <div style="width:100%;">
      <strong>${escapeHtmlMercado(i.nome)}</strong>
      <div class="pro-muted" style="margin-top:4px;">${escapeHtmlMercado(i.qtd)} ${escapeHtmlMercado(i.unidade)} · Previsto: ${formatMoeda(i.preco || 0)}${i.mercado ? ' · ' + escapeHtmlMercado(i.mercado) : ''}</div>
      <div class="mkt-status-group">
        ${['pendente', 'comprado', 'nao_encontrado', 'substituido'].map(s => `<button type="button" class="mkt-status-btn ${s === 'pendente' ? 'active-pend' : s === 'comprado' ? 'active-comp' : s === 'nao_encontrado' ? 'active-nao' : 'active-sub'} ${st === s ? 'active' : ''}" style="${st === s ? 'opacity:1;' : 'opacity:.75;'}" onclick="setStatusCompra('${i.id}','${s}')">${labelStatusCompra(s)}</button>`).join('')}
      </div>
      <div class="mkt-compra-fields">
        <div class="form-group" style="margin:0;">
          <label>Valor real (R$)</label>
          <input type="number" class="form-control" min="0" step="0.01" placeholder="0,00" value="${i.valorReal || ''}" onchange="atualizarValorRealMercado('${i.id}', this.value)">
        </div>
        <div class="form-group" style="margin:0;">
          <label>Observação rápida</label>
          <input type="text" class="form-control" placeholder="Ex.: promoção, marca trocada" value="${String(i.obsCompra || '').replace(/"/g, '&quot;')}" onchange="atualizarObsCompraMercado('${i.id}', this.value)">
        </div>
      </div>
    </div>
  </div>`;
}

function atualizarResumoMercadoHeader() {
  const { totalPrevisto, totalReal, dif } = totaisMercado();
  const tEl = document.getElementById('mercadoTotalLista'); if (tEl) tEl.innerText = formatMoeda(totalPrevisto);
  const cEl = document.getElementById('mktCount'); if (cEl) cEl.innerText = listaMercado.length;
  const realEl = document.getElementById('mktTotalReal'); if (realEl) realEl.innerText = formatMoeda(totalReal);
  const difEl = document.getElementById('mktTotalDif');
  if (difEl) {
    if (!totalReal) { difEl.innerText = '—'; difEl.className = ''; }
    else {
      difEl.innerText = formatMoeda(dif);
      difEl.className = dif > 0 ? 'c-up' : dif < 0 ? 'c-down' : '';
    }
  }
  const mes = getMesGlobal();
  const gastosMercado = getLancamentosFiltrados(mes).filter(l => l.tipo === 'despesa' && (((l.categoria || '').toLowerCase().includes('mercado')) || ((l.categoria || '').toLowerCase().includes('alimenta')))).reduce((sum, l) => sum + l.valor, 0);
  const gastoEl = document.getElementById('mercadoGastoMes'); if (gastoEl) gastoEl.innerText = formatMoeda(gastosMercado);
}

function renderListaMercado() {
  normalizarListaMercado();
  atualizarResumoMercadoHeader();
  const el = document.getElementById('listaMercadoHtml');
  if (el) {
    el.innerHTML = listaMercado.length
      ? listaMercado.map(i => renderItemMercadoCard(i)).join('')
      : '<div class="pro-card">Sua lista está vazia. Use as sugestões rápidas ou adicione itens manualmente.</div>';
  }
  renderModoCompraMercado();
  renderHistoricoMercado();
  renderPromocoesMercado();
  renderDicaInteligenteMercado();
}

function renderModoCompraMercado(mensagem) {
  const el = document.getElementById('modoCompraHtml');
  if (!el) return;
  if (mensagem) {
    el.innerHTML = `<div class="pro-card">${escapeHtmlMercado(mensagem)}</div>`;
    return;
  }
  if (!listaMercado.length) {
    el.innerHTML = '<div class="pro-card">Adicione itens à lista antes de iniciar a compra.</div>';
    return;
  }
  el.innerHTML = listaMercado.map(i => renderModoCompraItem(i)).join('');
}

function abrirAbaMercado(nomeAba, evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
  const alvo = abasMercado[nomeAba] ? nomeAba : 'lista';
  Object.keys(abasMercado).forEach(nome => {
    const tab = document.getElementById(abasMercado[nome].tab);
    const panel = document.getElementById(abasMercado[nome].panel);
    if (tab) tab.classList.toggle('active', nome === alvo);
    if (panel) panel.classList.toggle('active', nome === alvo);
  });
  if (alvo === 'modo-compra') renderModoCompraMercado();
  if (alvo === 'historico') renderHistoricoMercado();
  if (alvo === 'hub') { renderPromocoesMercado(); renderDicaInteligenteMercado(); }
}

function iniciarModoCompra(evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
  normalizarListaMercado();
  abrirAbaMercado('modo-compra');
  if (!listaMercado.length) {
    showToast('Adicione itens à lista antes de iniciar a compra.', 'warning');
    return renderModoCompraMercado('Adicione itens à lista antes de iniciar a compra.');
  }
  renderModoCompraMercado();
}

function limparListaMercado(evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
  if (!confirm('Deseja limpar todos os itens da lista de mercado?')) return;
  listaMercado = [];
  salvarListaMercado();
  cancelarEdicaoMercado();
  renderListaMercado();
  showToast('Lista limpa.');
}

function listaMercadoVaziaExportacao() {
  normalizarListaMercado();
  if (listaMercado.length) return false;
  showToast('Não há itens para exportar.', 'warning');
  return true;
}

function openModalDownload(evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
  if (listaMercadoVaziaExportacao()) return;
  document.getElementById('modalDownloadLista')?.classList.add('open');
}

function closeModalDownload() {
  document.getElementById('modalDownloadLista')?.classList.remove('open');
}

function baixarArquivoMercado(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function baixarTXT() {
  if (listaMercadoVaziaExportacao()) return;
  let txt = 'MINHA LISTA DE COMPRAS - FINANCASCASA\n';
  txt += 'Gerado em: ' + new Date().toLocaleDateString('pt-BR') + '\n\n';
  const { totalPrevisto } = totaisMercado();
  listaMercado.forEach(i => {
    txt += `[${labelStatusCompra(i.statusCompra)}] ${i.nome} - ${i.qtd || 1} ${i.unidade || 'un'}${i.mercado ? ' (' + i.mercado + ')' : ''}${i.preco ? ' | ' + formatMoeda(i.preco) : ''}${i.obs ? ' | Obs: ' + i.obs : ''}\n`;
  });
  txt += `\nTotal previsto: ${formatMoeda(totalPrevisto)}\n`;
  baixarArquivoMercado(`Lista_Mercado_${new Date().toISOString().split('T')[0]}.txt`, txt, 'text/plain;charset=utf-8');
  closeModalDownload();
}

function baixarCSV() {
  if (listaMercadoVaziaExportacao()) return;
  const linhas = [['produto', 'quantidade', 'unidade', 'valor estimado', 'mercado', 'observação', 'status']];
  listaMercado.forEach(i => linhas.push([
    i.nome, i.qtd || 1, i.unidade || 'un', (Number(i.preco) || 0).toFixed(2).replace('.', ','),
    i.mercado || '', i.obs || '', labelStatusCompra(i.statusCompra)
  ]));
  const csv = linhas.map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  baixarArquivoMercado(`Lista_Mercado_${new Date().toISOString().split('T')[0]}.csv`, csv, 'text/csv;charset=utf-8');
  closeModalDownload();
}

function imprimirLista() {
  if (listaMercadoVaziaExportacao()) return;
  const printEl = document.getElementById('print-lista');
  const mod = document.getElementById('mod-mercado');
  const { totalPrevisto } = totaisMercado();
  if (printEl) {
    printEl.innerHTML = `<div style="font-family:Arial,sans-serif;padding:24px;">
      <h1 style="font-size:22px;margin:0 0 8px;">Lista de Mercado</h1>
      <div style="font-size:12px;margin-bottom:18px;">Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th>Status</th><th>Produto</th><th>Qtd.</th><th>Valor est.</th><th>Mercado</th><th>Obs.</th></tr></thead>
        <tbody>${listaMercado.map(i => `<tr><td>${labelStatusCompra(i.statusCompra)}</td><td>${escapeHtmlMercado(i.nome)}</td><td>${escapeHtmlMercado(i.qtd || 1)} ${escapeHtmlMercado(i.unidade || 'un')}</td><td>${formatMoeda(i.preco || 0)}</td><td>${escapeHtmlMercado(i.mercado || '-')}</td><td>${escapeHtmlMercado(i.obs || '-')}</td></tr>`).join('')}</tbody>
      </table>
      <h2 style="font-size:16px;margin-top:18px;">Total previsto: ${formatMoeda(totalPrevisto)}</h2>
    </div>`;
  }
  if (mod) mod.classList.add('mkt-printing');
  closeModalDownload();
  window.print();
  setTimeout(() => {
    if (mod) mod.classList.remove('mkt-printing');
    if (printEl) printEl.innerHTML = '';
  }, 500);
}

function openModalFinalizar() {
  normalizarListaMercado();
  if (!listaMercado.length) return showToast('A lista está vazia.', 'warning');
  const { totalPrevisto, totalReal, dif } = totaisMercado();
  const totalUsado = totalReal || totalPrevisto;
  const resEl = document.getElementById('mktFinResumo');
  if (resEl) {
    resEl.innerHTML = `
      <div class="mkt-resumo-box"><span>Total previsto</span><strong>${formatMoeda(totalPrevisto)}</strong></div>
      <div class="mkt-resumo-box"><span>Total real</span><strong>${formatMoeda(totalReal || totalPrevisto)}</strong></div>
      <div class="mkt-resumo-box"><span>Diferença</span><strong class="${dif > 0 ? 'c-up' : dif < 0 ? 'c-down' : ''}">${totalReal ? formatMoeda(dif) : '—'}</strong></div>`;
  }
  document.getElementById('modalFinalizar')?.classList.add('open');
}

function closeFinalizar() {
  document.getElementById('modalFinalizar')?.classList.remove('open');
}

function descricaoCompraMercado() {
  const mes = getMesGlobal() || hojeISO().slice(0, 7);
  const [a, m] = mes.split('-').map(Number);
  const label = new Date(a, (m || 1) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return `Compra de Mercado - ${label}`;
}

function confirmarFinalizarCompra(lancarFinanceiro) {
  normalizarListaMercado();
  if (!listaMercado.length) return closeFinalizar();
  const { totalPrevisto, totalReal } = totaisMercado();
  const total = totalReal || totalPrevisto;
  if (!Array.isArray(historicoCopras)) historicoCopras = [];
  historicoCopras.push({
    id: generateId(),
    data: new Date().toISOString(),
    totalPrevisto,
    totalReal: total,
    diferenca: total - totalPrevisto,
    total,
    itens: listaMercado.map(i => ({ ...i })),
    pagamento: (document.getElementById('mktFinPgto') || {}).value || '',
    responsavel: (document.getElementById('mktFinResp') || {}).value || ''
  });
  salvarLocal('historicoCopras', historicoCopras);
  if (lancarFinanceiro && total > 0) {
    const cat = categorias.includes('Alimentação') ? 'Alimentação' : (categorias.includes('Mercado') ? 'Mercado' : 'Alimentação');
    dados.push({
      id: generateId(),
      descricao: descricaoCompraMercado(),
      tipo: 'despesa',
      categoria: cat,
      valor: total,
      vencimento: hojeISO(),
      status: 'pago',
      formaPagamento: (document.getElementById('mktFinPgto') || {}).value || 'Outro',
      responsavel: (document.getElementById('mktFinResp') || {}).value || '',
      observacao: 'Lançado pela Lista de Mercado'
    });
    salvarLocal('dados', dados);
  }
  listaMercado = [];
  salvarListaMercado();
  closeFinalizar();
  abrirAbaMercado('historico');
  processarDadosGlobais();
  showToast(lancarFinanceiro ? 'Compra finalizada e lançada no financeiro!' : 'Compra salva no histórico!');
}

function renderHistoricoMercado() {
  const el = document.getElementById('historicoComprasHtml');
  if (!el) return;
  if (!Array.isArray(historicoCopras)) historicoCopras = [];
  el.innerHTML = historicoCopras.length ? historicoCopras.slice().reverse().map(h => {
    const prev = h.totalPrevisto != null ? h.totalPrevisto : (h.itens || []).reduce((s, i) => s + (Number(i.preco) || 0), 0);
    const real = h.totalReal != null ? h.totalReal : h.total || 0;
    const dif = h.diferenca != null ? h.diferenca : real - prev;
    return `<div class="hist-card">
      <div>
        <strong>${formatMoeda(real)}</strong>
        <div class="pro-muted" style="margin-top:4px;">${new Date(h.data).toLocaleDateString('pt-BR')} · ${(h.itens || []).length} itens</div>
        <div class="hist-card-grid">
          <div class="mini-stat"><span>Previsto</span><strong>${formatMoeda(prev)}</strong></div>
          <div class="mini-stat"><span>Real</span><strong>${formatMoeda(real)}</strong></div>
          <div class="mini-stat"><span>Diferença</span><strong class="${dif > 0 ? 'c-red' : dif < 0 ? 'c-green' : ''}">${formatMoeda(dif)}</strong></div>
          <div class="mini-stat"><span>Pagamento</span><strong style="font-size:13px;">${escapeHtmlMercado(h.pagamento || '-')}</strong></div>
        </div>
      </div>
      <div class="action-cell" style="flex-direction:column;align-items:flex-end;">
        <button type="button" class="btn btn-outline btn-sm" onclick="visualizarHistoricoCompra('${h.id}')">Visualizar</button>
        <button type="button" class="btn btn-danger btn-sm" onclick="excluirHistoricoCompra('${h.id}')">Excluir</button>
      </div>
    </div>`;
  }).join('') : '<div class="pro-card">Nenhuma compra no histórico.</div>';
}

function visualizarHistoricoCompra(id) {
  const h = historicoCopras.find(x => x.id === id);
  if (!h) return;
  document.getElementById('modalHistoricoTitulo').innerText = `Compra de ${new Date(h.data).toLocaleDateString('pt-BR')}`;
  document.getElementById('modalHistoricoConteudo').innerHTML = `<div class="pro-summary-strip" style="margin-bottom:14px;">
    <div class="mini-stat"><span>Previsto</span><strong>${formatMoeda(h.totalPrevisto || 0)}</strong></div>
    <div class="mini-stat"><span>Real</span><strong>${formatMoeda(h.totalReal || h.total || 0)}</strong></div>
    <div class="mini-stat"><span>Itens</span><strong>${(h.itens || []).length}</strong></div>
  </div>${(h.itens || []).map(i => `<div class="mkt-item-card ${classeCardCompra(i.statusCompra || 'pendente')}" style="margin-bottom:8px;">
    <strong>${escapeHtmlMercado(i.nome)}</strong>
    <div class="pro-muted">${escapeHtmlMercado(i.qtd || 1)} ${escapeHtmlMercado(i.unidade || 'un')} · Previsto ${formatMoeda(i.preco || 0)} · Real ${formatMoeda(valorRealItemMercado(i))}</div>
    ${i.obsCompra || i.obs ? `<div class="pro-muted">${escapeHtmlMercado(i.obsCompra || i.obs)}</div>` : ''}
  </div>`).join('')}`;
  document.getElementById('modalHistoricoCompra').classList.add('open');
}

function fecharModalHistoricoCompra() {
  document.getElementById('modalHistoricoCompra')?.classList.remove('open');
}

function excluirHistoricoCompra(id) {
  if (!confirm('Excluir esta compra do histórico?')) return;
  historicoCopras = historicoCopras.filter(h => h.id !== id);
  salvarLocal('historicoCopras', historicoCopras);
  renderHistoricoMercado();
  showToast('Compra excluída do histórico.', 'warning');
}

function renderDicaInteligenteMercado() {
  const el = document.getElementById('mktDicaInteligente');
  const header = document.getElementById('mktDicaIA');
  if (!el && !header) return;
  normalizarListaMercado();
  const pendentes = listaMercado.filter(i => i.statusCompra === 'pendente');
  const nomes = listaMercado.map(i => i.nome.toLowerCase());
  const promos = Array.isArray(promocoesMercado) ? promocoesMercado : [];
  const matches = promos.filter(p => nomes.some(n => p.desc.toLowerCase().includes(n.split(' ')[0])));
  let dica = 'Monte sua lista com quantidade e valor estimado para comparar previsão e gasto real na finalização.';
  if (pendentes.length) {
    const caros = [...pendentes].sort((a, b) => (b.preco || 0) - (a.preco || 0))[0];
    dica = `Você tem ${pendentes.length} item(ns) pendente(s). Priorize ${caros.nome}${caros.preco ? ' (' + formatMoeda(caros.preco) + ')' : ''} e confira promoções anotadas antes de pagar.`;
  }
  if (matches.length) dica += ` Há ${matches.length} promoção(ões) anotada(s) relacionada(s) aos itens da sua lista.`;
  if (el) el.innerHTML = `<strong style="color:#166534;">Dica inteligente</strong><p style="font-size:13px;color:#15803d;margin-top:6px;line-height:1.6;">${escapeHtmlMercado(dica)}</p>`;
  if (header) header.innerText = dica;
}

function adicionarPromocao() {
  const input = document.getElementById('inputPromoDesc');
  if (!input || !input.value.trim()) return showToast('Descreva a promoção.', 'warning');
  if (!Array.isArray(promocoesMercado)) promocoesMercado = [];
  promocoesMercado.push({ id: generateId(), desc: input.value.trim(), data: new Date().toISOString() });
  salvarLocal('promocoesMercado', promocoesMercado);
  input.value = '';
  renderPromocoesMercado();
  renderDicaInteligenteMercado();
  showToast('Promoção salva!');
}

function removerPromocao(id) {
  promocoesMercado = (Array.isArray(promocoesMercado) ? promocoesMercado : []).filter(p => p.id !== id);
  salvarLocal('promocoesMercado', promocoesMercado);
  renderPromocoesMercado();
  renderDicaInteligenteMercado();
}

function renderPromocoesMercado() {
  const el = document.getElementById('promocoesMercadoHtml');
  if (!el) return;
  if (!Array.isArray(promocoesMercado)) promocoesMercado = [];
  el.innerHTML = promocoesMercado.length ? promocoesMercado.slice().reverse().map(p => `<div class="hub-promo-card">
    <div><strong>${escapeHtmlMercado(p.desc)}</strong><div class="pro-muted" style="margin-top:4px;">${new Date(p.data).toLocaleDateString('pt-BR')}</div></div>
    <button type="button" class="btn btn-danger btn-sm" onclick="removerPromocao('${p.id}')">Excluir</button>
  </div>`).join('') : '<div class="pro-card">Nenhuma promoção anotada.</div>';
}

function renderSugestoesMercado() {
  const el = document.getElementById('mktSugestoes');
  if (!el) return;
  el.innerHTML = SUGESTOES_MERCADO.map(s => `<button type="button" class="sug-btn" onclick="aplicarSugestaoMercado('${s.replace(/'/g, "\\'")}')">${escapeHtmlMercado(s)}</button>`).join('');
}

function inicializarEventosMercado() {
  renderSugestoesMercado();
  [
    ['btnIniciarCompra', iniciarModoCompra],
    ['btnExportarLista', openModalDownload],
    ['btnLimparLista', limparListaMercado],
    ['abaLista', evt => abrirAbaMercado('lista', evt)],
    ['abaModoCompra', evt => abrirAbaMercado('modo-compra', evt)],
    ['abaHistorico', evt => abrirAbaMercado('historico', evt)],
    ['abaHubOfertas', evt => abrirAbaMercado('hub', evt)]
  ].forEach(([id, handler]) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.mercadoEventoOk) {
      el.dataset.mercadoEventoOk = '1';
      el.addEventListener('click', evt => { evt.preventDefault(); handler(evt); });
    }
  });
  renderListaMercado();
  abrirAbaMercado('lista');
}

window.abrirAbaMercado = abrirAbaMercado;
window.iniciarModoCompra = iniciarModoCompra;
window.openModalDownload = openModalDownload;
window.limparListaMercado = limparListaMercado;
window.baixarTXT = baixarTXT;
window.baixarCSV = baixarCSV;
window.imprimirLista = imprimirLista;
window.aplicarSugestaoMercado = aplicarSugestaoMercado;
window.editarItemMercado = editarItemMercado;
window.cancelarEdicaoMercado = cancelarEdicaoMercado;
window.setStatusCompra = setStatusCompra;
window.visualizarHistoricoCompra = visualizarHistoricoCompra;
window.excluirHistoricoCompra = excluirHistoricoCompra;
window.fecharModalHistoricoCompra = fecharModalHistoricoCompra;
window.confirmarFinalizarCompra = confirmarFinalizarCompra;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicializarEventosMercado);
else inicializarEventosMercado();

/* ===== CAMADA PRO VISUAL E FUNCIONAL - LOCAL ===== */
let backupPendente = null;
let relatorioAtual = { titulo: '', tipo: 'geral', periodo: '', emitido: '', resumo: { rec: 0, des: 0, saldo: 0, qtd: 0 }, linhas: [], colunas: [], dados: [] };
let iaContext = { qtdAlertas: 0 };
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escAttr(v){return esc(v).replace(/`/g,'&#96;');}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function hojeISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function baixarArquivo(nome,conteudo,tipo){const b=new Blob([conteudo],{type:tipo});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=nome;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);}
function csvValor(v){return `"${String(v??'').replace(/"/g,'""')}"`;}
function resumoLancamentos(lista){const rec=lista.filter(i=>i.tipo==='receita').reduce((s,i)=>s+Number(i.valor||0),0);const des=lista.filter(i=>i.tipo==='despesa').reduce((s,i)=>s+Number(i.valor||0),0);const pago=lista.filter(i=>calcularStatus(i)==='pago').length;return{rec,des,saldo:rec-des,pago,aberto:lista.length-pago};}
function agruparPorCategoria(lista){const m={};lista.filter(i=>i.tipo==='despesa').forEach(i=>m[i.categoria]=(m[i.categoria]||0)+Number(i.valor||0));return m;}
function corCategoria(c){if(categoriasDetalhes[c]?.cor)return categoriasDetalhes[c].cor;const cores=['#6366f1','#0ea5e9','#10b981','#f59e0b','#f43f5e','#8b5cf6','#14b8a6','#64748b'];let s=0;String(c).split('').forEach(ch=>s+=ch.charCodeAt(0));return cores[s%cores.length];}
function iconCategoria(c){return categoriasDetalhes[c]?.icone||String(c||'?').trim().charAt(0).toUpperCase();}
function proximoRecorrente(dia){const base=getMesGlobal()||hojeISO().slice(0,7);const[a,m]=base.split('-').map(Number);const ult=new Date(a,m,0).getDate();return `${a}-${String(m).padStart(2,'0')}-${String(Math.min(Number(dia)||1,ult)).padStart(2,'0')}`;}
function aprimorarEstruturaVisual(){
  document.body.classList.toggle('theme-dark',config.tema==='escuro');
  document.body.classList.toggle('modo-compacto',config.densidade==='compacto');
  sincronizarConfigUI();
}
function sincronizarConfigUI(){
  const tema=document.getElementById('configTema'); if(tema) tema.value=config.tema||'claro';
  const dens=document.getElementById('configDensidade'); if(dens) dens.value=config.densidade||'normal';
  const moeda=document.getElementById('configMoeda'); if(moeda) moeda.value=config.moeda||'BRL';
  const mesIni=document.getElementById('configMesInicial'); if(mesIni) mesIni.value=config.mesInicial||'';
  const ex=document.getElementById('configExemplo'); if(ex) ex.value=config.mostrarExemplo?'1':'0';
  const modo=document.getElementById('configModo'); if(modo) modo.value=config.modo||'auto';
  const inicio=document.getElementById('configInicio'); if(inicio) inicio.value=config.inicio||'dashboard';
}
function salvarConfigTema(){config.tema=document.getElementById('configTema').value;salvarLocal('config',config);document.body.classList.toggle('theme-dark',config.tema==='escuro');}
function salvarConfigPreferencias(){config.densidade=document.getElementById('configDensidade').value;salvarLocal('config',config);document.body.classList.toggle('modo-compacto',config.densidade==='compacto');}
function salvarConfigMoeda(){config.moeda=document.getElementById('configMoeda').value;salvarLocal('config',config);processarDadosGlobais();}
function salvarConfigMesInicial(){config.mesInicial=document.getElementById('configMesInicial').value||'';salvarLocal('config',config);if(config.mesInicial){document.getElementById('filtroGlobalMes').value=config.mesInicial;processarDadosGlobais();}}
function restaurarConfigPadrao(){if(!confirm('Restaurar as configurações padrão? Os dados financeiros não serão apagados.'))return;const keep={mostrarExemplo:!!config.mostrarExemplo,ultimoBackup:config.ultimoBackup||''};config={...CONFIG_PADRAO,...keep};salvarLocal('config',config);sincronizarConfigUI();document.body.classList.toggle('theme-dark',config.tema==='escuro');document.body.classList.toggle('modo-compacto',config.densidade==='compacto');aplicarModoVisualizacao();if(config.mesInicial)document.getElementById('filtroGlobalMes').value=config.mesInicial;processarDadosGlobais();showToast('Configurações restauradas.');}
function temDadosExemplo(){return dados.some(i=>i._exemplo)||futuros.some(i=>i._exemplo)||listaMercado.some(i=>i._exemplo)||Object.values(metas).some(m=>Array.isArray(m)&&m.some(i=>i._exemplo));}
function gerarDadosExemplo(){
  if(temDadosExemplo())return;
  const mes=getMesGlobal()||hojeISO().slice(0,7);
  const mkId=()=>'ex_'+Math.random().toString(36).slice(2,9);
  dados.push({id:mkId(),descricao:'[Exemplo] Salário',tipo:'receita',categoria:'Outros',valor:5200,vencimento:`${mes}-05`,status:'pago',formaPagamento:'Pix',responsavel:'Titular',_exemplo:true});
  dados.push({id:mkId(),descricao:'[Exemplo] Supermercado',tipo:'despesa',categoria:'Alimentação',valor:680.5,vencimento:`${mes}-12`,status:'pago',formaPagamento:'Cartão Crédito',responsavel:'Família',_exemplo:true});
  dados.push({id:mkId(),descricao:'[Exemplo] Conta de luz',tipo:'despesa',categoria:'Moradia',valor:245.9,vencimento:`${mes}-20`,status:'pendente',formaPagamento:'Boleto',responsavel:'Titular',_exemplo:true});
  const metaMes=metas[mes]||[]; metaMes.push({id:mkId(),nome:'[Exemplo] Reserva',valor:1000,_exemplo:true}); metas[mes]=metaMes;
  listaMercado.push({id:mkId(),nome:'[Exemplo] Arroz 5kg',qtd:1,preco:28.9,status:'pendente',_exemplo:true});
  salvarLocal('dados',dados); salvarLocal('metas',metas); salvarLocal('listaMercado',listaMercado);
}
function removerDadosExemplo(){
  dados=dados.filter(i=>!i._exemplo);
  futuros=futuros.filter(i=>!i._exemplo);
  listaMercado=listaMercado.filter(i=>!i._exemplo);
  Object.keys(metas).forEach(k=>{metas[k]=(metas[k]||[]).filter(i=>!i._exemplo); if(!metas[k].length)delete metas[k];});
  salvarLocal('dados',dados); salvarLocal('futuros',futuros); salvarLocal('listaMercado',listaMercado); salvarLocal('metas',metas);
}
function toggleDadosExemplo(){
  config.mostrarExemplo=document.getElementById('configExemplo').value==='1';
  salvarLocal('config',config);
  if(config.mostrarExemplo)gerarDadosExemplo(); else removerDadosExemplo();
  processarDadosGlobais();
  showToast(config.mostrarExemplo?'Dados de exemplo exibidos.':'Dados de exemplo ocultados.');
}
function getTituloRelatorio(tipo){
  return ({geral:'Relatório geral do período',receitas:'Receitas',despesas:'Despesas',pagas:'Contas pagas',pendentes:'Contas pendentes',atrasadas:'Contas atrasadas',categorias:'Por categoria',mercado:'Lista de mercado',metas:'Metas',futuro:'Planejamento futuro',parcelamentos:'Parcelamentos'})[tipo]||'Relatório';
}
function getPeriodoRelatorio(){
  const ini=document.getElementById('fRelInicio')?.value||'';
  const fim=document.getElementById('fRelFim')?.value||'';
  const mes=getMesGlobal();
  if(ini||fim)return{ini,fim,label:`${ini?formatData(ini):'...'} a ${fim?formatData(fim):'...'}`};
  if(mes){const[a,m]=mes.split('-');const ult=new Date(Number(a),Number(m),0).getDate();return{ini:`${mes}-01`,fim:`${mes}-${String(ult).padStart(2,'0')}`,label:`${m}/${a}`,mes};}
  return{ini:'',fim:'',label:'Todos os períodos'};
}
function sincronizarPeriodoRelatorio(forcar){
  const mes=getMesGlobal(); if(!mes)return;
  const[a,m]=mes.split('-'); const ult=new Date(Number(a),Number(m),0).getDate();
  const ini=`${mes}-01`, fim=`${mes}-${String(ult).padStart(2,'0')}`;
  const iniEl=document.getElementById('fRelInicio'), fimEl=document.getElementById('fRelFim');
  if(iniEl&&(forcar||!iniEl.value)) iniEl.value=ini;
  if(fimEl&&(forcar||!fimEl.value)) fimEl.value=fim;
}
function popularFiltrosRelatorio(){
  const catEl=document.getElementById('fRelCategoria');
  if(catEl){const cur=catEl.value;catEl.innerHTML='<option value="">Todas</option>'+[...new Set(categorias)].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(c=>`<option value="${escAttr(c)}">${esc(c)}</option>`).join('');catEl.value=cur;}
  const respEl=document.getElementById('fRelResponsavel');
  if(respEl){const cur=respEl.value;const resps=[...new Set(dados.map(d=>d.responsavel).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));respEl.innerHTML='<option value="">Todos</option>'+resps.map(r=>`<option value="${escAttr(r)}">${esc(r)}</option>`).join('');respEl.value=cur;}
}
function filtrarLancamentosRelatorio(base){
  let l=[...base];
  const t=document.getElementById('fRelTipo')?.value||'';
  const s=document.getElementById('fRelStatus')?.value||'';
  const c=document.getElementById('fRelCategoria')?.value||'';
  const r=document.getElementById('fRelResponsavel')?.value||'';
  const pg=document.getElementById('fRelPagamento')?.value||'';
  const periodo=getPeriodoRelatorio();
  if(periodo.ini) l=l.filter(i=>i.vencimento&&i.vencimento>=periodo.ini);
  if(periodo.fim) l=l.filter(i=>i.vencimento&&i.vencimento<=periodo.fim);
  if(t) l=l.filter(i=>i.tipo===t);
  if(s) l=l.filter(i=>calcularStatus(i)===s);
  if(c) l=l.filter(i=>i.categoria===c);
  if(r) l=l.filter(i=>(i.responsavel||'')===r);
  if(pg) l=l.filter(i=>(i.formaPagamento||'Outro')===pg);
  return l.sort((a,b)=>new Date(a.vencimento||0)-new Date(b.vencimento||0));
}
function aplicarTipoRelatorio(l,tipo){
  if(tipo==='receitas') return l.filter(i=>i.tipo==='receita');
  if(tipo==='despesas') return l.filter(i=>i.tipo==='despesa');
  if(tipo==='pagas') return l.filter(i=>calcularStatus(i)==='pago');
  if(tipo==='pendentes') return l.filter(i=>calcularStatus(i)==='pendente');
  if(tipo==='atrasadas') return l.filter(i=>calcularStatus(i)==='atrasado');
  return l;
}
function montarTabelaRelatorio(colunas,linhas){
  if(!linhas.length) return '<div class="pro-card">Nenhum registro encontrado para os filtros selecionados.</div>';
  return `<div class="report-table-wrap"><table class="report-table"><thead><tr>${colunas.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${linhas.map(row=>`<tr>${colunas.map(c=>`<td>${row[c.key]??''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function obterDadosRelatorio(tipo){
  const periodo=getPeriodoRelatorio();
  const titulo=getTituloRelatorio(tipo);
  if(['mercado','metas','futuro','parcelamentos'].includes(tipo)){
    if(tipo==='mercado'){
      const lista=[...listaMercado];
      const linhas=lista.map(i=>({descricao:esc(i.nome||i.descricao||'-'),detalhe:`Qtd: ${esc(i.qtd||1)} · Status: ${esc(i.status||'pendente')}`,valor:formatMoeda(Number(i.preco||i.valor||0)),extra:''}));
      const total=lista.reduce((s,i)=>s+Number(i.preco||i.valor||0),0);
      return {titulo,periodo:periodo.label,tipo,resumo:{rec:0,des:total,saldo:-total,qtd:lista.length},colunas:[{key:'descricao',label:'Item'},{key:'detalhe',label:'Detalhes'},{key:'valor',label:'Valor previsto'}],linhas,dados:lista};
    }
    if(tipo==='metas'){
      const mes=periodo.mes||getMesGlobal()||hojeISO().slice(0,7);
      const lista=getMetasMes(mes);
      const saldo=resumoLancamentos(getLancamentosFiltrados(mes)).saldo;
      const linhas=lista.map(m=>{const pct=m.valor?clamp((saldo/m.valor)*100,0,999):0;return{descricao:esc(m.nome),detalhe:`Meta: ${formatMoeda(m.valor)} · Atingido: ${formatMoeda(saldo)}`,valor:`${pct.toFixed(1)}%`,extra:''};});
      return {titulo,periodo:periodo.label,tipo,resumo:{rec:Math.max(saldo,0),des:0,saldo,qtd:lista.length},colunas:[{key:'descricao',label:'Meta'},{key:'detalhe',label:'Progresso'},{key:'valor',label:'Percentual'}],linhas,dados:lista};
    }
    if(tipo==='futuro'){
      let lista=[...futuros];
      if(periodo.ini) lista=lista.filter(i=>i.data&&i.data>=periodo.ini);
      if(periodo.fim) lista=lista.filter(i=>i.data&&i.data<=periodo.fim);
      const linhas=lista.map(i=>({descricao:esc(i.descricao||'-'),detalhe:`${formatData(i.data)} · ${esc(i.categoria||'-')} · ${esc(i.status||'planejado')}`,valor:formatMoeda(Number(i.valor||0)),extra:esc(i.observacao||'')}));
      const total=lista.reduce((s,i)=>s+Number(i.valor||0),0);
      return {titulo,periodo:periodo.label,tipo,resumo:{rec:0,des:total,saldo:-total,qtd:lista.length},colunas:[{key:'descricao',label:'Descrição'},{key:'detalhe',label:'Data / categoria'},{key:'valor',label:'Valor'},{key:'extra',label:'Observação'}],linhas,dados:lista};
    }
    const lista=[...parcelamentos];
    const linhas=lista.map(p=>{const st=statsParcelamento(p);return{descricao:esc(p.descricao||'-'),detalhe:`${st.pagos}/${st.total} parcelas pagas`,valor:formatMoeda(st.valorParcela),extra:formatMoeda(Number(p.valorTotal||0))};});
    const total=lista.reduce((s,p)=>s+Number(p.valorTotal||0),0);
    return {titulo,periodo:periodo.label,tipo,resumo:{rec:0,des:total,saldo:-total,qtd:lista.length},colunas:[{key:'descricao',label:'Descrição'},{key:'detalhe',label:'Progresso'},{key:'valor',label:'Parcela'},{key:'extra',label:'Total'}],linhas,dados:lista};
  }
  let l=filtrarLancamentosRelatorio(dados);
  l=aplicarTipoRelatorio(l,tipo);
  const r=resumoLancamentos(l);
  if(tipo==='categorias'){
    const cat=agruparPorCategoria(l);
    const linhas=Object.entries(cat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>({descricao:esc(c),detalhe:`${r.des?((v/r.des)*100).toFixed(1):0}% do total`,valor:formatMoeda(v),extra:''}));
    return {titulo,periodo:periodo.label,tipo,resumo:{...r,qtd:linhas.length},colunas:[{key:'descricao',label:'Categoria'},{key:'detalhe',label:'Participação'},{key:'valor',label:'Total'}],linhas,dados:linhas};
  }
  const linhas=l.map(i=>({descricao:esc(i.descricao),detalhe:`${esc(i.categoria)} · ${formatData(i.vencimento)} · ${esc(i.formaPagamento||'-')}`,valor:`<strong class="${i.tipo==='receita'?'c-green':'c-red'}">${formatMoeda(i.valor)}</strong>`,extra:`${getBadgeHtml(calcularStatus(i))} ${esc(i.responsavel||'-')}`}));
  return {titulo,periodo:periodo.label,tipo,resumo:{rec:r.rec,des:r.des,saldo:r.saldo,qtd:l.length},colunas:[{key:'descricao',label:'Descrição'},{key:'detalhe',label:'Categoria / vencimento'},{key:'valor',label:'Valor'},{key:'extra',label:'Status / responsável'}],linhas,dados:l};
}
function gerarRelatorioTela(){
  sincronizarPeriodoRelatorio(false);
  popularFiltrosRelatorio();
  const tipo=document.getElementById('tipoRelatorio')?.value||'geral';
  const emitido=new Date().toLocaleString('pt-BR');
  const pack=obterDadosRelatorio(tipo);
  relatorioAtual={...pack,emitido};
  const area=document.getElementById('relatorioViewArea');
  if(!area)return;
  area.classList.add('report-preview');
  area.innerHTML=`<div class="rel-print-header"><h1>FinançasCasa</h1><p><strong>${esc(pack.titulo)}</strong></p><p>Período: ${esc(pack.periodo)}</p><p>Emitido em: ${esc(emitido)}</p></div>
    <div class="pro-summary-strip"><div class="mini-stat"><span>Receitas</span><strong class="c-green">${formatMoeda(pack.resumo.rec)}</strong></div><div class="mini-stat"><span>Despesas</span><strong class="c-red">${formatMoeda(pack.resumo.des)}</strong></div><div class="mini-stat"><span>Saldo</span><strong class="${pack.resumo.saldo>=0?'c-green':'c-red'}">${formatMoeda(pack.resumo.saldo)}</strong></div><div class="mini-stat"><span>Registros</span><strong>${pack.resumo.qtd}</strong></div></div>
    ${montarTabelaRelatorio(pack.colunas,pack.linhas)}`;
}
function exportarRelatorioCSV(){
  if(!relatorioAtual.dados.length){showToast('Nenhum dado para exportar.','warning');return;}
  const cols=relatorioAtual.colunas.map(c=>c.label);
  const rows=[cols];
  if(['mercado','metas','futuro','parcelamentos','categorias'].includes(relatorioAtual.tipo)){
    relatorioAtual.linhas.forEach(l=>rows.push(relatorioAtual.colunas.map(c=>String(l[c.key]||'').replace(/<[^>]+>/g,''))));
  }else{
    rows.push(['descricao','tipo','categoria','vencimento','valor','status','pagamento','responsavel','observacao']);
    relatorioAtual.dados.forEach(i=>rows.push([i.descricao,i.tipo,i.categoria,i.vencimento,i.valor,calcularStatus(i),i.formaPagamento||'',i.responsavel||'',i.observacao||'']));
  }
  baixarArquivo(`relatorio_financas_${new Date().toISOString().slice(0,10)}.csv`,rows.map(r=>r.map(csvValor).join(';')).join('\n'),'text/csv;charset=utf-8');
  showToast('CSV baixado.');
}
function exportarRelatorioJSON(){baixarArquivo(`relatorio_financas_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({meta:{titulo:relatorioAtual.titulo,tipo:relatorioAtual.tipo,periodo:relatorioAtual.periodo,emitido:relatorioAtual.emitido,resumo:relatorioAtual.resumo},dados:relatorioAtual.dados},null,2),'application/json;charset=utf-8');showToast('JSON baixado.');}
function imprimirRelatorio(){gerarRelatorioTela();document.body.classList.add('print-relatorio');window.print();setTimeout(()=>document.body.classList.remove('print-relatorio'),700);}
function renderBackupInfo(){
  const el=document.getElementById('backupUltimaData');
  if(el) el.textContent=config.ultimoBackup?formatDataHora(config.ultimoBackup):'Nenhum backup registrado neste navegador.';
  const stats=document.getElementById('backupStatsHtml');
  if(stats) stats.innerHTML=`<div class="backup-stat"><span>Lançamentos</span><strong>${dados.length}</strong></div><div class="backup-stat"><span>Categorias</span><strong>${categorias.length}</strong></div><div class="backup-stat"><span>Metas (meses)</span><strong>${Object.keys(metas).length}</strong></div><div class="backup-stat"><span>Lista mercado</span><strong>${listaMercado.length}</strong></div>`;
}
function contarBackupPreview(b){
  const cfg=b.config&&typeof b.config==='object'?1:0;
  return {
    lanc:(b.dados||[]).length,
    cats:(b.categorias||[]).length,
    metas:Object.values(b.metas||{}).reduce((s,a)=>s+(Array.isArray(a)?a.length:0),0),
    mercado:(b.listaMercado||[]).length,
    config:cfg
  };
}
function cancelarImportacaoBackup(){backupPendente=null;const p=document.getElementById('backupPreview');if(p){p.classList.add('hidden');p.innerHTML='';}document.getElementById('btnConfirmarImportacao')?.classList.add('hidden');document.getElementById('btnCancelarImportacao')?.classList.add('hidden');const inp=document.getElementById('inputFileBackup');if(inp)inp.value='';}
function filtrarLancamentosAvancado(){
  let l = getLancamentosFiltrados(getMesGlobal());
  const b = (document.getElementById('buscaLancPro')?.value || document.getElementById('buscaLanc')?.value || '').toLowerCase();
  const t = document.getElementById('fLancTipo')?.value || '';
  const s = document.getElementById('fLancStatus')?.value || '';
  const c = document.getElementById('fLancCategoria')?.value || '';
  const ini = document.getElementById('fLancInicio')?.value || '';
  const fim = document.getElementById('fLancFim')?.value || '';
  const pgto = document.getElementById('fLancPgto')?.value || '';
  if (b) l = l.filter(i => `${i.descricao} ${i.categoria} ${i.responsavel || ''} ${i.observacao || ''}`.toLowerCase().includes(b));
  if (t) l = l.filter(i => i.tipo === t);
  if (s) l = l.filter(i => calcularStatus(i) === s);
  if (c) l = l.filter(i => i.categoria === c);
  if (ini) l = l.filter(i => i.vencimento && i.vencimento >= ini);
  if (fim) l = l.filter(i => i.vencimento && i.vencimento <= fim);
  if (pgto) l = l.filter(i => (i.formaPagamento || 'Outro') === pgto);
  return l;
}
function renderDashboard(){const l=getLancamentosFiltrados();const r=resumoLancamentos(l);const atras=l.filter(i=>calcularStatus(i)==='atrasado').length;const pend=l.filter(i=>calcularStatus(i)==='pendente').length;const cat=agruparPorCategoria(l);const maior=Object.entries(cat).sort((a,b)=>b[1]-a[1])[0];const tx=r.rec?clamp((r.des/r.rec)*100,0,999):0;dashReceitas.innerText=formatMoeda(r.rec);dashDespesas.innerText=formatMoeda(r.des);dashSaldo.innerText=formatMoeda(r.saldo);dashSaldo.className=r.saldo>=0?'c-green':'c-red';dashPendentes.innerText=pend+atras;dashPagas.innerText=r.pago;dashSaudeCard.innerText=!l.length?'-':atras?'Critica':r.saldo>=0?'Boa':'Atencao';dashSaudeCard.style.color=atras?'var(--danger)':r.saldo>=0?'var(--success)':'var(--warning)';dashResumoIAHtml.innerHTML=`<div class="pro-summary-strip"><div class="mini-stat"><span>Comprometimento</span><strong>${tx.toFixed(1)}%</strong></div><div class="mini-stat"><span>Maior categoria</span><strong>${maior?esc(maior[0]):'-'}</strong></div><div class="mini-stat"><span>Em aberto</span><strong>${r.aberto}</strong></div><div class="mini-stat"><span>Saldo</span><strong class="${r.saldo>=0?'c-green':'c-red'}">${formatMoeda(r.saldo)}</strong></div></div><div class="ia-alert ${atras?'danger':r.saldo>=0?'success':'warning'}">${atras?`Existem ${atras} lancamento(s) atrasado(s).`:r.saldo>=0?'Periodo positivo. Acompanhe vencimentos e metas.':'Despesas acima das receitas. Revise prioridades.'}</div>`;const hoje=new Date();hoje.setHours(0,0,0,0);const lim=new Date(hoje);lim.setDate(lim.getDate()+7);const prox=l.filter(i=>i.vencimento&&calcularStatus(i)!=='pago'&&new Date(i.vencimento+'T00:00:00')<=lim).sort((a,b)=>new Date(a.vencimento)-new Date(b.vencimento)).slice(0,6);dashProxVencHtml.innerHTML=prox.length?prox.map(i=>`<div class="list-row"><div class="pro-card-title"><span>${esc(i.descricao)}</span><strong class="${i.tipo==='receita'?'c-green':'c-red'}">${formatMoeda(i.valor)}</strong></div><div class="pro-muted">${formatData(i.vencimento)} - ${esc(i.categoria)} - ${calcularStatus(i)}</div></div>`).join(''):'<div class="pro-card">Tudo em dia nos proximos 7 dias.</div>';dashCategoriasHtml.innerHTML=Object.keys(cat).length?Object.entries(cat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`<div class="bar-container"><div class="bar-header"><span>${esc(c)}</span><span>${formatMoeda(v)}</span></div><div class="bar-track"><div class="bar-fill bg-danger" style="width:${clamp((v/(r.des||1))*100,0,100)}%"></div></div></div>`).join(''):'<div class="pro-card">Sem despesas.</div>';dashRankingHtml.innerHTML=l.filter(i=>i.tipo==='despesa').sort((a,b)=>b.valor-a.valor).slice(0,6).map((i,n)=>`<div class="list-row"><div class="pro-card-title"><span>${n+1}. ${esc(i.descricao)}</span><strong class="c-red">${formatMoeda(i.valor)}</strong></div><div class="pro-muted">${esc(i.categoria)} - ${formatData(i.vencimento)}</div></div>`).join('')||'<div class="pro-card">Sem despesas.</div>';}
function renderLancamentos() {
  const cs = document.getElementById('fLancCategoria');
  if (cs) {
    const a = cs.value;
    cs.innerHTML = '<option value="">Todas</option>' + [...new Set(categorias)].sort((x, y) => x.localeCompare(y, 'pt-BR')).map(c => `<option value="${escAttr(c)}">${esc(c)}</option>`).join('');
    cs.value = a;
  }
  sincronizarBuscaLanc();
  const l = filtrarLancamentosAvancado().sort((a, b) => new Date(a.vencimento || 0) - new Date(b.vencimento || 0));
  const r = resumoLancamentos(l);
  const re = document.getElementById('lancResumoFiltrado');
  if (re) {
    re.innerHTML = `<div class="mini-stat"><span>Receitas filtradas</span><strong class="c-green">${formatMoeda(r.rec)}</strong></div>
      <div class="mini-stat"><span>Despesas filtradas</span><strong class="c-red">${formatMoeda(r.des)}</strong></div>
      <div class="mini-stat"><span>Saldo filtrado</span><strong class="${r.saldo >= 0 ? 'c-green' : 'c-red'}">${formatMoeda(r.saldo)}</strong></div>
      <div class="mini-stat"><span>Em aberto</span><strong>${r.aberto}</strong></div>`;
  }
  let tb = '', lst = '';
  l.forEach(i => {
    const st = calcularStatus(i);
    const cor = i.tipo === 'receita' ? 'c-green' : 'c-red';
    const tipoPill = `<span class="tipo-pill ${i.tipo}">${i.tipo === 'receita' ? 'Receita' : 'Despesa'}</span>`;
    const p = st !== 'pago' ? `<button type="button" class="btn btn-success btn-sm" onclick="pagarLancamento('${escAttr(i.id)}')">Pagar</button>` : '';
    const e = `<button type="button" class="btn btn-warning btn-sm" onclick="editarLancamento('${escAttr(i.id)}')">Editar</button>`;
    const d = `<button type="button" class="btn btn-danger btn-sm" onclick="excluirLancamento('${escAttr(i.id)}')">Excluir</button>`;
    tb += `<tr>
      <td><strong>${esc(i.descricao)}</strong>${i.responsavel ? `<div class="pro-muted">${esc(i.responsavel)}</div>` : ''}</td>
      <td>${esc(i.categoria)}</td>
      <td>${formatData(i.vencimento)}</td>
      <td class="col-valor ${cor}"><strong>${formatMoeda(i.valor)}</strong></td>
      <td class="col-status">${getBadgeHtml(st)}</td>
      <td class="col-acoes"><div class="action-cell">${p}${e}${d}</div></td>
    </tr>`;
    lst += `<div class="mobile-card">
      <div class="mobile-card-header"><span>${esc(i.descricao)}</span><strong class="${cor}">${formatMoeda(i.valor)}</strong></div>
      <div class="mobile-card-info">${tipoPill} ${esc(i.categoria)} · ${formatData(i.vencimento)} · ${getBadgeHtml(st)}</div>
      <div class="mobile-card-actions">${p}${e}${d}</div>
    </div>`;
  });
  document.getElementById('listaLancTabela').innerHTML = tb || '<tr><td colspan="6" class="empty-row">Nenhum lançamento encontrado.</td></tr>';
  document.getElementById('listaLancMobile').innerHTML = lst || '<div class="pro-card">Nenhum lançamento encontrado.</div>';
  atualizarChipsLanc();
}
let editMetaId = null;
let editOrcCat = null;
let editFutId = null;

function getMetasMes(m = getMesGlobal()) {
  const raw = metas[m];
  if (Array.isArray(raw)) return raw;
  if (Number(raw) > 0) return [{ id: 'principal', nome: 'Meta do mês', valor: Number(raw) }];
  return [];
}

function statusMetaInfo(atingido, valor) {
  const pct = valor ? (atingido / valor) * 100 : 0;
  if (pct >= 100) return { label: 'Concluída', cls: 'goal-status-done', bar: 'bg-success' };
  if (pct >= 50) return { label: 'Em risco', cls: 'goal-status-risk', bar: 'bg-warning' };
  return { label: 'Em andamento', cls: 'goal-status-progress', bar: 'bg-info' };
}

function badgeMetaStatus(st) {
  return `<span class="goal-status ${st.cls}">${esc(st.label)}</span>`;
}

function resumoMetasGeral(lista, saldo) {
  const totalPlanejado = lista.reduce((s, m) => s + Number(m.valor || 0), 0);
  const pctGeral = totalPlanejado ? clamp((saldo / totalPlanejado) * 100, 0, 999) : 0;
  return { qtd: lista.length, totalPlanejado, totalAtingido: saldo, pctGeral };
}

function editarMeta(id) {
  const m = getMetasMes().find(x => x.id === id);
  if (!m) return;
  editMetaId = id;
  document.getElementById('fMetaNome').value = m.nome;
  document.getElementById('fMetaValor').value = m.valor;
  document.getElementById('formMetaTitle').innerText = 'Editar meta';
  document.getElementById('btnSalvarMeta').innerText = 'Salvar alterações';
  document.getElementById('btnCancelMeta').classList.remove('hidden');
  document.getElementById('panelFormMeta').scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicaoMeta() {
  editMetaId = null;
  document.getElementById('fMetaNome').value = '';
  document.getElementById('fMetaValor').value = '';
  document.getElementById('formMetaTitle').innerText = 'Nova meta';
  document.getElementById('btnSalvarMeta').innerText = 'Salvar meta';
  document.getElementById('btnCancelMeta').classList.add('hidden');
}

function salvarMeta() {
  const m = getMesGlobal();
  const v = Number(document.getElementById('fMetaValor').value);
  const nome = (document.getElementById('fMetaNome').value || 'Meta do mês').trim();
  if (!m || !v || v <= 0) return showToast('Informe mês e valor da meta.', 'warning');
  if (!nome) return showToast('Informe o nome da meta.', 'warning');
  let l = getMetasMes(m);
  if (editMetaId) {
    const idx = l.findIndex(x => x.id === editMetaId);
    if (idx === -1) return cancelarEdicaoMeta();
    l[idx] = { ...l[idx], nome, valor: v };
  } else {
    l = l.filter(x => x.id !== 'principal');
    l.push({ id: generateId(), nome, valor: v });
  }
  metas[m] = l;
  salvarLocal('metas', metas);
  cancelarEdicaoMeta();
  processarDadosGlobais();
  showToast('Meta salva!');
}

function removerMeta(id) {
  if (!confirm('Excluir esta meta?')) return;
  const m = getMesGlobal();
  metas[m] = getMetasMes(m).filter(x => x.id !== id);
  if (!metas[m].length) delete metas[m];
  salvarLocal('metas', metas);
  if (editMetaId === id) cancelarEdicaoMeta();
  processarDadosGlobais();
  showToast('Meta excluída.', 'warning');
}

function renderMetas() {
  const lista = getMetasMes();
  const saldo = resumoLancamentos(getLancamentosFiltrados()).saldo;
  const rg = resumoMetasGeral(lista, saldo);
  const resEl = document.getElementById('metaResumoGeral');
  if (resEl) {
    resEl.innerHTML = `<div class="mini-stat"><span>Total de metas</span><strong>${rg.qtd}</strong></div>
      <div class="mini-stat"><span>Valor planejado</span><strong>${formatMoeda(rg.totalPlanejado)}</strong></div>
      <div class="mini-stat"><span>Total atingido</span><strong class="${rg.totalAtingido >= 0 ? 'c-green' : 'c-red'}">${formatMoeda(rg.totalAtingido)}</strong></div>
      <div class="mini-stat"><span>Percentual geral</span><strong>${rg.pctGeral.toFixed(1)}%</strong></div>`;
  }
  const el = document.getElementById('metaProgressoHtml');
  if (!el) return;
  el.innerHTML = lista.length ? lista.map(meta => {
    const atingido = saldo;
    const pct = meta.valor ? clamp((atingido / meta.valor) * 100, 0, 100) : 0;
    const st = statusMetaInfo(atingido, meta.valor);
    return `<div class="goal-card">
      <div class="goal-card-head">
        <div><strong>${esc(meta.nome)}</strong><div style="margin-top:6px;">${badgeMetaStatus(st)}</div></div>
        <div class="action-cell">
          <button type="button" class="btn btn-outline btn-sm" onclick="editarMeta('${escAttr(meta.id)}')">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="removerMeta('${escAttr(meta.id)}')">Excluir</button>
        </div>
      </div>
      <div class="goal-card-metrics">
        <div class="goal-metric"><span>Valor da meta</span><strong>${formatMoeda(meta.valor)}</strong></div>
        <div class="goal-metric"><span>Valor atingido</span><strong class="${atingido >= 0 ? 'c-green' : 'c-red'}">${formatMoeda(atingido)}</strong></div>
        <div class="goal-metric"><span>Percentual</span><strong>${pct.toFixed(1)}%</strong></div>
        <div class="goal-metric"><span>Status</span><strong>${esc(st.label)}</strong></div>
      </div>
      <div class="bar-track"><div class="bar-fill ${st.bar}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('') : '<div class="pro-card">Nenhuma meta cadastrada para este mês.</div>';
}

function statusOrcamentoInfo(pct) {
  if (pct >= 100) return { label: 'Ultrapassado', cls: 'budget-status-over', bar: 'bg-danger' };
  if (pct >= 80) return { label: 'Atenção', cls: 'budget-status-warn', bar: 'bg-warning' };
  return { label: 'Dentro do limite', cls: 'budget-status-ok', bar: 'bg-success' };
}

function resumoOrcamentoGeral(orc, cat) {
  const cats = Object.keys(orc);
  let totalLimite = 0, totalGasto = 0, acima = 0, atencao = 0;
  cats.forEach(c => {
    const lim = Number(orc[c] || 0);
    const gas = Number(cat[c] || 0);
    const pct = lim ? (gas / lim) * 100 : 0;
    totalLimite += lim;
    totalGasto += gas;
    if (pct >= 100) acima++;
    else if (pct >= 80) atencao++;
  });
  return { totalLimite, totalGasto, acima, atencao, qtd: cats.length };
}

function editarOrcamento(cat) {
  const mes = getMesGlobal();
  const lim = orcamentos[mes]?.[cat];
  if (lim == null) return;
  editOrcCat = cat;
  document.getElementById('fOrcCat').value = cat;
  document.getElementById('fOrcCat').disabled = true;
  document.getElementById('fOrcValor').value = lim;
  document.getElementById('formOrcTitle').innerText = 'Editar limite';
  document.getElementById('btnSalvarOrc').innerText = 'Salvar alterações';
  document.getElementById('btnCancelOrc').classList.remove('hidden');
  document.getElementById('panelFormOrc').scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicaoOrcamento() {
  editOrcCat = null;
  document.getElementById('fOrcValor').value = '';
  document.getElementById('fOrcCat').disabled = false;
  document.getElementById('formOrcTitle').innerText = 'Definir limite';
  document.getElementById('btnSalvarOrc').innerText = 'Definir limite';
  document.getElementById('btnCancelOrc').classList.add('hidden');
}

function salvarOrcamento() {
  const mes = getMesGlobal();
  const c = editOrcCat || document.getElementById('fOrcCat').value;
  const v = Number(document.getElementById('fOrcValor').value);
  if (!mes || !c || !v || v <= 0) return showToast('Informe categoria e limite válido.', 'warning');
  if (!orcamentos[mes]) orcamentos[mes] = {};
  orcamentos[mes][c] = v;
  salvarLocal('orcamentos', orcamentos);
  cancelarEdicaoOrcamento();
  processarDadosGlobais();
  showToast('Limite salvo!');
}

function renderOrcamento() {
  const mes = getMesGlobal();
  const orc = orcamentos[mes] || {};
  const cat = agruparPorCategoria(getLancamentosFiltrados(mes));
  const rg = resumoOrcamentoGeral(orc, cat);
  const resEl = document.getElementById('orcResumoGeral');
  if (resEl) {
    resEl.innerHTML = `<div class="mini-stat"><span>Total de limites</span><strong>${formatMoeda(rg.totalLimite)}</strong></div>
      <div class="mini-stat"><span>Total gasto</span><strong class="c-red">${formatMoeda(rg.totalGasto)}</strong></div>
      <div class="mini-stat"><span>Acima do limite</span><strong class="c-red">${rg.acima}</strong></div>
      <div class="mini-stat"><span>Em atenção</span><strong>${rg.atencao}</strong></div>`;
  }
  const el = document.getElementById('orcamentoProgressoHtml');
  if (!el) return;
  const cats = Object.keys(orc).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  el.innerHTML = cats.length ? cats.map(c => {
    const lim = Number(orc[c] || 0);
    const gas = Number(cat[c] || 0);
    const rest = lim - gas;
    const pct = lim ? (gas / lim) * 100 : 0;
    const st = statusOrcamentoInfo(pct);
    return `<div class="budget-card">
      <div class="budget-card-head">
        <div>
          <strong>${esc(c)}</strong>
          <div style="margin-top:6px;"><span class="budget-status ${st.cls}">${esc(st.label)}</span></div>
        </div>
        <div class="action-cell">
          <button type="button" class="btn btn-outline btn-sm" onclick="editarOrcamento('${escAttr(c)}')">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="removerOrcamento('${escAttr(c)}')">Excluir</button>
        </div>
      </div>
      <div class="budget-card-metrics">
        <div class="budget-metric"><span>Limite mensal</span><strong>${formatMoeda(lim)}</strong></div>
        <div class="budget-metric"><span>Gasto atual</span><strong class="c-red">${formatMoeda(gas)}</strong></div>
        <div class="budget-metric"><span>Saldo restante</span><strong class="${rest >= 0 ? 'c-green' : 'c-red'}">${formatMoeda(rest)}</strong></div>
        <div class="budget-metric"><span>Percentual usado</span><strong>${pct.toFixed(1)}%</strong></div>
      </div>
      <div class="bar-track"><div class="bar-fill ${st.bar}" style="width:${clamp(pct, 0, 100)}%"></div></div>
    </div>`;
  }).join('') : '<div class="pro-card">Defina limites por categoria para acompanhar o consumo.</div>';
}

function diasAteData(data) {
  if (!data) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(data + 'T00:00:00');
  return Math.ceil((alvo - hoje) / 86400000);
}

function statusFuturoInfo(item) {
  if ((item.status || 'pendente') === 'cancelado') return { label: 'Cancelado', cls: 'fut-status-cancel' };
  const dias = diasAteData(item.data);
  if (dias != null && dias < 0) return { label: 'Passado', cls: 'fut-status-warn' };
  if (dias != null && dias <= 30) return { label: 'Próximos 30 dias', cls: 'fut-status-ok' };
  return { label: 'Agendado', cls: 'fut-status-muted' };
}

function badgeFuturoStatus(st) {
  return `<span class="fut-status ${st.cls}">${esc(st.label)}</span>`;
}

function resumoFuturoHorizonte(lista) {
  const ativos = lista.filter(i => (i.status || 'pendente') !== 'cancelado');
  const sumRange = (max) => ativos.filter(i => {
    const d = diasAteData(i.data);
    return d != null && d >= 0 && d <= max;
  }).reduce((s, i) => s + Number(i.valor || 0), 0);
  return {
    d30: sumRange(30),
    d60: sumRange(60),
    d90: sumRange(90),
    total: ativos.reduce((s, i) => s + Number(i.valor || 0), 0)
  };
}

function limparFormFuturo() {
  ['fFutDesc', 'fFutValor', 'fFutData', 'fFutObs'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const st = document.getElementById('fFutStatus'); if (st) st.value = 'pendente';
  const tp = document.getElementById('fFutTipo'); if (tp) tp.value = 'despesa';
}

function editarFuturo(id) {
  const item = futuros.find(f => f.id === id);
  if (!item) return;
  editFutId = id;
  document.getElementById('fFutDesc').value = item.descricao || '';
  document.getElementById('fFutTipo').value = item.tipo || 'despesa';
  document.getElementById('fFutCat').value = item.categoria || '';
  document.getElementById('fFutValor').value = item.valor || '';
  document.getElementById('fFutData').value = item.data || '';
  document.getElementById('fFutObs').value = item.observacao || '';
  document.getElementById('fFutStatus').value = item.status || 'pendente';
  document.getElementById('formFutTitle').innerText = 'Editar planejamento';
  document.getElementById('btnSalvarFut').innerText = 'Salvar alterações';
  document.getElementById('btnCancelFut').classList.remove('hidden');
  document.getElementById('panelFormFut').scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicaoFuturo() {
  editFutId = null;
  limparFormFuturo();
  document.getElementById('formFutTitle').innerText = 'Novo planejamento';
  document.getElementById('btnSalvarFut').innerText = 'Adicionar planejamento';
  document.getElementById('btnCancelFut').classList.add('hidden');
}

function salvarFuturo() {
  const obj = {
    id: editFutId || generateId(),
    descricao: document.getElementById('fFutDesc').value.trim(),
    tipo: document.getElementById('fFutTipo').value,
    categoria: document.getElementById('fFutCat').value,
    valor: Number(document.getElementById('fFutValor').value),
    data: document.getElementById('fFutData').value,
    observacao: document.getElementById('fFutObs').value.trim(),
    status: document.getElementById('fFutStatus').value || 'pendente'
  };
  if (!obj.descricao || !obj.valor || !obj.data || obj.valor <= 0) return showToast('Preencha descrição, valor e data.', 'warning');
  if (editFutId) {
    const idx = futuros.findIndex(f => f.id === editFutId);
    if (idx !== -1) futuros[idx] = obj;
  } else {
    futuros.push(obj);
  }
  salvarLocal('futuros', futuros);
  cancelarEdicaoFuturo();
  processarDadosGlobais();
  showToast('Planejamento salvo!');
}

function renderFuturoCardActions(item) {
  const cancelado = (item.status || 'pendente') === 'cancelado';
  const efetivar = cancelado ? '' : `<button type="button" class="btn btn-success btn-sm" onclick="efetivarFuturo('${escAttr(item.id)}')">Transformar em lançamento</button>`;
  return `${efetivar}
    <button type="button" class="btn btn-outline btn-sm" onclick="editarFuturo('${escAttr(item.id)}')">Editar</button>
    <button type="button" class="btn btn-danger btn-sm" onclick="excluirFuturo('${escAttr(item.id)}')">Excluir</button>`;
}

function renderFuturo() {
  const rs = resumoFuturoHorizonte(futuros);
  const resEl = document.getElementById('futuroResumoHtml');
  if (resEl) {
    resEl.innerHTML = `<div class="mini-stat"><span>Próximos 30 dias</span><strong>${formatMoeda(rs.d30)}</strong></div>
      <div class="mini-stat"><span>Próximos 60 dias</span><strong>${formatMoeda(rs.d60)}</strong></div>
      <div class="mini-stat"><span>Próximos 90 dias</span><strong>${formatMoeda(rs.d90)}</strong></div>
      <div class="mini-stat"><span>Total previsto</span><strong>${formatMoeda(rs.total)}</strong></div>`;
  }
  const timeline = document.getElementById('futuroTimelineHtml');
  if (timeline) {
    const byMonth = {};
    [...futuros].sort((a, b) => String(a.data).localeCompare(String(b.data))).forEach(i => {
      const mes = (i.data || '').slice(0, 7) || 'sem-data';
      if (!byMonth[mes]) byMonth[mes] = [];
      byMonth[mes].push(i);
    });
    const meses = Object.keys(byMonth).sort();
    timeline.innerHTML = meses.length ? meses.map(mes => {
      const label = mes === 'sem-data' ? 'Sem data' : new Date(mes + '-01T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const items = byMonth[mes].map(i => {
        const st = statusFuturoInfo(i);
        const cor = i.tipo === 'receita' ? 'c-green' : 'c-red';
        return `<div class="timeline-item">
          <div class="timeline-item-main">
            <strong>${esc(i.descricao)}</strong>
            <div class="pro-muted">${esc(i.categoria)} · ${formatData(i.data)} · ${i.tipo === 'receita' ? 'Receita' : 'Despesa'}</div>
            ${i.observacao ? `<div class="pro-muted" style="margin-top:4px;">${esc(i.observacao)}</div>` : ''}
            <div style="margin-top:6px;">${badgeFuturoStatus(st)}</div>
          </div>
          <div>
            <div class="${cor}" style="font-weight:800;text-align:right;margin-bottom:8px;">${formatMoeda(i.valor)}</div>
            <div class="timeline-item-actions">${renderFuturoCardActions(i)}</div>
          </div>
        </div>`;
      }).join('');
      return `<div class="timeline-month"><div class="timeline-month-head">${esc(label)}</div>${items}</div>`;
    }).join('') : '<div class="pro-card">Nenhum planejamento futuro cadastrado.</div>';
  }
  const tb = document.getElementById('listFuturoTabela');
  if (tb) {
    tb.innerHTML = futuros.length ? [...futuros].sort((a, b) => String(a.data).localeCompare(String(b.data))).map(i => {
      const st = statusFuturoInfo(i);
      const cor = i.tipo === 'receita' ? 'c-green' : 'c-red';
      return `<tr>
        <td><strong>${esc(i.descricao)}</strong>${i.observacao ? `<div class="pro-muted">${esc(i.observacao)}</div>` : ''}</td>
        <td>${formatData(i.data)}</td>
        <td class="${cor}"><strong>${formatMoeda(i.valor)}</strong></td>
        <td>${badgeFuturoStatus(st)}</td>
        <td><div class="action-cell">${renderFuturoCardActions(i)}</div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5">Nenhum planejamento.</td></tr>';
  }
}
let editRecId = null;

function recorrenteAtivo(r) {
  return (r.ativo || 'ativo') !== 'inativo' && r.status !== 'inativo';
}

function proximoVencRecorrente(r) {
  return proximoRecorrente(r.dia);
}

function jaGeradoRecorrenteMes(id) {
  const r = recorrentes.find(x => x.id === id);
  if (!r) return false;
  const venc = proximoVencRecorrente(r);
  return dados.some(d => d.recorrenteId === id && d.vencimento === venc);
}

function resumoRecorrentes() {
  const ativas = recorrentes.filter(recorrenteAtivo);
  const totalMensal = ativas.reduce((s, r) => s + Number(r.valor || 0), 0);
  const proximas = ativas.map(r => ({ ...r, proximo: proximoVencRecorrente(r), gerado: jaGeradoRecorrenteMes(r.id) }))
    .sort((a, b) => a.proximo.localeCompare(b.proximo))
    .slice(0, 5);
  return { totalMensal, qtdAtivas: ativas.length, proximas };
}

function limparFormRecorrente() {
  ['fRecDesc', 'fRecValor', 'fRecDia', 'fRecResp'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const pg = document.getElementById('fRecPgto'); if (pg) pg.value = 'Pix';
  const st = document.getElementById('fRecAtivo'); if (st) st.value = 'ativo';
}

function editarRecorrente(id) {
  const r = recorrentes.find(x => x.id === id);
  if (!r) return;
  editRecId = id;
  document.getElementById('fRecDesc').value = r.descricao || '';
  document.getElementById('fRecCat').value = r.categoria || '';
  document.getElementById('fRecValor').value = r.valor || '';
  document.getElementById('fRecDia').value = r.dia || '';
  document.getElementById('fRecPgto').value = r.formaPagamento || 'Outro';
  document.getElementById('fRecResp').value = r.responsavel || '';
  document.getElementById('fRecAtivo').value = recorrenteAtivo(r) ? 'ativo' : 'inativo';
  document.getElementById('formRecTitle').innerText = 'Editar conta recorrente';
  document.getElementById('btnSalvarRec').innerText = 'Salvar alterações';
  document.getElementById('btnCancelRec').classList.remove('hidden');
  document.getElementById('panelFormRec').scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicaoRecorrente() {
  editRecId = null;
  limparFormRecorrente();
  document.getElementById('formRecTitle').innerText = 'Nova conta recorrente';
  document.getElementById('btnSalvarRec').innerText = 'Cadastrar recorrente';
  document.getElementById('btnCancelRec').classList.add('hidden');
}

function salvarRecorrente() {
  const obj = {
    id: editRecId || generateId(),
    descricao: document.getElementById('fRecDesc').value.trim(),
    categoria: document.getElementById('fRecCat').value,
    valor: Number(document.getElementById('fRecValor').value),
    dia: Number(document.getElementById('fRecDia').value),
    formaPagamento: document.getElementById('fRecPgto').value || 'Outro',
    responsavel: document.getElementById('fRecResp').value.trim(),
    ativo: document.getElementById('fRecAtivo').value || 'ativo'
  };
  if (!obj.descricao || !obj.valor || !obj.dia || obj.valor <= 0 || obj.dia < 1 || obj.dia > 31) {
    return showToast('Preencha descrição, valor e dia válido (1–31).', 'warning');
  }
  if (editRecId) {
    const idx = recorrentes.findIndex(r => r.id === editRecId);
    if (idx !== -1) recorrentes[idx] = obj;
  } else {
    recorrentes.push(obj);
  }
  salvarLocal('recorrentes', recorrentes);
  cancelarEdicaoRecorrente();
  processarDadosGlobais();
  showToast('Conta recorrente salva!');
}

function excluirRecorrente(id) {
  if (!confirm('Excluir esta conta recorrente?')) return;
  recorrentes = recorrentes.filter(r => r.id !== id);
  salvarLocal('recorrentes', recorrentes);
  if (editRecId === id) cancelarEdicaoRecorrente();
  processarDadosGlobais();
  showToast('Conta excluída.', 'warning');
}

function gerarRecorrenteIndividual(id) {
  const r = recorrentes.find(i => i.id === id);
  if (!r) return;
  if (!recorrenteAtivo(r)) return showToast('Conta inativa. Ative para gerar lançamento.', 'warning');
  const venc = proximoVencRecorrente(r);
  if (jaGeradoRecorrenteMes(id)) return showToast('Lançamento já gerado para este mês.', 'warning');
  dados.push({
    id: generateId(),
    recorrenteId: id,
    descricao: r.descricao,
    tipo: 'despesa',
    categoria: r.categoria,
    valor: Number(r.valor),
    vencimento: venc,
    status: 'pendente',
    formaPagamento: r.formaPagamento || 'Outro',
    responsavel: r.responsavel || ''
  });
  salvarLocal('dados', dados);
  processarDadosGlobais();
  showToast('Lançamento recorrente gerado!');
}

function gerarRecorrentesMes() {
  let gerados = 0;
  recorrentes.filter(recorrenteAtivo).forEach(r => {
    if (jaGeradoRecorrenteMes(r.id)) return;
    const venc = proximoVencRecorrente(r);
    dados.push({
      id: generateId(),
      recorrenteId: r.id,
      descricao: r.descricao,
      tipo: 'despesa',
      categoria: r.categoria,
      valor: Number(r.valor),
      vencimento: venc,
      status: 'pendente',
      formaPagamento: r.formaPagamento || 'Outro',
      responsavel: r.responsavel || ''
    });
    gerados++;
  });
  if (gerados) {
    salvarLocal('dados', dados);
    processarDadosGlobais();
    showToast(`${gerados} lançamento(s) gerado(s)!`);
  } else {
    showToast('Nenhuma conta pendente de geração neste mês.', 'warning');
  }
}

function renderRecorrenteCard(r) {
  const ativo = recorrenteAtivo(r);
  const proximo = proximoVencRecorrente(r);
  const gerado = jaGeradoRecorrenteMes(r.id);
  const stCls = ativo ? 'auto-status-ativo' : 'auto-status-inativo';
  const stLabel = ativo ? 'Ativo' : 'Inativo';
  const btnGerar = ativo && !gerado
    ? `<button type="button" class="btn btn-success btn-sm" onclick="gerarRecorrenteIndividual('${escAttr(r.id)}')">Gerar este mês</button>`
    : (gerado ? `<span class="pro-muted" style="font-size:12px;">Já gerado no mês</span>` : '');
  return `<div class="auto-card${ativo ? '' : ' is-inactive'}">
    <div class="auto-card-head">
      <div>
        <strong>${esc(r.descricao)}</strong>
        <div style="margin-top:6px;"><span class="auto-status ${stCls}">${stLabel}</span></div>
      </div>
      <strong>${formatMoeda(r.valor)}</strong>
    </div>
    <div class="auto-card-metrics">
      <div class="auto-metric"><span>Vencimento</span><strong>Dia ${r.dia}</strong></div>
      <div class="auto-metric"><span>Próxima geração</span><strong>${formatData(proximo)}</strong></div>
      <div class="auto-metric"><span>Categoria</span><strong>${esc(r.categoria)}</strong></div>
      <div class="auto-metric"><span>Pagamento</span><strong>${esc(r.formaPagamento || 'Outro')}</strong></div>
    </div>
    <div class="auto-card-actions">
      ${btnGerar}
      <button type="button" class="btn btn-outline btn-sm" onclick="editarRecorrente('${escAttr(r.id)}')">Editar</button>
      <button type="button" class="btn btn-danger btn-sm" onclick="excluirRecorrente('${escAttr(r.id)}')">Excluir</button>
    </div>
  </div>`;
}

function renderRecorrentes() {
  const rs = resumoRecorrentes();
  const resEl = document.getElementById('recResumoGeral');
  if (resEl) {
    resEl.innerHTML = `<div class="mini-stat"><span>Total recorrente mensal</span><strong class="c-red">${formatMoeda(rs.totalMensal)}</strong></div>
      <div class="mini-stat"><span>Contas ativas</span><strong>${rs.qtdAtivas}</strong></div>
      <div class="mini-stat"><span>Total cadastradas</span><strong>${recorrentes.length}</strong></div>
      <div class="mini-stat"><span>Próximas fixas</span><strong>${rs.proximas.length}</strong></div>`;
  }
  const proxEl = document.getElementById('recProximasHtml');
  if (proxEl) {
    proxEl.innerHTML = rs.proximas.length
      ? `<div class="pro-muted" style="margin-bottom:6px;">Próximas contas fixas</div>` + rs.proximas.map(r =>
          `<div class="prox-item"><span>${esc(r.descricao)} · ${formatData(r.proximo)}</span><strong>${formatMoeda(r.valor)}</strong></div>`
        ).join('')
      : '';
  }
  const grid = document.getElementById('recorrentesGrid');
  if (grid) {
    grid.innerHTML = recorrentes.length
      ? recorrentes.map(r => renderRecorrenteCard(r)).join('')
      : '<div class="pro-card">Nenhuma conta recorrente cadastrada.</div>';
  }
  const tb = document.getElementById('listRecorrenteTabela');
  if (tb) {
    tb.innerHTML = recorrentes.length ? recorrentes.map(r => {
      const ativo = recorrenteAtivo(r);
      return `<tr>
        <td><strong>${esc(r.descricao)}</strong><div class="pro-muted">${esc(r.categoria)}</div></td>
        <td>${formatData(proximoVencRecorrente(r))}</td>
        <td><strong>${formatMoeda(r.valor)}</strong></td>
        <td><span class="auto-status ${ativo ? 'auto-status-ativo' : 'auto-status-inativo'}">${ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td><div class="action-cell">
          ${ativo && !jaGeradoRecorrenteMes(r.id) ? `<button type="button" class="btn btn-success btn-sm" onclick="gerarRecorrenteIndividual('${escAttr(r.id)}')">Gerar</button>` : ''}
          <button type="button" class="btn btn-outline btn-sm" onclick="editarRecorrente('${escAttr(r.id)}')">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="excluirRecorrente('${escAttr(r.id)}')">Excluir</button>
        </div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5">Nenhuma recorrência.</td></tr>';
  }
}

function lancamentosParcelamento(p) {
  const byId = dados.filter(d => d.parcelamentoId === p.id);
  if (byId.length) return byId.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  return dados.filter(d => d.descricao && d.descricao.startsWith(`${p.descricao} (`))
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
}

function statsParcelamento(p) {
  const lista = lancamentosParcelamento(p);
  const total = Number(p.parcelas || lista.length || 0);
  const pagos = lista.filter(d => calcularStatus(d) === 'pago').length;
  const valorParcela = total ? Number(p.valorTotal || 0) / total : 0;
  const totalPago = lista.filter(d => calcularStatus(d) === 'pago').reduce((s, d) => s + Number(d.valor || 0), 0);
  const restante = Math.max(0, Number(p.valorTotal || 0) - totalPago);
  const proxima = lista.find(d => calcularStatus(d) !== 'pago');
  const concluido = total > 0 && pagos >= total;
  const pct = total ? (pagos / total) * 100 : 0;
  return { lista, pagos, total, valorParcela, totalPago, restante, proxima, concluido, pct };
}

function gerarParcelamento() {
  const desc = document.getElementById('fParDesc').value.trim();
  const valorTotal = Number(document.getElementById('fParValor').value);
  const qtd = Number(document.getElementById('fParQtd').value);
  const dataInicio = document.getElementById('fParData').value;
  const cat = document.getElementById('fParCat').value;
  const pgto = document.getElementById('fParPgto').value || 'Outro';
  const resp = document.getElementById('fParResp').value.trim();
  if (!desc || !valorTotal || !qtd || !dataInicio || qtd < 2) {
    return showToast('Preencha descrição, valor, parcelas (≥2) e data inicial.', 'warning');
  }
  const valorParcela = valorTotal / qtd;
  const parId = generateId();
  let d = new Date(dataInicio + 'T00:00:00');
  for (let i = 1; i <= qtd; i++) {
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dados.push({
      id: generateId(),
      parcelamentoId: parId,
      descricao: `${desc} (${i}/${qtd})`,
      tipo: 'despesa',
      categoria: cat,
      valor: valorParcela,
      vencimento: dStr,
      status: 'pendente',
      formaPagamento: pgto,
      responsavel: resp
    });
    d.setMonth(d.getMonth() + 1);
  }
  parcelamentos.push({
    id: parId,
    descricao: desc,
    valorTotal,
    parcelas: qtd,
    dataCriacao: new Date().toISOString(),
    dataInicio,
    categoria: cat,
    formaPagamento: pgto,
    responsavel: resp
  });
  salvarLocal('dados', dados);
  salvarLocal('parcelamentos', parcelamentos);
  ['fParDesc', 'fParValor', 'fParData', 'fParResp'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const q = document.getElementById('fParQtd'); if (q) q.value = '2';
  processarDadosGlobais();
  showToast('Parcelas geradas!');
}

function gerarParcelasPendentes(parId) {
  const p = parcelamentos.find(x => x.id === parId);
  if (!p) return;
  const existentes = lancamentosParcelamento(p);
  if (existentes.length >= Number(p.parcelas)) return showToast('Parcelas já geradas.', 'warning');
  const qtd = Number(p.parcelas);
  const valorParcela = Number(p.valorTotal) / qtd;
  const inicio = p.dataInicio || existentes[0]?.vencimento || hojeISO();
  let d = new Date(inicio + 'T00:00:00');
  const numsExistentes = new Set(existentes.map(l => {
    const m = l.descricao.match(/\((\d+)\/\d+\)/);
    return m ? Number(m[1]) : null;
  }).filter(Boolean));
  let criadas = 0;
  for (let i = 1; i <= qtd; i++) {
    if (numsExistentes.has(i)) { d.setMonth(d.getMonth() + 1); continue; }
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dados.push({
      id: generateId(),
      parcelamentoId: parId,
      descricao: `${p.descricao} (${i}/${qtd})`,
      tipo: 'despesa',
      categoria: p.categoria || 'Outros',
      valor: valorParcela,
      vencimento: dStr,
      status: 'pendente',
      formaPagamento: p.formaPagamento || 'Outro',
      responsavel: p.responsavel || ''
    });
    criadas++;
    d.setMonth(d.getMonth() + 1);
  }
  if (!criadas) return showToast('Nenhuma parcela pendente para gerar.', 'warning');
  salvarLocal('dados', dados);
  processarDadosGlobais();
  showToast(`${criadas} parcela(s) gerada(s)!`);
}

function marcarParcelaPaga(lancId) {
  const item = dados.find(d => d.id === lancId);
  if (!item) return;
  item.status = 'pago';
  salvarLocal('dados', dados);
  processarDadosGlobais();
  const p = parcelamentos.find(x => x.id === item.parcelamentoId);
  if (p) verParcelas(p.id);
  showToast('Parcela marcada como paga!');
}

function verParcelas(parId) {
  const p = parcelamentos.find(x => x.id === parId);
  if (!p) return;
  const st = statsParcelamento(p);
  document.getElementById('modalParcelasTitle').innerText = `Parcelas — ${p.descricao}`;
  document.getElementById('modalParcelasLista').innerHTML = st.lista.length ? st.lista.map(l => {
    const pago = calcularStatus(l) === 'pago';
    return `<div class="par-list-item">
      <div>
        <strong>${esc(l.descricao)}</strong>
        <div class="pro-muted">${formatData(l.vencimento)} · ${esc(l.categoria)}</div>
      </div>
      <div style="text-align:right;">
        <strong class="c-red">${formatMoeda(l.valor)}</strong>
        <div style="margin-top:6px;">${getBadgeHtml(calcularStatus(l))}</div>
        ${!pago ? `<button type="button" class="btn btn-success btn-sm" style="margin-top:6px;" onclick="marcarParcelaPaga('${escAttr(l.id)}')">Marcar paga</button>` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="pro-card">Nenhuma parcela vinculada. Use "Gerar parcelas".</div>';
  document.getElementById('modalParcelas').classList.remove('hidden');
}

function fecharModalParcelas() {
  document.getElementById('modalParcelas').classList.add('hidden');
}

function marcarProximaParcelaPaga(parId) {
  const st = statsParcelamento(parcelamentos.find(x => x.id === parId));
  if (!st.proxima) return showToast('Nenhuma parcela pendente.', 'warning');
  marcarParcelaPaga(st.proxima.id);
}

function renderParcelamentoCard(p) {
  const st = statsParcelamento(p);
  const stCls = st.concluido ? 'par-status-done' : 'par-status-ativo';
  const stLabel = st.concluido ? 'Concluído' : 'Ativo';
  const semLanc = st.lista.length === 0;
  return `<div class="par-card">
    <div class="par-card-head">
      <div>
        <strong>${esc(p.descricao)}</strong>
        <div style="margin-top:6px;"><span class="par-status ${stCls}">${stLabel}</span></div>
      </div>
      <strong>${formatMoeda(p.valorTotal)}</strong>
    </div>
    <div class="pro-muted">${st.pagos}/${st.total} parcelas pagas · parcela ${formatMoeda(st.valorParcela)}</div>
    <div class="par-card-metrics">
      <div class="par-metric"><span>Total pago</span><strong class="c-green">${formatMoeda(st.totalPago)}</strong></div>
      <div class="par-metric"><span>Total restante</span><strong class="c-red">${formatMoeda(st.restante)}</strong></div>
      <div class="par-metric"><span>Próxima parcela</span><strong>${st.proxima ? formatData(st.proxima.vencimento) : '—'}</strong></div>
      <div class="par-metric"><span>Progresso</span><strong>${st.pct.toFixed(0)}%</strong></div>
    </div>
    <div class="bar-track"><div class="bar-fill ${st.concluido ? 'bg-success' : 'bg-info'}" style="width:${clamp(st.pct, 0, 100)}%"></div></div>
    <div class="par-card-actions">
      ${semLanc ? `<button type="button" class="btn btn-primary btn-sm" onclick="gerarParcelasPendentes('${escAttr(p.id)}')">Gerar parcelas</button>` : ''}
      <button type="button" class="btn btn-outline btn-sm" onclick="verParcelas('${escAttr(p.id)}')">Ver parcelas</button>
      ${!st.concluido && st.proxima ? `<button type="button" class="btn btn-success btn-sm" onclick="marcarProximaParcelaPaga('${escAttr(p.id)}')">Marcar próxima paga</button>` : ''}
    </div>
  </div>`;
}

function renderParcelamentos() {
  const ativos = [];
  const concluidos = [];
  parcelamentos.forEach(p => {
    if (statsParcelamento(p).concluido) concluidos.push(p);
    else ativos.push(p);
  });
  const totalPrevisto = parcelamentos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
  const totalPago = parcelamentos.reduce((s, p) => s + statsParcelamento(p).totalPago, 0);
  const resEl = document.getElementById('parResumoGeral');
  if (resEl) {
    resEl.innerHTML = `<div class="mini-stat"><span>Parcelamentos</span><strong>${parcelamentos.length}</strong></div>
      <div class="mini-stat"><span>Ativos</span><strong>${ativos.length}</strong></div>
      <div class="mini-stat"><span>Concluídos</span><strong>${concluidos.length}</strong></div>
      <div class="mini-stat"><span>Total pago</span><strong class="c-green">${formatMoeda(totalPago)}</strong></div>`;
  }
  const elA = document.getElementById('parcelamentosAtivosHtml');
  const elC = document.getElementById('parcelamentosConcluidosHtml');
  if (elA) elA.innerHTML = ativos.length ? ativos.map(p => renderParcelamentoCard(p)).join('') : '<div class="pro-card">Nenhum parcelamento ativo.</div>';
  if (elC) elC.innerHTML = concluidos.length ? concluidos.map(p => renderParcelamentoCard(p)).join('') : '<div class="pro-card">Nenhum parcelamento concluído ainda.</div>';
  const tb = document.getElementById('listParcelamentosGerados');
  if (tb) {
    tb.innerHTML = parcelamentos.length ? parcelamentos.map(p => {
      const st = statsParcelamento(p);
      const stCls = st.concluido ? 'par-status-done' : 'par-status-ativo';
      return `<tr>
        <td><strong>${esc(p.descricao)}</strong><div class="pro-muted">${esc(p.categoria || '')}</div></td>
        <td>${st.pagos}/${st.total}</td>
        <td><strong>${formatMoeda(p.valorTotal)}</strong></td>
        <td><span class="par-status ${stCls}">${st.concluido ? 'Concluído' : 'Ativo'}</span></td>
        <td><div class="action-cell">
          ${st.lista.length === 0 ? `<button type="button" class="btn btn-primary btn-sm" onclick="gerarParcelasPendentes('${escAttr(p.id)}')">Gerar</button>` : ''}
          <button type="button" class="btn btn-outline btn-sm" onclick="verParcelas('${escAttr(p.id)}')">Ver</button>
          ${st.proxima ? `<button type="button" class="btn btn-success btn-sm" onclick="marcarProximaParcelaPaga('${escAttr(p.id)}')">Pagar</button>` : ''}
        </div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5">Nenhum parcelamento.</td></tr>';
  }
}
function renderCategorias() {
  const el = document.getElementById('listaCategoriasHtml');
  if (!el) return;
  el.className = 'cat-grid';
  const sorted = [...categorias].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  el.innerHTML = sorted.length ? sorted.map(c => {
    const st = statsCategoriaMes(c);
    const padrao = CATEGORIAS_PADRAO.includes(c);
    const usoTotal = dados.filter(i => i.categoria === c).length;
    const btnDel = padrao ? '' : `<button type="button" class="btn btn-danger btn-sm" onclick="removerCategoria('${escAttr(c)}')">Excluir</button>`;
    return `<div class="cat-card${padrao ? ' is-default' : ''}">
      <div class="cat-card-head">
        <span class="chip-icon" style="background:${corCategoria(c)}">${esc(iconCategoria(c))}</span>
        <div style="flex:1;min-width:0;">
          <strong>${esc(c)}</strong>
          ${padrao ? '<div class="pro-muted" style="margin-top:4px;">Categoria padrão</div>' : ''}
        </div>
      </div>
      <div class="cat-card-stats">
        <div class="cat-stat-box"><span>Lançamentos no mês</span><strong>${st.qtd}</strong></div>
        <div class="cat-stat-box"><span>Movimentado no mês</span><strong>${formatMoeda(st.movimentado)}</strong></div>
        <div class="cat-stat-box"><span>Despesas no mês</span><strong class="c-red">${formatMoeda(st.totalDesp)}</strong></div>
        <div class="cat-stat-box"><span>Uso total</span><strong>${usoTotal}</strong></div>
      </div>
      <div class="cat-card-actions">
        <button type="button" class="btn btn-outline btn-sm" onclick="editarCategoria('${escAttr(c)}')">Editar</button>
        ${btnDel}
      </div>
    </div>`;
  }).join('') : '<div class="pro-card">Nenhuma categoria cadastrada.</div>';
}
function baixarAnaliseIA(){baixarArquivo(`analise_ia_financas_${new Date().toISOString().slice(0,10)}.txt`,montarTextoAnaliseIA(),'text/plain;charset=utf-8');showToast('Análise TXT baixada.');}
function imprimirAnaliseIA(){const area=document.getElementById('iaPrintArea');if(area){area.innerHTML=`<div class="rel-print-header"><h1>FinançasCasa</h1><p><strong>Análise do Assistente IA</strong></p><p>Emitido em: ${esc(new Date().toLocaleString('pt-BR'))}</p></div><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.6;">${esc(montarTextoAnaliseIA())}</pre>`;}document.body.classList.add('print-ia');window.print();setTimeout(()=>document.body.classList.remove('print-ia'),700);}
function coletarContextoIA(){
  const mes=getMesGlobal();
  const l=getLancamentosFiltrados(mes);
  const r=resumoLancamentos(l);
  const cat=agruparPorCategoria(l);
  const maiorCat=Object.entries(cat).sort((a,b)=>b[1]-a[1])[0]||null;
  const atrasadas=l.filter(i=>calcularStatus(i)==='atrasado');
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const lim=new Date(hoje); lim.setDate(lim.getDate()+7);
  const vencendo=l.filter(i=>i.vencimento&&calcularStatus(i)!=='pago'&&new Date(i.vencimento+'T00:00:00')>=hoje&&new Date(i.vencimento+'T00:00:00')<=lim);
  const metasLista=getMetasMes(mes);
  const saldo=r.saldo;
  const metasRisco=metasLista.filter(m=>{const st=statusMetaInfo(saldo,m.valor);return st.label==='Em risco'||(m.valor&&saldo<m.valor*0.5);});
  const orc=orcamentos[mes]||{};
  const rg=resumoOrcamentoGeral(orc,cat);
  return {mes,l,r,cat,maiorCat,atrasadas,vencendo,metasLista,metasRisco,orc,rg,saldo};
}
function montarAlertasIA(ctx){
  const alertas=[];
  if(!ctx.l.length) alertas.push({tipo:'info',titulo:'Sem lançamentos',msg:'Nenhum lançamento encontrado para o período. Cadastre receitas e despesas para receber análises mais precisas.'});
  if(ctx.atrasadas.length) alertas.push({tipo:'danger',titulo:'Contas atrasadas',msg:`${ctx.atrasadas.length} conta(s) atrasada(s), totalizando ${formatMoeda(ctx.atrasadas.reduce((s,i)=>s+Number(i.valor||0),0))}. Priorize a regularização.`});
  if(ctx.vencendo.length) alertas.push({tipo:'warning',titulo:'Contas vencendo',msg:`${ctx.vencendo.length} conta(s) vencem nos próximos 7 dias. Revise o fluxo de caixa.`});
  if(ctx.r.saldo<0) alertas.push({tipo:'danger',titulo:'Saldo negativo',msg:`Despesas acima das receitas em ${formatMoeda(Math.abs(ctx.r.saldo))}. Ajuste gastos ou antecipe receitas.`});
  else if(ctx.l.length) alertas.push({tipo:'success',titulo:'Saldo positivo',msg:`Saldo do período em ${formatMoeda(ctx.r.saldo)}. Continue acompanhando vencimentos e metas.`});
  if(ctx.maiorCat) alertas.push({tipo:'info',titulo:'Maior gasto por categoria',msg:`${ctx.maiorCat[0]} concentra ${formatMoeda(ctx.maiorCat[1])}${ctx.r.des?' ('+((ctx.maiorCat[1]/ctx.r.des)*100).toFixed(1)+'% das despesas)':''}.`});
  if(ctx.metasRisco.length) alertas.push({tipo:'warning',titulo:'Meta em risco',msg:`${ctx.metasRisco.length} meta(s) abaixo do esperado para o mês. Reforce a economia ou revise o valor planejado.`});
  if(ctx.rg.acima>0) alertas.push({tipo:'danger',titulo:'Orçamento ultrapassado',msg:`${ctx.rg.acima} categoria(s) acima do limite definido no controle de gastos.`});
  else if(ctx.rg.atencao>0) alertas.push({tipo:'warning',titulo:'Orçamento em atenção',msg:`${ctx.rg.atencao} categoria(s) com consumo acima de 80% do limite.`});
  if(!alertas.length) alertas.push({tipo:'info',titulo:'Tudo monitorado',msg:'Nenhum alerta crítico no momento. Continue registrando suas movimentações.'});
  return alertas;
}
function renderAlertaCard(a){
  const icon={success:'✓',warning:'!',danger:'!',info:'i'}[a.tipo]||'i';
  return `<div class="ia-alert-card ia-alert-${a.tipo}"><div class="ia-alert-icon">${icon}</div><div><strong>${esc(a.titulo)}</strong><p>${esc(a.msg)}</p></div></div>`;
}
function montarRecomendacoesIA(ctx){
  const rec=[];
  if(!ctx.l.length){rec.push({titulo:'Comece registrando',texto:'Cadastre ao menos uma receita e uma despesa do mês para destravar alertas e recomendações.'});return rec;}
  if(ctx.atrasadas.length) rec.push({titulo:'Regularize pendências',texto:'Pague ou renegocie as contas atrasadas antes de assumir novos compromissos.'});
  if(ctx.r.saldo<0) rec.push({titulo:'Recuperar saldo',texto:`Busque reduzir despesas em ${formatMoeda(Math.abs(ctx.r.saldo))} ou aumentar receitas neste mês.`});
  if(ctx.maiorCat) rec.push({titulo:'Foco de economia',texto:`Revise lançamentos em ${ctx.maiorCat[0]} — é sua maior alavanca de ajuste agora.`});
  if(ctx.vencendo.length) rec.push({titulo:'Planejar pagamentos',texto:'Separe valores para as contas que vencem nos próximos 7 dias e evite novos atrasos.'});
  if(ctx.metasLista.length) rec.push({titulo:'Acompanhar metas',texto:`Você tem ${ctx.metasLista.length} meta(s) no mês. Compare o saldo atual com os valores planejados.`});
  if(ctx.rg.acima>0) rec.push({titulo:'Revisar orçamento',texto:'Categorias acima do limite pedem corte imediato ou revisão do teto definido.'});
  if(rec.length<3&&ctx.r.saldo>=0) rec.push({titulo:'Manter disciplina',texto:'Saldo positivo no período. Mantenha registros em dia e faça backup semanal.'});
  return rec.slice(0,4);
}
function renderRecomendacoesIA(ctx){
  const el=document.getElementById('iaRecomendacoesHtml');
  if(!el)return;
  const rec=montarRecomendacoesIA(ctx);
  el.innerHTML=rec.map(r=>`<div class="ia-rec-item"><strong>${esc(r.titulo)}</strong>${esc(r.texto)}</div>`).join('');
}
function montarBalaoChat(role,text){
  if(role==='user') return `<div class="chat-row chat-row-user"><div class="chat-bubble chat-user">${esc(text)}</div></div>`;
  return `<div class="chat-row chat-row-ai"><div class="chat-avatar" aria-hidden="true">IA</div><div class="chat-bubble chat-ai">${esc(text)}</div></div>`;
}
function renderChatHistorico(){
  const el=document.getElementById('chatMessages');
  if(!el)return;
  const items=chatHistorico.length?chatHistorico:[{role:'ai',text:'Olá! Sou seu assistente financeiro local. Posso analisar seu mês, apontar contas atrasadas, sugerir economia e montar um plano simples com base nos seus dados.'}];
  el.innerHTML=items.map(m=>montarBalaoChat(m.role,m.text)).join('');
  el.scrollTop=el.scrollHeight;
}
function adicionarMensagemChat(role,text){
  chatHistorico.push({role,text,ts:new Date().toISOString()});
  if(chatHistorico.length>120) chatHistorico=chatHistorico.slice(-120);
  salvarLocal('chatHistorico',chatHistorico);
  renderChatHistorico();
}
function limparChatIA(){if(!confirm('Limpar o histórico de conversa deste navegador?'))return;chatHistorico=[];salvarLocal('chatHistorico',chatHistorico);renderChatHistorico();showToast('Chat limpo.');}
function responderAutoAjuda(t){
  const ctx=coletarContextoIA();
  const {r,l,atrasadas,maiorCat,saldo,metasLista,rg,vencendo}=ctx;
  const msgs={
    analisar:`Análise do mês: receitas ${formatMoeda(r.rec)}, despesas ${formatMoeda(r.des)}, saldo ${formatMoeda(r.saldo)}. ${l.length} lançamento(s), ${r.aberto} em aberto e ${atrasadas.length} atrasada(s).`,
    economizar:maiorCat?`Para economizar, comece por ${maiorCat[0]} (${formatMoeda(maiorCat[1])}). Revise itens recorrentes, negocie valores e defina um teto no controle de gastos.`:'Cadastre despesas por categoria para identificar onde cortar primeiro.',
    atrasadas:atrasadas.length?`Contas atrasadas (${atrasadas.length}): ${atrasadas.slice(0,5).map(i=>`${i.descricao} (${formatMoeda(i.valor)})`).join('; ')}${atrasadas.length>5?'...':''}.`:'Nenhuma conta atrasada no período selecionado.',
    maior_gasto:maiorCat?`Maior gasto: ${maiorCat[0]} com ${formatMoeda(maiorCat[1])}${r.des?' — '+((maiorCat[1]/r.des)*100).toFixed(1)+'% das despesas':''}.`:'Sem despesas registradas no período.',
    melhorar_saldo:saldo>=0?`Seu saldo está positivo (${formatMoeda(saldo)}). Para melhorar ainda mais, reforce receitas recorrentes e reduza a categoria de maior impacto.`:`Para melhorar o saldo, reduza ${formatMoeda(Math.abs(saldo))} em despesas ou aumente receitas. Priorize contas atrasadas e limites de orçamento.`,
    plano_financeiro:`Plano simples: 1) Regularizar ${atrasadas.length} atraso(s); 2) Reservar ${formatMoeda(vencendo.reduce((s,i)=>s+Number(i.valor||0),0))} para vencimentos de 7 dias; 3) Focar economia em ${maiorCat?maiorCat[0]:'categorias variáveis'}; 4) Acompanhar ${metasLista.length} meta(s); 5) Revisar ${rg.acima} categoria(s) acima do orçamento.`
  };
  return msgs[t]||msgs.analisar;
}
function responderPerguntaIA(pergunta){
  const ctx=coletarContextoIA();
  const q=pergunta.toLowerCase();
  const {r,l,atrasadas,vencendo,maiorCat,saldo,metasLista,rg}=ctx;
  if(/saldo|sobra|resultado/.test(q)) return `Seu saldo no período é ${formatMoeda(saldo)} (${formatMoeda(r.rec)} de receitas e ${formatMoeda(r.des)} de despesas).`;
  if(/receita|entrada|ganho/.test(q)) return `Receitas do período: ${formatMoeda(r.rec)} em ${l.filter(i=>i.tipo==='receita').length} lançamento(s).`;
  if(/despesa|gasto|sa[ií]da/.test(q)) return `Despesas do período: ${formatMoeda(r.des)} em ${l.filter(i=>i.tipo==='despesa').length} lançamento(s).`;
  if(/atras|vencid/.test(q)) return atrasadas.length?`Há ${atrasadas.length} conta(s) atrasada(s): ${atrasadas.slice(0,4).map(i=>i.descricao).join(', ')}.`:'Não há contas atrasadas no período selecionado.';
  if(/venc|pr[oó]xim|7 dias/.test(q)) return vencendo.length?`${vencendo.length} conta(s) vencem em até 7 dias, somando ${formatMoeda(vencendo.reduce((s,i)=>s+Number(i.valor||0),0))}.`:'Nenhuma conta pendente vence nos próximos 7 dias.';
  if(/econom|reduz|cort/.test(q)) return responderAutoAjuda('economizar');
  if(/meta/.test(q)) return metasLista.length?`Você tem ${metasLista.length} meta(s) no mês. Saldo atual: ${formatMoeda(saldo)}.`:'Nenhuma meta cadastrada para este mês.';
  if(/or[cç]amento|limite/.test(q)) return rg.qtd?`${rg.acima} categoria(s) acima do limite e ${rg.atencao} em atenção.`:'Nenhum limite de orçamento definido para este mês.';
  if(/categoria|gastando mais|maior gasto/.test(q)) return responderAutoAjuda('maior_gasto');
  if(/plano|organiz|passo/.test(q)) return responderAutoAjuda('plano_financeiro');
  if(/oi|ol[aá]|bom dia|boa tarde|boa noite|ajuda/.test(q)) return 'Posso falar sobre saldo, receitas, despesas, contas atrasadas, metas, orçamento e plano financeiro simples — tudo com base nos seus dados locais.';
  return `Com base no mês atual: receitas ${formatMoeda(r.rec)}, despesas ${formatMoeda(r.des)}, saldo ${formatMoeda(saldo)}. ${atrasadas.length?`Atenção para ${atrasadas.length} conta(s) atrasada(s).`:'Situação de pagamentos em dia.'} Use os botões de autoajuda para análises guiadas.`;
}
function montarTextoAnaliseIA(){
  const ctx=coletarContextoIA();
  const alertas=montarAlertasIA(ctx);
  const rec=montarRecomendacoesIA(ctx);
  const linhas=[
    'ANÁLISE DO ASSISTENTE IA — FINANÇASCASA',
    `Período: ${ctx.mes||'todos'}`,
    `Emitido em: ${new Date().toLocaleString('pt-BR')}`,
    '',
    'RESUMO',
    `Receitas: ${formatMoeda(ctx.r.rec)}`,
    `Despesas: ${formatMoeda(ctx.r.des)}`,
    `Saldo: ${formatMoeda(ctx.r.saldo)}`,
    `Lançamentos: ${ctx.l.length}`,
    `Contas atrasadas: ${ctx.atrasadas.length}`,
    `Vencendo em 7 dias: ${ctx.vencendo.length}`,
    '',
    'ALERTAS',
    ...alertas.map(a=>`- [${a.titulo}] ${a.msg}`),
    '',
    'RECOMENDAÇÕES',
    ...rec.map(r=>`- ${r.titulo}: ${r.texto}`),
    '',
    'Obs.: análise gerada localmente, sem API externa.'
  ];
  return linhas.join('\n');
}
function analisarIA(){
  const ctx=coletarContextoIA();
  const alertas=montarAlertasIA(ctx);
  iaContext.qtdAlertas=alertas.filter(a=>a.tipo==='danger'||a.tipo==='warning').length;
  const el=document.getElementById('iaAlertasHtml');
  if(el) el.innerHTML=alertas.map(renderAlertaCard).join('');
  renderRecomendacoesIA(ctx);
  renderChatHistorico();
}
function enviarMensagemIA(){
  const i=document.getElementById('chatInput');
  const txt=i?.value.trim();
  if(!txt)return;
  adicionarMensagemChat('user',txt);
  adicionarMensagemChat('ai',responderPerguntaIA(txt));
  if(i)i.value='';
}
function autoAjuda(t){
  const labels={analisar:'Analisar meu mês',economizar:'Como economizar mais?',atrasadas:'Quais contas estão atrasadas?',maior_gasto:'Onde estou gastando mais?',melhorar_saldo:'Como melhorar meu saldo?',plano_financeiro:'Gerar plano financeiro simples'};
  adicionarMensagemChat('user',labels[t]||'Autoajuda');
  adicionarMensagemChat('ai',responderAutoAjuda(t));
}
function exportarBackupJSON(){
  config.ultimoBackup=new Date().toISOString();
  salvarLocal('config',config);
  baixarArquivo(`financas_casa_backup_${new Date().toISOString().split('T')[0]}.json`,JSON.stringify({dados,metas,orcamentos,futuros,recorrentes,parcelamentos,categorias,categoriasDetalhes,listaMercado,historicoCopras,promocoesMercado,config},null,2),'application/json;charset=utf-8');
  renderBackupInfo();
  showToast('Backup baixado com sucesso.');
}
function importarBackupJSON(evt){
  const f=evt.target.files[0]; if(!f)return;
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      backupPendente=JSON.parse(e.target.result);
      if(!backupPendente||typeof backupPendente!=='object') throw new Error('invalid');
      const c=contarBackupPreview(backupPendente);
      const preview=document.getElementById('backupPreview');
      if(preview){
        preview.classList.remove('hidden');
        preview.innerHTML=`<strong>Prévia do backup</strong><div class="backup-preview-grid">
          <div class="backup-preview-item"><span>Lançamentos</span><strong>${c.lanc}</strong></div>
          <div class="backup-preview-item"><span>Categorias</span><strong>${c.cats}</strong></div>
          <div class="backup-preview-item"><span>Metas</span><strong>${c.metas}</strong></div>
          <div class="backup-preview-item"><span>Listas de mercado</span><strong>${c.mercado}</strong></div>
          <div class="backup-preview-item"><span>Configurações</span><strong>${c.config?'Sim':'Não'}</strong></div>
        </div><p class="pro-muted" style="margin-top:10px;">Revise os totais e escolha substituir ou somar antes de confirmar.</p>`;
      }
      document.getElementById('btnConfirmarImportacao')?.classList.remove('hidden');
      document.getElementById('btnCancelarImportacao')?.classList.remove('hidden');
    }catch(err){showToast('Erro ao ler arquivo de backup.','error');cancelarImportacaoBackup();}
  };
  rd.readAsText(f);
}
function aplicarBackupSubstituir(b){
  dados=b.dados||[];
  metas=b.metas||{};
  orcamentos=b.orcamentos||{};
  futuros=b.futuros||[];
  recorrentes=b.recorrentes||[];
  parcelamentos=b.parcelamentos||[];
  categorias=b.categorias||categorias;
  categoriasDetalhes=b.categoriasDetalhes||{};
  listaMercado=b.listaMercado||[];
  historicoCopras=b.historicoCopras||[];
  promocoesMercado=b.promocoesMercado||[];
  if(b.config&&typeof b.config==='object'){config={...config,...b.config};}
}
function aplicarBackupSomar(b){
  dados=dados.concat(b.dados||[]);
  futuros=futuros.concat(b.futuros||[]);
  recorrentes=recorrentes.concat(b.recorrentes||[]);
  parcelamentos=parcelamentos.concat(b.parcelamentos||[]);
  listaMercado=listaMercado.concat(b.listaMercado||[]);
  historicoCopras=historicoCopras.concat(b.historicoCopras||[]);
  promocoesMercado=promocoesMercado.concat(b.promocoesMercado||[]);
  categorias=[...new Set(categorias.concat(b.categorias||[]))];
  metas={...metas,...(b.metas||{})};
  orcamentos={...orcamentos,...(b.orcamentos||{})};
  categoriasDetalhes={...categoriasDetalhes,...(b.categoriasDetalhes||{})};
}
function confirmarImportacaoBackup(){
  if(!backupPendente)return;
  const modo=document.getElementById('backupModoImportacao')?.value||'substituir';
  if(modo==='substituir'&&!confirm('Isso substituirá todos os dados atuais deste navegador. Deseja continuar?'))return;
  if(modo==='substituir') aplicarBackupSubstituir(backupPendente); else aplicarBackupSomar(backupPendente);
  salvarLocal('dados',dados); salvarLocal('metas',metas); salvarLocal('orcamentos',orcamentos); salvarLocal('futuros',futuros);
  salvarLocal('recorrentes',recorrentes); salvarLocal('parcelamentos',parcelamentos); salvarLocal('categorias',categorias);
  salvarLocal('categoriasDetalhes',categoriasDetalhes); salvarLocal('listaMercado',listaMercado);
  salvarLocal('historicoCopras',historicoCopras); salvarLocal('promocoesMercado',promocoesMercado); salvarLocal('config',config);
  cancelarImportacaoBackup();
  processarDadosGlobais();
  showToast('Backup importado com sucesso!');
}
function limparTodosDados(){if(!confirm('Deseja apagar todos os dados locais do FinançasCasa? Esta ação não pode ser desfeita.'))return;if(!confirm('Confirme novamente: todos os lançamentos, metas, listas e configurações serão removidos.'))return;['dados','metas','orcamentos','futuros','recorrentes','parcelamentos','categorias','categoriasDetalhes','listaMercado','historicoCopras','promocoesMercado','chatHistorico'].forEach(k=>localStorage.removeItem('financasCasa_'+k));location.reload();}
processarDadosGlobais=function(){aprimorarEstruturaVisual();popularSelectCategorias();popularDatalistDescricao();analisarIA();renderDashboard();renderLancamentos();renderMetas();renderOrcamento();renderFuturo();renderRecorrentes();renderParcelamentos();renderCategorias();renderListaMercado();renderBackupInfo();gerarRelatorioTela();const mes=getMesGlobal(),qtd=getLancamentosFiltrados(mes).length;if(badgeLanc){if(qtd>0){badgeLanc.innerText=qtd;badgeLanc.classList.remove('hidden');}else badgeLanc.classList.add('hidden');}if(badgeIA){if(iaContext.qtdAlertas>0){badgeIA.innerText=iaContext.qtdAlertas;badgeIA.classList.remove('hidden');badgeIA.classList.add('badge-alert');}else badgeIA.classList.add('hidden');}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{aprimorarEstruturaVisual();document.body.classList.toggle('modo-compacto',config.densidade==='compacto');processarDadosGlobais();});else{aprimorarEstruturaVisual();document.body.classList.toggle('modo-compacto',config.densidade==='compacto');processarDadosGlobais();}
