import { getLead, resolvePhone, sendWhatsApp } from './kommo.js';
import { getChatHistory, saveChatMessage } from './redis.js';
import { getAiResponse } from './agent.js';
import { addExecution, addLog } from './logger.js';
import { readAutomationState } from './dashboard.js';

/**
 * Processa uma mensagem recebida de um lead
 */
export async function processMessage(body) {
  const entityId = body['message[add][0][entity_id]'];
  const contactId = body['message[add][0][contact_id]'];
  const text = body['message[add][0][text]'] || '';
  const entityType = body['message[add][0][entity_type]'];
  const subdomain = body['account[subdomain]'] || process.env.KOMMO_SUBDOMAIN;

  if (!entityId || entityType !== 'lead') {
    addLog('⏭️', 'warn', `Ignorado: entityType=${entityType}`);
    return { ignored: true, reason: 'not_a_lead' };
  }

  addLog('📩', 'info', `Mensagem de lead ${entityId}: "${text.slice(0, 50)}..."`);

  // 1. Busca dados do lead
  let lead;
  try {
    lead = await getLead(entityId);
    addLog('✅', 'success', `Lead ${entityId} encontrado: ${lead.name || 'sem nome'}`);
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 204) {
      addLog('⚠️', 'warn', `Lead ${entityId} não encontrado (deletado)`);
      addExecution({ leadId: entityId, message: text, status: 'error', response: 'Lead not found' });
      return { ignored: true, reason: 'lead_not_found' };
    }
    addLog('❌', 'error', `Erro ao buscar lead ${entityId}: ${err.message}`);
    throw err;
  }

  // 2. Busca histórico
  const history = await getChatHistory(entityId);
  addLog('💬', 'info', `Histórico: ${history.length} mensagens`);

  // 3. Salva mensagem do lead
  await saveChatMessage(entityId, { role: 'user', content: text });

  // 4. Gera resposta da IA
  let aiResponse;
  try {
    aiResponse = await getAiResponse(text, history, lead);
    addLog('🤖', 'success', `Resposta gerada (${aiResponse.length} chars)`);
  } catch (err) {
    addLog('❌', 'error', `Erro na IA: ${err.message}`);
    aiResponse = 'Desculpe, estou com dificuldades técnicas. Um atendente será notificado.';
  }

  // 5. Salva resposta
  await saveChatMessage(entityId, { role: 'assistant', content: aiResponse });

  // 6. Envia resposta via WhatsApp (uazapi - igual fluxo n8n)
  const phone = await resolvePhone(lead, contactId);
  if (phone) {
    try {
      await sendWhatsApp(phone, aiResponse);
      addLog('📤', 'success', `Resposta enviada para +${phone}`);
    } catch (err) {
      const status = err.response?.status;
      addLog('❌', 'error', `Erro uazapi (${status || 'sem status'}): ${err.message}`);
      addExecution({ leadId: entityId, message: text, status: 'error', response: `Send fail: ${err.message}` });
    }
  } else {
    addLog('⚠️', 'warn', `Telefone não encontrado no lead ${entityId} - resposta não enviada`);
    addExecution({ leadId: entityId, message: text, status: 'error', response: 'No phone found' });
  }

  addExecution({ leadId: entityId, message: text, status: 'success', response: aiResponse });
  return { success: true, leadId: entityId, response: aiResponse };
}

/**
 * Envia a resposta via Salesbot
 */
async function sendResponse(subdomain, entityId, userMessage, aiResponse) {
  try {
    const axios = (await import('axios')).default;
    const TOKEN = process.env.KOMMO_ACCESS_TOKEN;

    await axios.post(`https://${subdomain}.kommo.com/api/v2/salesbot/run`, {
      bot_id: 65683,
      entity_id: entityId,
      entity_type: 2
    }, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    addLog('✅', 'success', `Resposta enviada via Salesbot para lead ${entityId}`);
  } catch (err) {
    addLog('❌', 'error', `Erro Salesbot: ${err.message}`);
  }
}

/**
 * Handler do Express para o webhook
 */
export async function handleWebhook(req, res) {
  try {
    addLog('📡', 'info', 'Webhook recebido');
    const body = req.body;

    const hasMessageAdd = Object.keys(body).some(k => k.startsWith('message[add]'));
    if (!hasMessageAdd) {
      addLog('⏭️', 'info', 'Ignorado: não é message[add]');
      return res.json({ ignored: true, reason: 'not_message_add' });
    }

    // Verifica se a automação está ativa
    if (!readAutomationState()) {
      addLog('⏸️', 'warn', 'Automação PAUSADA - mensagem ignorada');
      return res.json({ ignored: true, reason: 'automation_paused' });
    }

    // Responde IMEDIATAMENTE ao Kommo e processa em background
    // (evita timeout - igual comportamento do n8n)
    res.json({ received: true });
    processMessage(body).catch(err => {
      addLog('❌', 'error', `Erro no processamento: ${err.message}`);
    });
  } catch (err) {
    addLog('❌', 'error', `Erro no webhook: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}