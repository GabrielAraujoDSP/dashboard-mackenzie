const chartInstances = {};

const CHART_COLORS = [
  '#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6'
];

// Resolve CSS variable to actual color value at the moment of call
function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';
}

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function getScoreColor(val) {
  if (val >= 8) return '#22c55e';
  if (val >= 6) return '#f59e0b';
  return '#ef4444';
}

function calcMediaPorCriterio(dados, colunas, criterios) {
  return criterios.map(crit => {
    const idx = colunas.indexOf(crit);
    const vals = dados.map(r => r[idx]).filter(v => typeof v === 'number');
    return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
  });
}

function calcMediaPorTurmaCriterio(dados, colunas, criterios, turmas) {
  const idxTurma = colunas.findIndex(c => c.toLowerCase().includes('turma'));
  return turmas.map(turma => {
    const rows = dados.filter(r => String(r[idxTurma]).trim() === turma);
    return calcMediaPorCriterio(rows, colunas, criterios);
  });
}

// 1. Radar
function renderRadar(dados, colunas, criterios, turmasSel) {
  destroyChart('radar');
  const ctx = document.getElementById('chart-radar').getContext('2d');
  const idxTurma = colunas.findIndex(c => c.toLowerCase().includes('turma'));
  const turmasPresentes = [...new Set(dados.map(r => String(r[idxTurma]).trim()))].filter(Boolean);
  const turmasFinal = turmasSel.length ? turmasSel.filter(t => turmasPresentes.includes(t)) : turmasPresentes;

  let datasets;
  if (turmasFinal.length <= 1) {
    const medias = calcMediaPorCriterio(dados, colunas, criterios);
    datasets = [{
      label: turmasFinal[0] || 'Geral',
      data: medias,
      backgroundColor: 'rgba(59,130,246,0.15)',
      borderColor: '#3b82f6',
      pointBackgroundColor: '#3b82f6',
      borderWidth: 2
    }];
  } else {
    const mediasTurma = calcMediaPorTurmaCriterio(dados, colunas, criterios, turmasFinal);
    datasets = turmasFinal.map((t, i) => ({
      label: t,
      data: mediasTurma[i],
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '26',
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      pointBackgroundColor: CHART_COLORS[i % CHART_COLORS.length],
      borderWidth: 2
    }));
  }

  const corTexto = getCSSVar('--cor-texto');
  const corMuted = getCSSVar('--cor-texto-muted');
  const corBorda = getCSSVar('--cor-borda');

  function wrapLabel(label, maxLen = 15) {
    const words = label.split(' ');
    const lines = [];
    let line = '';
    words.forEach(word => {
      if (line && (line + ' ' + word).length > maxLen) {
        lines.push(line);
        line = word;
      } else {
        line = line ? line + ' ' + word : word;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  chartInstances['radar'] = new Chart(ctx, {
    type: 'radar',
    data: { labels: criterios.map(c => wrapLabel(c)), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 10,
          ticks: { stepSize: 2, color: corMuted, backdropColor: 'transparent', font: { size: 11 } },
          grid: { color: corBorda },
          angleLines: { color: corBorda },
          pointLabels: {
            color: corTexto,
            font: { size: 13, weight: '500' },
            padding: 8
          }
        }
      },
      plugins: {
        legend: { labels: { color: corTexto } },
        tooltip: {
          callbacks: {
            title: items => criterios[items[0].dataIndex],
            label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)}`
          }
        }
      }
    }
  });
}

// 2. Barras horizontais — ranking
function renderBarras(dados, colunas, criterios) {
  destroyChart('barras');
  const ctx = document.getElementById('chart-barras').getContext('2d');
  const medias = calcMediaPorCriterio(dados, colunas, criterios);
  const paired = criterios.map((c, i) => ({ c, v: medias[i] })).sort((a,b) => b.v - a.v);
  const corTexto = getCSSVar('--cor-texto');
  const corMuted = getCSSVar('--cor-texto-muted');
  const corBorda = getCSSVar('--cor-borda');

  const badgesEl = document.getElementById('barras-turmas-badges');
  if (badgesEl) {
    badgesEl.innerHTML = '';
    const idxTurma = colunas.findIndex(c => c.toLowerCase().includes('turma'));
    const turmas = [...new Set(dados.map(r => String(r[idxTurma]).trim()))].filter(Boolean).sort();
    turmas.forEach((turma, i) => {
      const color = CHART_COLORS[i % CHART_COLORS.length];
      const badge = document.createElement('span');
      badge.className = 'chart-turma-badge';
      badge.style.borderColor = color + '55';
      badge.style.color = color;
      badge.innerHTML = `<span class="chart-turma-badge-dot" style="background:${color}"></span>${turma}`;
      badgesEl.appendChild(badge);
    });
  }

  chartInstances['barras'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: paired.map(p => p.c),
      datasets: [{
        label: 'Média',
        data: paired.map(p => p.v),
        backgroundColor: paired.map(p => getScoreColor(p.v)),
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { min: 0, max: 10, ticks: { color: corMuted }, grid: { color: corBorda } },
        y: { ticks: { color: corTexto, font: { size: 13 } }, grid: { display: false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Média: ${ctx.raw.toFixed(2)}`
          }
        }
      }
    }
  });
}

// 3. Linha — evolução mensal
function renderLinha(semestresData, colunas, criterios, turmasSel, criterioFiltro) {
  destroyChart('linha');
  const ctx = document.getElementById('chart-linha').getContext('2d');
  const idxData = colunas.findIndex(c => c.toLowerCase().includes('carimbo'));
  const idxTurma = colunas.findIndex(c => c.toLowerCase().includes('turma'));
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const corTexto = getCSSVar('--cor-texto');
  const corMuted = getCSSVar('--cor-texto-muted');
  const corBorda = getCSSVar('--cor-borda');

  const mesesSet = new Set();
  semestresData.forEach(row => {
    const parts = String(row[idxData]).split('/');
    if (parts.length >= 2) mesesSet.add(parseInt(parts[1]));
  });
  const mesesOrdenados = [...mesesSet].sort((a,b) => a-b);
  const mesesLabels = mesesOrdenados.map(m => nomes[m-1]);

  const turmasPresentes = [...new Set(semestresData.map(r => String(r[idxTurma]).trim()))].filter(Boolean);
  const turmasFinal = turmasSel.length ? turmasSel.filter(t => turmasPresentes.includes(t)) : turmasPresentes;

  const critsFiltro = criterioFiltro !== 'todos' ? [criterioFiltro] : criterios;

  const datasets = turmasFinal.map((turma, i) => {
    const rows = semestresData.filter(r => String(r[idxTurma]).trim() === turma);
    const vals = mesesOrdenados.map(mes => {
      const rowsMes = rows.filter(r => {
        const p = String(r[idxData]).split('/');
        return parseInt(p[1]) === mes;
      });
      if (!rowsMes.length) return null;
      const medias = critsFiltro.map(crit => {
        const idx = colunas.indexOf(crit);
        const vs = rowsMes.map(r => r[idx]).filter(v => typeof v === 'number');
        return vs.length ? vs.reduce((a,b)=>a+b,0)/vs.length : null;
      }).filter(v => v !== null);
      return medias.length ? medias.reduce((a,b)=>a+b,0)/medias.length : null;
    });
    return {
      label: turma,
      data: vals,
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '26',
      tension: 0.3,
      spanGaps: true,
      pointRadius: 5
    };
  });

  chartInstances['linha'] = new Chart(ctx, {
    type: 'line',
    data: { labels: mesesLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 10, ticks: { color: corMuted }, grid: { color: corBorda } },
        x: { ticks: { color: corTexto }, grid: { display: false } }
      },
      plugins: {
        legend: { labels: { color: corTexto } },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw !== null ? ctx.raw.toFixed(2) : 'N/A'}` }
        }
      }
    }
  });
}

// 4. Histograma — distribuição de um critério
function renderHistograma(dados, colunas, criterio) {
  destroyChart('histograma');
  const ctx = document.getElementById('chart-histograma').getContext('2d');
  const idx = colunas.indexOf(criterio);
  const contagem = Array(10).fill(0);
  dados.forEach(row => {
    const v = row[idx];
    if (typeof v === 'number' && v >= 1 && v <= 10) contagem[Math.round(v)-1]++;
  });
  const corMuted = getCSSVar('--cor-texto-muted');
  const corTexto = getCSSVar('--cor-texto');
  const corBorda = getCSSVar('--cor-borda');

  chartInstances['histograma'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['1','2','3','4','5','6','7','8','9','10'],
      datasets: [{
        label: 'Respostas',
        data: contagem,
        backgroundColor: contagem.map((_,i) => getScoreColor(i+1)),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { color: corMuted, stepSize: 1 }, grid: { color: corBorda } },
        x: { ticks: { color: corTexto }, grid: { display: false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} resposta(s)` } }
      }
    }
  });
}

// 5. Barras agrupadas — comparativo entre semestres
function renderComparativo(semestresInfo, criterios) {
  destroyChart('comparativo');
  const ctx = document.getElementById('chart-comparativo').getContext('2d');
  const corTexto = getCSSVar('--cor-texto');
  const corMuted = getCSSVar('--cor-texto-muted');
  const corBorda = getCSSVar('--cor-borda');

  const datasets = semestresInfo.map((sem, i) => {
    const medias = calcMediaPorCriterio(sem.dados, sem.colunas, criterios);
    return {
      label: sem.nome,
      data: medias,
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
      borderRadius: 4
    };
  });

  chartInstances['comparativo'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: criterios, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 10, ticks: { color: corMuted }, grid: { color: corBorda } },
        x: { ticks: { color: corTexto, font: { size: 10 } }, grid: { display: false } }
      },
      plugins: {
        legend: { labels: { color: corTexto } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)}` } }
      }
    }
  });
}
