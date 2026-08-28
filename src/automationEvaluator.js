/**
 * Normaliza valores vindos do Kommo para comparações previsíveis.
 * Ignora caixa, acentos e espaços duplicados, mas exige o nome completo da tag.
 */
export function normalizeKommoValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function getLeadTagNames(lead) {
  const tags = lead?._embedded?.tags || lead?.tags || [];
  return tags
    .map(tag => normalizeKommoValue(typeof tag === 'string' ? tag : tag?.name))
    .filter(Boolean);
}

export function hasExplicitAutomationScope(conditions = {}) {
  return Boolean(
    conditions.allowAllLeads === true ||
    (conditions.pipelineId && conditions.pipelineId !== 'all') ||
    (conditions.stageId && conditions.stageId !== 'all') ||
    (Array.isArray(conditions.requiredTags) && conditions.requiredTags.some(tag => normalizeKommoValue(tag))) ||
    conditions.keywordMatch?.trim()
  );
}

/**
 * Avalia se o lead atende a todas as condições de uma automação.
 * Filtros configurados trabalham em modo fail-closed: contexto ausente não passa.
 */
export function automationAcceptsEvent(automation, eventType) {
  if (automation?.trigger === 'all') return true;
  return automation?.trigger === eventType;
}

export function evaluateConditionsDetailed(automation, context) {
  const { lead, text, messageType, pipeline } = context;
  const conds = automation.conditions || {};
  const rejected = (reason, detail = '') => ({ matches: false, reason, detail });

  // Segurança operacional: uma automação precisa declarar onde pode atuar.
  // "Todos os leads" só é aceito quando explicitamente habilitado.
  if (!hasExplicitAutomationScope(conds)) return rejected('sem_escopo_explicito');

  if (conds.pipelineId && conds.pipelineId !== 'all') {
    if (String(conds.pipelineId).startsWith('name:')) {
      const requiredPipelineName = String(conds.pipelineId).slice(5);
      if (!pipeline) return rejected('funil_nao_encontrado', requiredPipelineName);
      if (normalizeKommoValue(pipeline.name) !== normalizeKommoValue(requiredPipelineName)) return rejected('funil_diferente', pipeline.name);
    } else if (!lead?.pipeline_id || Number(lead.pipeline_id) !== Number(conds.pipelineId)) {
      return rejected('funil_diferente', String(lead?.pipeline_id || 'ausente'));
    }
  }

  if (conds.stageId && conds.stageId !== 'all') {
    if (!lead?.status_id || Number(lead.status_id) !== Number(conds.stageId)) return rejected('etapa_diferente', String(lead?.status_id || 'ausente'));
  }

  // Para fluxos sensíveis, a lista de etapas permitidas é mais segura que
  // depender apenas da posição da etapa no funil. O nome atual sempre vem do
  // próprio pipeline retornado pelo Kommo e a ausência desse contexto bloqueia.
  if (Array.isArray(conds.allowedStageNames) && conds.allowedStageNames.length > 0) {
    const statuses = pipeline?._embedded?.statuses || [];
    const current = statuses.find(status => Number(status.id) === Number(lead?.status_id));
    const allowed = conds.allowedStageNames.map(normalizeKommoValue).filter(Boolean);
    if (!current) return rejected('etapa_nao_encontrada_no_funil', String(lead?.status_id || 'ausente'));
    if (!allowed.includes(normalizeKommoValue(current.name))) return rejected('etapa_nao_permitida', current.name);
  }

  // Impede que uma automação de primeiro contato continue atendendo depois
  // que a oportunidade avançou no funil. Se a ordem não puder ser confirmada,
  // bloqueia a execução por segurança.
  if (conds.stopAtStageName) {
    const statuses = [...(pipeline?._embedded?.statuses || [])]
      .filter(status => status?.id != null)
      .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
    const cutoff = statuses.find(status =>
      normalizeKommoValue(status.name) === normalizeKommoValue(conds.stopAtStageName)
    );
    const current = statuses.find(status => Number(status.id) === Number(lead?.status_id));
    if (!cutoff || !current) return rejected('barreira_de_etapa_nao_confirmada');
    if (Number(current.sort || 0) >= Number(cutoff.sort || 0)) return rejected('automacao_encerrada_na_etapa', current.name);
  }

  const leadTags = getLeadTagNames(lead);

  if (Array.isArray(conds.requiredTags) && conds.requiredTags.length > 0) {
    const requiredTags = conds.requiredTags.map(normalizeKommoValue).filter(Boolean);
    const missingTags = requiredTags.filter(tag => !leadTags.includes(tag));
    if (missingTags.length > 0) return rejected('tag_obrigatoria_ausente', missingTags.join(', '));
  }

  if (Array.isArray(conds.excludedTags) && conds.excludedTags.length > 0) {
    const excludedTags = conds.excludedTags.map(normalizeKommoValue).filter(Boolean);
    const blockedTag = excludedTags.find(tag => leadTags.includes(tag));
    if (blockedTag) return rejected('tag_bloqueada_presente', blockedTag);
  }

  if (Array.isArray(conds.messageTypes) && conds.messageTypes.length > 0) {
    if (!messageType || !conds.messageTypes.includes(messageType)) return rejected('tipo_de_mensagem_nao_permitido', String(messageType || 'ausente'));
  }

  if (conds.keywordMatch && conds.keywordMatch.trim()) {
    const keywords = conds.keywordMatch
      .split(',')
      .map(normalizeKommoValue)
      .filter(Boolean);
    const normalizedText = normalizeKommoValue(text);
    if (keywords.length > 0 && !keywords.some(keyword => normalizedText.includes(keyword))) return rejected('palavra_chave_ausente');
  }

  return { matches: true, reason: 'aplicavel', detail: '' };
}

export function evaluateConditions(automation, context) {
  return evaluateConditionsDetailed(automation, context).matches;
}
