/* DataLab — Dashboard Comercial: especificação do nicho.
   Colunas conforme docs/textos-aulas-kiwify.md: Data, Cliente, Produto, Quantidade, Valor */
window.DK_SPEC = {
  id: "comercial",
  titulo: "Dashboard Comercial",
  aba: "vendas",
  unidade: "vendas",
  msgVazio: "Nenhuma venda válida encontrada. Confira se a planilha tem as colunas Data, Cliente, Produto, Quantidade e Valor — use o template.xlsx como base.",

  campos: {
    data: { tipo: "data", aceita: ["date", "dia", "data da venda"], obrigatorio: true },
    cliente: { tipo: "texto", aceita: ["customer", "comprador"], padrao: "Sem cliente" },
    produto: { tipo: "texto", aceita: ["item", "product", "sku"], padrao: "Sem produto" },
    quantidade: { tipo: "numero", aceita: ["qtd", "qtde", "quantity"], positivo: true, padrao: 1 },
    valor: { tipo: "numero", aceita: ["value", "total", "valor total", "receita"], positivo: true, naoZero: true, obrigatorio: true },
    vendedor: { tipo: "texto", aceita: ["seller", "responsavel", "consultor"], padrao: "" },
  },

  metricasMensais: {
    faturamento: function (rows) { return window.DK.soma(rows, "valor"); },
    pedidos: function (rows) { return rows.length; },
    itens: function (rows) { return window.DK.soma(rows, "quantidade"); },
    clientes: function (rows) { return window.DK.unicos(rows, "cliente"); },
  },

  posMensal: function (mensal, DK) {
    mensal.forEach(function (m) { m.ticket = m.pedidos > 0 ? m.faturamento / m.pedidos : 0; });
    DK.acumular(mensal, "faturamento", "acumulado");
  },

  kpis: [
    { label: "Faturamento", metrica: "faturamento", formato: "moeda",
      calc: function (rows, mensal, DK) { return DK.soma(rows, "valor"); } },
    { label: "Pedidos", metrica: "pedidos", formato: "numero",
      calc: function (rows) { return rows.length; } },
    { label: "Ticket médio", metrica: "ticket", formato: "moeda",
      calc: function (rows, mensal, DK) { return rows.length ? DK.soma(rows, "valor") / rows.length : null; } },
    { label: "Clientes atendidos", metrica: "clientes", formato: "numero",
      calc: function (rows, mensal, DK) { return DK.unicos(rows, "cliente"); } },
  ],

  graficos: [
    { tipo: "barras", titulo: "Faturamento mensal", arquivo: "faturamento-mensal", formato: "moeda",
      series: [{ label: "Faturamento", metrica: "faturamento", cor: "s1" }] },
    { tipo: "barras", titulo: "Pedidos por mês", arquivo: "pedidos-por-mes", formato: "numero",
      series: [{ label: "Pedidos", metrica: "pedidos", cor: "s3" }] },
    { tipo: "linha", titulo: "Faturamento acumulado", arquivo: "faturamento-acumulado", formato: "moeda",
      serie: { label: "Acumulado", metrica: "acumulado" }, cor: "s1" },
    { tipo: "donut", titulo: "Faturamento por produto", arquivo: "faturamento-por-produto", formato: "moeda",
      dimensao: "produto", topN: 5, rotuloOutras: "Outros",
      valor: function (r) { return r.valor; } },
    { tipo: "ranking", titulo: "Melhores clientes", arquivo: "melhores-clientes", formato: "moeda",
      largura: "full", dimensao: "cliente", topN: 8, rotuloOutras: "Outros", cor: "s1",
      rotuloValor: "Faturamento",
      valor: function (r) { return r.valor; } },
  ],

  tabela: {
    titulo: "Resumo mensal",
    colunas: [
      { titulo: "Mês", formato: "texto", calc: function (m, DK) { return DK.mesLabelLongo(m.ym); } },
      { titulo: "Faturamento", formato: "moeda", calc: function (m) { return m.faturamento; } },
      { titulo: "Pedidos", formato: "numero", calc: function (m) { return m.pedidos; } },
      { titulo: "Itens", formato: "numero", calc: function (m) { return m.itens; } },
      { titulo: "Ticket médio", formato: "moeda", calc: function (m) { return m.ticket; } },
      { titulo: "Clientes", formato: "numero", calc: function (m) { return m.clientes; } },
      { titulo: "Acumulado", formato: "moeda", calc: function (m) { return m.acumulado; } },
    ],
    total: function (rows, mensal, DK) {
      var fat = DK.soma(rows, "valor");
      return ["Total", fat, rows.length, DK.soma(rows, "quantidade"),
              rows.length ? fat / rows.length : 0, DK.unicos(rows, "cliente"),
              mensal[mensal.length - 1].acumulado];
    },
  },
};
