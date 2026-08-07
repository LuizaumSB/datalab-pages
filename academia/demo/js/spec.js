/* DataLab — Dashboard Academia: especificação do nicho.
   Colunas conforme docs/textos-aulas-kiwify.md: Data, Aluno, Plano, Evento, Valor */

/* Eventos canônicos e as variações de escrita que o dashboard reconhece.
   Evento não reconhecido é mantido como o usuário escreveu. */
var ACAD_EVENTOS = {
  mensalidade: "Mensalidade", mensalidades: "Mensalidade", pagamento: "Mensalidade",
  parcela: "Mensalidade", cobranca: "Mensalidade", recorrencia: "Mensalidade",
  matricula: "Matrícula", matriculas: "Matrícula", adesao: "Matrícula",
  "nova matricula": "Matrícula", inscricao: "Matrícula", cadastro: "Matrícula",
  renovacao: "Renovação", renovacoes: "Renovação", renovou: "Renovação",
  "renovacao de plano": "Renovação", rematricula: "Renovação",
  cancelamento: "Cancelamento", cancelamentos: "Cancelamento", cancelou: "Cancelamento",
  cancelado: "Cancelamento", desistencia: "Cancelamento", trancamento: "Cancelamento",
  evasao: "Cancelamento",
};

/* Planos canônicos. Plano diferente é mantido como o usuário escreveu. */
var ACAD_PLANOS = {
  mensal: "Mensal", "plano mensal": "Mensal", mes: "Mensal", "1 mes": "Mensal",
  trimestral: "Trimestral", "plano trimestral": "Trimestral", "3 meses": "Trimestral",
  anual: "Anual", "plano anual": "Anual", "12 meses": "Anual", ano: "Anual",
  "passe livre": "Passe livre", "passe-livre": "Passe livre", livre: "Passe livre",
  "plano livre": "Passe livre", vip: "Passe livre", "full": "Passe livre",
};

function acadEvento(nome) { return function (r) { return r.evento === nome; }; }
function acadPago(r) { return r.valor > 0; }
function acadValor(r) { return r.valor; }

window.DK_SPEC = {
  id: "academia",
  titulo: "Dashboard Academia",
  aba: "alunos",
  unidade: "lançamentos",
  msgVazio: "Nenhum lançamento válido encontrado. Confira se a planilha tem as colunas Data, Aluno, Plano, Evento e Valor — use o template.xlsx como base.",

  campos: {
    data: { tipo: "data", aceita: ["date", "dia", "data do pagamento", "vencimento", "competencia"], obrigatorio: true },
    aluno: { tipo: "texto", aceita: ["nome", "cliente", "membro", "matriculado", "student"], padrao: "Sem aluno" },
    plano: { tipo: "texto", aceita: ["pacote", "contrato", "modalidade", "plan"], padrao: "Mensal" },
    evento: { tipo: "texto", aceita: ["tipo", "movimento", "ocorrencia", "lancamento", "situacao"], padrao: "Mensalidade" },
    valor: { tipo: "numero", aceita: ["value", "total", "pago", "pagamento", "receita", "mensalidade", "preco"], positivo: true, padrao: 0 },
  },

  /* Padroniza evento e plano escritos pelo usuário. */
  derivaLinha: function (linha) {
    var ev = ACAD_EVENTOS[window.DK.slug(linha.evento)];
    if (ev) linha.evento = ev;
    else if (!linha.evento) linha.evento = "Mensalidade";
    var pl = ACAD_PLANOS[window.DK.slug(linha.plano)];
    if (pl) linha.plano = pl;
    else if (!linha.plano) linha.plano = "Mensal";
  },

  metricasMensais: {
    receita: function (rows) { return window.DK.soma(rows, "valor"); },
    alunos: function (rows) { return window.DK.unicos(rows, "aluno"); },
    pagamentos: function (rows) { return window.DK.contarSe(rows, acadPago); },
    matriculas: function (rows) { return window.DK.contarSe(rows, acadEvento("Matrícula")); },
    renovacoes: function (rows) { return window.DK.contarSe(rows, acadEvento("Renovação")); },
    cancelamentos: function (rows) { return window.DK.contarSe(rows, acadEvento("Cancelamento")); },
  },

  posMensal: function (mensal, DK) {
    mensal.forEach(function (m) {
      m.ticket = m.pagamentos > 0 ? m.receita / m.pagamentos : 0;
      m.saldo = m.matriculas - m.cancelamentos;
    });
    DK.acumular(mensal, "receita", "acumulado");
  },

  kpis: [
    { label: "Receita", metrica: "receita", formato: "moeda",
      calc: function (rows, mensal, DK) { return DK.soma(rows, "valor"); } },
    { label: "Alunos ativos", metrica: "alunos", formato: "numero",
      calc: function (rows, mensal, DK) { return DK.unicos(rows, "aluno"); } },
    { label: "Renovações", metrica: "renovacoes", formato: "numero",
      calc: function (rows, mensal, DK) { return DK.contarSe(rows, acadEvento("Renovação")); } },
    { label: "Cancelamentos", metrica: "cancelamentos", formato: "numero", subirEBom: false,
      calc: function (rows, mensal, DK) { return DK.contarSe(rows, acadEvento("Cancelamento")); } },
  ],

  graficos: [
    { tipo: "barras", titulo: "Receita mensal", arquivo: "receita-mensal", formato: "moeda",
      series: [{ label: "Receita", metrica: "receita", cor: "s1" }] },
    { tipo: "donut", titulo: "Receita por plano", arquivo: "receita-por-plano", formato: "moeda",
      dimensao: "plano", topN: 5, rotuloOutras: "Outros planos",
      valor: acadValor },
    { tipo: "barras", titulo: "Renovações e cancelamentos por mês", arquivo: "renovacoes-cancelamentos", formato: "numero",
      series: [{ label: "Renovações", metrica: "renovacoes", cor: "s3" },
               { label: "Cancelamentos", metrica: "cancelamentos", cor: "s2" }] },
    { tipo: "linha", titulo: "Receita acumulada", arquivo: "receita-acumulada", formato: "moeda",
      serie: { label: "Acumulado", metrica: "acumulado" }, cor: "s1" },
    { tipo: "ranking", titulo: "Alunos que mais geraram receita", sub: "no período selecionado",
      arquivo: "melhores-alunos", formato: "moeda",
      largura: "full", dimensao: "aluno", topN: 8, rotuloOutras: "Demais alunos", cor: "s1",
      rotuloValor: "Receita",
      valor: acadValor },
  ],

  tabela: {
    titulo: "Resumo mensal",
    colunas: [
      { titulo: "Mês", formato: "texto", calc: function (m, DK) { return DK.mesLabelLongo(m.ym); } },
      { titulo: "Receita", formato: "moeda", calc: function (m) { return m.receita; } },
      { titulo: "Alunos", formato: "numero", calc: function (m) { return m.alunos; } },
      { titulo: "Ticket médio", formato: "moedaExata", calc: function (m) { return m.ticket; } },
      { titulo: "Matrículas", formato: "numero", calc: function (m) { return m.matriculas; } },
      { titulo: "Renovações", formato: "numero", calc: function (m) { return m.renovacoes; } },
      { titulo: "Cancelamentos", formato: "numero", calc: function (m) { return m.cancelamentos; } },
      { titulo: "Acumulado", formato: "moeda", calc: function (m) { return m.acumulado; } },
    ],
    total: function (rows, mensal, DK) {
      var receita = DK.soma(rows, "valor");
      var pagos = DK.contarSe(rows, acadPago);
      return ["Total", receita, DK.unicos(rows, "aluno"),
              pagos > 0 ? receita / pagos : 0,
              DK.contarSe(rows, acadEvento("Matrícula")),
              DK.contarSe(rows, acadEvento("Renovação")),
              DK.contarSe(rows, acadEvento("Cancelamento")),
              mensal[mensal.length - 1].acumulado];
    },
  },
};
