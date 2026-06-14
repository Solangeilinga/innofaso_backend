const { normalizeSchema } = require('./formSchema.service');

function buildGroqMessages(currentSchema, userPrompt) {
  return [
    {
      role: 'system',
      content: [
        'Tu modifies un schema JSON pivot de formulaire ERP.',
        'Retourne uniquement un objet JSON pur.',
        'Ne retourne pas tout le schema. Retourne un delta.',
        'Format attendu: {"operations":[{"op":"add_field|update_field|remove_field","target":"field_name_or_id","field":{...},"after":"field_name_or_id","before":"field_name_or_id"}]}',
        'Types autorises: text, number, date, select, checkbox, textarea, currency, email, phone, file, time, signature.',
        `Schema actuel: ${JSON.stringify(currentSchema)}`,
      ].join('\n'),
    },
    { role: 'user', content: userPrompt },
  ];
}

function insertField(fields, field, delta) {
  const next = [...fields];
  if (delta.before) {
    const index = next.findIndex(item => item.id === delta.before || item.name === delta.before);
    if (index >= 0) {
      next.splice(index, 0, field);
      return next;
    }
  }
  if (delta.after) {
    const index = next.findIndex(item => item.id === delta.after || item.name === delta.after);
    if (index >= 0) {
      next.splice(index + 1, 0, field);
      return next;
    }
  }
  next.push(field);
  return next;
}

function applyDelta(schema, delta) {
  const normalized = normalizeSchema(schema);
  let fields = [...normalized.fields];

  for (const operation of delta.operations || []) {
    if (operation.op === 'add_field' && operation.field) {
      fields = insertField(fields, operation.field, operation);
    }
    if (operation.op === 'update_field') {
      fields = fields.map(field =>
        field.id === operation.target || field.name === operation.target
          ? { ...field, ...(operation.field || {}) }
          : field
      );
    }
    if (operation.op === 'remove_field') {
      fields = fields.filter(field => field.id !== operation.target && field.name !== operation.target);
    }
  }

  return normalizeSchema({ ...normalized, fields }, { title: normalized.title });
}

async function requestGroqDelta(currentSchema, userPrompt) {
  if (!process.env.GROQ_API_KEY) {
    const err = new Error('GROQ_API_KEY manquant dans backend/.env');
    err.status = 400;
    throw err;
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: buildGroqMessages(currentSchema, userPrompt),
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`Groq a refuse la requete: ${text}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{"operations":[]}');
}

module.exports = { applyDelta, requestGroqDelta };
