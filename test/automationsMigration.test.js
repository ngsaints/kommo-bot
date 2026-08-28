import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { migrateAutomationSafety } from '../src/automationsStore.js';

const automations = JSON.parse(
  fs.readFileSync(new URL('../data/automations.json', import.meta.url), 'utf8')
);

test('migra regras persistidas para tag Contato Inicial no Funil de vendas', () => {
  const migrated = migrateAutomationSafety([
    { id: 'aut-default-ia', conditions: { pipelineId: 'all', stageId: 'all', requiredTags: [] } },
    { id: 'aut-transfer-human', conditions: { requiredTags: [] } },
  ]);

  assert.deepEqual(migrated[0].conditions.requiredTags, ['Contato Inicial']);
  assert.equal(migrated[0].conditions.pipelineId, 'name:Funil de vendas');
  assert.equal(migrated[0].priority, 10);
  assert.equal(migrated[0].stopAfterMatch, false);
  assert.deepEqual(migrated[0].conditions.allowedStageNames, [
    'Contato Inicial',
    'Primeiro Contato (Prioridade)',
  ]);
  assert.equal(migrated[0].conditions.stopAtStageName, 'Lead');
  assert.deepEqual(migrated[1].conditions.requiredTags, ['Contato Inicial']);
  assert.equal(migrated[1].conditions.pipelineId, 'name:Funil de vendas');
  assert.equal(migrated[1].priority, 100);
  assert.equal(migrated[1].stopAfterMatch, true);
  assert.deepEqual(migrated[1].conditions.allowedStageNames, [
    'Contato Inicial',
    'Primeiro Contato (Prioridade)',
  ]);
  assert.equal(migrated[1].conditions.stopAtStageName, 'Lead');
});

test('automação principal versionada inicia pausada e usa Novo Lead Criado', () => {
  const mainAutomation = automations.find(item => item.id === 'aut-default-ia');
  assert.ok(mainAutomation);
  assert.equal(mainAutomation.active, false);
  assert.equal(mainAutomation.trigger, 'lead_add');
});

test('prompt principal envia o link do Netlify e não usa tools do Google Agenda', () => {
  const mainAutomation = automations.find(item => item.id === 'aut-default-ia');
  const prompt = mainAutomation?.actions?.find(item => item.type === 'ai_chat')?.customPrompt || '';
  assert.match(prompt, /https:\/\/stunning-croquembouche-c01dde\.netlify\.app\//);
  assert.doesNotMatch(prompt, /GET_ALL_CALENDAR|UPDATE_CALENDAR|REMOVE_CALENDAR_GUEST/);
  assert.doesNotMatch(prompt, /\]\(https:\/\/stunning-croquembouche-c01dde\.netlify\.app\//);
});

test('migração é idempotente e não duplica a tag', () => {
  const original = [{ id: 'aut-default-ia', conditions: { requiredTags: ['Contato Inicial'] } }];
  const once = migrateAutomationSafety(original);
  const twice = migrateAutomationSafety(once);
  assert.deepEqual(twice, once);
});
