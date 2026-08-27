import axios from 'axios';

const SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;
const TOKEN = process.env.KOMMO_ACCESS_TOKEN;

const api = axios.create({
  baseURL: `https://${SUBDOMAIN}.kommo.com/api/v4`,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/hal+json',
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

export async function getLead(leadId) {
  const { data } = await api.get(`/leads/${leadId}?with=contacts`);
  return data;
}

/**
 * Busca um contato com seus campos (para extrair o telefone)
 */
export async function getContact(contactId) {
  const { data } = await api.get(`/contacts/${contactId}`);
  return data;
}

/**
 * Extrai o telefone dos campos de um contato/lead
 */
function phoneFromFields(customFields) {
  for (const f of customFields || []) {
    const code = (f.field_code || '').toUpperCase();
    const name = (f.field_name || f.name || '').toLowerCase();
    if (code === 'PHONE' || name.includes('tel') || name.includes('phone')) {
      for (const v of f.values || []) {
        if (v.value) {
          const digits = String(v.value).replace(/\D/g, '');
          if (digits.length >= 10) return digits;
        }
      }
    }
  }
  // fallback: primeiro campo que pareça telefone
  for (const f of customFields || []) {
    for (const v of f.values || []) {
      const digits = String(v.value || '').replace(/\D/g, '');
      if (/^55\d{10,13}$/.test(digits)) return digits;
    }
  }
  return null;
}

/**
 * Obtém o telefone do contato (busca na API se necessário)
 * @param {Object} lead - resposta do getLead
 * @param {string|number} contactId - id do contato do webhook
 */
export async function resolvePhone(lead, contactId) {
  // 1. Tenta nos contatos embutidos
  const contacts = lead._embedded?.contacts || [];
  for (const c of contacts) {
    const p = phoneFromFields(c.custom_fields_values);
    if (p) return p;
  }

  // 2. Busca o contato completo via API
  const cid = contactId || contacts[0]?.id;
  if (cid) {
    try {
      const contact = await getContact(cid);
      const p = phoneFromFields(contact.custom_fields_values);
      if (p) return p;
    } catch (err) {
      console.error('Erro ao buscar contato:', err.message);
    }
  }
  return null;
}

export async function getLeadByEntityId(entityId, entityType = 2) {
  if (entityType !== 2) return null;
  const { data } = await api.get(`/leads/${entityId}?with=contacts`);
  return data;
}

export async function updateLead(leadId, updates) {
  const { data } = await api.patch(`/leads`, [{ id: Number(leadId), ...updates }]);
  return data;
}

export async function updateLeadStage(leadId, pipelineId, statusId) {
  const payload = { id: Number(leadId) };
  if (statusId) payload.status_id = Number(statusId);
  if (pipelineId && pipelineId !== 'all') payload.pipeline_id = Number(pipelineId);
  const { data } = await api.patch(`/leads`, [payload]);
  return data;
}

export async function addTag(leadId, tagName) {
  if (!tagName) return;
  const { data } = await api.patch(`/leads`, [{
    id: Number(leadId),
    _embedded: {
      tags: [{ name: tagName }]
    }
  }]);
  return data;
}

export async function removeTag(leadId, tagName) {
  if (!tagName) return;
  try {
    const lead = await getLead(leadId);
    const existingTags = lead._embedded?.tags || [];
    const remainingTags = existingTags.filter(t => t.name !== tagName).map(t => ({ id: t.id, name: t.name }));
    const { data } = await api.patch(`/leads`, [{
      id: Number(leadId),
      _embedded: {
        tags: remainingTags
      }
    }]);
    return data;
  } catch (err) {
    console.error(`Erro ao remover tag ${tagName} do lead ${leadId}:`, err.message);
  }
}

export async function addLeadNote(leadId, text) {
  try {
    const { data } = await api.post(`/leads/${leadId}/notes`, [{
      note_type: 'common',
      params: { text }
    }]);
    return data;
  } catch (err) {
    console.error(`Erro ao adicionar nota ao lead ${leadId}:`, err.message);
  }
}

export async function getPipelines() {
  try {
    const { data } = await api.get('/leads/pipelines');
    const list = data._embedded?.pipelines || [];
    // Retorna apenas pipelines ativos (ignora arquivados)
    return list.filter(p => !p.is_archive);
  } catch (err) {
    console.error('Erro ao buscar pipelines:', err.message);
    return [];
  }
}

export async function createPipeline(name, statuses = []) {
  try {
    const payload = [{
      name,
      sort: 1,
      _embedded: statuses.length > 0 ? {
        statuses: statuses.map((st, idx) => ({
          name: typeof st === 'string' ? st : st.name,
          color: st.color || '#3b82f6',
          sort: (idx + 1) * 10
        }))
      } : undefined
    }];
    const { data } = await api.post('/leads/pipelines', payload);
    return data._embedded?.pipelines?.[0] || data;
  } catch (err) {
    console.error('Erro ao criar pipeline no Kommo:', err.response?.data || err.message);
    throw err;
  }
}

export async function getCustomFields() {
  try {
    const { data } = await api.get('/leads/custom_fields');
    return data._embedded?.custom_fields || [];
  } catch (err) {
    console.error('Erro ao buscar custom fields:', err.message);
    return [];
  }
}

// uazapi - envio de WhatsApp
const UAZAPI_URL = process.env.UAZAPI_URL || 'https://agentekommo.uazapi.com/send/text';
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || '6033f312-3e6f-4142-ae49-e594520ca33a';

export async function sendWhatsApp(number, text) {
  const { data } = await axios.post(UAZAPI_URL, 
    { number, text },
    {
      headers: {
        'Accept': 'application/json',
        'token': UAZAPI_TOKEN,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    }
  );
  return data;
}

export default {
  getLead,
  getContact,
  resolvePhone,
  updateLead,
  updateLeadStage,
  addTag,
  removeTag,
  addLeadNote,
  getPipelines,
  createPipeline,
  getCustomFields,
  sendWhatsApp
};