let dados = JSON.parse(localStorage.getItem("contasCasa")) || [
  { descricao: "Salário", tipo: "receita", categoria: "Salário", valor: 3500, vencimento: "2026-05-05", status: "pago" },
  { descricao: "Aluguel", tipo: "despesa", categoria: "Moradia", valor: 1200, vencimento: "2026-05-10", status: "pago" },
  { descricao: "Energia elétrica", tipo: "despesa", categoria: "Energia", valor: 280, vencimento: "2026-05-20", status: "pendente" },
  { descricao: "Internet", tipo: "despesa", categoria: "Internet", valor: 110, vencimento: "2026-05-25", status: "pendente" }
];

let editIndex = -1;

function salvar() {
  localStorage.setItem("contasCasa", JSON.stringify(dados));
}

function moeda(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusReal(item) {
  if (item.status === "pago") return "pago";

  const hoje = new Date();
  hoje.setHours(0,0,0,0);

  const venc = new Date(item.vencimento + "T00:00:00");

  return venc < hoje ? "atrasado" : "pendente";
}

function adicionar() {
  const item = {
    descricao: document.getElementById("descricao").value.trim(),
    tipo: document.getElementById("tipo").value,
    categoria: document.getElementById("categoria").value,
    valor: Number(document.getElementById("valor").value),
    vencimento: document.getElementById("vencimento").value,
    status: document.getElementById("status").value
  };

  if (!item.descricao || !item.valor || !item.vencimento) {
    alert("Preencha descrição, valor e vencimento.");
    return;
  }

  if (editIndex === -1) {
    // Cadastro
    dados.push(item);
  } else {
    // Alteração/Edição
    dados[editIndex] = item;
    cancelarEdicao();
  }

  salvar();
  
  // Limpar inputs de texto/valor/data
  document.getElementById("descricao").value = "";
  document.getElementById("valor").value = "";
  document.getElementById("vencimento").value = "";
  
  renderizar();
}

function editar(index) {
  editIndex = index;
  const item = dados[index];

  // Popula o formulário com os valores do item selecionado
  document.getElementById("descricao").value = item.descricao;
  document.getElementById("tipo").value = item.tipo;
  document.getElementById("categoria").value = item.categoria;
  document.getElementById("valor").value = item.valor;
  document.getElementById("vencimento").value = item.vencimento;
  document.getElementById("status").value = item.status;

  // Modifica a interface do formulário para o estado de Edição
  document.getElementById("tituloForm").innerText = "Editar Lançamento";
  document.getElementById("btnSalvar").innerText = "Salvar Alteração";
  document.getElementById("btnCancelar").style.display = "block";

  // Rolar suavemente até o formulário para facilitar no mobile/desktop
  document.getElementById("tituloForm").scrollIntoView({ behavior: "smooth" });
}

function cancelarEdicao() {
  editIndex = -1;

  // Limpa formulário
  document.getElementById("descricao").value = "";
  document.getElementById("valor").value = "";
  document.getElementById("vencimento").value = "";
  document.getElementById("status").value = "pendente";

  // Retorna a interface do formulário para o estado de Cadastro
  document.getElementById("tituloForm").innerText = "Novo Lançamento";
  document.getElementById("btnSalvar").innerText = "Adicionar";
  document.getElementById("btnCancelar").style.display = "none";
}

function pagar(index) {
  dados[index].status = "pago";
  
  // Se o item que foi pago estiver sendo editado no formulário, atualiza o formulário também
  if (editIndex === index) {
    document.getElementById("status").value = "pago";
  }

  salvar();
  renderizar();
}

function excluir(index) {
  if (confirm("Deseja excluir este lançamento?")) {
    dados.splice(index, 1);
    
    // Tratamento seguro do índice de edição ao excluir
    if (editIndex === index) {
      cancelarEdicao();
    } else if (editIndex > index) {
      editIndex--;
    }

    salvar();
    renderizar();
  }
}

function renderizarCards() {
  const receitas = dados.filter(i => i.tipo === "receita").reduce((s, i) => s + i.valor, 0);
  const despesas = dados.filter(i => i.tipo === "despesa").reduce((s, i) => s + i.valor, 0);
  const pendentes = dados.filter(i => statusReal(i) !== "pago").length;

  document.getElementById("totalReceitas").innerText = moeda(receitas);
  document.getElementById("totalDespesas").innerText = moeda(despesas);
  document.getElementById("saldoAtual").innerText = moeda(receitas - despesas);
  document.getElementById("qtdPendentes").innerText = pendentes;
}

function renderizarTabela() {
  const tabela = document.getElementById("tabela");
  tabela.innerHTML = "";

  const busca = document.getElementById("busca").value.toLowerCase();
  const filtroTipo = document.getElementById("filtroTipo").value;
  const filtroStatus = document.getElementById("filtroStatus").value;

  dados.forEach((item, index) => {
    const st = statusReal(item);

    if (busca && !item.descricao.toLowerCase().includes(busca)) return;
    if (filtroTipo !== "todos" && item.tipo !== filtroTipo) return;
    if (filtroStatus !== "todos" && st !== filtroStatus) return;

    // Apenas exibe o botão "Pagar" se o status atual não for "pago"
    const botaoPagar = item.status !== "pago" 
      ? `<button class="success" onclick="pagar(${index})">Pagar</button>` 
      : "";

    tabela.innerHTML += `
      <tr>
        <td>${item.descricao}</td>
        <td>${item.tipo === "receita" ? "Receita" : "Despesa"}</td>
        <td>${item.categoria}</td>
        <td>${moeda(item.valor)}</td>
        <td>${item.vencimento.split("-").reverse().join("/")}</td>
        <td><span class="badge ${st}">${st.toUpperCase()}</span></td>
        <td>
          <div class="actions">
            ${botaoPagar}
            <button class="warning" onclick="editar(${index})">Editar</button>
            <button class="danger" onclick="excluir(${index})">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  });
}

function renderizarVencimentos() {
  const tabela = document.getElementById("vencimentos");
  tabela.innerHTML = "";

  dados
    .filter(i => statusReal(i) !== "pago")
    .sort((a,b) => new Date(a.vencimento) - new Date(b.vencimento))
    .slice(0, 6)
    .forEach(item => {
      const st = statusReal(item);
      tabela.innerHTML += `
        <tr>
          <td>${item.descricao}</td>
          <td>${moeda(item.valor)}</td>
          <td>${item.vencimento.split("-").reverse().join("/")}</td>
          <td><span class="badge ${st}">${st.toUpperCase()}</span></td>
        </tr>
      `;
    });
}

function renderizarCategorias() {
  const box = document.getElementById("resumoCategorias");
  box.innerHTML = "";

  const despesas = dados.filter(i => i.tipo === "despesa");
  const total = despesas.reduce((s, i) => s + i.valor, 0);
  const categorias = {};

  despesas.forEach(i => {
    categorias[i.categoria] = (categorias[i.categoria] || 0) + i.valor;
  });

  Object.keys(categorias).forEach(cat => {
    const valor = categories[cat];
    const perc = total ? (valor / total) * 100 : 0;

    box.innerHTML += `
      <div class="bar-box">
        <div class="bar-title">
          <span>${cat}</span>
          <strong>${moeda(valor)}</strong>
        </div>
        <div class="bar"><div style="width:${perc}%"></div></div>
      </div>
    `;
  });
}

function renderizar() {
  renderizarCards();
  renderizarTabela();
  renderizarVencimentos();
  renderizarCategorias();
}

function exportarDados() {
  const backup = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    backup[key] = localStorage.getItem(key);
  }
  
  // Se o localStorage estiver vazio mas temos dados em memória, salvamos no backup
  if (!backup["contasCasa"] && dados && dados.length > 0) {
    backup["contasCasa"] = JSON.stringify(dados);
  }

  const jsonString = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup-total-localstorage-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importarDados(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backup = JSON.parse(e.target.result);
      
      // Validação: o arquivo deve ser um dicionário/objeto JSON de chaves e valores
      if (typeof backup === "object" && backup !== null && !Array.isArray(backup)) {
        if (confirm("ATENÇÃO: Isso irá substituir TODOS os dados do sistema por este arquivo de backup. Deseja continuar?")) {
          // Limpa completamente o localStorage
          localStorage.clear();
          
          // Restaura todas as chaves e valores salvos no backup
          for (const key in backup) {
            if (backup.hasOwnProperty(key)) {
              localStorage.setItem(key, backup[key]);
            }
          }
          
          // Recarrega a variável de controle principal
          dados = JSON.parse(localStorage.getItem("contasCasa")) || [];
          
          // Cancela qualquer edição pendente para evitar falhas de índice
          cancelarEdicao();
          
          // Atualiza toda a tela com os novos dados importados
          renderizar();
          alert("Backup completo restaurado com sucesso!");
        }
      } else {
        alert("Erro: O arquivo de backup não possui um formato válido de armazenamento.");
      }
    } catch (err) {
      alert("Erro ao decodificar o arquivo. Certifique-se de que é um JSON de backup válido.");
    }
    event.target.value = "";
  };
  reader.readAsText(file);
}

renderizar();
