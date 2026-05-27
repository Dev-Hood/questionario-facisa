const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://gqwrmnvlsgeeevmiyyze.supabase.co";
const SUPABASE_API_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const { randomUUID } = require("crypto");

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

module.exports = async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_API_KEY) {
    response.status(500).json({
      error:
        "Configure SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente.",
    });
    return;
  }

  try {
    if (request.method === "GET") {
      response.status(200).json(await readData());
      return;
    }

    if (request.method !== "POST") {
      response.status(405).json({ error: "Método não permitido." });
      return;
    }

    const body = await readBody(request);
    const result = await handleAction(body || {});
    response.status(200).json(result);
  } catch (error) {
    response.status(500).json({ error: error.message || "Erro interno." });
  }
};

async function handleAction(body) {
  if (body.action === "setPostUnlocked") {
    await requestSupabase("/questionnaire_settings?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: [
        {
          id: "global",
          post_unlocked: Boolean(body.value),
          updated_at: new Date().toISOString(),
        },
      ],
    });
    return readData();
  }

  if (body.action === "setAccessLocked") {
    await requestSupabase("/questionnaire_settings?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: [
        {
          id: "access",
          post_unlocked: Boolean(body.value),
          updated_at: new Date().toISOString(),
        },
      ],
    });
    return readData();
  }

  if (body.action === "upsertPart") {
    await upsertPart(body.user, body.type, body.payload);
    return readData();
  }

  if (body.action === "saveSubmission") {
    await saveSubmission(body.submission);
    return readData();
  }

  if (body.action === "clearPart") {
    await clearPart(body.id, body.type);
    return readData();
  }

  if (body.action === "deleteSubmission") {
    await requestSupabase(`/questionnaire_submissions?id=eq.${encodeURIComponent(body.id)}`, {
      method: "DELETE",
    });
    return readData();
  }

  if (body.action === "replaceData") {
    await replaceData(body.data);
    return readData();
  }

  throw new Error("Ação inválida.");
}

async function readData() {
  const [settings, submissions] = await Promise.all([
    requestSupabase("/questionnaire_settings?id=in.(global,access)&select=id,post_unlocked"),
    requestSupabase("/questionnaire_submissions?select=*&order=created_at.asc"),
  ]);
  const globalSettings = settings.find((item) => item.id === "global");
  const accessSettings = settings.find((item) => item.id === "access");

  return {
    postUnlocked: Boolean(globalSettings?.post_unlocked),
    accessLocked: Boolean(accessSettings?.post_unlocked),
    submissions: submissions.map(fromDbSubmission),
  };
}

async function upsertPart(user, type, payload) {
  if (!["pre", "post"].includes(type)) throw new Error("Tipo de etapa inválido.");

  const normalizedUser = normalizeUser(user);
  const existing = await requestSupabase(
    `/questionnaire_submissions?normalized_user=eq.${encodeURIComponent(normalizedUser)}&select=*`,
  );
  const now = new Date().toISOString();
  const column = type === "pre" ? "pre" : "post";

  if (existing[0]) {
    await requestSupabase(
      `/questionnaire_submissions?id=eq.${encodeURIComponent(existing[0].id)}`,
      {
        method: "PATCH",
        body: {
          user_name: user,
          [column]: payload,
          updated_at: now,
        },
      },
    );
    return;
  }

  await requestSupabase("/questionnaire_submissions", {
    method: "POST",
    body: {
      id: createId(),
      user_name: user,
      normalized_user: normalizedUser,
      [column]: payload,
      created_at: now,
      updated_at: now,
    },
  });
}

async function saveSubmission(submission) {
  if (!submission?.user?.trim()) throw new Error("Participante inválido.");

  const now = new Date().toISOString();
  await requestSupabase("/questionnaire_submissions?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: [
      {
        id: submission.id || createId(),
        user_name: submission.user.trim(),
        normalized_user: normalizeUser(submission.user),
        pre: submission.pre || null,
        post: submission.post || null,
        created_at: submission.createdAt || now,
        updated_at: now,
      },
    ],
  });
}

async function clearPart(id, type) {
  if (!["pre", "post"].includes(type)) throw new Error("Tipo de etapa inválido.");
  await requestSupabase(`/questionnaire_submissions?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: {
      [type]: null,
      updated_at: new Date().toISOString(),
    },
  });
}

async function replaceData(data) {
  const nextData = {
    postUnlocked: Boolean(data?.postUnlocked),
    accessLocked: Boolean(data?.accessLocked),
    submissions: Array.isArray(data?.submissions) ? data.submissions : [],
  };
  const current = await requestSupabase("/questionnaire_submissions?select=id");

  await Promise.all(
    current.map((item) =>
      requestSupabase(`/questionnaire_submissions?id=eq.${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      }),
    ),
  );

  await requestSupabase("/questionnaire_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: [
      {
        id: "global",
        post_unlocked: nextData.postUnlocked,
        updated_at: new Date().toISOString(),
      },
      {
        id: "access",
        post_unlocked: nextData.accessLocked,
        updated_at: new Date().toISOString(),
      },
    ],
  });

  if (nextData.submissions.length) {
    await requestSupabase("/questionnaire_submissions", {
      method: "POST",
      body: nextData.submissions.map(toDbSubmission),
    });
  }
}

async function requestSupabase(path, options = {}) {
  const headers = {
    apikey: SUPABASE_API_KEY,
    Authorization: `Bearer ${SUPABASE_API_KEY}`,
    ...jsonHeaders,
    ...(options.headers || {}),
  };

  const result = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!result.ok) {
    const detail = await result.text();
    throw new Error(formatSupabaseError(detail, result.status));
  }

  if (result.status === 204) return null;
  const text = await result.text();
  return text ? JSON.parse(text) : null;
}

function fromDbSubmission(item) {
  return {
    id: item.id,
    user: item.user_name,
    normalizedUser: item.normalized_user,
    pre: item.pre || undefined,
    post: item.post || undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function toDbSubmission(item) {
  const now = new Date().toISOString();
  return {
    id: item.id || createId(),
    user_name: item.user,
    normalized_user: item.normalizedUser || normalizeUser(item.user),
    pre: item.pre || null,
    post: item.post || null,
    created_at: item.createdAt || now,
    updated_at: item.updatedAt || now,
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function normalizeUser(user) {
  return String(user || "").trim().toLowerCase();
}

function createId() {
  return randomUUID();
}

function formatSupabaseError(detail, status) {
  try {
    const parsed = JSON.parse(detail);
    if (parsed.code === "PGRST205") {
      return "Banco conectado, mas as tabelas ainda não foram criadas. Execute o arquivo supabase-schema.sql no Supabase.";
    }
    return parsed.message || detail || `Erro Supabase ${status}`;
  } catch {
    return detail || `Erro Supabase ${status}`;
  }
}
