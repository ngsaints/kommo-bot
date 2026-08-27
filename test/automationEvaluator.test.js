import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConditions, hasExplicitAutomationScope } from '../src/automationEvaluator.js';

const initialContactAutomation = {
  conditions: {
    pipelineId: 'all',
    stageId: 'all',
    requiredTags: ['Contato Inicial'],
    excludedTags: ['Atendimento Humano'],
    messageTypes: ['text'],
    keywordMatch: '',
  },
};

function contextWithTags(tags, overrides = {}) {
  return {
    lead: {
      id: 123,
      pipeline_id: 10,
      status_id: 20,
      _embedded: { tags: tags.map(name => ({ name })) },
    },
    text: 'Olá, gostaria de informações',
    messageType: 'text',
    ...overrides,
  };
}

test('executa contato inicial somente quando a tag obrigatória existe', () => {
  assert.equal(evaluateConditions(initialContactAutomation, contextWithTags(['Contato Inicial'])), true);
  assert.equal(evaluateConditions(initialContactAutomation, contextWithTags(['Aluno Ativo'])), false);
  assert.equal(evaluateConditions(initialContactAutomation, contextWithTags([])), false);
});

test('normaliza caixa, acentos e espaços das tags', () => {
  assert.equal(evaluateConditions(initialContactAutomation, contextWithTags(['  CONTATO   INICIAL  '])), true);
});

test('tag bloqueada prevalece sobre a tag obrigatória', () => {
  assert.equal(
    evaluateConditions(initialContactAutomation, contextWithTags(['Contato Inicial', 'Atendimento Humano'])),
    false,
  );
});

test('etapa configurada bloqueia leads de outras colunas', () => {
  const automation = {
    conditions: { ...initialContactAutomation.conditions, stageId: '20' },
  };
  assert.equal(evaluateConditions(automation, contextWithTags(['Contato Inicial'])), true);
  assert.equal(
    evaluateConditions(automation, contextWithTags(['Contato Inicial'], { lead: { status_id: 99, _embedded: { tags: [{ name: 'Contato Inicial' }] } } })),
    false,
  );
});

test('automação sem escopo explícito nunca executa', () => {
  const unsafeAutomation = {
    conditions: {
      pipelineId: 'all',
      stageId: 'all',
      requiredTags: [],
      excludedTags: ['Atendimento Humano'],
      messageTypes: ['text'],
      keywordMatch: '',
    },
  };
  assert.equal(hasExplicitAutomationScope(unsafeAutomation.conditions), false);
  assert.equal(evaluateConditions(unsafeAutomation, contextWithTags(['Aluno Ativo'])), false);
});

test('escopo global depende de confirmação explícita', () => {
  const globalAutomation = {
    conditions: {
      allowAllLeads: true,
      pipelineId: 'all',
      stageId: 'all',
      requiredTags: [],
      excludedTags: [],
      messageTypes: ['text'],
      keywordMatch: '',
    },
  };
  assert.equal(hasExplicitAutomationScope(globalAutomation.conditions), true);
  assert.equal(evaluateConditions(globalAutomation, contextWithTags(['Aluno Ativo'])), true);
});

test('Contato Inicial desliga na etapa Lead e em todas as seguintes', () => {
  const automation = {
    conditions: {
      ...initialContactAutomation.conditions,
      stopAtStageName: 'Lead',
    },
  };
  const pipeline = {
    _embedded: {
      statuses: [
        { id: 10, name: 'Contato Inicial', sort: 10 },
        { id: 20, name: 'Lead', sort: 20 },
        { id: 30, name: 'Experimental Agendado', sort: 30 },
      ],
    },
  };

  assert.equal(evaluateConditions(automation, contextWithTags(['Contato Inicial'], {
    pipeline,
    lead: { status_id: 10, _embedded: { tags: [{ name: 'Contato Inicial' }] } },
  })), true);
  assert.equal(evaluateConditions(automation, contextWithTags(['Contato Inicial'], {
    pipeline,
    lead: { status_id: 20, _embedded: { tags: [{ name: 'Contato Inicial' }] } },
  })), false);
  assert.equal(evaluateConditions(automation, contextWithTags(['Contato Inicial'], {
    pipeline,
    lead: { status_id: 30, _embedded: { tags: [{ name: 'Contato Inicial' }] } },
  })), false);
});

test('trava de etapa bloqueia se o funil não puder ser confirmado', () => {
  const automation = {
    conditions: { ...initialContactAutomation.conditions, stopAtStageName: 'Lead' },
  };
  assert.equal(evaluateConditions(automation, contextWithTags(['Contato Inicial'])), false);
});

test('automação principal exige tag no Funil de vendas e desliga a partir de Lead', () => {
  const automation = {
    conditions: {
      pipelineId: 'name:Funil de vendas',
      stageId: 'all',
      requiredTags: ['Contato Inicial'],
      excludedTags: [],
      messageTypes: ['text'],
      stopAtStageName: 'Lead',
    },
  };
  const stages = [
    { id: 10, name: 'Contato Inicial', sort: 10 },
    { id: 20, name: 'Primeiro Contato (Prioridade)', sort: 20 },
    { id: 30, name: 'Lead', sort: 30 },
  ];
  const inStage = (statusId, tags = ['Contato Inicial']) => contextWithTags(tags, {
    lead: { pipeline_id: 1, status_id: statusId, _embedded: { tags: tags.map(name => ({ name })) } },
    pipeline: { id: 1, name: 'Funil de Vendas', _embedded: { statuses: stages } },
  });

  assert.equal(evaluateConditions(automation, inStage(10)), true);
  assert.equal(evaluateConditions(automation, inStage(20)), true);
  assert.equal(evaluateConditions(automation, inStage(30)), false);
  assert.equal(evaluateConditions(automation, inStage(10, [])), false);
  assert.equal(evaluateConditions(automation, {
    ...inStage(10),
    pipeline: { id: 2, name: 'Outro Funil', _embedded: { statuses: stages } },
  }), false);
});
