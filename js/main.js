const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxVswnxY9bzUFmg8Ypyp90m0c9i6AFA4JINWrghWFF14NWx_sn74g-XhHZ8uHFG1-5m/exec",
  SCHEDULED_PULL: {
    enabled: false,
    intervalHours: 24,
    lastPull: null
  }
};

let STATE = {
  rawData: null,
  cursosData: [],
  filtered: [],
  colunas: [],
  criterios: [],
  currentPage: 1,
  rowsPerPage: 20
};

// ─── Bootstrap ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadScheduleConfig();
  checkScheduledPull();

  document.getElementById('sel-curso').addEventListener('change', onCursoChange);
  document.getElementById('sel-semestre').addEventListener('change', onFiltersChange);
  document.getElementById('sel-criterio').addEventListener('change', onFiltersChange);
  document.getElementById('sel-mes').addEventListener('change', onFiltersChange);
  document.getElementById('btn-atualizar').addEventListener('click', fetchData);
  document.getElementById('btn-toggle-table').addEventListener('click', toggleTable);
  document.getElementById('btn-export-xlsx').addEventListener('click', exportXLSX);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
  document.getElementById('mobile-menu-btn').addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

  document.querySelectorAll('.btn-theme').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  document.getElementById('toggle-schedule').addEventListener('change', onScheduleChange);
  document.getElementById('schedule-hours').addEventListener('change', onScheduleChange);

  fetchData();
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchData() {
  if (CONFIG.APPS_SCRIPT_URL === "COLE_AQUI_A_URL_DO_WEB_APP") {
    showError("Configure a URL do Apps Script em dashboard/js/main.js");
    return;
  }
  showLoading(true);
  hideError();
  try {
    const resp = await fetch(CONFIG.APPS_SCRIPT_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.erro) throw new Error(data.erro);
    STATE.rawData = data;
    STATE.cursosData = data.cursos || [];
    updateLastPull();
    populateCursos(STATE.cursosData);
    updateTimestamp(data.ultima_atualizacao);
    hideStaleBadge();
  } catch (err) {
    showError("Erro ao carregar dados: " + err.message);
  } finally {
    showLoading(false);
  }
}

// ─── Cascata de seletores ─────────────────────────────────────────────────────

function onCursoChange() {
  const nomeCurso = document.getElementById('sel-curso').value;
  const curso = STATE.cursosData.find(c => c.nome === nomeCurso);
  populateSemestres(curso);
  onFiltersChange();
}

function onFiltersChange() {
  const filters = getFilters();
  const curso = STATE.cursosData.find(c => c.nome === filters.curso);
  if (!curso) return;

  let semestresUsar = filters.semestre === 'todos'
    ? curso.semestres
    : curso.semestres.filter(s => s.nome === filters.semestre);

  const semComDados = semestresUsar.find(s => s.colunas && s.colunas.length);
  if (!semComDados) return;

  const colunas = semComDados.colunas;
  STATE.colunas = colunas;

  let dadosUnidos = [];
  semestresUsar.forEach(s => {
    if (s.dados) dadosUnidos = dadosUnidos.concat(s.dados);
  });

  const criterios = detectNoteColumns(colunas, dadosUnidos);
  STATE.criterios = criterios;

  const idxTurma = colunas.findIndex(c => c.toLowerCase().includes('turma'));
  const turmas = [...new Set(dadosUnidos.map(r => String(r[idxTurma]).trim()))].filter(Boolean).sort();
  populateTurmas(turmas);
  populateCriterios(criterios);

  const meses = getMesesFromDados(colunas, dadosUnidos);
  populateMeses(meses);

  const filters2 = getFilters();
  const dadosFiltrados = applyFilters(dadosUnidos, filters2, colunas);
  STATE.filtered = dadosFiltrados;

  updateKPIs(dadosFiltrados, colunas, criterios);
  renderAllCharts(dadosFiltrados, colunas, criterios, filters2, semestresUsar, curso);
  renderTable(dadosFiltrados, colunas, criterios);
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function updateKPIs(dados, colunas, criterios) {
  document.getElementById('kpi-respostas').textContent = dados.length;

  if (!dados.length || !criterios.length) {
    ['kpi-media','kpi-melhor','kpi-melhor-val','kpi-pior','kpi-pior-val','kpi-turmas']
      .forEach(id => document.getElementById(id).textContent = '—');
    return;
  }

  const medias = criterios.map(crit => {
    const idx = colunas.indexOf(crit);
    const vals = dados.map(r => r[idx]).filter(v => typeof v === 'number');
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
  });

  const mediaGeral = medias.reduce((a,b)=>a+b,0)/medias.length;
  const maxMediaIdx = medias.indexOf(Math.max(...medias));
  const minMediaIdx = medias.indexOf(Math.min(...medias));

  // Nota máxima e mínima individuais reais (não médias por critério)
  let notaMin = Infinity, notaMax = -Infinity;
  criterios.forEach(crit => {
    const idx = colunas.indexOf(crit);
    dados.forEach(r => {
      const v = r[idx];
      if (typeof v === 'number') {
        if (v < notaMin) notaMin = v;
        if (v > notaMax) notaMax = v;
      }
    });
  });

  const idxTurma = colunas.findIndex(c => c.toLowerCase().includes('turma'));
  const nTurmas = new Set(dados.map(r => String(r[idxTurma]).trim())).size;

  setKPI('kpi-media', mediaGeral.toFixed(2), mediaGeral);
  // Nota máxima real + nome do critério com melhor média como contexto
  setKPI('kpi-melhor-val', notaMax !== -Infinity ? notaMax : '—', notaMax);
  document.getElementById('kpi-melhor').textContent = `Melhor média: ${criterios[maxMediaIdx]} (${medias[maxMediaIdx].toFixed(2)})`;
  // Nota mínima real + nome do critério com pior média como contexto
  setKPI('kpi-pior-val', notaMin !== Infinity ? notaMin : '—', notaMin);
  document.getElementById('kpi-pior').textContent = `Pior média: ${criterios[minMediaIdx]} (${medias[minMediaIdx].toFixed(2)})`;
  document.getElementById('kpi-turmas').textContent = nTurmas;
}

function setKPI(id, text, val) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'kpi-value ' + (val >= 8 ? 'score-high' : val >= 6 ? 'score-mid' : 'score-low');
}

// ─── Gráficos ─────────────────────────────────────────────────────────────────

function renderAllCharts(dados, colunas, criterios, filters, semestresUsar, curso) {
  const isTodos = filters.semestre === 'todos';
  const criterioFiltro = filters.criterio;

  renderRadar(dados, colunas, criterios, filters.turmas);
  renderBarras(dados, colunas, criterios);

  const secLinha = document.getElementById('sec-linha');
  if (!isTodos && semestresUsar.length === 1 && semestresUsar[0].dados.length) {
    secLinha.style.display = '';
    renderLinha(semestresUsar[0].dados, colunas, criterios, filters.turmas, criterioFiltro);
  } else {
    secLinha.style.display = 'none';
  }

  const secHist = document.getElementById('sec-histograma');
  if (criterioFiltro !== 'todos') {
    secHist.style.display = '';
    renderHistograma(dados, colunas, criterioFiltro);
  } else {
    secHist.style.display = 'none';
  }

  const secComp = document.getElementById('sec-comparativo');
  if (isTodos && semestresUsar.length > 1) {
    secComp.style.display = '';
    const semInfo = semestresUsar.map(s => ({ nome: s.nome, dados: s.dados || [], colunas: s.colunas || colunas }));
    renderComparativo(semInfo, criterios);
  } else {
    secComp.style.display = 'none';
  }
}

// ─── Tabela ───────────────────────────────────────────────────────────────────

function renderTable(dados, colunas, criterios) {
  STATE.currentPage = 1;
  renderTablePage();
}

function renderTablePage() {
  const dados = STATE.filtered;
  const colunas = STATE.colunas;
  const criterios = STATE.criterios;
  const idxTurma = colunas.findIndex(c => c.toLowerCase().includes('turma'));

  const start = (STATE.currentPage - 1) * STATE.rowsPerPage;
  const pageData = dados.slice(start, start + STATE.rowsPerPage);

  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const headRow = document.createElement('tr');
  ['Turma', ...criterios, 'Média'].forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.length > 25 ? col.substring(0,23)+'…' : col;
    th.title = col;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  pageData.forEach(row => {
    const tr = document.createElement('tr');
    const turma = idxTurma >= 0 ? String(row[idxTurma]).trim() : '—';
    const tdTurma = document.createElement('td');
    tdTurma.textContent = turma;
    tr.appendChild(tdTurma);

    const notas = criterios.map(crit => {
      const idx = colunas.indexOf(crit);
      return typeof row[idx] === 'number' ? row[idx] : null;
    });

    notas.forEach(nota => {
      const td = document.createElement('td');
      if (nota !== null) {
        td.textContent = nota;
        td.className = nota >= 8 ? 'score-high' : nota >= 6 ? 'score-mid' : 'score-low';
      } else {
        td.textContent = '—';
      }
      tr.appendChild(td);
    });

    const validas = notas.filter(n => n !== null);
    const media = validas.length ? (validas.reduce((a,b)=>a+b,0)/validas.length).toFixed(2) : '—';
    const tdMedia = document.createElement('td');
    tdMedia.textContent = media;
    if (media !== '—') {
      tdMedia.className = 'font-mono ' + (parseFloat(media) >= 8 ? 'score-high' : parseFloat(media) >= 6 ? 'score-mid' : 'score-low');
    }
    tr.appendChild(tdMedia);
    tbody.appendChild(tr);
  });

  renderPagination(dados.length);
}

function renderPagination(total) {
  const totalPages = Math.ceil(total / STATE.rowsPerPage);
  const el = document.getElementById('pagination');
  el.innerHTML = '';

  if (totalPages <= 1) return;

  const makeBtn = (label, page, disabled = false, active = false) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'btn-page' + (active ? ' active' : '');
    btn.disabled = disabled;
    btn.addEventListener('click', () => { STATE.currentPage = page; renderTablePage(); });
    return btn;
  };

  el.appendChild(makeBtn('←', STATE.currentPage - 1, STATE.currentPage === 1));

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - STATE.currentPage) <= 1) {
      el.appendChild(makeBtn(i, i, false, i === STATE.currentPage));
    } else if (Math.abs(i - STATE.currentPage) === 2) {
      const sp = document.createElement('span');
      sp.textContent = '…';
      sp.className = 'page-ellipsis';
      el.appendChild(sp);
    }
  }

  el.appendChild(makeBtn('→', STATE.currentPage + 1, STATE.currentPage === totalPages));
}

function toggleTable() {
  const body = document.getElementById('table-wrapper');
  const btn = document.getElementById('btn-toggle-table');
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  btn.textContent = hidden ? '▲ Recolher' : '▼ Expandir';
}

// ─── Export XLSX — planilha completa idêntica ao Drive ───────────────────────

function exportXLSX() {
  if (!window.XLSX) {
    alert('Biblioteca XLSX não carregou. Verifique sua conexão com a internet.');
    return;
  }
  const dados = STATE.filtered;
  const colunas = STATE.colunas;
  if (!dados.length || !colunas.length) {
    alert('Sem dados para exportar. Aplique os filtros primeiro.');
    return;
  }

  // Cabeçalho + todas as linhas originais, sem omitir nenhuma coluna
  const wsData = [
    colunas,
    ...dados.map(row => colunas.map((_, i) => {
      const v = row[i];
      return v !== undefined && v !== null ? v : '';
    }))
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Largura de coluna automática (baseada no conteúdo real)
  ws['!cols'] = colunas.map((col, i) => {
    const maxLen = Math.max(
      col.length,
      ...dados.slice(0, 200).map(row => String(row[i] ?? '').length)
    );
    return { wch: Math.min(maxLen + 2, 45) };
  });

  const filters = getFilters();
  const semLabel = filters.semestre === 'todos' ? 'todos_semestres' : filters.semestre;
  XLSX.utils.book_append_sheet(wb, ws, 'Avaliação Discente');
  XLSX.writeFile(wb, `avaliacao_${filters.curso.replace(/\s+/g, '_')}_${semLabel}.xlsx`);
}

// ─── Export PDF — A4 retrato ──────────────────────────────────────────────────

async function exportPDF() {
  if (!window.jspdf) {
    alert('jsPDF não carregou. Verifique sua conexão com a internet.');
    return;
  }
  if (!STATE.filtered.length) {
    alert('Sem dados para exportar. Aplique os filtros primeiro.');
    return;
  }

  const btn = document.getElementById('btn-export-pdf');
  btn.disabled = true;
  btn.textContent = 'Gerando...';

  try {
    const { jsPDF } = window.jspdf;
    // A4 retrato: 210mm × 297mm
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = 210;
    const PH = 297;
    const M  = 14;
    const CW = PW - 2 * M;   // 182mm
    const filters  = getFilters();
    const semLabel = filters.semestre === 'todos' ? 'Todos os semestres' : filters.semestre;

    // Fundo escuro para legibilidade em projetor/tela
    const darkPage = () => {
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, PW, PH, 'F');
    };

    // Faixa de título de seção
    const sectionHeader = (title, subtitle) => {
      doc.setFillColor(59, 130, 246);
      doc.rect(0, 0, PW, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(title, M, 13);
      if (subtitle) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(subtitle, PW - M, 13, { align: 'right' });
      }
    };

    // Fundo escuro atrás do canvas para preservar legibilidade das labels
    const addChartImg = (canvasId, x, cy, w, h) => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      try {
        doc.setFillColor(30, 41, 59);
        doc.roundedRect(x, cy, w, h, 2, 2, 'F');
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, cy, w, h);
      } catch (_) {}
    };

    // ── Página 1: header + filtros + KPIs + Radar + Ranking ────────────────

    darkPage();
    sectionHeader('Relatório de Avaliação Discente', `Gerado em ${new Date().toLocaleDateString('pt-BR')}`);

    let y = 24;

    // Linha de filtros
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(M, y, CW, 10, 2, 2, 'F');
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.text(`Curso: ${filters.curso}`, M + 4, y + 6.5);
    doc.text(`Semestre: ${semLabel}`, M + 80, y + 6.5);
    const turmasSel  = filters.turmas;
    const turmasLbl  = turmasSel.length === 0 ? 'Nenhuma' :
      turmasSel.length <= 2 ? turmasSel.join(', ') :
      `${turmasSel.slice(0, 2).join(', ')} +${turmasSel.length - 2}`;
    doc.text(`Turmas: ${turmasLbl}`, M + 135, y + 6.5);
    y += 14;

    // KPI cards — linha 1: 3 cards (Respostas, Média, Turmas)
    const row1Kpis = [
      { label: 'Total de Respostas', val: document.getElementById('kpi-respostas').textContent, sub: '' },
      { label: 'Média Geral',        val: document.getElementById('kpi-media').textContent,     sub: '' },
      { label: 'Turmas',             val: document.getElementById('kpi-turmas').textContent,    sub: 'respondentes' },
    ];
    const c1W = (CW - 2 * 4) / 3;   // ~58mm
    const c1H = 22;
    row1Kpis.forEach((kpi, i) => {
      const cx = M + i * (c1W + 4);
      doc.setFillColor(30, 41, 59);
      doc.roundedRect(cx, y, c1W, c1H, 2, 2, 'F');
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(kpi.label, cx + 4, y + 6);
      doc.setTextColor(226, 232, 240);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(kpi.val, cx + 4, y + 15);
      if (kpi.sub) {
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.sub, cx + 4, y + 20.5);
      }
    });
    y += c1H + 4;

    // KPI cards — linha 2: 2 cards (Melhor, Pior) com sub-texto longo
    const row2Kpis = [
      { label: 'Melhor Critério',    val: document.getElementById('kpi-melhor-val').textContent, sub: document.getElementById('kpi-melhor').textContent },
      { label: 'Critério Mais Baixo',val: document.getElementById('kpi-pior-val').textContent,  sub: document.getElementById('kpi-pior').textContent },
    ];
    const c2W = (CW - 1 * 4) / 2;   // ~89mm
    const c2H = 26;
    row2Kpis.forEach((kpi, i) => {
      const cx = M + i * (c2W + 4);
      doc.setFillColor(30, 41, 59);
      doc.roundedRect(cx, y, c2W, c2H, 2, 2, 'F');
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(kpi.label, cx + 4, y + 6);
      doc.setTextColor(226, 232, 240);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(kpi.val, cx + 4, y + 15);
      if (kpi.sub) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        const sub = kpi.sub.length > 30 ? kpi.sub.substring(0, 29) + '…' : kpi.sub;
        doc.text(sub, cx + 4, y + 22);
      }
    });
    y += c2H + 6;

    // Gráfico Radar — largura total, altura proporcional
    const chartW = CW;
    const chartH1 = 84;   // Radar (quadrado ficará bem)
    const chartH2 = 84;   // Ranking

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(148, 163, 184);
    doc.text('RADAR — VISÃO POR CRITÉRIO', M, y + 1);
    y += 5;
    addChartImg('chart-radar', M, y, chartW, chartH1);
    y += chartH1 + 5;

    // Gráfico Ranking
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(148, 163, 184);
    doc.text('RANKING DE CRITÉRIOS', M, y + 1);
    y += 5;
    addChartImg('chart-barras', M, y, chartW, chartH2);

    // ── Páginas extras para gráficos opcionais ─────────────────────────────
    const extraCharts = [
      { canvasId: 'chart-linha',       title: 'EVOLUÇÃO MENSAL',              sectionId: 'sec-linha' },
      { canvasId: 'chart-histograma',  title: 'DISTRIBUIÇÃO DE NOTAS',        sectionId: 'sec-histograma' },
      { canvasId: 'chart-comparativo', title: 'COMPARATIVO ENTRE SEMESTRES',  sectionId: 'sec-comparativo' },
    ];

    for (const { canvasId, title, sectionId } of extraCharts) {
      const sec = document.getElementById(sectionId);
      if (!sec || sec.style.display === 'none') continue;
      doc.addPage();
      darkPage();
      sectionHeader(title, `${filters.curso} — ${semLabel}`);
      // Gráfico ocupa toda a altura útil da página
      addChartImg(canvasId, M, 24, CW, PH - 38);
    }

    // ── Resumo analítico ───────────────────────────────────────────────────
    doc.addPage();
    darkPage();
    sectionHeader('RESUMO ANALÍTICO', `${filters.curso} — ${semLabel}`);

    doc.setFillColor(30, 41, 59);
    doc.roundedRect(M, 24, CW, PH - 38, 3, 3, 'F');

    const mediaGeral = document.getElementById('kpi-media').textContent;
    const totalResp  = document.getElementById('kpi-respostas').textContent;
    const melhorCrit = document.getElementById('kpi-melhor').textContent;
    const melhorVal  = document.getElementById('kpi-melhor-val').textContent;
    const piorCrit   = document.getElementById('kpi-pior').textContent;
    const piorVal    = document.getElementById('kpi-pior-val').textContent;
    const nTurmas    = document.getElementById('kpi-turmas').textContent;

    let ty = 34;
    const textLines = [
      { bold: true,  text: `Período: ${semLabel}` },
      { bold: false, text: `Curso: ${filters.curso}` },
      { bold: false, text: '' },
      { bold: false, text: `Foram coletadas ${totalResp} respostas de ${nTurmas} turma(s).` },
      { bold: false, text: '' },
      { bold: true,  text: 'Resultado Geral' },
      { bold: false, text: `Média geral das avaliações: ${mediaGeral} (escala 1–10).` },
      { bold: false, text: '' },
      { bold: true,  text: 'Destaques' },
      { bold: false, text: `Nota mais alta registrada: ${melhorVal}. ${melhorCrit}.` },
      { bold: false, text: `Nota mais baixa registrada: ${piorVal}. ${piorCrit}.` },
      { bold: false, text: '' },
      { bold: false, text: 'Os gráficos nas páginas anteriores detalham a' },
      { bold: false, text: 'distribuição das notas por critério, turma e período.' },
    ];
    textLines.forEach(line => {
      if (ty > PH - M - 4) return;
      doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
      doc.setFontSize(line.bold ? 10.5 : 10);
      doc.setTextColor(
        line.bold ? 226 : 148,
        line.bold ? 232 : 163,
        line.bold ? 240 : 184
      );
      doc.text(line.text, M + 6, ty);
      ty += line.bold ? 9 : 8;
    });

    // Footer em todas as páginas
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Dashboard de Avaliação Discente — Mackenzie', M, PH - 5);
      doc.text(`${p} / ${totalPages}`, PW - M, PH - 5, { align: 'right' });
    }

    const semFile = semLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.]/g, '');
    doc.save(`relatorio_${filters.curso.replace(/\s+/g, '_')}_${semFile}.pdf`);

  } catch (err) {
    console.error(err);
    alert('Erro ao gerar PDF: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Exportar PDF';
  }
}

// ─── Mobile sidebar ───────────────────────────────────────────────────────────

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const isOpen  = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay.classList.toggle('visible', !isOpen);
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

// ─── Agendamento ──────────────────────────────────────────────────────────────

function loadScheduleConfig() {
  const saved = JSON.parse(localStorage.getItem('schedule-config') || 'null');
  if (saved) {
    CONFIG.SCHEDULED_PULL.enabled = saved.enabled;
    CONFIG.SCHEDULED_PULL.intervalHours = saved.intervalHours;
  }
  document.getElementById('toggle-schedule').checked = CONFIG.SCHEDULED_PULL.enabled;
  document.getElementById('schedule-hours').value = CONFIG.SCHEDULED_PULL.intervalHours;
  updateNextPullLabel();
}

function onScheduleChange() {
  CONFIG.SCHEDULED_PULL.enabled = document.getElementById('toggle-schedule').checked;
  CONFIG.SCHEDULED_PULL.intervalHours = parseInt(document.getElementById('schedule-hours').value) || 24;
  localStorage.setItem('schedule-config', JSON.stringify({
    enabled: CONFIG.SCHEDULED_PULL.enabled,
    intervalHours: CONFIG.SCHEDULED_PULL.intervalHours
  }));
  updateNextPullLabel();
}

function updateLastPull() {
  const now = Date.now();
  CONFIG.SCHEDULED_PULL.lastPull = now;
  localStorage.setItem('last-pull', now);
  updateNextPullLabel();
}

function checkScheduledPull() {
  const lastPull = parseInt(localStorage.getItem('last-pull') || '0');
  const saved = JSON.parse(localStorage.getItem('schedule-config') || 'null');
  if (!saved || !saved.enabled) return;
  const intervalMs = (saved.intervalHours || 24) * 3600000;
  if (Date.now() - lastPull > intervalMs) {
    showStaleBadge();
  }
  setInterval(() => {
    if (!CONFIG.SCHEDULED_PULL.enabled) return;
    const last = parseInt(localStorage.getItem('last-pull') || '0');
    const ms = CONFIG.SCHEDULED_PULL.intervalHours * 3600000;
    if (Date.now() - last > ms) fetchData();
  }, 60000);
}

function updateNextPullLabel() {
  const lastPull = parseInt(localStorage.getItem('last-pull') || '0');
  const el = document.getElementById('next-pull-label');
  if (!CONFIG.SCHEDULED_PULL.enabled || !lastPull) {
    el.textContent = 'Desativado';
    return;
  }
  const next = new Date(lastPull + CONFIG.SCHEDULED_PULL.intervalHours * 3600000);
  el.textContent = 'Próxima: ' + next.toLocaleString('pt-BR');
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function showLoading(on) {
  document.getElementById('spinner').style.display = on ? 'inline-block' : 'none';
  document.getElementById('btn-atualizar').disabled = on;
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError() {
  document.getElementById('error-msg').style.display = 'none';
}

function updateTimestamp(iso) {
  const el = document.getElementById('last-update');
  if (!iso) return;
  el.textContent = 'Atualizado: ' + new Date(iso).toLocaleString('pt-BR');
}

function showStaleBadge() {
  document.getElementById('stale-badge').style.display = 'flex';
}

function hideStaleBadge() {
  document.getElementById('stale-badge').style.display = 'none';
}
