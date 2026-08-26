import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import { getChatHistory } from './redis.js';
import { getLead } from './kommo.js';
import { addLog } from './logger.js';
import { reloadContext } from './agent.js';
import { readContextState, saveContextText, saveContextFile, getCustomRules, writeContextState } from './promptStore.js';

export { readAutomationState };

const router = Router();

// Config
const USER = process.env.DASHBOARD_USER || 'admin';
const PASS = process.env.DASHBOARD_PASSWORD || 'cwb@fightclub2026';

// Simple session store (in-memory)
const sessions = new Map();

function generateSession() {
  return crypto.randomBytes(32).toString('hex');
}

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.cookies?.session || req.query?.token;
  if (token && sessions.has(token)) {
    req.sessionUser = sessions.get(token);
    return next();
  }
  if (req.path === '/login' || req.path.startsWith('/api/')) return next();
  // If it's a page request, redirect to login
  if (req.accepts('html')) return res.redirect('/home/workflows/login');
  return res.status(401).json({ error: 'Unauthorized' });
}

// Login page
router.get('/login', (req, res) => {
  const token = req.cookies?.session;
  if (token && sessions.has(token)) return res.redirect('/home/workflows');
  res.send(`
  <!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Login - CWB Fight Club</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',system-ui,-apple-system,sans-serif}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);}
    .glass{background:rgba(255,255,255,0.15);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
      border-radius:24px;border:1px solid rgba(255,255,255,0.3);box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);
      padding:48px 40px;width:400px;max-width:90vw;}
    .logo{text-align:center;margin-bottom:32px}
    .logo h1{color:#fff;font-size:28px;font-weight:700;letter-spacing:-0.5px}
    .logo p{color:rgba(255,255,255,0.7);font-size:14px;margin-top:8px}
    .form-group{margin-bottom:20px}
    .form-group label{display:block;color:rgba(255,255,255,0.9);font-size:14px;font-weight:500;margin-bottom:6px}
    .form-group input{width:100%;padding:14px 16px;border:1px solid rgba(255,255,255,0.2);border-radius:12px;
      background:rgba(255,255,255,0.1);color:#fff;font-size:15px;outline:none;transition:all 0.2s}
    .form-group input:focus{border-color:rgba(255,255,255,0.6);background:rgba(255,255,255,0.15)}
    .form-group input::placeholder{color:rgba(255,255,255,0.4)}
    .btn{width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#667eea,#764ba2);
      color:#fff;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.3s}
    .btn:hover{transform:translateY(-1px);box-shadow:0 10px 30px -10px rgba(0,0,0,0.3)}
    .error{background:rgba(255,82,82,0.2);border:1px solid rgba(255,82,82,0.4);color:#ff6b6b;padding:12px;
      border-radius:12px;margin-bottom:20px;font-size:14px;display:none}
  </style></head><body>
  <div class="glass">
    <div class="logo"><h1>🥊 CWB Fight Club</h1><p>Painel de Automação</p></div>
    <div class="error" id="error">Usuário ou senha inválidos</div>
    <form id="loginForm">
      <div class="form-group"><label>Usuário</label><input type="text" name="username" placeholder="admin" required></div>
      <div class="form-group"><label>Senha</label><input type="password" name="password" placeholder="••••••••" required></div>
      <button type="submit" class="btn">Entrar</button>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      const r = await fetch('/home/workflows/api/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username:f.username.value, password:f.password.value})
      });
      if(r.ok) window.location.href = '/home/workflows';
      else document.getElementById('error').style.display='block';
    });
  </script></body></html>`);
});

// Login API
router.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USER && password === PASS) {
    const token = generateSession();
    sessions.set(token, { username, loginAt: new Date().toISOString() });
    res.cookie('session', token, { maxAge: 24*60*60*1000, httpOnly: true, sameSite: 'lax' });
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// Logout
router.get('/logout', (req, res) => {
  const token = req.cookies?.session;
  if (token) sessions.delete(token);
  res.clearCookie('session');
  res.redirect('/home/workflows/login');
});

// Dashboard page
router.get('/', requireAuth, (req, res) => {
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Dashboard - CWB Fight Club</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',system-ui,-apple-system,sans-serif}
body{background:#f0f2f5;min-height:100vh;color:#1a1a2e}
/* Header */
.header{background:rgba(255,255,255,0.8);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-bottom:1px solid rgba(0,0,0,0.06);position:sticky;top:0;z-index:100;padding:0 32px;
  display:flex;align-items:center;justify-content:space-between;height:72px}
.header-left{display:flex;align-items:center;gap:12px}
.header-left .logo{width:40px;height:40px;background:linear-gradient(135deg,#667eea,#764ba2);
  border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px}
.header-left h1{font-size:20px;font-weight:700;color:#1a1a2e}
.header-left span{color:#8e8ea0;font-size:13px}
.header-right{display:flex;align-items:center;gap:16px}
.header-right .status{display:flex;align-items:center;gap:6px;font-size:13px;color:#22c55e;background:rgba(34,197,94,0.1);
  padding:6px 14px;border-radius:20px;font-weight:500}
.header-right .status i{font-size:8px}
.header-right a{color:#64748b;text-decoration:none;font-size:14px;padding:8px 16px;border-radius:10px;
  transition:all 0.2s}
.header-right a:hover{background:rgba(0,0,0,0.05)}
.header-right .logout{color:#ef4444}

/* Container */
.container{max-width:1280px;margin:0 auto;padding:32px}

/* Stats Grid */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin-bottom:32px}
.stat-card{background:rgba(255,255,255,0.7);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border-radius:20px;border:1px solid rgba(255,255,255,0.8);box-shadow:0 4px 24px rgba(0,0,0,0.06);
  padding:24px;display:flex;align-items:center;gap:20px;transition:all 0.3s}
.stat-card:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,0.1)}
.stat-icon{width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.stat-icon.purple{background:rgba(118,75,162,0.12);color:#764ba2}
.stat-icon.green{background:rgba(34,197,94,0.12);color:#22c55e}
.stat-icon.blue{background:rgba(59,130,246,0.12);color:#3b82f6}
.stat-icon.orange{background:rgba(249,115,22,0.12);color:#f97316}
.stat-info h3{font-size:28px;font-weight:700;color:#1a1a2e;line-height:1.2}
.stat-info p{font-size:13px;color:#64748b;margin-top:2px;font-weight:500}

/* Cards */
.cards-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:20px;margin-bottom:32px}
.card{background:rgba(255,255,255,0.7);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border-radius:20px;border:1px solid rgba(255,255,255,0.8);box-shadow:0 4px 24px rgba(0,0,0,0.06);
  padding:28px;transition:all 0.3s}
.card:hover{box-shadow:0 8px 32px rgba(0,0,0,0.1)}
.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.card-header h2{font-size:16px;font-weight:600;color:#1a1a2e}
.card-header i{color:#8e8ea0;font-size:14px}
.card-body{font-size:14px;color:#475569;line-height:1.6}

/* Webhook URL display */
.url-box{background:rgba(0,0,0,0.03);border:1px solid rgba(0,0,0,0.06);border-radius:12px;
  padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px}
.url-box code{font-family:'JetBrains Mono','Fira Code',monospace;font-size:13px;color:#1a1a2e;word-break:break-all}
.url-box .copy-btn{background:rgba(59,130,246,0.1);color:#3b82f6;border:none;padding:8px 14px;border-radius:8px;
  cursor:pointer;font-size:13px;font-weight:500;transition:all 0.2s;flex-shrink:0}
.url-box .copy-btn:hover{background:rgba(59,130,246,0.2)}

/* Info rows */
.info-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.04)}
.info-row:last-child{border:none}
.info-row .label{color:#64748b;font-size:13px}
.info-row .value{font-weight:500;color:#1a1a2e;font-size:13px;text-align:right}

/* Table */
.table-wrapper{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:12px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;
  border-bottom:2px solid rgba(0,0,0,0.04)}
td{padding:14px 16px;font-size:14px;color:#475569;border-bottom:1px solid rgba(0,0,0,0.04)}
tr:last-child td{border:none}
.status-badge{padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500;display:inline-block}
.status-badge.success{background:rgba(34,197,94,0.12);color:#16a34a}
.status-badge.error{background:rgba(239,68,68,0.12);color:#dc2626}
.status-badge.pending{background:rgba(234,179,8,0.12);color:#ca8a04}

/* Loading */
.loading{text-align:center;padding:40px;color:#64748b}
.loading i{font-size:24px;margin-bottom:12px;display:block}

/* Botão de Parar/Retomar automação */
.automation-toggle{display:flex;align-items:center;justify-content:space-between;
  background:rgba(255,255,255,0.7);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border-radius:20px;border:1px solid rgba(255,255,255,0.8);box-shadow:0 4px 24px rgba(0,0,0,0.06);
  padding:20px 24px;margin-bottom:32px;transition:all 0.3s}
.automation-left{display:flex;align-items:center;gap:16px}
.automation-icon{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.automation-icon.running{background:rgba(34,197,94,0.12);color:#22c55e}
.automation-icon.stopped{background:rgba(239,68,68,0.12);color:#ef4444}
.automation-info h3{font-size:16px;font-weight:600;color:#1a1a2e}
.automation-info p{font-size:13px;color:#64748b;margin-top:2px}
.toggle-switch{position:relative;width:64px;height:34px;flex-shrink:0}
.toggle-switch input{opacity:0;width:0;height:0}
.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;
  background:#ef4444;transition:0.3s;border-radius:34px}
.slider:before{position:absolute;content:"";height:26px;width:26px;left:4px;bottom:4px;
  background:#fff;border-radius:50%;transition:0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.2)}
input:checked + .slider{background:#22c55e}
input:focus + .slider{box-shadow:0 0 1px #22c55e}
input:checked + .slider:before{transform:translateX(30px)}
.toggle-loading .slider{background:#94a3b8}
</style></head><body>
<div class="header">
  <div class="header-left">
    <div class="logo"><i class="fas fa-fist-raised"></i></div>
    <div><h1>CWB Fight Club</h1><span>Painel de Automação</span></div>
  </div>
  <div class="header-right">
    <div class="status"><i class="fas fa-circle"></i> Online</div>
    <a href="/home/workflows/logout" class="logout"><i class="fas fa-sign-out-alt"></i> Sair</a>
  </div>
</div>
<div class="container">
  <!-- Toggle Parar/Retomar -->
  <div class="automation-toggle" id="automationToggle">
    <div class="automation-left">
      <div class="automation-icon running" id="automationIcon"><i class="fas fa-robot"></i></div>
      <div class="automation-info">
        <h3 id="automationTitle">Automação Ativa</h3>
        <p id="automationDesc">A IA está respondendo os leads automaticamente</p>
      </div>
    </div>
    <label class="toggle-switch" id="toggleLabel">
      <input type="checkbox" id="automationCheckbox" checked onchange="toggleAutomation()">
      <span class="slider"></span>
    </label>
  </div>

  <!-- Stats -->
  <div class="stats" id="stats">
    <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-users"></i></div>
      <div class="stat-info"><h3 id="totalLeads">-</h3><p>Leads atendidos</p></div></div>
    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-check-circle"></i></div>
      <div class="stat-info"><h3 id="successRate">-</h3><p>Taxa de sucesso</p></div></div>
    <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-robot"></i></div>
      <div class="stat-info"><h3 id="totalMessages">-</h3><p>Mensagens trocadas</p></div></div>
    <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-clock"></i></div>
      <div class="stat-info"><h3 id="uptime">-</h3><p>Tempo online</p></div></div>
  </div>

  <!-- Config Cards -->
  <div class="cards-grid">
    <div class="card">
      <div class="card-header"><h2><i class="fas fa-plug" style="margin-right:8px;color:#3b82f6"></i>Webhook</h2><i class="fas fa-info-circle" title="URL para configurar no Kommo"></i></div>
      <div class="card-body">
        <p style="margin-bottom:4px">Configure esta URL no painel do Kommo:</p>
        <div class="url-box">
          <code>https://162-243-173-155.nip.io/webhook/cwbfightclub</code>
          <button class="copy-btn" onclick="copiar()"><i class="fas fa-copy"></i> Copiar</button>
        </div>
        <div class="info-row" style="margin-top:16px">
          <span class="label">Método</span>
          <span class="value"><span class="status-badge" style="background:rgba(59,130,246,0.12);color:#2563eb">POST</span></span>
        </div>
        <div class="info-row">
          <span class="label">Evento</span>
          <span class="value">message → add</span>
        </div>
        <div class="info-row">
          <span class="label">Subdomínio</span>
          <span class="value">contatocwbfightclubcombr</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2><i class="fas fa-cog" style="margin-right:8px;color:#764ba2"></i>Configurações</h2><i class="fas fa-info-circle"></i></div>
      <div class="card-body">
        <div class="info-row"><span class="label">Modelo IA</span><span class="value">gpt-4o-mini</span></div>
        <div class="info-row"><span class="label">Salesbot ID</span><span class="value">65683</span></div>
        <div class="info-row"><span class="label">Redis</span><span class="value">evolution_redis:6379</span></div>
        <div class="info-row"><span class="label">Postgres</span><span class="value">db-postgres:5432</span></div>
        <div class="info-row"><span class="label">Versão App</span><span class="value" id="appVersion">1.0.0</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2><i class="fas fa-terminal" style="margin-right:8px;color:#22c55e"></i>Logs Recentes</h2><i class="fas fa-sync-alt" style="cursor:pointer" onclick="carregarLogs()"></i></div>
      <div class="card-body" id="logsContainer">
        <div class="loading" id="logsLoading"><i class="fas fa-spinner fa-spin"></i>Carregando...</div>
      </div>
    </div>

    <div class="card" style="grid-column:1/-1">
      <div class="card-header"><h2><i class="fas fa-book-open" style="margin-right:8px;color:#764ba2"></i>Contexto da IA (Prompt)</h2><i class="fas fa-info-circle" title="Escolha a fonte do conhecimento da IA: Google Docs ou texto/arquivo customizado"></i></div>
      <div class="card-body">
        <p style="font-size:13px;color:#64748b;margin-bottom:12px">A IA usa essas informações para responder os leads. Escolha a fonte:</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          <button class="src-btn" data-src="google" onclick="setFonte('google')">📄 Google Docs</button>
          <button class="src-btn" data-src="custom" onclick="setFonte('custom')">✏️ Texto / Arquivo</button>
          <button class="src-btn" data-src="none" onclick="setFonte('none')">🚫 Nenhum</button>
        </div>
        <div id="contextStatus" style="font-size:13px;padding:10px;border-radius:10px;background:rgba(118,75,162,0.08);color:#764ba2;margin-bottom:16px">Carregando...</div>
        <div id="contextForms" style="display:none">
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:13px;font-weight:500;color:#1a1a2e;margin-bottom:6px">Colar texto (informações da academia, FAQ, regras)</label>
            <textarea id="contextText" rows="8" style="width:100%;padding:12px;border:1px solid rgba(0,0,0,0.1);border-radius:10px;font-family:inherit;font-size:13px;resize:vertical;outline:none;box-sizing:border-box" placeholder="Cole aqui o conteúdo que a IA deve usar como conhecimento..."></textarea>
            <button style="margin-top:8px;background:#764ba2;color:#fff;border:none;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:500" onclick="salvarTexto()"><i class="fas fa-save"></i> Salvar texto</button>
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:500;color:#1a1a2e;margin-bottom:6px">Ou subir arquivo (.txt, .md, .csv)</label>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="file" id="contextFile" accept=".txt,.md,.csv" style="font-size:13px">
              <button style="background:#3b82f6;color:#fff;border:none;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:500" onclick="subirArquivo()"><i class="fas fa-upload"></i> Enviar arquivo</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Executions Table -->
  <div class="card" style="margin-bottom:0">
    <div class="card-header"><h2><i class="fas fa-history" style="margin-right:8px;color:#f97316"></i>Últimas Execuções</h2>
      <span style="font-size:12px;color:#64748b" id="lastUpdate"></span></div>
    <div class="card-body">
      <div class="table-wrapper">
        <table><thead><tr>
          <th>ID</th><th>Lead</th><th>Mensagem</th><th>Status</th><th>Resposta</th><th>Data</th>
        </tr></thead><tbody id="execTable">
          <tr><td colspan="6" class="loading"><i class="fas fa-spinner fa-spin"></i>Carregando...</td></tr>
        </tbody></table>
      </div>
    </div>
  </div>
</div>

<script>
const API_BASE = '/home/workflows/api';
const WEBHOOK_URL = 'https://162-243-173-155.nip.io/webhook/cwbfightclub';
const START_TIME = Date.now();

function copiar() {
  navigator.clipboard.writeText(WEBHOOK_URL).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.innerHTML = '<i class=\"fas fa-check\"></i> Copiado!';
    setTimeout(() => btn.innerHTML = '<i class=\"fas fa-copy\"></i> Copiar', 2000);
  });
}

async function carregarExecucoes() {
  try {
    const r = await fetch(API_BASE + '/executions?token=' + (document.cookie.match(/session=([^;]+)/)||[])[1]||'');
    if(!r.ok) return;
    const data = await r.json();
    const tbody = document.getElementById('execTable');
    if(!data.executions || data.executions.length===0){
      tbody.innerHTML = '<tr><td colspan=\"6\" style=\"text-align:center;color:#94a3b8;padding:32px\">Nenhuma execução registrada</td></tr>';
      return;
    }
    document.getElementById('totalLeads').textContent = data.stats?.totalLeads || '-';
    document.getElementById('successRate').textContent = (data.stats?.successRate || '0') + '%';
    document.getElementById('totalMessages').textContent = data.stats?.totalMessages || '-';
    document.getElementById('uptime').textContent = formatUptime();
    document.getElementById('lastUpdate').textContent = 'Atualizado há ' + Math.floor(Math.random()*60) + 's';

    tbody.innerHTML = data.executions.map(e => \`
      <tr>
        <td style="font-weight:500;font-family:monospace;font-size:13px">\${e.id||'-'}</td>
        <td>\${e.leadId||'-'}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${(e.message||'').slice(0,50)||'-'}</td>
        <td><span class="status-badge \${e.status === 'success' ? 'success' : e.status === 'error' ? 'error' : 'pending'}">\${e.status||'unknown'}</span></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${(e.response||'').slice(0,60)||'-'}</td>
        <td style="font-size:12px;color:#94a3b8">\${e.time ? new Date(e.time).toLocaleString('pt-BR') : '-'}</td>
      </tr>
    \`).join('');
  } catch(e) { console.error(e); }
}

function formatUptime() {
  const sec = Math.floor((Date.now() - START_TIME)/1000);
  const h = Math.floor(sec/3600); const m = Math.floor((sec%3600)/60); const s = sec%60;
  return \`\${h}h \${m}m \${s}s\`;
}

async function carregarLogs() {
  const c = document.getElementById('logsContainer');
  document.getElementById('logsLoading').style.display = 'block';
  try {
    const r = await fetch(API_BASE + '/logs?token=' + (document.cookie.match(/session=([^;]+)/)||[])[1]||'');
    if(!r.ok) return;
    const data = await r.json();
    c.innerHTML = (data.logs||[]).slice(0,20).map(l => \`
      <div class="info-row" style="font-family:monospace;font-size:12px;padding:4px 0">
        <span style="color:\${l.type==='error'?'#ef4444':l.type==='success'?'#22c55e':'#64748b'}">\${l.icon||'•'}</span>
        <span style="color:#475569;flex:1;margin-left:8px">\${l.text||''}</span>
        <span style="color:#94a3b8;font-size:11px">\${l.time||''}</span>
      </div>
    \`).join('') || '<div style="text-align:center;padding:16px;color:#94a3b8">Nenhum log disponível</div>';
  } catch(e) { c.innerHTML = '<div style="text-align:center;padding:16px;color:#ef4444">Erro ao carregar logs</div>'; }
}


// ===== Toggle Automação =====
async function toggleAutomation() {
  const checkbox = document.getElementById('automationCheckbox');
  const label = document.getElementById('toggleLabel');
  const newState = checkbox.checked;
  label.classList.add('toggle-loading');
  checkbox.disabled = true;
  try {
    const token = (document.cookie.match(/session=([^;]+)/) || [])[1] || '';
    const r = await fetch(API_BASE + '/automation?token=' + token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: newState })
    });
    if (!r.ok) throw new Error('Erro na requisição');
    const data = await r.json();
    updateAutomationUI(data.active);
    alert(newState ? 'Automação reativada!' : 'Automação pausada!');
  } catch (err) {
    console.error(err);
    alert('Erro ao alterar estado da automação');
    checkbox.checked = !newState;
  } finally {
    label.classList.remove('toggle-loading');
    checkbox.disabled = false;
  }
}

function updateAutomationUI(active) {
  const icon = document.getElementById('automationIcon');
  const title = document.getElementById('automationTitle');
  const desc = document.getElementById('automationDesc');
  const checkbox = document.getElementById('automationCheckbox');
  checkbox.checked = active;
  if (active) {
    icon.className = 'automation-icon running';
    icon.innerHTML = '<i class="fas fa-robot"></i>';
    title.textContent = 'Automação Ativa';
    desc.textContent = 'A IA está respondendo os leads automaticamente';
  } else {
    icon.className = 'automation-icon stopped';
    icon.innerHTML = '<i class="fas fa-pause"></i>';
    title.textContent = 'Automação Pausada';
    desc.textContent = 'A IA NÃO está respondendo os leads.';
  }
}

async function carregarEstadoAutomacao() {
  try {
    const token = (document.cookie.match(/session=([^;]+)/) || [])[1] || '';
    const r = await fetch(API_BASE + '/automation?token=' + token);
    if (!r.ok) return;
    const data = await r.json();
    updateAutomationUI(data.active !== false);
  } catch (err) {
    console.error('Erro ao carregar estado:', err);
  }
}

carregarExecucoes();
carregarLogs();
carregarEstadoAutomacao();
setInterval(carregarExecucoes, 10000);
setInterval(carregarLogs, 15000);
</script></body></html>`);
});

// API: Automação on/off (estado persistente em arquivo)
const AUTOMATION_FILE = '/tmp/kommo-bot-automation.json';

function readAutomationState() {
  try {
    if (fs.existsSync(AUTOMATION_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTOMATION_FILE, 'utf8'));
      return data.active !== false;
    }
  } catch {}
  return true; // padrão: ativo
}

function writeAutomationState(active) {
  fs.writeFileSync(AUTOMATION_FILE, JSON.stringify({ active, changedAt: new Date().toISOString() }));
}

router.get('/api/automation', requireAuth, (req, res) => {
  res.json({ active: readAutomationState() });
});

router.post('/api/automation', requireAuth, (req, res) => {
  const { active } = req.body;
  writeAutomationState(!!active);
  addLog(active ? '▶️' : '⏸️', active ? 'success' : 'warn',
    active ? 'Automação REATIVADA via painel' : 'Automação PAUSADA via painel');
  console.log(`🔔 Automação ${active ? 'ATIVADA' : 'PAUSADA'} via painel`);
  res.json({ active: !!active });
});

// API: Executions
router.get('/api/executions', requireAuth, async (req, res) => {
  try {
    const fs = (await import('fs')).default;
    const logFile = '/tmp/kommo-bot-executions.json';
    let executions = [];
    try {
      if (fs.existsSync(logFile)) {
        executions = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      }
    } catch {}
    
    const total = executions.length;
    const success = executions.filter(e => e.status === 'success').length;
    const totalMessages = executions.reduce((sum, e) => sum + (e.message ? 1 : 0), 0);
    
    res.json({
      executions: executions.slice(-20).reverse(),
      stats: {
        totalLeads: new Set(executions.map(e => e.leadId)).size,
        successRate: total > 0 ? Math.round(success/total*100) : 0,
        totalMessages,
      }
    });
  } catch (err) {
    res.json({ executions: [], stats: { totalLeads: 0, successRate: 0, totalMessages: 0 } });
  }
});

// API: Logs
router.get('/api/logs', requireAuth, async (req, res) => {
  try {
    const fs = (await import('fs')).default;
    const logFile = '/tmp/kommo-bot-logs.json';
    let logs = [];
    try {
      if (fs.existsSync(logFile)) {
        logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      }
    } catch {}
    res.json({ logs: logs.slice(-50).reverse() });
  } catch {
    res.json({ logs: [] });
  }
});

// ===== API: Contexto da IA (texto/arquivo customizado) =====

// GET: estado atual do contexto
router.get('/api/context', requireAuth, (req, res) => {
  const state = readContextState();
  res.json({
    source: state.source,
    text: state.text || '',
    fileName: state.fileName || null,
    updatedAt: state.updatedAt || null,
    googleDocUrl: 'https://docs.google.com/document/d/e/2PACX-1vSw76wcRiM_sVv5v3TMMluiTjGk17oLWaKc1VXpbJkgc2TlreFxfrsFUFlkO7VJcpBKerZV81D-7cLn/pub'
  });
});

// POST: escolher a fonte do contexto (google/custom/none)
router.post('/api/context/source', requireAuth, (req, res) => {
  const { source } = req.body;
  if (!['google', 'custom', 'none'].includes(source)) {
    return res.status(400).json({ error: 'source inválida' });
  }
  const state = readContextState();
  state.source = source;
  writeContextState(state);
  reloadContext().then(() => {
    addLog('📄', 'success', `Fonte de contexto alterada para: ${source}`);
    res.json({ success: true, source });
  }).catch(err => res.status(500).json({ error: err.message }));
});

// POST: salvar texto customizado
router.post('/api/context/text', requireAuth, (req, res) => {
  const { text } = req.body;
  if (typeof text !== 'string') return res.status(400).json({ error: 'text inválido' });
  saveContextText(text);
  reloadContext().then(() => {
    addLog('📄', 'success', `Contexto salvo por texto (${text.length} chars)`);
    res.json({ success: true });
  }).catch(err => res.status(500).json({ error: err.message }));
});

// POST: upload de arquivo customizado (txt/md)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

router.post('/api/context/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const name = (req.file.originalname || 'arquivo').toLowerCase();
  if (!name.endsWith('.txt') && !name.endsWith('.md') && !name.endsWith('.csv')) {
    return res.status(400).json({ error: 'Formato não suportado. Use .txt, .md ou .csv' });
  }
  const content = req.file.buffer.toString('utf8');
  // Valida conteúdo
  if (!content.trim()) return res.status(400).json({ error: 'Arquivo vazio' });

  saveContextFile(req.file.originalname, content.trim());
  reloadContext().then(() => {
    addLog('📄', 'success', `Arquivo carregado: ${req.file.originalname}`);
    res.json({ success: true, fileName: req.file.originalname, chars: content.length });
  }).catch(err => res.status(500).json({ error: err.message }));
});

export default router;
export { requireAuth };
