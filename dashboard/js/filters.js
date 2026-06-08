// Popula sidebar com cursos, semestres, turmas, critérios, meses
function populateCursos(cursos) {
  const sel = document.getElementById('sel-curso');
  sel.innerHTML = '';
  cursos.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.nome;
    opt.textContent = c.nome;
    sel.appendChild(opt);
  });
  sel.dispatchEvent(new Event('change'));
}

function populateSemestres(curso) {
  const sel = document.getElementById('sel-semestre');
  sel.innerHTML = '<option value="todos">Todos</option>';
  if (!curso) return;
  curso.semestres.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.nome;
    opt.textContent = s.nome;
    sel.appendChild(opt);
  });
}

function populateTurmas(turmas) {
  const container = document.getElementById('turmas-container');

  // Preserve which turmas were checked before rebuilding
  const prevChecked = new Set(
    Array.from(document.querySelectorAll('.turma-cb:checked')).map(cb => cb.value)
  );
  const hadAny = document.querySelectorAll('.turma-cb').length > 0;

  container.innerHTML = '';

  // "Todas" toggle
  const allLabel = document.createElement('label');
  allLabel.className = 'checkbox-label checkbox-all';
  allLabel.innerHTML = `<input type="checkbox" id="turma-todas"> Todas as turmas`;
  container.appendChild(allLabel);

  turmas.forEach(t => {
    // First build: default all checked. Subsequent builds: restore previous state.
    const isChecked = !hadAny || prevChecked.has(t);
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    // Escape value for safe HTML attribute
    const safeVal = t.replace(/"/g, '&quot;');
    label.innerHTML = `<input type="checkbox" class="turma-cb" value="${safeVal}" ${isChecked ? 'checked' : ''}> ${t}`;
    container.appendChild(label);
  });

  // Sync "todas" indeterminate/checked state
  syncTodasCheckbox();

  document.getElementById('turma-todas').addEventListener('change', function() {
    document.querySelectorAll('.turma-cb').forEach(cb => cb.checked = this.checked);
    onFiltersChange();
  });

  document.querySelectorAll('.turma-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      syncTodasCheckbox();
      onFiltersChange();
    });
  });
}

function syncTodasCheckbox() {
  const all = document.querySelectorAll('.turma-cb');
  const checked = document.querySelectorAll('.turma-cb:checked');
  const todasCb = document.getElementById('turma-todas');
  if (!todasCb) return;
  todasCb.indeterminate = checked.length > 0 && checked.length < all.length;
  todasCb.checked = all.length > 0 && checked.length === all.length;
}

function populateCriterios(criterios) {
  const sel = document.getElementById('sel-criterio');
  sel.innerHTML = '<option value="todos">Todos os critérios</option>';
  criterios.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

function populateMeses(meses) {
  const sel = document.getElementById('sel-mes');
  sel.innerHTML = '<option value="todos">Todos os meses</option>';
  meses.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  });
}

function getSelectedTurmas() {
  const checked = document.querySelectorAll('.turma-cb:checked');
  return Array.from(checked).map(cb => cb.value);
}

function getFilters() {
  return {
    curso: document.getElementById('sel-curso').value,
    semestre: document.getElementById('sel-semestre').value,
    turmas: getSelectedTurmas(),
    criterio: document.getElementById('sel-criterio').value,
    mes: document.getElementById('sel-mes').value
  };
}

// Detecta colunas de nota: valores todos numéricos 1–10
function detectNoteColumns(colunas, dados) {
  const META = ['Carimbo de data/hora', 'Endereço de e-mail', 'Selecione sua turma', 'Nome completo'];
  return colunas.filter((col, idx) => {
    if (META.some(m => col.toLowerCase() === m.toLowerCase())) return false;
    if (dados.length === 0) return false;
    return dados.every(row => {
      const v = row[idx];
      return typeof v === 'number' && v >= 1 && v <= 10;
    });
  });
}

function getMesesFromDados(colunas, dados) {
  const idxData = colunas.findIndex(c => c.toLowerCase().includes('carimbo'));
  if (idxData === -1) return [];
  const meses = new Set();
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  dados.forEach(row => {
    const val = row[idxData];
    if (!val) return;
    const parts = String(val).split('/');
    if (parts.length >= 2) {
      const m = parseInt(parts[1]);
      const a = parts[2] ? parts[2].split(' ')[0] : '';
      if (m >= 1 && m <= 12) meses.add(`${nomes[m-1]}/${a}`);
    }
  });
  return Array.from(meses);
}

// Filtra dados conforme filtros ativos
function applyFilters(semestresData, filters, colunas) {
  let dados = [...semestresData];

  const idxTurma = colunas.findIndex(c => c.toLowerCase().includes('turma'));
  const idxData = colunas.findIndex(c => c.toLowerCase().includes('carimbo'));
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  if (filters.turmas.length > 0) {
    dados = dados.filter(row => {
      const t = idxTurma >= 0 ? String(row[idxTurma]).trim() : '';
      return filters.turmas.includes(t);
    });
  }

  if (filters.mes !== 'todos' && idxData >= 0) {
    dados = dados.filter(row => {
      const val = row[idxData];
      const parts = String(val).split('/');
      if (parts.length < 2) return false;
      const m = parseInt(parts[1]);
      const a = parts[2] ? parts[2].split(' ')[0] : '';
      const label = `${nomes[m-1]}/${a}`;
      return label === filters.mes;
    });
  }

  return dados;
}
