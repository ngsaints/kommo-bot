import { getLead, resolvePhone, sendWhatsApp, addTag, removeTag, updateLeadStage, addLeadNote } from './kommo.js';
import { getChatHistory, saveChatMessage } from './redis.js';
import { getAiResponse } from './agent.js';
import { addExecution, addLog } from './logger.js';
import { readAutomationState } from './dashboard.js';
import { readAutomations, recordAutomationRun } from './automationsStore.js';
import axios from 'axios';

/**
 * Normaliza tags do lead para comparação fácil (minúsculas, sem espaços extras)
 */
function getLeadTagNames(lead) {
  const tags = lead?._embedded?.tags || [];
  return tags.map(t => (t.name || '').trim().toLowerCase()).filter(Boolean);
}

/**
 * Avalia se o lead atende a todas as condições de uma automação
 */
function evaluateConditions(automation, context) {
  const { lead, text, messageType } = context;
  const conds = automation.conditions || {};

  // 1. Filtro de Funil (Pipeline)
  if (conds.pipelineId && conds.pipelineId !== 'all') {
    if (Number(lead?.pipeline_id) !== Number(conds.pipelineId)) {
      return false;
    }
  }

  // 2. Filtro de Etapa (Stage / Status)
  if (conds.stageId && conds.stageId !== 'all') {
    if (Number(lead?.status_id) !== Number(conds.stageId)) {
      return false;
    }
  }

  const leadTags = getLeadTagNames(lead);

  // 3. Tags Obrigatórias (todas devem existir)
  if (Array.isArray(conds.requiredTags) && conds.requiredTags.length > 0) {
    for (const reqTag of conds.requiredTags) {
      const normalized = (reqTag || '').trim().toLowerCase();
      if (normalized && !leadTags.includes(normalized)) {
        return false;
      }
    }
  }

  // 4. Tags Bloqueadas / Excluídas (nenhuma pode existir)
  if (Array.isArray(conds.excludedTags) && conds.excludedTags.length > 0) {
    for (const excTag of conds.excludedTags) {
      const normalized = (excTag || '').trim().toLowerCase();
      if (normalized && leadTags.includes(normalized)) {
        return false;
      }
    }
  }

  // 5. Tipo de Mensagem
  if (Array.isArray(conds.messageTypes) && conds.messageTypes.length > 0) {
    if (messageType && !conds.messageTypes.includes(messageType)) {
      return false;
    }
  }

  // 6. Palavras-chave no texto
  if (conds.keywordMatch && conds.keywordMatch.trim()) {
    const rawKeywords = conds.keywordMatch.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    if (rawKeywords.length > 0) {
      const lowerText = (text || '').toLowerCase();
      const hasMatch = rawKeywords.some(keyword => lowerText.includes(keyword));
      if (!hasMatch) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Substitui variáveis dinâmicas em textos de template
 */
function renderTemplate(text, lead, contactPhone) {
  if (!text) return '';
  const name = lead?.name || 'Cliente';
  const firstName = name.split(' ')[0] || 'Cliente';
  const leadId = lead?.id || '';
  const phone = contactPhone || '';

  return text
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone)
    .replace(/\{\{\s*lead_id\s*\}\}/gi, String(leadId));
}

/**
 * Executa uma ação de automação
 */
async function executeAction(action, automation, context) {
  const { lead, text, contactId, entityId } = context;
  const result = { success: false, actionType: action.type };

  const phone = await resolvePhone(lead, contactId);

  switch (action.type) {
    case 'ai_chat': {
      // 1. Busca histórico no Redis
      const history = await getChatHistory(entityId);
      // 2. Salva mensagem do usuário
      if (text) {
        await saveChatMessage(entityId, { role: 'user', content: text });
      }

      // 3. Gera resposta da IA
      let aiResponse;
      try {
        aiResponse = await getAiResponse(text, history, lead);
        addLog('ai', 'success', `[${automation.name}] Resposta IA gerada (${aiResponse.length} chars)`);
      } catch (err) {
        addLog('error', 'error', `[${automation.name}] Erro na IA: ${err.message}`);
        aiResponse = 'Desculpe, estou com instabilidade temporária. Um atendente foi notificado.';
      }

      // 4. Salva resposta no Redis
      await saveChatMessage(entityId, { role: 'assistant', content: aiResponse });

      // 5. Envio WhatsApp
      if (phone) {
        try {
          await sendWhatsApp(phone, aiResponse);
          addLog('send', 'success', `[${automation.name}] WhatsApp enviado para +${phone}`);
          result.success = true;
          result.response = aiResponse;
        } catch (err) {
          addLog('error', 'error', `[${automation.name}] Erro ao enviar WhatsApp: ${err.message}`);
          result.error = err.message;
        }
      } else {
        addLog('warn', 'warn', `[${automation.name}] Telefone nao encontrado para o lead ${entityId}`);
      }

      // Tags de pós-execução
      if (action.addTagOnSuccess) await addTag(entityId, action.addTagOnSuccess);
      if (action.removeTagOnSuccess) await removeTag(entityId, action.removeTagOnSuccess);
      if (action.moveStageId && action.moveStageId !== 'all') {
        await updateLeadStage(entityId, action.movePipelineId, action.moveStageId);
      }
      break;
    }

    case 'send_template': {
      const rendered = renderTemplate(action.templateText, lead, phone);
      if (phone && rendered) {
        try {
          await sendWhatsApp(phone, rendered);
          addLog('send', 'success', `[${automation.name}] Mensagem template enviada para +${phone}`);
          result.success = true;
          result.response = rendered;
        } catch (err) {
          addLog('error', 'error', `[${automation.name}] Erro ao enviar template: ${err.message}`);
          result.error = err.message;
        }
      }

      // Tags de pós-execução
      if (action.addTagOnSuccess) await addTag(entityId, action.addTagOnSuccess);
      if (action.removeTagOnSuccess) await removeTag(entityId, action.removeTagOnSuccess);
      if (action.moveStageId && action.moveStageId !== 'all') {
        await updateLeadStage(entityId, action.movePipelineId, action.moveStageId);
      }
      break;
    }

    case 'change_stage': {
      if (action.stageId && action.stageId !== 'all') {
        await updateLeadStage(entityId, action.pipelineId, action.stageId);
        addLog('stage', 'success', `[${automation.name}] Lead ${entityId} movido para etapa ${action.stageId}`);
        result.success = true;
      }
      break;
    }

    case 'manage_tags': {
      if (action.addTag) await addTag(entityId, action.addTag);
      if (action.removeTag) await removeTag(entityId, action.removeTag);
      addLog('tag', 'success', `[${automation.name}] Tags atualizadas para lead ${entityId}`);
      result.success = true;
      break;
    }

    case 'webhook_forward': {
      if (action.webhookUrl) {
        try {
          await axios.post(action.webhookUrl, {
            lead,
            message: text,
            automationId: automation.id,
            timestamp: new Date().toISOString()
          }, { timeout: 10000 });
          addLog('forward', 'success', `[${automation.name}] Webhook encaminhado para ${action.webhookUrl}`);
          result.success = true;
        } catch (err) {
          addLog('error', 'error', `[${automation.name}] Erro ao encaminhar webhook: ${err.message}`);
        }
      }
      break;
    }

    default:
      addLog('warn', 'warn', `Acao desconhecida: ${action.type}`);
  }

  return result;
}

/**
 * Processador principal de mensagens e eventos do Kommo
 */
export async function processKommoEvent(body, eventType) {
  const entityId = body['message[add][0][entity_id]'] || body['leads[status][0][id]'] || body['leads[add][0][id]'] || body['leads[update][0][id]'];
  const contactId = body['message[add][0][contact_id]'];
  const text = body['message[add][0][text]'] || '';
  const entityType = body['message[add][0][entity_type]'] || 'lead';
  const attachmentType = body['message[add][0][attachment][type]'] || 'text';

  if (!entityId) {
    addLog('info', 'info', `Evento ignorado: sem entityId (${eventType})`);
    return { ignored: true, reason: 'no_entity_id' };
  }

  if (entityType !== 'lead' && eventType === 'message_add') {
    addLog('info', 'info', `Ignorado: tipo ${entityType} nao suportado`);
    return { ignored: true, reason: 'not_a_lead' };
  }

  addLog('incoming', 'info', `Evento Kommo recebido: ${eventType} (Lead ${entityId}) "${text.slice(0, 40)}"`);

  // 1. Busca dados do lead no Kommo
  let lead;
  try {
    lead = await getLead(entityId);
    addLog('check', 'success', `Lead ${entityId} encontrado: ${lead.name || 'Sem nome'}`);
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 204) {
      addLog('warn', 'warn', `Lead ${entityId} nao encontrado no Kommo`);
      addExecution({ leadId: entityId, message: text, status: 'error', response: 'Lead não encontrado' });
      return { ignored: true, reason: 'lead_not_found' };
    }
    addLog('error', 'error', `Erro ao buscar lead ${entityId}: ${err.message}`);
    throw err;
  }

  const context = {
    lead,
    contactId,
    entityId,
    text,
    messageType: attachmentType,
    eventType
  };

  // 2. Carrega automações ativas para o gatilho correspondente
  const allAutomations = readAutomations();
  const matchedAutomations = allAutomations.filter(a => {
    if (!a.active) return false;
    // Gatilho compatível
    if (a.trigger !== eventType && a.trigger !== 'all') return false;
    // Avaliação de condições e regras do Kommo
    return evaluateConditions(a, context);
  });

  if (matchedAutomations.length === 0) {
    addLog('info', 'info', `Nenhuma regra de automacao aplicavel para o Lead ${entityId}`);
    return { matched: 0 };
  }

  addLog('workflow', 'info', `Executando ${matchedAutomations.length} regra(s) para Lead ${entityId}`);

  // 3. Executa as automações correspondentes
  let lastResponse = '';
  let finalStatus = 'success';

  for (const automation of matchedAutomations) {
    try {
      addLog('play', 'info', `Disparando automacao: "${automation.name}"`);
      let autoSuccess = true;

      for (const action of automation.actions || []) {
        const actionResult = await executeAction(action, automation, context);
        if (actionResult.response) lastResponse = actionResult.response;
        if (!actionResult.success && actionResult.error) {
          autoSuccess = false;
        }
      }

      recordAutomationRun(automation.id, autoSuccess);
      if (!autoSuccess) finalStatus = 'error';
    } catch (err) {
      console.error(`Erro ao rodar automação ${automation.id}:`, err);
      recordAutomationRun(automation.id, false);
      finalStatus = 'error';
    }
  }

  addExecution({
    leadId: entityId,
    message: text || `Evento: ${eventType}`,
    status: finalStatus,
    response: lastResponse || 'Ações executadas com sucesso',
    automationsCount: matchedAutomations.length
  });

  return { success: true, executedCount: matchedAutomations.length };
}

/**
 * Handler do Express para o Webhook do Kommo
 */
export async function handleWebhook(req, res) {
  try {
    const body = req.body || {};

    // 1. Identifica o tipo de evento recebido
    let eventType = 'unknown';
    if (Object.keys(body).some(k => k.startsWith('message[add]'))) {
      eventType = 'message_add';
    } else if (Object.keys(body).some(k => k.startsWith('leads[status]') || k.startsWith('lead[status]'))) {
      eventType = 'lead_stage_change';
    } else if (Object.keys(body).some(k => k.startsWith('leads[add]') || k.startsWith('lead[add]'))) {
      eventType = 'lead_add';
    } else if (Object.keys(body).some(k => k.startsWith('leads[update]') || k.startsWith('lead[update]'))) {
      eventType = 'lead_update';
    }

    if (eventType === 'unknown') {
      addLog('info', 'info', 'Webhook ignorado: tipo de evento nao mapeado');
      return res.json({ ignored: true, reason: 'unknown_event_format' });
    }

    // 2. Verifica se as automações gerais estão ativas
    if (!readAutomationState()) {
      addLog('pause', 'warn', 'Automacoes PAUSADAS globalmente no painel - evento ignorado');
      return res.json({ ignored: true, reason: 'automation_paused' });
    }

    // 3. Responde imediatamente ao Kommo para evitar timeout (comportamento idêntico ao n8n)
    res.json({ received: true, event: eventType });

    // 4. Processa o evento em background
    processKommoEvent(body, eventType).catch(err => {
      addLog('error', 'error', `Erro no processamento do evento ${eventType}: ${err.message}`);
    });
  } catch (err) {
    addLog('error', 'error', `Erro no webhook: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

export default { handleWebhook, processKommoEvent };