const SESSION_KEY = "auri-questionario-session";

const state = {
  currentUser: null,
  questions: { preQuestions: [], postQuestions: [] },
  dataError: "",
  data: {
    postUnlocked: false,
    submissions: [],
  },
};

const fallbackQuestions = {
  preQuestions: [
    {
      question: "O pH está relacionado a qual característica de uma substância?",
      options: ["Cor", "Acidez ou basicidade", "Temperatura"],
      answer: 1,
    },
    {
      question: "Qual das substâncias abaixo é considerada básica?",
      options: ["Limão", "Vinagre", "Sabão"],
      answer: 2,
    },
    {
      question: "O que significa dizer que uma substância possui pH 7?",
      options: ["É ácida", "É neutra", "É básica"],
      answer: 1,
    },
  ],
  postQuestions: [
    {
      question: "Qual é a principal função do pH na área farmacêutica?",
      options: [
        "Alterar a cor dos medicamentos",
        "Controlar a estabilidade e a eficácia dos medicamentos",
        "Aumentar o tamanho dos comprimidos",
      ],
      answer: 1,
    },
    {
      question: "Um produto com pH menor que 7 é classificado como:",
      options: ["Ácido", "Básico", "Neutro"],
      answer: 0,
    },
    {
      question: "Por que o equilíbrio ácido-base é importante para o corpo humano?",
      options: [
        "Porque ajuda no funcionamento adequado das células e órgãos",
        "Porque muda a cor do sangue",
        "Porque aumenta a temperatura corporal",
      ],
      answer: 0,
    },
  ],
};

const app = document.querySelector("#app");

init();

async function init() {
  state.questions = await loadQuestions();
  state.data = await loadData();
  restoreSession();
}

async function loadQuestions() {
  try {
    const response = await fetch("questions.txt", { cache: "no-store" });
    if (!response.ok) throw new Error("questions.txt indisponível");
    const source = await response.text();
    const parsed = Function(`${source}; return { preQuestions, postQuestions };`)();
    if (!Array.isArray(parsed.preQuestions) || !Array.isArray(parsed.postQuestions)) {
      throw new Error("Formato de perguntas inválido");
    }
    return parsed;
  } catch (error) {
    console.warn("Usando perguntas internas:", error);
    return fallbackQuestions;
  }
}

async function loadData() {
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Erro ao carregar dados.");
    state.dataError = "";
    return normalizeData(payload);
  } catch (error) {
    state.dataError = error.message || "Erro ao conectar com o Supabase.";
    return { postUnlocked: false, submissions: [] };
  }
}

async function persistData(action) {
  const response = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Erro ao salvar dados.");
  }

  state.data = normalizeData(payload);
  state.dataError = "";
  return state.data;
}

function normalizeData(data) {
  return {
    postUnlocked: Boolean(data?.postUnlocked),
    submissions: Array.isArray(data?.submissions) ? data.submissions : [],
  };
}

function renderLogin() {
  state.currentUser = null;
  clearSession();
  app.innerHTML = `
    <section class="login-layout">
      <div class="brand-panel">
        <span class="pill">Questionário acadêmico</span>
        <h1>Sistema de questionário</h1>
        <p>Informe seu nome para iniciar a primeira etapa.</p>
      </div>

      <form class="card login-card" id="loginForm">
        <h2>Entrar</h2>
        <p class="muted">Informe apenas o nome para iniciar.</p>
        ${state.dataError ? `<div class="notice">${escapeHtml(state.dataError)}</div>` : ""}
        <div class="field">
          <label for="name">Nome do participante</label>
          <input id="name" name="name" autocomplete="name" required minlength="2" placeholder="Ex.: Maria Silva" />
        </div>
        <button class="btn full" type="submit">Entrar</button>
      </form>
    </section>
  `;

  document.querySelector("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name").trim();
    if (!name) return;
    state.currentUser = name;
    if (isAdmin()) {
      saveSession("admin");
      renderAdmin();
    } else {
      saveSession("pre");
      renderParticipant();
    }
  });
}

function isAdmin() {
  return state.currentUser?.trim().toLowerCase() === "auri";
}

function renderParticipant(message = "") {
  saveSession("pre");
  const userSubmission = getUserSubmission(state.currentUser);
  const hasPre = Boolean(userSubmission?.pre);

  app.innerHTML = `
    ${renderTopbar(`Olá, ${escapeHtml(state.currentUser)}`, false)}
    ${state.dataError ? `<div class="notice">${escapeHtml(state.dataError)}</div>` : ""}
    ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ""}

    <div class="section-title">
      <div>
        <h2>Primeira parte</h2>
        <p class="muted">Responda todas as questões do pré-questionário.</p>
      </div>
      ${hasPre ? `<span class="pill">Enviado</span>` : `<span class="pill">Disponível</span>`}
    </div>
    ${hasPre ? renderPreCompleted(userSubmission.pre, true) : renderQuiz("pre")}
  `;

  bindTopbar();
  bindQuizForms();
  document.querySelector("#goPostBtn")?.addEventListener("click", () => {
    saveSession("post");
    renderPostScreen();
  });
}

function renderPostScreen(message = "") {
  saveSession("post");
  const userSubmission = getUserSubmission(state.currentUser);
  const hasPre = Boolean(userSubmission?.pre);
  const hasPost = Boolean(userSubmission?.post);
  const canAnswerPost = state.data.postUnlocked && hasPre;

  app.innerHTML = `
    ${renderTopbar(`Olá, ${escapeHtml(state.currentUser)}`, false)}
    ${state.dataError ? `<div class="notice">${escapeHtml(state.dataError)}</div>` : ""}
    ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ""}

    <div class="section-title">
      <div>
        <h2>Segunda parte</h2>
        <p class="muted">Essa etapa fica disponível após a explicação.</p>
      </div>
      ${hasPost ? `<span class="pill">Enviado</span>` : `<span class="pill">${state.data.postUnlocked ? "Disponível" : "Bloqueado"}</span>`}
    </div>
    ${
      hasPost
        ? renderSubmissionSummary(userSubmission.post, "postQuestions", true)
        : canAnswerPost
          ? renderQuiz("post")
          : renderLockedPost(hasPre)
    }

    <div class="topbar-actions post-nav">
      <button class="btn secondary" id="backPreBtn" type="button">Voltar para primeira parte</button>
    </div>
  `;

  bindTopbar();
  bindQuizForms();
  document.querySelector("#backPreBtn").addEventListener("click", () => {
    saveSession("pre");
    renderParticipant();
  });
}

function renderThanksScreen() {
  saveSession("thanks");
  app.innerHTML = `
    <section class="thanks-screen">
      <div class="thanks-card">
        <img
          class="thanks-gif"
          src="https://media.giphy.com/media/3oz8xIsloV7zOmt81G/giphy.gif"
          alt="Animação de agradecimento"
        />
        <h1>Obrigado por participar!</h1>
        <p>Sua contribuição foi registrada com sucesso.</p>
        <button class="btn secondary" id="finishBtn" type="button">Finalizar</button>
      </div>
    </section>
  `;

  document.querySelector("#finishBtn").addEventListener("click", () => {
    clearSession();
    renderLogin();
  });
}

function renderTopbar(title, admin) {
  return `
    <header class="topbar">
      <div>
        <span class="pill">${admin ? "Administração" : "Participante"}</span>
        <h1>${title}</h1>
      </div>
      <div class="topbar-actions">
        ${admin ? `<button class="btn secondary" id="refreshBtn" type="button">Atualizar</button>` : ""}
        <button class="btn secondary" id="logoutBtn" type="button">Sair</button>
      </div>
    </header>
  `;
}

function renderQuiz(type) {
  const key = type === "pre" ? "preQuestions" : "postQuestions";
  const title = type === "pre" ? "pre" : "post";
  const questions = state.questions[key];

  return `
    <form class="grid" data-quiz="${title}">
      ${questions
        .map(
          (question, index) => `
            <article class="quiz-card">
              <h3>${index + 1}. ${escapeHtml(question.question)}</h3>
              <div class="options">
                ${question.options
                  .map(
                    (option, optionIndex) => `
                      <label class="option">
                        <input type="radio" name="q${index}" value="${optionIndex}" required />
                        <span>${escapeHtml(option)}</span>
                      </label>
                    `,
                  )
                  .join("")}
              </div>
            </article>
          `,
        )
        .join("")}
      <button class="btn" type="submit">Enviar respostas</button>
    </form>
  `;
}

function renderLockedPost(hasPre) {
  return `
    <section class="panel locked">
      <div>
        <strong>Segunda parte bloqueada</strong>
        <span class="muted">
          ${hasPre ? "Aguarde a liberação." : "Envie a primeira parte antes de avançar."}
        </span>
      </div>
    </section>
  `;
}

function renderPreCompleted(submissionPart, hideScore = false) {
  return `
    ${renderSubmissionSummary(submissionPart, "preQuestions", hideScore)}
    <div class="topbar-actions post-nav">
      <button class="btn" id="goPostBtn" type="button">Acessar segunda parte</button>
    </div>
  `;
}

function renderSubmissionSummary(submissionPart, questionKey, hideScore = false) {
  const total = state.questions[questionKey].length;
  return `
    <section class="panel">
      <h2>Respostas registradas</h2>
      <p class="muted">
        ${
          hideScore
            ? `Enviado em ${formatDate(submissionPart.createdAt)}.`
            : `Pontuação: <strong>${submissionPart.score}/${total}</strong>. Enviado em ${formatDate(submissionPart.createdAt)}.`
        }
      </p>
    </section>
  `;
}

function bindQuizForms() {
  document.querySelectorAll("[data-quiz]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const type = event.currentTarget.dataset.quiz;
      const questionKey = type === "pre" ? "preQuestions" : "postQuestions";
      const questions = state.questions[questionKey];
      const formData = new FormData(event.currentTarget);
      const answers = questions.map((_, index) => {
        const value = formData.get(`q${index}`);
        return value === null ? null : Number(value);
      });

      if (answers.some((answer) => answer === null || Number.isNaN(answer))) {
        showQuizValidation(event.currentTarget, "Selecione uma alternativa em todas as 3 questões antes de enviar.");
        return;
      }

      const score = answers.reduce(
        (total, answer, index) => total + (answer === questions[index].answer ? 1 : 0),
        0,
      );
      try {
        await upsertSubmissionPart(state.currentUser, type, {
          answers,
          score,
          createdAt: new Date().toISOString(),
        });
        if (type === "pre") {
          renderPostScreen("Primeira parte salva com sucesso.");
        } else {
          renderThanksScreen();
        }
      } catch (error) {
        state.dataError = error.message;
        if (type === "pre") renderParticipant();
        else renderPostScreen();
      }
    });
  });
}

function showQuizValidation(form, message) {
  form.querySelector(".notice")?.remove();
  form.insertAdjacentHTML("afterbegin", `<div class="notice">${escapeHtml(message)}</div>`);
  form.querySelector(".notice").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function upsertSubmissionPart(user, type, payload) {
  await persistData({
    action: "upsertPart",
    user,
    type,
    payload,
  });
}

function getUserSubmission(user) {
  return state.data.submissions.find((item) => item.normalizedUser === normalizeUser(user));
}

function renderAdmin(message = "") {
  saveSession("admin");
  const stats = getStats();
  app.innerHTML = `
    ${renderTopbar("Painel Auri", true)}
    ${state.dataError ? `<div class="notice">${escapeHtml(state.dataError)}</div>` : ""}
    ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ""}

    <section class="grid dashboard-grid">
      <article class="panel stat">
        <span class="muted">Participantes</span>
        <strong>${stats.totalUsers}</strong>
      </article>
      <article class="panel stat">
        <span class="muted">Pré-questionários</span>
        <strong>${stats.preCount}</strong>
      </article>
      <article class="panel stat">
        <span class="muted">Pós-questionários</span>
        <strong>${stats.postCount}</strong>
      </article>
    </section>

    <section class="section-title">
      <div>
        <h2>Controle da segunda parte</h2>
        <p class="muted">Libere ou bloqueie o pós-questionário para todos os participantes.</p>
      </div>
      <button class="btn" id="togglePostBtn" type="button">
        ${state.data.postUnlocked ? "Bloquear segunda parte" : "Desbloquear segunda parte"}
      </button>
    </section>

    <section class="panel admin-shortcut">
      <div>
        <h2>Estatísticas anônimas</h2>
        <p class="muted">Veja médias, acertos e distribuição de alternativas sem identificar participantes.</p>
      </div>
      <button class="btn" id="statsBtn" type="button">Ver estatísticas</button>
    </section>

    <section class="split">
      <article class="panel">
        <h2>Desempenho geral</h2>
        ${renderGeneralStats(stats)}
      </article>
      <article class="panel">
        <h2>Dados</h2>
        <p class="muted">Exporte os registros em JSON ou importe um arquivo salvo anteriormente.</p>
        <div class="topbar-actions">
          <button class="btn secondary" id="newSubmissionBtn" type="button">Nova resposta</button>
          <button class="btn secondary" id="exportBtn" type="button">Exportar JSON</button>
          <button class="btn secondary" id="importBtn" type="button">Importar JSON</button>
          <input class="hidden-input" id="importInput" type="file" accept="application/json" />
        </div>
      </article>
    </section>

    <section class="section-title">
      <div>
        <h2>Respostas recebidas</h2>
        <p class="muted">Edite o nome, remova etapas ou exclua registros completos.</p>
      </div>
    </section>
    ${renderResponsesTable()}
  `;

  bindTopbar();
  bindAdminActions();
}

function renderStatsScreen() {
  saveSession("admin");
  const preStats = buildPhaseStats("pre", "preQuestions");
  const postStats = buildPhaseStats("post", "postQuestions");

  app.innerHTML = `
    ${renderTopbar("Estatísticas", true)}
    <div class="topbar-actions post-nav">
      <button class="btn secondary" id="backAdminBtn" type="button">Voltar ao painel</button>
    </div>

    <section class="grid dashboard-grid stats-overview">
      ${renderMetricCard("Participantes", state.data.submissions.length)}
      ${renderMetricCard("Média pré", `${preStats.averageScore.toFixed(1)} / ${preStats.totalQuestions}`)}
      ${renderMetricCard("Média pós", `${postStats.averageScore.toFixed(1)} / ${postStats.totalQuestions}`)}
    </section>

    <section class="split">
      ${renderPhaseStats("Primeira etapa", preStats, "pre")}
      ${renderPhaseStats("Segunda etapa", postStats, "post")}
    </section>
  `;

  bindTopbar();
  document.querySelector("#backAdminBtn").addEventListener("click", () => renderAdmin());
  drawStatsCharts(preStats, "pre");
  drawStatsCharts(postStats, "post");
}

function renderMetricCard(label, value) {
  return `
    <article class="panel stat">
      <span class="muted">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderPhaseStats(title, phaseStats, prefix) {
  return `
    <article class="panel stats-panel">
      <div class="stats-heading">
        <div>
          <h2>${title}</h2>
          <p class="muted">${phaseStats.count} resposta(s) registradas.</p>
        </div>
      </div>

      <div class="stats-metrics">
        <span><strong>${phaseStats.averageScore.toFixed(1)}</strong> média de acertos</span>
        <span><strong>${phaseStats.averagePercent}%</strong> aproveitamento médio</span>
        <span><strong>${phaseStats.totalCorrect}</strong> acertos totais</span>
      </div>

      <div class="chart-box">
        <h3>Acertos por questão</h3>
        <canvas id="${prefix}BarChart" width="520" height="300"></canvas>
      </div>

      <div class="chart-box">
        <h3>Distribuição geral das alternativas</h3>
        <canvas id="${prefix}PieChart" width="420" height="300"></canvas>
      </div>

      <div class="question-stats">
        ${phaseStats.questions
          .map(
            (question, index) => `
              <div class="question-stat">
                <strong>${index + 1}. ${escapeHtml(question.question)}</strong>
                <span>${question.correctCount}/${phaseStats.count || 0} acertos (${question.correctPercent}%)</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

function buildPhaseStats(partKey, questionKey) {
  const questions = state.questions[questionKey];
  const submissions = state.data.submissions.filter((item) => item[partKey]);
  const optionTotals = [0, 0, 0];
  const questionStats = questions.map((question, questionIndex) => {
    const optionCounts = question.options.map(() => 0);
    let correctCount = 0;

    submissions.forEach((submission) => {
      const answer = submission[partKey].answers?.[questionIndex];
      if (typeof answer !== "number") return;
      optionCounts[answer] += 1;
      optionTotals[answer] = (optionTotals[answer] || 0) + 1;
      if (answer === question.answer) correctCount += 1;
    });

    return {
      question: question.question,
      optionCounts,
      correctCount,
      correctPercent: percent(correctCount, submissions.length),
    };
  });

  const scores = submissions.map((item) => item[partKey].score || 0);
  const totalCorrect = scores.reduce((total, score) => total + score, 0);
  const averageScore = average(scores);

  return {
    count: submissions.length,
    totalQuestions: questions.length,
    totalCorrect,
    averageScore,
    averagePercent: percent(averageScore, questions.length),
    optionTotals,
    questions: questionStats,
  };
}

function drawStatsCharts(phaseStats, prefix) {
  drawBarChart(document.querySelector(`#${prefix}BarChart`), phaseStats);
  drawPieChart(document.querySelector(`#${prefix}PieChart`), phaseStats.optionTotals);
}

function drawBarChart(canvas, phaseStats) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 44;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const max = Math.max(phaseStats.count, 1);
  const colors = ["#7c3aed", "#14b8a6", "#f59e0b"];

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#ded4ef";
  context.beginPath();
  context.moveTo(padding, padding);
  context.lineTo(padding, height - padding);
  context.lineTo(width - padding, height - padding);
  context.stroke();

  phaseStats.questions.forEach((question, index) => {
    const barWidth = chartWidth / phaseStats.questions.length - 24;
    const x = padding + index * (chartWidth / phaseStats.questions.length) + 12;
    const barHeight = (question.correctCount / max) * chartHeight;
    const y = height - padding - barHeight;

    context.fillStyle = colors[index % colors.length];
    context.fillRect(x, y, barWidth, barHeight);
    context.fillStyle = "#20172f";
    context.font = "700 14px sans-serif";
    context.textAlign = "center";
    context.fillText(`Q${index + 1}`, x + barWidth / 2, height - 18);
    context.fillText(`${question.correctCount}`, x + barWidth / 2, y - 8);
  });
}

function drawPieChart(canvas, totals) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerX = 145;
  const centerY = height / 2;
  const radius = 90;
  const colors = ["#7c3aed", "#14b8a6", "#f59e0b"];
  const labels = ["Alternativa A", "Alternativa B", "Alternativa C"];
  const total = totals.reduce((sum, value) => sum + value, 0);
  let start = -Math.PI / 2;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  if (!total) {
    context.fillStyle = "#746985";
    context.font = "700 16px sans-serif";
    context.textAlign = "center";
    context.fillText("Sem dados", centerX, centerY);
    return;
  }

  totals.forEach((value, index) => {
    const slice = (value / total) * Math.PI * 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, start, start + slice);
    context.closePath();
    context.fillStyle = colors[index];
    context.fill();
    start += slice;
  });

  labels.forEach((label, index) => {
    const y = 92 + index * 34;
    context.fillStyle = colors[index];
    context.fillRect(270, y - 13, 16, 16);
    context.fillStyle = "#20172f";
    context.font = "700 14px sans-serif";
    context.textAlign = "left";
    context.fillText(`${label}: ${totals[index] || 0}`, 296, y);
  });
}

function getStats() {
  const submissions = state.data.submissions;
  const preScores = submissions.filter((item) => item.pre).map((item) => item.pre.score);
  const postScores = submissions.filter((item) => item.post).map((item) => item.post.score);

  return {
    totalUsers: submissions.length,
    preCount: preScores.length,
    postCount: postScores.length,
    preAverage: average(preScores),
    postAverage: average(postScores),
  };
}

function renderGeneralStats(stats) {
  const preTotal = state.questions.preQuestions.length || 1;
  const postTotal = state.questions.postQuestions.length || 1;
  return `
    <div class="bars">
      ${renderBar("Média do pré-questionário", stats.preAverage, preTotal)}
      ${renderBar("Média do pós-questionário", stats.postAverage, postTotal)}
    </div>
  `;
}

function renderBar(label, value, total) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return `
    <div class="bar-row">
      <div class="bar-meta">
        <strong>${label}</strong>
        <span>${value.toFixed(1)} / ${total}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width: ${percent}%"></div></div>
    </div>
  `;
}

function renderResponsesTable() {
  if (!state.data.submissions.length) {
    return `<div class="empty">Nenhuma resposta registrada ainda.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Participante</th>
            <th>Pré</th>
            <th>Pós</th>
            <th>Atualizado</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${state.data.submissions
            .map(
              (item) => `
                <tr>
                  <td>${escapeHtml(item.user)}</td>
                  <td>${renderPartCell(item.pre, "preQuestions")}</td>
                  <td>${renderPartCell(item.post, "postQuestions")}</td>
                  <td>${formatDate(item.updatedAt || item.createdAt)}</td>
                  <td>
                    <div class="row-actions">
                      <button class="mini-btn" data-action="edit" data-id="${item.id}" type="button">Editar</button>
                      <button class="mini-btn" data-action="clear-pre" data-id="${item.id}" type="button">Limpar pré</button>
                      <button class="mini-btn" data-action="clear-post" data-id="${item.id}" type="button">Limpar pós</button>
                      <button class="mini-btn delete" data-action="delete" data-id="${item.id}" type="button">Excluir</button>
                    </div>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPartCell(part, questionKey) {
  if (!part) return `<span class="muted">Sem resposta</span>`;
  return `${part.score}/${state.questions[questionKey].length} em ${formatDate(part.createdAt)}`;
}

function bindAdminActions() {
  document.querySelector("#togglePostBtn").addEventListener("click", async () => {
    const nextValue = !state.data.postUnlocked;
    try {
      await persistData({ action: "setPostUnlocked", value: nextValue });
      renderAdmin(
        state.data.postUnlocked
          ? "Segunda parte desbloqueada para os participantes."
          : "Segunda parte bloqueada.",
      );
    } catch (error) {
      state.dataError = error.message;
      renderAdmin();
    }
  });

  document.querySelector("#newSubmissionBtn").addEventListener("click", () => {
    renderResponseEditor();
  });
  document.querySelector("#statsBtn").addEventListener("click", () => {
    renderStatsScreen();
  });
  document.querySelector("#exportBtn").addEventListener("click", exportJson);
  document.querySelector("#importBtn").addEventListener("click", () => {
    document.querySelector("#importInput").click();
  });
  document.querySelector("#importInput").addEventListener("change", importJson);

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleCrud(button.dataset.action, button.dataset.id));
  });
}

async function handleCrud(action, id) {
  const submission = state.data.submissions.find((item) => item.id === id);
  if (!submission) return;

  if (action === "edit") {
    renderResponseEditor(id);
    return;
  }

  try {
    if (action === "clear-pre") {
      await persistData({ action: "clearPart", id, type: "pre" });
    }

    if (action === "clear-post") {
      await persistData({ action: "clearPart", id, type: "post" });
    }

    if (action === "delete") {
      const confirmed = confirm(`Excluir todas as respostas de ${submission.user}?`);
      if (!confirmed) return;
      await persistData({ action: "deleteSubmission", id });
    }

    renderAdmin("Registro atualizado.");
  } catch (error) {
    state.dataError = error.message;
    renderAdmin();
  }
}

function renderResponseEditor(id = "") {
  saveSession("admin");
  const submission = state.data.submissions.find((item) => item.id === id);
  const isEditing = Boolean(submission);

  app.innerHTML = `
    ${renderTopbar(isEditing ? "Editar resposta" : "Nova resposta", true)}
    <form class="grid" id="responseEditor">
      <section class="panel">
        <h2>Participante</h2>
        <div class="field">
          <label for="participantName">Nome</label>
          <input id="participantName" name="participantName" required minlength="2" value="${escapeHtml(submission?.user || "")}" />
        </div>
      </section>

      <section class="split">
        <article class="panel">
          <h2>Pré-questionário</h2>
          ${renderEditorQuestions("pre", submission?.pre)}
        </article>
        <article class="panel">
          <h2>Pós-questionário</h2>
          ${renderEditorQuestions("post", submission?.post)}
        </article>
      </section>

      <div class="topbar-actions">
        <button class="btn" type="submit">Salvar</button>
        <button class="btn secondary" id="cancelEditorBtn" type="button">Cancelar</button>
      </div>
    </form>
  `;

  bindTopbar();
  document.querySelector("#cancelEditorBtn").addEventListener("click", () => renderAdmin());
  document.querySelector("#responseEditor").addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveEditorSubmission(id, event.currentTarget);
  });
}

function renderEditorQuestions(type, part) {
  const questionKey = type === "pre" ? "preQuestions" : "postQuestions";
  return state.questions[questionKey]
    .map((question, index) => {
      const selected = part?.answers?.[index];
      return `
        <div class="field">
          <label for="${type}-q${index}">${index + 1}. ${escapeHtml(question.question)}</label>
          <select id="${type}-q${index}" name="${type}-q${index}">
            <option value="">Sem resposta</option>
            ${question.options
              .map(
                (option, optionIndex) => `
                  <option value="${optionIndex}" ${selected === optionIndex ? "selected" : ""}>
                    ${escapeHtml(option)}
                  </option>
                `,
              )
              .join("")}
          </select>
        </div>
      `;
    })
    .join("");
}

async function saveEditorSubmission(id, form) {
  const formData = new FormData(form);
  const user = formData.get("participantName").trim();
  const now = new Date().toISOString();
  let submission = state.data.submissions.find((item) => item.id === id);

  if (!submission) {
    submission = {
      id: createId(),
      user,
      normalizedUser: normalizeUser(user),
      createdAt: now,
    };
  }

  const pre = collectEditorPart(formData, "pre");
  const post = collectEditorPart(formData, "post");
  if (pre === false || post === false) {
    renderResponseEditor(id);
    const formElement = document.querySelector("#responseEditor");
    formElement.insertAdjacentHTML(
      "afterbegin",
      `<div class="notice">Preencha todas as respostas de uma etapa ou deixe a etapa inteira sem resposta.</div>`,
    );
    return;
  }

  submission.user = user;
  submission.normalizedUser = normalizeUser(user);
  submission.updatedAt = now;

  if (pre) submission.pre = { ...pre, createdAt: submission.pre?.createdAt || now };
  else delete submission.pre;

  if (post) submission.post = { ...post, createdAt: submission.post?.createdAt || now };
  else delete submission.post;

  try {
    await persistData({ action: "saveSubmission", submission });
    renderAdmin("Resposta salva.");
  } catch (error) {
    state.dataError = error.message;
    renderResponseEditor(id);
  }
}

function collectEditorPart(formData, type) {
  const questionKey = type === "pre" ? "preQuestions" : "postQuestions";
  const questions = state.questions[questionKey];
  const rawAnswers = questions.map((_, index) => formData.get(`${type}-q${index}`));
  const answered = rawAnswers.filter((value) => value !== "");

  if (!answered.length) return null;
  if (answered.length !== questions.length) return false;

  const answers = rawAnswers.map(Number);
  const score = answers.reduce(
    (total, answer, index) => total + (answer === questions[index].answer ? 1 : 0),
    0,
  );
  return { answers, score };
}

function exportJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    questions: state.questions,
    data: state.data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `auri-respostas-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      const nextData = parsed.data || parsed;
      if (!Array.isArray(nextData.submissions)) throw new Error("JSON inválido");
      await persistData({
        action: "replaceData",
        data: {
          postUnlocked: Boolean(nextData.postUnlocked),
          submissions: nextData.submissions,
        },
      });
      renderAdmin("Dados importados com sucesso.");
    } catch (error) {
      state.dataError = error.message || "Não foi possível importar o arquivo selecionado.";
      renderAdmin();
    }
  };
  reader.readAsText(file);
}

function bindTopbar() {
  document.querySelector("#logoutBtn")?.addEventListener("click", () => {
    clearSession();
    renderLogin();
  });
  document.querySelector("#refreshBtn")?.addEventListener("click", async () => {
    state.data = await loadData();
    renderAdmin("Painel atualizado.");
  });
}

function restoreSession() {
  const session = readSession();

  if (!session?.user) {
    renderLogin();
    return;
  }

  state.currentUser = session.user;

  if (isAdmin()) {
    renderAdmin();
    return;
  }

  if (session.screen === "post") {
    renderPostScreen();
    return;
  }

  if (session.screen === "thanks") {
    renderThanksScreen();
    return;
  }

  renderParticipant();
}

function saveSession(screen) {
  if (!state.currentUser) return;
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      user: state.currentUser,
      screen,
    }),
  );
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function normalizeUser(user) {
  return user.trim().toLowerCase();
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
