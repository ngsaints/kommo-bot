import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dir, '..', 'data');
const AUTOMATIONS_FILE = path.join(DATA_DIR, 'automations.json');
const INITIAL_CONTACT_ALLOWED_STAGES = [
  'Contato Inicial',
  'Primeiro Contato (Prioridade)',
];

// Garante existência da pasta de dados
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getDefaultAutomations() {
  return [];
}

export function migrateAutomationSafety(automations) {
  return automations.map(automation => {
    if (!['aut-default-ia', 'aut-transfer-human'].includes(automation.id)) return automation;

    const requiredTags = Array.isArray(automation.conditions?.requiredTags)
      ? automation.conditions.requiredTags
      : [];
    const hasInitialContact = requiredTags.some(tag =>
      String(tag || '').trim().toLowerCase() === 'contato inicial'
    );

    return {
      ...automation,
      priority: automation.id === 'aut-transfer-human' ? 100 : 10,
      stopAfterMatch: automation.id === 'aut-transfer-human',
      conditions: {
        ...(automation.conditions || {}),
        pipelineId: automation.conditions?.pipelineId && automation.conditions.pipelineId !== 'all'
          ? automation.conditions.pipelineId
          : 'name:Funil de vendas',
        requiredTags: hasInitialContact ? requiredTags : [...requiredTags, 'Contato Inicial'],
        // Escopo explícito: não depende somente da ordem configurada no Kommo.
        // A migração reaplica a proteção mesmo após uma edição pelo painel.
        allowedStageNames: INITIAL_CONTACT_ALLOWED_STAGES,
        stopAtStageName: automation.conditions?.stopAtStageName || 'Lead',
        allowAllLeads: false,
      },
    };
  });
}

export function readAutomations() {
  try {
    if (fs.existsSync(AUTOMATIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTOMATIONS_FILE, 'utf8'));
      if (Array.isArray(data)) {
        const migrated = migrateAutomationSafety(data);
        if (JSON.stringify(migrated) !== JSON.stringify(data)) writeAutomations(migrated);
        return migrated;
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
    priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : 0,
    stopAfterMatch: data.stopAfterMatch === true,
    trigger: data.trigger || 'message_add',
    conditions: {
      pipelineId: data.conditions?.pipelineId || 'all',
      stageId: data.conditions?.stageId || 'all',
      requiredTags: Array.isArray(data.conditions?.requiredTags) ? data.conditions.requiredTags : [],
      excludedTags: Array.isArray(data.conditions?.excludedTags) ? data.conditions.excludedTags : [],
      messageTypes: Array.isArray(data.conditions?.messageTypes) ? data.conditions.messageTypes : ['text', 'audio', 'image'],
      keywordMatch: data.conditions?.keywordMatch || '',
      allowedStageNames: Array.isArray(data.conditions?.allowedStageNames)
        ? data.conditions.allowedStageNames
        : [],
      stopAtStageName: data.conditions?.stopAtStageName || '',
      allowAllLeads: data.conditions?.allowAllLeads === true,
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
