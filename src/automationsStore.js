import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dir, '..', 'data');
const AUTOMATIONS_FILE = path.join(DATA_DIR, 'automations.json');

// Garante existência da pasta de dados
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getDefaultAutomations() {
  return [
    {
      id: 'aut-default-ia',
      name: 'Atendimento Inteligente com IA',
      description: 'Responde automaticamente leads que enviarem mensagens pelo WhatsApp utilizando a base de conhecimento e IA.',
      active: true,
      trigger: 'message_add', // message_add, lead_add, lead_stage_change, lead_tag_added
      conditions: {
        pipelineId: 'all',
        stageId: 'all',
        requiredTags: [],
        excludedTags: ['Atendimento Humano', 'Nao Perturbe', 'Sem IA'],
        messageTypes: ['text', 'audio', 'image'],
        keywordMatch: '', // vazio = qualquer mensagem
      },
      actions: [
        {
          type: 'ai_chat',
          useCustomPrompt: false,
          customPrompt: '',
          sendChannel: 'whatsapp_uazapi',
          addTagOnSuccess: 'Em Atendimento IA',
          removeTagOnSuccess: '',
        }
      ],
      stats: {
        executionsCount: 0,
        successCount: 0,
        lastRun: null,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'aut-transfer-human',
      name: 'Transbordo para Atendimento Humano',
      description: 'Identifica quando um lead solicita atendente humano ou manifesta insatisfação e atualiza as tags no CRM.',
      active: true,
      trigger: 'message_add',
      conditions: {
        pipelineId: 'all',
        stageId: 'all',
        requiredTags: [],
        excludedTags: ['Atendimento Humano'],
        messageTypes: ['text'],
        keywordMatch: 'humano,atendente,gerente,falar com pessoa,responsavel,reclamacao,suporte humano',
      },
      actions: [
        {
          type: 'send_template',
          templateText: 'Entendido! Estou transferindo seu atendimento para um de nossos atendentes humanos. Em instantes entraremos em contato!',
          sendChannel: 'whatsapp_uazapi',
          addTagOnSuccess: 'Atendimento Humano',
          removeTagOnSuccess: 'Em Atendimento IA',
        }
      ],
      stats: {
        executionsCount: 0,
        successCount: 0,
        lastRun: null,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

export function readAutomations() {
  try {
    if (fs.existsSync(AUTOMATIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTOMATIONS_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.error('Erro ao ler automações:', err.message);
  }

  // Se não existir, inicializa com as regras padrão
  const defaults = getDefaultAutomations();
  writeAutomations(defaults);
  return defaults;
}

export function writeAutomations(automations) {
  try {
    fs.writeFileSync(AUTOMATIONS_FILE, JSON.stringify(automations, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Erro ao salvar automações:', err.message);
    return false;
  }
}

export function getAutomation(id) {
  const list = readAutomations();
  return list.find(a => a.id === id) || null;
}

export function saveAutomation(data) {
  const list = readAutomations();
  const now = new Date().toISOString();

  if (data.id) {
    // Atualização
    const index = list.findIndex(a => a.id === data.id);
    if (index !== -1) {
      list[index] = {
        ...list[index],
        ...data,
        updatedAt: now
      };
      writeAutomations(list);
      return list[index];
    }
  }

  // Criação
  const newAutomation = {
    id: 'aut-' + crypto.randomBytes(4).toString('hex'),
    name: data.name || 'Nova Automação',
    description: data.description || '',
    active: data.active !== false,
    trigger: data.trigger || 'message_add',
    conditions: {
      pipelineId: data.conditions?.pipelineId || 'all',
      stageId: data.conditions?.stageId || 'all',
      requiredTags: Array.isArray(data.conditions?.requiredTags) ? data.conditions.requiredTags : [],
      excludedTags: Array.isArray(data.conditions?.excludedTags) ? data.conditions.excludedTags : [],
      messageTypes: Array.isArray(data.conditions?.messageTypes) ? data.conditions.messageTypes : ['text', 'audio', 'image'],
      keywordMatch: data.conditions?.keywordMatch || '',
    },
    actions: Array.isArray(data.actions) && data.actions.length > 0 ? data.actions : [
      {
        type: 'ai_chat',
        useCustomPrompt: false,
        customPrompt: '',
        sendChannel: 'whatsapp_uazapi',
        addTagOnSuccess: '',
        removeTagOnSuccess: '',
      }
    ],
    stats: {
      executionsCount: 0,
      successCount: 0,
      lastRun: null,
    },
    createdAt: now,
    updatedAt: now
  };

  list.push(newAutomation);
  writeAutomations(list);
  return newAutomation;
}

export function toggleAutomation(id, active) {
  const list = readAutomations();
  const item = list.find(a => a.id === id);
  if (item) {
    item.active = typeof active === 'boolean' ? active : !item.active;
    item.updatedAt = new Date().toISOString();
    writeAutomations(list);
    return item;
  }
  return null;
}

export function deleteAutomation(id) {
  const list = readAutomations();
  const filtered = list.filter(a => a.id !== id);
  if (filtered.length !== list.length) {
    writeAutomations(filtered);
    return true;
  }
  return false;
}

export function recordAutomationRun(id, success = true) {
  const list = readAutomations();
  const item = list.find(a => a.id === id);
  if (item) {
    if (!item.stats) {
      item.stats = { executionsCount: 0, successCount: 0, lastRun: null };
    }
    item.stats.executionsCount = (item.stats.executionsCount || 0) + 1;
    if (success) {
      item.stats.successCount = (item.stats.successCount || 0) + 1;
    }
    item.stats.lastRun = new Date().toISOString();
    writeAutomations(list);
  }
}

export default {
  readAutomations,
  writeAutomations,
  getAutomation,
  saveAutomation,
  toggleAutomation,
  deleteAutomation,
  recordAutomationRun,
};
