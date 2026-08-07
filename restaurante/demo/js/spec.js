/* DataLab — Dashboard Restaurante: especificação do nicho.
   Colunas conforme docs/textos-aulas-kiwify.md: Data, Item, Canal, Quantidade, Valor */

/* Canais canônicos e as variações de escrita que o dashboard reconhece.
   Canal não reconhecido é mantido como o usuário escreveu. */
var REST_CANAIS = {
  salao: "Salão", "salao interno": "Salão", mesa: "Salão", mesas: "Salão",
  local: "Salão", presencial: "Salão", "consumo local": "Salão", restaurante: "Salão",
  delivery: "Delivery", entrega: "Delivery", "tele entrega": "Delivery",
  motoboy: "Delivery", "delivery proprio": "Delivery", whatsapp: "Delivery",
  balcao: "Balcão", retirada: "Balcão", "retirada no balcao": "Balcão",
  "take away": "Balcão", takeaway: "Balcão", viagem: "Balcão", "para viagem": "Balcão",
  ifood: "iFood", "i food": "iFood", "ifood delivery": "iFood",
};

var REST_DELIVERY = ["Delivery", "iFood"];

function restDelivery(r) { return REST_DELIVERY.indexOf(r.canal) >= 0; }

window.DK_SPEC = {
  id: "restaurante",
  titulo: "Dashboard Restaurante",
  aba: "pedidos",
  unidade: "pedidos",
  msgVazio: "Nenhum pedido válido encontrado. Confira se a planilha tem as colunas Data, Item, Canal, Quantidade e Valor — use o template.xlsx como base.",

  campos: {
    data: { tipo: "data", aceita: ["date", "dia", "data do pedido"], obrigatorio: true },
    item: { tipo: "texto", aceita: ["produto", "prato", "product", "descricao", "cardapio"], padrao: "Sem item" },
    canal: { tipo: "texto", aceita: ["origem", "tipo", "channel", "modalidade", "venda"], padrao: "Salão" },
    quantidade: { tipo: "numero", aceita: ["qtd", "qtde", "quantity", "porcoes"], positivo: true, padrao: 1 },
    valor: { tipo: "numero", aceita: ["value", "total", "valor total", "receita", "preco"], positivo: true, naoZero: true, obrigatorio: true },
  },

  /* Padroniza o canal escrito pelo usuário (salão, delivery, balcão, iFood). */
  derivaLinha: function (linha) {
    var canonico = REST_CANAIS[window.DK.slug(linha.canal)];
    if (canonico) linha.canal = canonico;
    else if (!linha.canal) linha.canal = "Salão";
  },

  metricasMensais: {
    faturamento: function (rows) { return window.DK.soma(rows, "valor"); },
    pedidos: function (rows) { return rows.length; },
    itens: function (rows) { return window.DK.soma(rows, "quantidade"); },
    delivery: function (rows) { return window.DK.somaSe(rows, "valor", restDelivery); },
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
    { label: "Ticket médio", metrica: "ticket", formato: "moedaExata",
      calc: function (rows, mensal, DK) { return rows.length ? DK.soma(rows, "valor") / rows.length : null; } },
    { label: "Itens vendidos", metrica: "itens", formato: "numero",
      calc: function (rows, mensal, DK) { return DK.soma(rows, "quantidade"); } },
  ],

  graficos: [
    { tipo: "barras", titulo: "Faturamento mensal", arquivo: "faturamento-mensal", formato: "moeda",
      series: [{ label: "Faturamento", metrica: "faturamento", cor: "s1" }] },
    { tipo: "barras", titulo: "Pedidos por mês", arquivo: "pedidos-por-mes", formato: "numero",
      series: [{ label: "Pedidos", metrica: "pedidos", cor: "s3" }] },
    { tipo: "donut", titulo: "Faturamento por canal", arquivo: "faturamento-por-canal", formato: "moeda",
      dimensao: "canal", topN: 5, rotuloOutras: "Outros canais",
      valor: function (r) { return r.valor; } },
    { tipo: "linha", titulo: "Faturamento acumulado", arquivo: "faturamento-acumulado", formato: "moeda",
      serie: { label: "Acumulado", metrica: "acumulado" }, cor: "s1" },
    { tipo: "ranking", titulo: "Itens mais vendidos", sub: "por faturamento no período",
      arquivo: "itens-mais-vendidos", formato: "moeda",
      largura: "full", alto: true, dimensao: "item", topN: 10, rotuloOutras: "Outros itens", cor: "s1",
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
      { titulo: "Ticket médio", formato: "moedaExata", calc: function (m) { return m.ticket; } },
      { titulo: "Delivery + iFood", formato: "moeda", calc: function (m) { return m.delivery; } },
      { titulo: "Acumulado", formato: "moeda", calc: function (m) { return m.acumulado; } },
    ],
    total: function (rows, mensal, DK) {
      var fat = DK.soma(rows, "valor");
      return ["Total", fat, rows.length, DK.soma(rows, "quantidade"),
              rows.length ? fat / rows.length : 0, DK.somaSe(rows, "valor", restDelivery),
              mensal[mensal.length - 1].acumulado];
    },
  },
};
