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
export function evaluateConditions(automation, context) {
  const { lead, text, messageType, pipeline } = context;
  const conds = automation.conditions || {};

  // Segurança operacional: uma automação precisa declarar onde pode atuar.
  // "Todos os leads" só é aceito quando explicitamente habilitado.
  if (!hasExplicitAutomationScope(conds)) return false;

  if (conds.pipelineId && conds.pipelineId !== 'all') {
    if (String(conds.pipelineId).startsWith('name:')) {
      const requiredPipelineName = String(conds.pipelineId).slice(5);
      if (!pipeline || normalizeKommoValue(pipeline.name) !== normalizeKommoValue(requiredPipelineName)) return false;
    } else if (!lead?.pipeline_id || Number(lead.pipeline_id) !== Number(conds.pipelineId)) {
      return false;
    }
  }

  if (conds.stageId && conds.stageId !== 'all') {
    if (!lead?.status_id || Number(lead.status_id) !== Number(conds.stageId)) return false;
  }

  // Para fluxos sensíveis, a lista de etapas permitidas é mais segura que
  // depender apenas da posição da etapa no funil. O nome atual sempre vem do
  // próprio pipeline retornado pelo Kommo e a ausência desse contexto bloqueia.
  if (Array.isArray(conds.allowedStageNames) && conds.allowedStageNames.length > 0) {
    const statuses = pipeline?._embedded?.statuses || [];
    const current = statuses.find(status => Number(status.id) === Number(lead?.status_id));
    const allowed = conds.allowedStageNames.map(normalizeKommoValue).filter(Boolean);
    if (!current || !allowed.includes(normalizeKommoValue(current.name))) return false;
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
    if (!cutoff || !current || Number(current.sort || 0) >= Number(cutoff.sort || 0)) return false;
  }

  const leadTags = getLeadTagNames(lead);

  if (Array.isArray(conds.requiredTags) && conds.requiredTags.length > 0) {
    const requiredTags = conds.requiredTags.map(normalizeKommoValue).filter(Boolean);
    if (!requiredTags.every(tag => leadTags.includes(tag))) return false;
  }

  if (Array.isArray(conds.excludedTags) && conds.excludedTags.length > 0) {
    const excludedTags = conds.excludedTags.map(normalizeKommoValue).filter(Boolean);
    if (excludedTags.some(tag => leadTags.includes(tag))) return false;
  }

  if (Array.isArray(conds.messageTypes) && conds.messageTypes.length > 0) {
    if (!messageType || !conds.messageTypes.includes(messageType)) return false;
  }

  if (conds.keywordMatch && conds.keywordMatch.trim()) {
    const keywords = conds.keywordMatch
      .split(',')
      .map(normalizeKommoValue)
      .filter(Boolean);
    const normalizedText = normalizeKommoValue(text);
    if (keywords.length > 0 && !keywords.some(keyword => normalizedText.includes(keyword))) return false;
  }

  return true;
}
