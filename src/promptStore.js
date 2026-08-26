import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dir, '..', 'data');
const CONTEXT_FILE = path.join(DATA_DIR, 'context.json');
const RULES_FILE = path.join(DATA_DIR, 'custom-rules.txt');

// Garante que o diretório de dados existe
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Estrutura do contexto customizado:
 * {
 *   source: 'google' | 'custom' | 'none',   // qual fonte usar
 *   text: string,                             // texto colado manualmente
 *   fileName: string|null,                    // nome do arquivo enviado
 *   updatedAt: string
 * }
 */
function defaultState() {
  return { source: 'google', text: '', fileName: null, updatedAt: null };
}

export function readContextState() {
  try {
    if (fs.existsSync(CONTEXT_FILE)) {
      const s = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
      return { ...defaultState(), ...s };
    }
  } catch {}
  return defaultState();
}

export function writeContextState(state) {
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
}

/**
 * Retorna o conteúdo de contexto efetivamente usado pela IA:
 * - Se source === 'custom': usa o texto customizado (colado ou arquivo)
 * - Se source === 'google': retorna null (o agent.js deve buscar no Google Docs)
 * - Se source === 'none': retorna string vazia
 */
export function getCustomContext() {
  const s = readContextState();
  if (s.source === 'custom') {
    if (s.text && s.text.trim()) return s.text.trim();
    // fallback: conteúdo do arquivo salvo
    try {
      if (fs.existsSync(RULES_FILE)) return fs.readFileSync(RULES_FILE, 'utf8').trim();
    } catch {}
    return null;
  }
  return null;
}

export function getCustomRules() {
  try {
    if (fs.existsSync(RULES_FILE)) return fs.readFileSync(RULES_FILE, 'utf8').trim();
  } catch {}
  return '';
}

export function saveContextText(text) {
  const s = readContextState();
  s.source = 'custom';
  s.text = text;
  s.fileName = null;
  writeContextState(s);
  return s;
}

export function saveContextFile(fileName, content) {
  fs.writeFileSync(RULES_FILE, content);
  const s = readContextState();
  s.source = 'custom';
  s.text = content;
  s.fileName = fileName;
  writeContextState(s);
  return s;
}

export default {
  readContextState,
  writeContextState,
  getCustomContext,
  getCustomRules,
  saveContextText,
  saveContextFile,
};