# Dashboard de Avaliação Discente — Mackenzie

## Contexto do Projeto

Sistema de visualização de dados provenientes de formulários Google de avaliação discente por curso e semestre. O backend é um **Google Apps Script** que acessa o Google Drive e expõe os dados via Web App (API REST simples). O frontend é um **dashboard HTML/CSS/JS puro** (sem frameworks) que consome essa API.

---

## Estrutura de Pastas no Google Drive

```
Drive (conta pessoal @gmail)
└── mackenzie/
    └── [Nome do Curso]/          ← ex: "Ciência de dados"
        └── [Semestre]/           ← ex: "2026.1", "2026.2", "2027.1"
            └── AVALIAÇÃO DISCENTE - [Curso] - [Semestre].xlsx
                ← nome sempre começa com "AVALIAÇÃO DISCENTE"
```

**Regra de busca da planilha:** dentro de cada pasta de semestre, pegar o primeiro arquivo cujo nome começa com `"AVALIAÇÃO DISCENTE"` (case-insensitive).

---

## Estrutura do Projeto (repositório)

```
project/
├── CLAUDE.md
├── apps-script/
│   └── Code.gs              # Google Apps Script — deploy como Web App
├── dashboard/
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── main.js          # bootstrap, fetch API, estado global
│       ├── charts.js        # toda lógica de Chart.js
│       ├── filters.js       # lógica de filtros e seletores
│       └── themes.js        # troca de temas (claro/escuro/alto contraste)
└── README.md                # instruções de deploy do Apps Script + uso
```

---

## Colunas da Planilha

### Metadados (não são notas)
| Coluna original | Uso no dashboard |
|---|---|
| `Carimbo de data/hora` | Filtro por mês (dentro do semestre) |
| `Endereço de e-mail` | Identificação (não exibir publicamente) |
| `Selecione sua turma` | Filtro de turma |
| `Nome completo` | Identificação (não exibir publicamente) |

### Critérios Avaliados (notas de 1 a 10)
1. Conteúdo e Organização
2. Carga horária
3. Adequação do conteúdo e objetivo
4. Didática
5. Conhecimento
6. Respostas a questionamentos
7. Motivação e relacionamento interpessoal
8. Material didático utilizado
9. Pontualidade e administração do tempo de aula
10. Bibliografia referencial
11. Atividade extraclasse (apoio e incentivo)

> **Detecção automática:** o dashboard deve identificar colunas de nota dinamicamente — qualquer coluna cujos valores sejam todos numéricos no intervalo 1–10 é tratada como critério avaliado. Isso garante que novas perguntas futuras apareçam automaticamente sem alterar o código.

---

## Especificação do Apps Script (`Code.gs`)

### Função principal: `doGet(e)`

Retorna um JSON com a estrutura abaixo e headers CORS habilitados:

```json
{
  "cursos": [
    {
      "nome": "Ciência de dados",
      "semestres": [
        {
          "nome": "2026.1",
          "planilha": "AVALIAÇÃO DISCENTE - Ciência de dados - 1º semestre de 2026",
          "colunas": ["Carimbo de data/hora", "Endereço de e-mail", "Selecione sua turma", "Nome completo", "Conteúdo e Organização", "..."],
          "dados": [
            ["01/03/2026 10:00:00", "aluno@email.com", "Turma A", "João Silva", 8, 7, 9, ...],
            ...
          ]
        }
      ]
    }
  ],
  "ultima_atualizacao": "2026-05-28T10:00:00Z"
}
```

### Lógica de traversal

```
1. Buscar pasta "mackenzie" na raiz do Drive
2. Para cada subpasta (= curso): registrar nome do curso
3. Para cada subpasta do curso (= semestre): registrar nome do semestre
4. Dentro do semestre: buscar arquivo cujo nome começa com "AVALIAÇÃO DISCENTE" (DriveApp.getFolderById + getFilesByName / iteração)
5. Abrir como SpreadsheetApp, ler aba ativa, retornar headers + todas as linhas com dados
6. Ordenar semestres por nome (2026.1 < 2026.2 < 2027.1 etc.)
```

### Headers CORS obrigatórios

```javascript
return ContentService
  .createTextOutput(JSON.stringify(result))
  .setMimeType(ContentService.MimeType.JSON)
  // CORS é gerenciado pelo próprio Apps Script ao deployar como Web App com acesso "Qualquer pessoa"
```

### Tratamento de erros

- Pasta "mackenzie" não encontrada → retornar `{ "erro": "Pasta mackenzie não encontrada no Drive" }`
- Planilha não encontrada no semestre → semestre incluído com `"dados": []` e campo `"aviso": "planilha não encontrada"`
- Qualquer exceção → retornar `{ "erro": "[mensagem]" }`

---

## Especificação do Dashboard

### Configuração inicial (`dashboard/js/main.js`)

No topo do arquivo, um objeto de configuração que o usuário preenche uma vez:

```javascript
const CONFIG = {
  APPS_SCRIPT_URL: "COLE_AQUI_A_URL_DO_WEB_APP",  // URL do deploy do Apps Script
  SCHEDULED_PULL: {
    enabled: false,       // habilitar atualização automática
    intervalHours: 24,    // intervalo em horas
    lastPull: null        // preenchido automaticamente via localStorage
  }
};
```

---

### Temas (3 obrigatórios)

Implementados via classes CSS no `<html>` + variáveis CSS (`--cor-fundo`, `--cor-texto`, etc.)

| Tema | Classe no `<html>` | Característica |
|---|---|---|
| Claro | `theme-light` | Fundo branco/cinza claro, texto escuro |
| Escuro | `theme-dark` | Fundo #0f172a, texto claro, cards em #1e293b |
| Alto Contraste | `theme-contrast` | Fundo preto puro, texto branco puro, bordas amarelas, sem gradientes — WCAG AAA |

Botão de troca de tema persistido em `localStorage`.

---

### Layout Geral

```
┌─────────────────────────────────────────────────────────┐
│  HEADER: Logo Mackenzie + Nome do sistema + Botões tema  │
├──────────────────┬──────────────────────────────────────┤
│  SIDEBAR         │  ÁREA PRINCIPAL                      │
│  - Curso         │  - KPI Cards (topo)                  │
│  - Semestre      │  - Gráficos                          │
│  - Turma(s)      │  - Tabela detalhada (bottom)         │
│  - Critério      │                                      │
│  - Mês           │                                      │
│  - Btn Atualizar │                                      │
└──────────────────┴──────────────────────────────────────┘
```

---

### Painel de Filtros (Sidebar)

#### Seletor de Curso
- Dropdown populado dinamicamente a partir dos cursos retornados pela API
- Atualmente: apenas "Ciência de dados" — mas preparado para N cursos

#### Seletor de Semestre
- Dropdown com todos os semestres disponíveis do curso selecionado + opção "Todos"

#### Seletor de Turma (multi-seleção)
- Checkboxes para cada turma disponível nos dados filtrados
- Opção "Todas as turmas" (seleciona/deseleciona todas)
- Permite selecionar qualquer combinação

#### Seletor de Critério
- Dropdown: "Todos os critérios" ou um critério específico
- Quando um critério específico é selecionado, o foco muda para gráficos daquele critério

#### Filtro por Mês
- Dropdown com os meses presentes nos dados do semestre selecionado
- Opção "Todos os meses"

#### Botão "Atualizar dados"
- Dispara novo fetch na API do Apps Script
- Exibe spinner e timestamp da última atualização

#### Configuração de Agendamento
- Toggle on/off para atualização automática
- Campo numérico para intervalo em horas
- Exibe próxima atualização agendada

---

### KPI Cards (topo da área principal)

Exibidos como cards horizontais. Calculados sobre os dados filtrados:

| Card | Cálculo |
|---|---|
| **Total de respostas** | Número de linhas após filtros |
| **Média Geral** | Média de todas as notas de todos os critérios |
| **Melhor critério** | Critério com maior média + valor |
| **Critério mais baixo** | Critério com menor média + valor |
| **Turmas respondentes** | Quantas turmas distintas nos dados filtrados |

---

### Gráficos (Chart.js)

Usar **Chart.js** via CDN. Todos os gráficos respondem aos filtros aplicados.

#### 1. Gráfico de Radar — Visão Geral por Critério
- Eixos = 11 critérios
- Série por turma (quando múltiplas turmas selecionadas) ou única
- Escala 0–10

#### 2. Gráfico de Barras Horizontais — Ranking de Critérios
- Cada barra = média de um critério
- Ordenado do maior para o menor
- Cor da barra: verde (≥8), amarelo (6–7.9), vermelho (<6)

#### 3. Gráfico de Linha — Evolução Mensal
- Eixo X = meses do semestre
- Eixo Y = média geral (ou do critério selecionado)
- Uma linha por turma selecionada
- Visível apenas quando semestre específico selecionado

#### 4. Gráfico de Distribuição — Histograma por Critério
- Exibido quando um critério específico está selecionado no filtro
- Eixo X = notas 1 a 10
- Eixo Y = contagem de respostas

#### 5. Gráfico de Barras Agrupadas — Comparativo entre Semestres
- Visível quando "Todos os semestres" está selecionado
- Eixo X = critérios
- Grupos de barras = semestres

---

### Tabela Detalhada

- Exibida no rodapé da área principal, colapsável
- Colunas: Turma | Critério 1 | Critério 2 | ... | Média do aluno
- **Não exibir** nome do aluno nem e-mail na tabela
- Paginação: 20 linhas por página
- Exportar como CSV (botão)

---

### Atualização Automática Agendada

- Usar `setInterval` + `localStorage` para persistir entre sessões
- Ao abrir o dashboard, verificar se passou o intervalo configurado desde `lastPull`
- Se sim, disparar fetch automaticamente
- Exibir badge "Dados desatualizados — clique para atualizar" se ultrapassou o prazo

---

## README.md — Instruções de Deploy

O README deve conter:

1. **Como deployar o Apps Script:**
   - Acesse script.google.com → Novo projeto
   - Cole o conteúdo de `apps-script/Code.gs`
   - Deploy → Novo deploy → Tipo: Web App → Acesso: Qualquer pessoa
   - Copie a URL gerada

2. **Como configurar o dashboard:**
   - Abra `dashboard/js/main.js`
   - Cole a URL do Apps Script no campo `APPS_SCRIPT_URL`

3. **Como adicionar novo semestre:**
   - Crie pasta `[ANO].[N]` dentro da pasta do curso no Drive
   - Coloque a planilha nomeada como `"AVALIAÇÃO DISCENTE - ..."` na pasta
   - Clique em "Atualizar dados" no dashboard — o semestre aparecerá automaticamente

4. **Como adicionar novo curso:**
   - Crie subpasta dentro de `mackenzie/` com o nome do curso
   - Crie as subpastas de semestre dentro
   - O curso aparecerá automaticamente no seletor

---

## Restrições e Boas Práticas

- **Sem frameworks JS** — HTML/CSS/JS puro. Única dependência externa permitida: Chart.js via CDN
- **Sem build step** — o dashboard deve funcionar abrindo `index.html` diretamente no browser
- **Responsivo** — funcionar bem em telas de 1280px+. Mobile é secundário
- **Não expor dados pessoais** — nome e e-mail dos alunos nunca exibidos na UI
- **Tratar loading states** — spinner enquanto API carrega, mensagem de erro amigável se falhar
- **Sem dependência de backend próprio** — toda lógica de acesso ao Drive fica no Apps Script

---

## Estética e Design

- Tipografia: fonte display moderna (ex: `DM Sans`, `Plus Jakarta Sans`, ou similar via Google Fonts) para títulos; fonte mono para números/notas
- Paleta base (tema escuro): navy `#0f172a`, cards `#1e293b`, accent `#3b82f6`, success `#22c55e`, warning `#f59e0b`, danger `#ef4444`
- Cards com bordas suaves, sombras sutis, sem bordas grossas
- Gráficos com tooltips customizados mostrando valor + média geral como referência
- Transições suaves ao trocar filtros (0.2s ease)
- Badge colorido na nota média: verde/amarelo/vermelho conforme faixa
