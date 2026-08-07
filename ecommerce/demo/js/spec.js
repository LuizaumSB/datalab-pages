/* DataLab — Dashboard E-commerce: especificação do nicho.
   Colunas conforme docs/textos-aulas-kiwify.md: Data, Pedido, Produto, Categoria, Valor, Frete
   Uma linha por produto do pedido; o número do pedido agrupa as linhas. */
window.DK_SPEC = {
  id: "ecommerce",
  titulo: "Dashboard E-commerce",
  aba: "pedidos",
  unidade: "itens vendidos",
  msgVazio: "Nenhum pedido válido encontrado. Confira se a planilha tem as colunas Data, Pedido, Produto, Categoria, Valor e Frete — use o template.xlsx como base.",

  campos: {
    data: { tipo: "data", aceita: ["date", "dia", "data do pedido", "data da venda"], obrigatorio: true },
    pedido: { tipo: "texto", aceita: ["order", "numero do pedido", "n do pedido", "no pedido", "id do pedido", "codigo do pedido"], padrao: "" },
    produto: { tipo: "texto", aceita: ["item", "product", "sku", "nome do produto"], padrao: "Sem produto" },
    categoria: { tipo: "texto", aceita: ["category", "departamento", "secao", "colecao"], padrao: "Sem categoria" },
    valor: { tipo: "numero", aceita: ["value", "total", "preco", "valor total", "subtotal", "receita"], positivo: true, naoZero: true, obrigatorio: true },
    frete: { tipo: "numero", aceita: ["shipping", "entrega", "valor do frete", "custo de envio"], positivo: true, padrao: 0 },
  },

  /* Pedidos = números de pedido distintos. Quem exporta sem a coluna Pedido
     cai no total de linhas, tratando cada linha como um pedido. */
  contarPedidos: function (rows) {
    var u = window.DK.unicos(rows, "pedido");
    return u > 0 ? u : rows.length;
  },

  metricasMensais: {
    faturamento: function (rows) { return window.DK.soma(rows, "valor"); },
    pedidos: function (rows) { return window.DK_SPEC.contarPedidos(rows); },
    itens: function (rows) { return rows.length; },
    frete: function (rows) { return window.DK.soma(rows, "frete"); },
  },

  posMensal: function (mensal, DK) {
    mensal.forEach(function (m) { m.ticket = m.pedidos > 0 ? m.faturamento / m.pedidos : 0; });
    DK.acumular(mensal, "faturamento", "acumulado");
  },

  kpis: [
    { label: "Faturamento", metrica: "faturamento", formato: "moeda",
      calc: function (rows, mensal, DK) { return DK.soma(rows, "valor"); } },
    { label: "Pedidos", metrica: "pedidos", formato: "numero",
      calc: function (rows) { return window.DK_SPEC.contarPedidos(rows); } },
    { label: "Ticket médio", metrica: "ticket", formato: "moeda",
      calc: function (rows, mensal, DK) {
        var ped = window.DK_SPEC.contarPedidos(rows);
        return ped > 0 ? DK.soma(rows, "valor") / ped : null;
      } },
    { label: "Frete total", metrica: "frete", formato: "moeda",
      calc: function (rows, mensal, DK) { return DK.soma(rows, "frete"); } },
  ],

  graficos: [
    { tipo: "barras", titulo: "Faturamento mensal", arquivo: "faturamento-mensal", formato: "moeda",
      series: [{ label: "Faturamento", metrica: "faturamento", cor: "s1" }] },
    { tipo: "barras", titulo: "Pedidos por mês", arquivo: "pedidos-por-mes", formato: "numero",
      series: [{ label: "Pedidos", metrica: "pedidos", cor: "s3" }] },
    { tipo: "linha", titulo: "Faturamento acumulado", arquivo: "faturamento-acumulado", formato: "moeda",
      serie: { label: "Acumulado", metrica: "acumulado" }, cor: "s1" },
    { tipo: "donut", titulo: "Faturamento por categoria", arquivo: "faturamento-por-categoria", formato: "moeda",
      dimensao: "categoria", topN: 5, rotuloOutras: "Outras",
      valor: function (r) { return r.valor; } },
    { tipo: "ranking", titulo: "Produtos que mais faturam", arquivo: "produtos-que-mais-faturam", formato: "moeda",
      largura: "full", dimensao: "produto", topN: 8, rotuloOutras: "Outros", cor: "s1",
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
      { titulo: "Frete", formato: "moeda", calc: function (m) { return m.frete; } },
      { titulo: "Acumulado", formato: "moeda", calc: function (m) { return m.acumulado; } },
    ],
    total: function (rows, mensal, DK) {
      var fat = DK.soma(rows, "valor");
      var ped = window.DK_SPEC.contarPedidos(rows);
      return ["Total", fat, ped, rows.length, ped > 0 ? fat / ped : null,
              DK.soma(rows, "frete"), mensal[mensal.length - 1].acumulado];
    },
  },
};
