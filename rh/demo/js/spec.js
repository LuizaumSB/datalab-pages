/* DataLab — Dashboard RH: especificação do nicho.
   Colunas conforme docs/textos-aulas-kiwify.md: Data, Funcionário, Evento, Quantidade

   Atenção: este nicho não tem coluna de valor monetário. Tudo aqui é contagem —
   dias, horas e ocorrências. Nenhum formato "moeda" é usado. */

/* Eventos canônicos e as variações de escrita que o dashboard reconhece.
   Evento não reconhecido é mantido como o usuário escreveu. */
var RH_EVENTOS = {
  falta: "Falta", faltas: "Falta", ausencia: "Falta", ausencias: "Falta",
  "falta injustificada": "Falta", "falta nao justificada": "Falta", "nao compareceu": "Falta",
  atestado: "Atestado", atestados: "Atestado", "atestado medico": "Atestado",
  "licenca medica": "Atestado", afastamento: "Atestado", "falta justificada": "Atestado",
  ferias: "Férias", feria: "Férias", "ferias programadas": "Férias", "gozo de ferias": "Férias",
  "hora extra": "Hora extra", "horas extras": "Hora extra", "hora-extra": "Hora extra",
  "horas extra": "Hora extra", he: "Hora extra", extra: "Hora extra", overtime: "Hora extra",
  admissao: "Admissão", admissoes: "Admissão", contratacao: "Admissão",
  contratado: "Admissão", admitido: "Admissão", entrada: "Admissão",
  demissao: "Demissão", demissoes: "Demissão", desligamento: "Demissão",
  desligado: "Demissão", rescisao: "Demissão", saida: "Demissão",
};

/* Faltas e atestados são o que compõe o absenteísmo. */
function rhAusencia(r) { return r.evento === "Falta" || r.evento === "Atestado"; }
function rhEvento(nome) { return function (r) { return r.evento === nome; }; }
function rhUm() { return 1; }

window.DK_SPEC = {
  id: "rh",
  titulo: "Dashboard RH",
  aba: "registros",
  unidade: "registros",
  msgVazio: "Nenhum registro válido encontrado. Confira se a planilha tem as colunas Data, Funcionário, Evento e Quantidade — use o template.xlsx como base.",

  campos: {
    data: { tipo: "data", aceita: ["date", "dia", "data do evento", "data do registro"], obrigatorio: true },
    funcionario: { tipo: "texto", aceita: ["colaborador", "nome", "empregado", "employee", "pessoa"], padrao: "Sem funcionário" },
    evento: { tipo: "texto", aceita: ["tipo", "ocorrencia", "movimento", "motivo", "lancamento"], padrao: "Falta" },
    quantidade: { tipo: "numero", aceita: ["qtd", "qtde", "dias", "horas", "quantity"], positivo: true, padrao: 1 },
  },

  /* Padroniza o evento escrito pelo usuário (falta, atestado, férias, hora extra…). */
  derivaLinha: function (linha) {
    var canonico = RH_EVENTOS[window.DK.slug(linha.evento)];
    if (canonico) linha.evento = canonico;
    else if (!linha.evento) linha.evento = "Falta";
  },

  metricasMensais: {
    funcionarios: function (rows) { return window.DK.unicos(rows, "funcionario"); },
    ocorrencias: function (rows) { return rows.length; },
    faltas: function (rows) { return window.DK.somaSe(rows, "quantidade", rhEvento("Falta")); },
    atestados: function (rows) { return window.DK.somaSe(rows, "quantidade", rhEvento("Atestado")); },
    ferias: function (rows) { return window.DK.somaSe(rows, "quantidade", rhEvento("Férias")); },
    horasExtras: function (rows) { return window.DK.somaSe(rows, "quantidade", rhEvento("Hora extra")); },
    admissoes: function (rows) { return window.DK.contarSe(rows, rhEvento("Admissão")); },
    demissoes: function (rows) { return window.DK.contarSe(rows, rhEvento("Demissão")); },
  },

  posMensal: function (mensal, DK) {
    mensal.forEach(function (m) {
      m.absenteismo = m.faltas + m.atestados;
      m.saldo = m.admissoes - m.demissoes;
    });
    DK.acumular(mensal, "absenteismo", "acumulado");
  },

  kpis: [
    { label: "Funcionários ativos", metrica: "funcionarios", formato: "numero",
      calc: function (rows, mensal, DK) { return DK.unicos(rows, "funcionario"); } },
    { label: "Faltas (dias)", metrica: "faltas", formato: "numero", subirEBom: false,
      calc: function (rows, mensal, DK) { return DK.somaSe(rows, "quantidade", rhEvento("Falta")); } },
    { label: "Horas extras", metrica: "horasExtras", formato: "numero", subirEBom: false,
      calc: function (rows, mensal, DK) { return DK.somaSe(rows, "quantidade", rhEvento("Hora extra")); } },
    { label: "Absenteísmo (dias)", metrica: "absenteismo", formato: "numero", subirEBom: false,
      calc: function (rows, mensal, DK) { return DK.somaSe(rows, "quantidade", rhAusencia); } },
  ],

  graficos: [
    { tipo: "barras", titulo: "Faltas e horas extras por mês", arquivo: "faltas-horas-extras", formato: "numero",
      series: [{ label: "Faltas (dias)", metrica: "faltas", cor: "s2" },
               { label: "Horas extras", metrica: "horasExtras", cor: "s4" }] },
    { tipo: "donut", titulo: "Ocorrências por tipo de evento", sub: "registros no período",
      arquivo: "ocorrencias-por-evento", formato: "numero",
      dimensao: "evento", topN: 6, rotuloOutras: "Outros eventos",
      valor: rhUm },
    { tipo: "barras", titulo: "Admissões e demissões por mês", arquivo: "admissoes-demissoes", formato: "numero",
      series: [{ label: "Admissões", metrica: "admissoes", cor: "s3" },
               { label: "Demissões", metrica: "demissoes", cor: "s2" }] },
    { tipo: "linha", titulo: "Absenteísmo acumulado", sub: "dias de falta + atestado",
      arquivo: "absenteismo-acumulado", formato: "numero",
      serie: { label: "Acumulado", metrica: "acumulado" }, cor: "s2" },
    { tipo: "ranking", titulo: "Funcionários com mais ocorrências", sub: "registros no período",
      arquivo: "funcionarios-mais-ocorrencias", formato: "numero",
      largura: "full", dimensao: "funcionario", topN: 8, rotuloOutras: "Demais funcionários", cor: "s1",
      rotuloValor: "Ocorrências",
      valor: rhUm },
  ],

  tabela: {
    titulo: "Resumo mensal",
    colunas: [
      { titulo: "Mês", formato: "texto", calc: function (m, DK) { return DK.mesLabelLongo(m.ym); } },
      { titulo: "Funcionários", formato: "numero", calc: function (m) { return m.funcionarios; } },
      { titulo: "Faltas (dias)", formato: "numero", calc: function (m) { return m.faltas; } },
      { titulo: "Atestados (dias)", formato: "numero", calc: function (m) { return m.atestados; } },
      { titulo: "Férias (dias)", formato: "numero", calc: function (m) { return m.ferias; } },
      { titulo: "Horas extras", formato: "numero", calc: function (m) { return m.horasExtras; } },
      { titulo: "Absenteísmo (dias)", formato: "numero", calc: function (m) { return m.absenteismo; } },
      { titulo: "Acumulado", formato: "numero", calc: function (m) { return m.acumulado; } },
    ],
    total: function (rows, mensal, DK) {
      return ["Total",
              DK.unicos(rows, "funcionario"),
              DK.somaSe(rows, "quantidade", rhEvento("Falta")),
              DK.somaSe(rows, "quantidade", rhEvento("Atestado")),
              DK.somaSe(rows, "quantidade", rhEvento("Férias")),
              DK.somaSe(rows, "quantidade", rhEvento("Hora extra")),
              DK.somaSe(rows, "quantidade", rhAusencia),
              mensal[mensal.length - 1].acumulado];
    },
  },
};
