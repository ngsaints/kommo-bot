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

export async function addTag(leadId, tagName) {
  const { data } = await api.patch(`/leads`, [{
    id: Number(leadId),
    custom_fields_values: [{
      field_code: 'TAG',
      values: [{ value: tagName }]
    }]
  }]);
  return data;
}

export async function getPipelines() {
  const { data } = await api.get('/leads/pipelines');
  return data;
}

export async function getCustomFields() {
  const { data } = await api.get('/leads/custom_fields');
  return data;
}

// uazapi - envio de WhatsApp (mesma API usada no fluxo n8n)
const UAZAPI_URL = 'https://agentekommo.uazapi.com/send/text';
const UAZAPI_TOKEN = '6033f312-3e6f-4142-ae49-e594520ca33a';

/**
 * Extrai o telefone do contato embutido na resposta do lead
 */
/**
 * Envia mensagem WhatsApp via uazapi (igual ao node ENVIA MENSAGEM WHATSAPP do n8n)
 */
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

export default { getLead, getContact, resolvePhone, updateLead, addTag, getPipelines, getCustomFields, sendWhatsApp };