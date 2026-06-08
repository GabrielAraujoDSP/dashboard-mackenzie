function doGet(e) {
  try {
    var result = buildResult();
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ erro: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function buildResult() {
  var rootFolders = DriveApp.getFoldersByName("mackenzie");
  if (!rootFolders.hasNext()) {
    return { erro: "Pasta mackenzie não encontrada no Drive" };
  }
  var mackenzieFolder = rootFolders.next();
  var cursos = [];

  var cursoIter = mackenzieFolder.getFolders();
  while (cursoIter.hasNext()) {
    var cursoFolder = cursoIter.next();
    var nomeCurso = cursoFolder.getName();
    var semestres = [];

    var semIter = cursoFolder.getFolders();
    while (semIter.hasNext()) {
      var semFolder = semIter.next();
      var nomeSem = semFolder.getName();
      var semData = lerSemestre(semFolder, nomeSem);
      semestres.push(semData);
    }

    semestres.sort(function(a, b) {
      return compareSemestres(a.nome, b.nome);
    });

    cursos.push({ nome: nomeCurso, semestres: semestres });
  }

  return {
    cursos: cursos,
    ultima_atualizacao: new Date().toISOString()
  };
}

function lerSemestre(folder, nomeSem) {
  var fileIter = folder.getFiles();
  var planilhaFile = null;

  while (fileIter.hasNext()) {
    var f = fileIter.next();
    var nome = f.getName().toUpperCase();
    var ehSheet = f.getMimeType() === MimeType.GOOGLE_SHEETS;
    if (ehSheet && (nome.indexOf("AVALIAÇÃO DISCENTE") === 0 || nome.indexOf("AVALIACAO DISCENTE") === 0)) {
      planilhaFile = f;
      break;
    }
  }

  if (!planilhaFile) {
    return { nome: nomeSem, dados: [], colunas: [], aviso: "planilha não encontrada" };
  }

  try {
    var ss = SpreadsheetApp.openById(planilhaFile.getId());
    var sheet = ss.getActiveSheet();
    var allValues = sheet.getDataRange().getValues();

    if (allValues.length < 2) {
      return { nome: nomeSem, planilha: planilhaFile.getName(), colunas: [], dados: [] };
    }

    var headers = allValues[0].map(function(h) { return String(h).trim(); });
    var dados = [];

    for (var i = 1; i < allValues.length; i++) {
      var row = allValues[i];
      var hasData = row.some(function(cell) { return cell !== "" && cell !== null; });
      if (!hasData) continue;

      var rowOut = row.map(function(cell, idx) {
        var num = parseFloat(cell);
        if (!isNaN(num) && num >= 1 && num <= 10) return num;
        if (cell instanceof Date) {
          return Utilities.formatDate(cell, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
        }
        return cell;
      });
      dados.push(rowOut);
    }

    return {
      nome: nomeSem,
      planilha: planilhaFile.getName(),
      colunas: headers,
      dados: dados
    };
  } catch (err) {
    return { nome: nomeSem, dados: [], colunas: [], aviso: "erro ao ler planilha: " + err.message };
  }
}

function compareSemestres(a, b) {
  var pa = parseSemestre(a);
  var pb = parseSemestre(b);
  if (pa.ano !== pb.ano) return pa.ano - pb.ano;
  return pa.num - pb.num;
}

function parseSemestre(nome) {
  var parts = nome.split(".");
  return {
    ano: parseInt(parts[0]) || 0,
    num: parseInt(parts[1]) || 0
  };
}
