import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTagMutation } from '../src/kommo.js';

test('adicionar tag usa mutação incremental e não substitui tags existentes', () => {
  assert.deepEqual(buildTagMutation('add', 'Em Atendimento IA'), {
    _embedded: {
      tags_to_add: [{ name: 'Em Atendimento IA' }],
    },
  });
  assert.equal('tags' in buildTagMutation('add', 'Em Atendimento IA')._embedded, false);
});

test('remover tag informa somente a tag escolhida', () => {
  assert.deepEqual(buildTagMutation('remove', 'Em Atendimento IA'), {
    _embedded: {
      tags_to_delete: [{ name: 'Em Atendimento IA' }],
    },
  });
});
