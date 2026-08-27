import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readAutomationState, writeAutomationState } from '../src/automationStateStore.js';

test('motor inicia ativo e mantém o estado salvo após nova leitura', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kommo-state-'));
  const file = path.join(dir, 'automation-state.json');
  try {
    assert.equal(readAutomationState(file), true);
    writeAutomationState(false, file);
    assert.equal(readAutomationState(file), false);
    writeAutomationState(true, file);
    assert.equal(readAutomationState(file), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
