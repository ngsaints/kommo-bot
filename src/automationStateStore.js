import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE_FILE = path.join(__dir, '..', 'data', 'automation-state.json');

export function readAutomationState(filePath = DEFAULT_STATE_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data.active !== false;
    }
  } catch (err) {
    console.error('Erro ao ler estado do motor de automações:', err.message);
  }
  // Falha fechada: em deploy novo ou sem volume persistente, o motor inicia pausado.
  return false;
}

export function writeAutomationState(active, filePath = DEFAULT_STATE_FILE) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const state = {
    active: active === true,
    changedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  return state.active;
}

export default { readAutomationState, writeAutomationState };
