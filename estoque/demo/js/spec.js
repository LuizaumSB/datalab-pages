/* DataLab — Dashboard Estoque: especificação do nicho.
   Colunas conforme docs/textos-aulas-kiwify.md: Data, Produto, Movimento, Quantidade, Valor */

/* A coluna Movimento é padronizada em "Entrada" ou "Saída" — o usuário escreve
   do jeito dele (compra, venda, baixa, in, out...) e o dashboard entende. */
var ESTOQUE_SINONIMOS = {
  entrada: "Entrada", entradas: "Entrada", compra: "Entrada", compras: "Entrada",
  comprado: "Entrada", recebimento: "Entrada", recebido: "Entrada", recebida: "Entrada",
  aquisicao: "Entrada", reposicao: "Entrada", "entrada de estoque": "Entrada",
  "nota de entrada": "Entrada", devolucao: "Entrada", "devolucao de cliente": "Entrada",
  in: "Entrada", input: "Entrada", e: "Entrada", "+": "Entrada",

  saida: "Saída", saidas: "Saída", venda: "Saída", vendas: "Saída", vendido: "Saída",
  vendida: "Saída", baixa: "Saída", consumo: "Saída", consumido: "Saída",
  perda: "Saída", quebra: "Saída", descarte: "Saída", "saida de estoque": "Saída",
  "nota de saida": "Saída", transferencia: "Saída",
  out: "Saída", output: "Saída", s: "Saída", "-": "Saída",
};

function estoqueEntrada(r) { return r.movimento === "Entrada"; }
function estoqueSaida(r) { return r.movimento === "Saída"; }

window.DK_SPEC = {
  id: "estoque",
  titulo: "Dashboard Estoque",
  aba: "movimentacoes",
  unidade: "movimentações",
  msgVazio: "Nenhuma movimentação válida encontrada. Confira se a planilha tem as colunas Data, Produto, Movimento, Quantidade e Valor — use o template.xlsx como base.",

  campos: {
    data: { tipo: "data", aceita: ["date", "dia", "data do movimento", "data da movimentacao"], obrigatorio: true },
    produto: { tipo: "texto", aceita: ["item", "material", "mercadoria", "sku", "codigo", "descricao"], padrao: "Sem produto" },
    movimento: { tipo: "texto", aceita: ["tipo", "operacao", "movimentacao", "tipo de movimento", "entrada/saida", "e/s"], padrao: "Saída" },
    quantidade: { tipo: "numero", aceita: ["qtd", "qtde", "quantity", "unidades", "volume"], positivo: true, padrao: 1 },
    valor: { tipo: "numero", aceita: ["value", "total", "valor total", "custo", "preco"], positivo: true, naoZero: true, obrigatorio: true },
  },

  /* Padroniza o movimento em "Entrada" ou "Saída". O que não for reconhecido
     como entrada é tratado como saída (baixa de estoque). */
  derivaLinha: function (linha) {
    var s = window.DK.slug(linha.movimento);
    if (ESTOQUE_SINONIMOS[s]) { linha.movimento = ESTOQUE_SINONIMOS[s]; return; }
    var ehEntrada = s.indexOf("entra") >= 0 || s.indexOf("compr") >= 0 ||
                    s.indexOf("receb") >= 0 || s.indexOf("devolu") >= 0;
    linha.movimento = ehEntrada ? "Entrada" : "Saída";
  },

  metricasMensais: {
    entradasQtd: function (rows) { return window.DK.somaSe(rows, "quantidade", estoqueEntrada); },
    saidasQtd: function (rows) { return window.DK.somaSe(rows, "quantidade", estoqueSaida); },
    entradasValor: function (rows) { return window.DK.somaSe(rows, "valor", estoqueEntrada); },
    saidasValor: function (rows) { return window.DK.somaSe(rows, "valor", estoqueSaida); },
    movimentado: function (rows) { return window.DK.soma(rows, "valor"); },
  },

  posMensal: function (mensal, DK) {
    mensal.forEach(function (m) { m.saldoMes = m.entradasQtd - m.saidasQtd; });
    DK.acumular(mensal, "saldoMes", "saldo");
  },

  kpis: [
    { label: "Entradas (un.)", metrica: "entradasQtd", formato: "numero",
      calc: function (rows, mensal, DK) { return DK.somaSe(rows, "quantidade", estoqueEntrada); } },
    { label: "Saídas (un.)", metrica: "saidasQtd", formato: "numero",
      calc: function (rows, mensal, DK) { return DK.somaSe(rows, "quantidade", estoqueSaida); } },
    { label: "Saldo em estoque", metrica: "saldo", formato: "numero",
      calc: function (rows, mensal, DK) {
        return DK.somaSe(rows, "quantidade", estoqueEntrada) - DK.somaSe(rows, "quantidade", estoqueSaida);
      } },
    { label: "Valor movimentado", metrica: "movimentado", formato: "moeda",
      calc: function (rows, mensal, DK) { return DK.soma(rows, "valor"); } },
  ],

  graficos: [
    { tipo: "barras", titulo: "Entradas x Saídas por mês", sub: "em unidades",
      arquivo: "entradas-x-saidas", formato: "numero",
      series: [
        { label: "Entradas", metrica: "entradasQtd", cor: "s1" },
        { label: "Saídas", metrica: "saidasQtd", cor: "s3" },
      ] },
    { tipo: "linha", titulo: "Saldo acumulado em estoque", sub: "em unidades",
      arquivo: "saldo-acumulado", formato: "numero",
      serie: { label: "Saldo", metrica: "saldo" }, cor: "s1" },
    { tipo: "donut", titulo: "Saídas por produto", sub: "em valor", arquivo: "saidas-por-produto", formato: "moeda",
      dimensao: "produto", topN: 6, rotuloOutras: "Outros",
      valor: function (r) { return r.movimento === "Saída" ? r.valor : null; } },
    { tipo: "barras", titulo: "Compras x Vendas por mês", sub: "em reais",
      arquivo: "compras-x-vendas", formato: "moeda",
      series: [
        { label: "Compras (entradas)", metrica: "entradasValor", cor: "s1" },
        { label: "Vendas (saídas)", metrica: "saidasValor", cor: "s3" },
      ] },
    { tipo: "ranking", titulo: "Produtos com maior saída", sub: "em unidades",
      arquivo: "produtos-maior-saida", formato: "numero",
      largura: "full", dimensao: "produto", topN: 8, rotuloOutras: "Outros", cor: "s1",
      rotuloValor: "Unidades",
      valor: function (r) { return r.movimento === "Saída" ? r.quantidade : null; } },
  ],

  tabela: {
    titulo: "Resumo mensal do estoque",
    colunas: [
      { titulo: "Mês", formato: "texto", calc: function (m, DK) { return DK.mesLabelLongo(m.ym); } },
      { titulo: "Entradas (un.)", formato: "numero", calc: function (m) { return m.entradasQtd; } },
      { titulo: "Saídas (un.)", formato: "numero", calc: function (m) { return m.saidasQtd; } },
      { titulo: "Saldo do mês", formato: "numero", calc: function (m) { return m.saldoMes; },
        negativoSe: function (m) { return m.saldoMes < 0; } },
      { titulo: "Saldo acumulado", formato: "numero", calc: function (m) { return m.saldo; },
        negativoSe: function (m) { return m.saldo < 0; } },
      { titulo: "Compras", formato: "moeda", calc: function (m) { return m.entradasValor; } },
      { titulo: "Vendas", formato: "moeda", calc: function (m) { return m.saidasValor; } },
    ],
    total: function (rows, mensal, DK) {
      var entradas = DK.somaSe(rows, "quantidade", estoqueEntrada);
      var saidas = DK.somaSe(rows, "quantidade", estoqueSaida);
      return ["Total", entradas, saidas, entradas - saidas,
              mensal[mensal.length - 1].saldo,
              DK.somaSe(rows, "valor", estoqueEntrada),
              DK.somaSe(rows, "valor", estoqueSaida)];
    },
  },
};
