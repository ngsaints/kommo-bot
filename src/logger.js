import fs from 'fs';

const EXEC_FILE = '/tmp/kommo-bot-executions.json';
const LOG_FILE = '/tmp/kommo-bot-logs.json';

let executions = [];
let logs = [];

export function initLogger() {
  try {
    if (fs.existsSync(EXEC_FILE)) {
      executions = JSON.parse(fs.readFileSync(EXEC_FILE, 'utf8'));
    }
  } catch {}
  try {
    if (fs.existsSync(LOG_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  } catch {}
  
  console.log(`📝 Logger iniciado: ${executions.length} execuções, ${logs.length} logs`);
}

export function addExecution(data) {
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ...data,
    time: data.time || new Date().toISOString(),
  };
  executions.push(entry);
  // Keep last 500
  if (executions.length > 500) executions = executions.slice(-500);
  try {
    fs.writeFileSync(EXEC_FILE, JSON.stringify(executions, null, 2));
  } catch (err) {
    console.error('Erro ao salvar execuções:', err.message);
  }
  return entry;
}

export function addLog(icon, type, text) {
  const entry = {
    icon,
    type: type || 'info',
    text,
    time: new Date().toLocaleString('pt-BR'),
  };
  logs.push(entry);
  if (logs.length > 500) logs = logs.slice(-500);
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch {}
  return entry;
}

export default { initLogger, addExecution, addLog };