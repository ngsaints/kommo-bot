import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateAutomationSafety } from '../src/automationsStore.js';

test('migra regras persistidas antigas para o escopo Contato Inicial', () => {
  const migrated = migrateAutomationSafety([
    { id: 'aut-default-ia', conditions: { pipelineId: 'all', stageId: 'all', requiredTags: [] } },
    { id: 'aut-transfer-human', conditions: { requiredTags: [] } },
  ]);

  assert.deepEqual(migrated[0].conditions.requiredTags, ['Contato Inicial']);
  assert.equal(migrated[0].priority, 10);
  assert.equal(migrated[0].stopAfterMatch, false);
  assert.equal(migrated[0].conditions.stopAtStageName, 'Lead');
  assert.deepEqual(migrated[1].conditions.requiredTags, ['Contato Inicial']);
  assert.equal(migrated[1].priority, 100);
  assert.equal(migrated[1].stopAfterMatch, true);
  assert.equal(migrated[1].conditions.stopAtStageName, 'Lead');
});

test('migração é idempotente e não duplica a tag', () => {
  const original = [{ id: 'aut-default-ia', conditions: { requiredTags: ['Contato Inicial'] } }];
  const once = migrateAutomationSafety(original);
  const twice = migrateAutomationSafety(once);
  assert.deepEqual(twice, once);
});
