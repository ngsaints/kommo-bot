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
