import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import { getChatHistory } from './redis.js';
import { getLead, getPipelines, createPipeline, getCustomFields } from './kommo.js';
import { addLog } from './logger.js';
import { reloadContext } from './agent.js';
import { readContextState, saveContextText, saveContextFile, writeContextState } from './promptStore.js';
import {
  readAutomations,
  getAutomation,
  saveAutomation,
  toggleAutomation,
  deleteAutomation
} from './automationsStore.js';

export { readAutomationState };

const router = Router();

// Config
const USER = process.env.DASHBOARD_USER || 'admin';
const PASS = process.env.DASHBOARD_PASSWORD || 'cwb@fightclub2026';

// Sessões em memória
const sessions = new Map();

function generateSession() {
  return crypto.randomBytes(32).toString('hex');
}

// Middleware de Autenticação
function requireAuth(req, res, next) {
  const token = req.cookies?.session || req.query?.token;
  if (token && sessions.has(token)) {
    req.sessionUser = sessions.get(token);
    return next();
  }
  if (req.path === '/login' || req.path.startsWith('/api/login')) return next();
  if (req.accepts('html')) return res.redirect('/home/workflows/login');
  return res.status(401).json({ error: 'Unauthorized' });
}

// ===== TELA DE LOGIN (Clean White SaaS Style - Sem Emojis) =====
router.get('/login', (req, res) => {
  const token = req.cookies?.session;
  if (token && sessions.has(token)) return res.redirect('/home/workflows');
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Login - Gestão de Automações</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f8fafc;
      color: #0f172a;
      padding: 20px;
    }
    .login-container {
      width: 100%;
      max-width: 420px;
    }
    .brand-header {
      text-align: center;
      margin-bottom: 28px;
    }
    .brand-icon {
      width: 48px;
      height: 48px;
      background: #2563eb;
      color: #ffffff;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      margin-bottom: 12px;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
    }
    .brand-header h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .brand-header p {
      font-size: 14px;
      color: #64748b;
      margin-top: 4px;
    }
    .login-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.05), 0 8px 10px -6px rgba(15, 23, 42, 0.02);
      padding: 32px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 8px;
    }
    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }
    .input-wrapper i {
      position: absolute;
      left: 14px;
      color: #94a3b8;
      font-size: 15px;
    }
    .input-wrapper input {
      width: 100%;
      padding: 12px 14px 12px 40px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      font-size: 14px;
      color: #0f172a;
      background: #ffffff;
      outline: none;
      transition: all 0.2s ease;
    }
    .input-wrapper input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }
    .input-wrapper input::placeholder {
      color: #94a3b8;
    }
    .btn-primary {
      width: 100%;
      padding: 12px 16px;
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s ease, transform 0.1s ease;
    }
    .btn-primary:hover {
      background: #1d4ed8;
    }
    .btn-primary:active {
      transform: scale(0.99);
    }
    .error-alert {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      margin-bottom: 20px;
      display: none;
      align-items: center;
      gap: 8px;
    }
    .login-footer {
      text-align: center;
      margin-top: 24px;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="brand-header">
      <div class="brand-icon"><i class="fas fa-network-wired"></i></div>
      <h1>Central de Automações</h1>
      <p>Gerenciamento inteligente integrado ao Kommo CRM</p>
    </div>
    <div class="login-card">
      <div class="error-alert" id="error">
        <i class="fas fa-exclamation-circle"></i>
        <span>Credenciais de acesso incorretas.</span>
      </div>
      <form id="loginForm">
        <div class="form-group">
          <label for="username">Usuário</label>
          <div class="input-wrapper">
            <i class="fas fa-user"></i>
            <input type="text" id="username" name="username" placeholder="Digite seu usuário" required autofocus>
          </div>
        </div>
        <div class="form-group">
          <label for="password">Senha</label>
          <div class="input-wrapper">
            <i class="fas fa-lock"></i>
            <input type="password" id="password" name="password" placeholder="Digite sua senha" required>
          </div>
        </div>
        <button type="submit" class="btn-primary">
          <span>Acessar Painel</span>
          <i class="fas fa-arrow-right"></i>
        </button>
      </form>
    </div>
    <div class="login-footer">
      Ambiente de Produção &bull; Conexão Segura
    </div>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = f.querySelector('button');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Entrando...</span>';
      
      try {
        const r = await fetch('/home/workflows/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: f.username.value, password: f.password.value })
        });
        if (r.ok) {
          window.location.href = '/home/workflows';
        } else {
          document.getElementById('error').style.display = 'flex';
          btn.disabled = false;
          btn.innerHTML = '<span>Acessar Painel</span><i class="fas fa-arrow-right"></i>';
        }
      } catch (err) {
        document.getElementById('error').style.display = 'flex';
        btn.disabled = false;
        btn.innerHTML = '<span>Acessar Painel</span><i class="fas fa-arrow-right"></i>';
      }
    });
  </script>
</body>
</html>`);
});

// Login API
router.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USER && password === PASS) {
    const token = generateSession();
    sessions.set(token, { username, loginAt: new Date().toISOString() });
    res.cookie('session', token, { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
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

// ===== DASHBOARD PRINCIPAL =====
router.get('/', requireAuth, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Painel de Automações & Funis - Kommo Bot</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    :root {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --success: #16a34a;
      --danger: #dc2626;
      --warning: #d97706;
      --radius: 12px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    body { background-color: var(--bg); color: var(--text-main); min-height: 100vh; display: flex; flex-direction: column; }
    
    /* Top Header */
    .top-header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      height: 68px;
      padding: 0 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon {
      width: 38px; height: 38px; background: var(--primary); color: #fff;
      border-radius: 10px; display: flex; align-items: center; justify-content: center;
      font-size: 18px;
    }
    .brand-title h1 { font-size: 17px; font-weight: 700; color: var(--text-main); line-height: 1.2; }
    .brand-title span { font-size: 12px; color: var(--text-muted); }
    .header-actions { display: flex; align-items: center; gap: 16px; }
    .status-indicator {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
      background: #f0fdf4; color: var(--success); border: 1px solid #bbf7d0;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); }
    .btn-logout {
      color: var(--text-muted); text-decoration: none; font-size: 13px; font-weight: 500;
      padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border);
      transition: all 0.2s ease; display: flex; align-items: center; gap: 6px;
    }
    .btn-logout:hover { background: #fef2f2; color: var(--danger); border-color: #fecaca; }

    /* Navigation Bar / Tabs */
    .tab-nav-wrapper {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 0 32px;
    }
    .tab-nav {
      max-width: 1300px;
      margin: 0 auto;
      display: flex;
      gap: 24px;
    }
    .tab-btn {
      padding: 16px 4px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .tab-btn:hover { color: var(--text-main); }
    .tab-btn.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
    }

    /* Container */
    .main-container {
      max-width: 1300px;
      margin: 0 auto;
      padding: 28px 32px;
      width: 100%;
      flex: 1;
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Global Automation Switch */
    .master-switch-bar {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 20px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .switch-left { display: flex; align-items: center; gap: 14px; }
    .switch-icon {
      width: 42px; height: 42px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .switch-icon.active { background: #f0fdf4; color: var(--success); }
    .switch-icon.inactive { background: #fef2f2; color: var(--danger); }
    .switch-text h3 { font-size: 15px; font-weight: 600; color: var(--text-main); }
    .switch-text p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

    /* Toggle Switch */
    .toggle { position: relative; display: inline-block; width: 48px; height: 26px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #cbd5e1; transition: 0.3s; border-radius: 34px;
    }
    .slider:before {
      position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px;
      background-color: white; transition: 0.3s; border-radius: 50%;
    }
    input:checked + .slider { background-color: var(--success); }
    input:checked + .slider:before { transform: translateX(22px); }

    /* Action Toolbar */
    .section-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .section-title h2 { font-size: 18px; font-weight: 700; color: var(--text-main); }
    .section-title p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
    .btn-create {
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: background 0.2s ease;
    }
    .btn-create:hover { background: var(--primary-hover); }

    /* Automations Grid */
    .automations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 20px;
    }
    .auto-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .auto-card:hover {
      box-shadow: 0 8px 16px -4px rgba(15, 23, 42, 0.06);
      transform: translateY(-2px);
    }
    .auto-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .auto-card-title h3 { font-size: 15px; font-weight: 700; color: var(--text-main); }
    .auto-card-title p { font-size: 13px; color: var(--text-muted); margin-top: 4px; line-height: 1.4; }
    
    .tags-container { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .badge-trigger { background: #eff6ff; color: #1d4ed8; border: 1px solid #dbeafe; }
    .badge-action { background: #f5f3ff; color: #6d28d9; border: 1px solid #ede9fe; }
    .badge-condition { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }

    .auto-card-stats {
      background: #f8fafc;
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      justify-content: space-around;
      margin: 12px 0;
      border: 1px solid #f1f5f9;
    }
    .stat-item { text-align: center; }
    .stat-item .val { font-size: 14px; font-weight: 700; color: var(--text-main); }
    .stat-item .lbl { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

    .auto-card-footer {
      border-top: 1px solid var(--border);
      padding-top: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .card-actions { display: flex; gap: 8px; }
    .btn-icon {
      background: none; border: 1px solid var(--border); border-radius: 6px;
      padding: 6px 10px; font-size: 12px; color: var(--text-muted); cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-icon:hover { background: #f1f5f9; color: var(--text-main); }
    .btn-icon.delete:hover { background: #fef2f2; color: var(--danger); border-color: #fecaca; }

    /* Pipelines Grid */
    .pipelines-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 20px;
    }
    .pipeline-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .pipeline-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9;
    }
    .pipeline-header h3 { font-size: 16px; font-weight: 700; color: var(--text-main); }
    .stage-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; margin-bottom: 6px; background: #f8fafc; border-radius: 6px; font-size: 13px;
      border-left: 4px solid var(--primary);
    }

    /* Overview Stats Cards */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .stat-card-icon {
      width: 46px; height: 46px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center; font-size: 20px;
    }
    .stat-card-icon.blue { background: #eff6ff; color: #2563eb; }
    .stat-card-icon.green { background: #f0fdf4; color: #16a34a; }
    .stat-card-icon.purple { background: #f5f3ff; color: #7c3aed; }
    .stat-card-icon.amber { background: #fffbeb; color: #d97706; }
    .stat-card-info h3 { font-size: 22px; font-weight: 700; color: var(--text-main); line-height: 1.2; }
    .stat-card-info p { font-size: 12px; font-weight: 500; color: var(--text-muted); margin-top: 2px; }

    /* Standard Cards & Tables */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;
    }
    .card-header h2 { font-size: 16px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px; }

    .table-container { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; padding: 12px 14px; font-size: 12px; font-weight: 600;
      color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em;
      border-bottom: 1px solid var(--border); background: #f8fafc;
    }
    td { padding: 14px; font-size: 13px; color: var(--text-main); border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    
    .status-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;
    }
    .status-badge.success { background: #f0fdf4; color: #16a34a; }
    .status-badge.error { background: #fef2f2; color: #dc2626; }
    .status-badge.pending { background: #fffbeb; color: #d97706; }

    /* Form Fields */
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-main); margin-bottom: 6px; }
    .form-control {
      width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px;
      font-size: 13px; color: var(--text-main); background: #fff; outline: none; transition: border-color 0.2s ease;
    }
    .form-control:focus { border-color: var(--primary); }
    textarea.form-control { resize: vertical; min-height: 90px; }

    /* Modal */
    .modal-backdrop {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px);
      display: none; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
    }
    .modal {
      background: #fff; border-radius: 16px; max-width: 650px; width: 100%;
      max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
    }
    .modal-header {
      padding: 20px 24px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .modal-header h3 { font-size: 17px; font-weight: 700; }
    .btn-close { background: none; border: none; font-size: 18px; color: var(--text-muted); cursor: pointer; }
    .modal-body { padding: 24px; }
    .modal-footer {
      padding: 16px 24px; border-top: 1px solid var(--border);
      display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; border-radius: 0 0 16px 16px;
    }
    .btn-secondary {
      background: #fff; border: 1px solid var(--border); border-radius: 8px;
      padding: 10px 16px; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer;
    }

    /* Logs view */
    .log-row {
      padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-family: monospace; font-size: 12px;
      display: flex; align-items: center; gap: 12px;
    }
    .log-row:last-child { border-bottom: none; }
    .log-tag { font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
    .log-tag.info { background: #eff6ff; color: #2563eb; }
    .log-tag.success { background: #f0fdf4; color: #16a34a; }
    .log-tag.warn { background: #fffbeb; color: #d97706; }
    .log-tag.error { background: #fef2f2; color: #dc2626; }

    /* Webhook URL display */
    .url-box {
      background: #f8fafc; border: 1px solid var(--border); border-radius: 8px;
      padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .url-box code { font-family: monospace; font-size: 13px; color: var(--text-main); word-break: break-all; }
  </style>
</head>
<body>

  <!-- Top Header -->
  <header class="top-header">
    <div class="header-brand">
      <div class="brand-icon"><i class="fas fa-network-wired"></i></div>
      <div class="brand-title">
        <h1>Kommo Bot &bull; CWB Fight Club</h1>
        <span>Central de Automações, Funis e IA</span>
      </div>
    </div>
    <div class="header-actions">
      <div class="status-indicator">
        <span class="status-dot"></span>
        <span>Sistema Ativo</span>
      </div>
      <a href="/home/workflows/logout" class="btn-logout">
        <i class="fas fa-sign-out-alt"></i>
        <span>Sair</span>
      </a>
    </div>
  </header>

  <!-- Navigation Tabs -->
  <div class="tab-nav-wrapper">
    <div class="tab-nav">
      <button class="tab-btn active" onclick="switchTab('tab-automations')">
        <i class="fas fa-sitemap"></i>
        <span>Automações</span>
      </button>
      <button class="tab-btn" onclick="switchTab('tab-pipelines')">
        <i class="fas fa-filter"></i>
        <span>Funis (Pipelines)</span>
      </button>
      <button class="tab-btn" onclick="switchTab('tab-overview')">
        <i class="fas fa-chart-line"></i>
        <span>Métricas</span>
      </button>
      <button class="tab-btn" onclick="switchTab('tab-context')">
        <i class="fas fa-brain"></i>
        <span>Base de Conhecimento (IA)</span>
      </button>
      <button class="tab-btn" onclick="switchTab('tab-history')">
        <i class="fas fa-history"></i>
        <span>Histórico & Logs</span>
      </button>
      <button class="tab-btn" onclick="switchTab('tab-settings')">
        <i class="fas fa-sliders-h"></i>
        <span>Configurações & Webhook</span>
      </button>
    </div>
  </div>

  <!-- Main Content Area -->
  <main class="main-container">

    <!-- Global Master Switch -->
    <div class="master-switch-bar">
      <div class="switch-left">
        <div class="switch-icon active" id="globalSwitchIcon"><i class="fas fa-play"></i></div>
        <div class="switch-text">
          <h3 id="globalSwitchTitle">Motor de Automações Ativo</h3>
          <p id="globalSwitchDesc">O bot está processando eventos do Kommo e respondendo leads em tempo real.</p>
        </div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="globalAutomationToggle" checked onchange="handleGlobalToggle()">
        <span class="slider"></span>
      </label>
    </div>

    <!-- TAB 1: AUTOMAÇÕES -->
    <div id="tab-automations" class="tab-content active">
      <div class="section-toolbar">
        <div class="section-title">
          <h2>Regras de Automação</h2>
          <p>Crie e gerencie respostas automáticas, transbordo humano e ações em etapas do Kommo</p>
        </div>
        <button class="btn-create" onclick="openCreateModal()">
          <i class="fas fa-plus"></i>
          <span>Nova Automação</span>
        </button>
      </div>

      <div class="automations-grid" id="automationsGrid">
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 8px;"></i>
          <p>Carregando automações...</p>
        </div>
      </div>
    </div>

    <!-- TAB 2: FUNIS / PIPELINES -->
    <div id="tab-pipelines" class="tab-content">
      <div class="section-toolbar">
        <div class="section-title">
          <h2>Funis de Vendas do Kommo (Pipelines)</h2>
          <p>Visualize os funis e etapas sincronizados com o CRM ou crie novos funis diretamente</p>
        </div>
        <button class="btn-create" onclick="openCreatePipelineModal()">
          <i class="fas fa-plus"></i>
          <span>Novo Funil / Pipeline</span>
        </button>
      </div>

      <div class="pipelines-grid" id="pipelinesGrid">
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 8px;"></i>
          <p>Carregando funis do Kommo...</p>
        </div>
      </div>
    </div>

    <!-- TAB 3: MÉTRICAS -->
    <div id="tab-overview" class="tab-content">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card-icon blue"><i class="fas fa-users"></i></div>
          <div class="stat-card-info">
            <h3 id="statTotalLeads">-</h3>
            <p>Leads Atendidos</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon green"><i class="fas fa-check-circle"></i></div>
          <div class="stat-card-info">
            <h3 id="statSuccessRate">-%</h3>
            <p>Taxa de Sucesso</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon purple"><i class="fas fa-comments"></i></div>
          <div class="stat-card-info">
            <h3 id="statTotalMessages">-</h3>
            <p>Mensagens Trocadas</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon amber"><i class="fas fa-clock"></i></div>
          <div class="stat-card-info">
            <h3 id="statUptime">-</h3>
            <p>Tempo de Atividade</p>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: BASE DE CONHECIMENTO IA -->
    <div id="tab-context" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h2><i class="fas fa-book" style="color: var(--primary);"></i> Fonte de Conhecimento da IA</h2>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
          Selecione de onde a IA obtém as regras comerciais, horários de aulas e respostas sobre a CWB Fight Club:
        </p>
        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
          <button class="btn-secondary" id="btnSrcGoogle" onclick="setContextSource('google')">
            <i class="fas fa-file-alt"></i> Google Docs Oficial
          </button>
          <button class="btn-secondary" id="btnSrcCustom" onclick="setContextSource('custom')">
            <i class="fas fa-edit"></i> Texto / Regras Personalizadas
          </button>
          <button class="btn-secondary" id="btnSrcNone" onclick="setContextSource('none')">
            <i class="fas fa-ban"></i> Apenas Instruções Base
          </button>
        </div>

        <div id="contextInfoBox" style="padding: 12px 16px; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; margin-bottom: 20px;">
          Carregando status do contexto...
        </div>

        <div id="customContextPanel" style="display: none;">
          <div class="form-group">
            <label>Texto Customizado / FAQ</label>
            <textarea class="form-control" id="customTextContent" rows="8" placeholder="Digite ou cole as informações oficiais que a IA usará para responder aos leads..."></textarea>
            <button class="btn-create" style="margin-top: 10px;" onclick="saveCustomText()">
              <i class="fas fa-save"></i> Salvar Texto
            </button>
          </div>
          <div class="form-group" style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
            <label>Ou envie um arquivo (.txt, .md, .csv)</label>
            <div style="display: flex; gap: 10px; align-items: center;">
              <input type="file" id="contextFileInput" accept=".txt,.md,.csv" class="form-control" style="max-width: 320px;">
              <button class="btn-secondary" onclick="uploadContextFile()">
                <i class="fas fa-upload"></i> Enviar Arquivo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 5: HISTÓRICO & LOGS -->
    <div id="tab-history" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h2><i class="fas fa-history" style="color: var(--primary);"></i> Últimas Execuções de Automação</h2>
          <button class="btn-icon" onclick="loadExecutions()"><i class="fas fa-sync-alt"></i> Atualizar</button>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Lead</th>
                <th>Mensagem Recebida</th>
                <th>Status</th>
                <th>Resposta / Ação</th>
                <th>Data / Hora</th>
              </tr>
            </thead>
            <tbody id="executionsTableBody">
              <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">Carregando execuções...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2><i class="fas fa-terminal" style="color: var(--primary);"></i> Logs de Atividade em Tempo Real</h2>
          <button class="btn-icon" onclick="loadLogs()"><i class="fas fa-sync-alt"></i> Atualizar</button>
        </div>
        <div id="logsConsole" style="background: #ffffff; border: 1px solid var(--border); border-radius: 8px; max-height: 350px; overflow-y: auto;">
          <div style="padding: 20px; text-align: center; color: var(--text-muted);">Carregando logs...</div>
        </div>
      </div>
    </div>

    <!-- TAB 6: CONFIGURAÇÕES -->
    <div id="tab-settings" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h2><i class="fas fa-plug" style="color: var(--primary);"></i> Webhook do Kommo CRM</h2>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">
          Configure esta URL no Kommo (Configurações &rarr; Integrações &rarr; Webhooks) para os eventos desejados:
        </p>
        <div class="url-box">
          <code id="webhookUrlDisplay">https://162-243-173-155.nip.io/webhook/cwbfightclub</code>
          <button class="btn-create" onclick="copyWebhookUrl()">
            <i class="fas fa-copy"></i> Copiar
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2><i class="fas fa-server" style="color: var(--primary);"></i> Parâmetros do Ambiente</h2>
        </div>
        <table style="font-size: 13px;">
          <tbody>
            <tr><td style="font-weight: 600; width: 220px;">Subdomínio Kommo</td><td>contatocwbfightclubcombr</td></tr>
            <tr><td style="font-weight: 600;">Modelo OpenAI</td><td>gpt-4o-mini</td></tr>
            <tr><td style="font-weight: 600;">Provedor de WhatsApp</td><td>uazapi (agentekommo.uazapi.com)</td></tr>
            <tr><td style="font-weight: 600;">Persistência Redis</td><td>evolution_redis:6379</td></tr>
            <tr><td style="font-weight: 600;">Banco Postgres</td><td>db-postgres:5432</td></tr>
          </tbody>
        </table>
      </div>
    </div>

  </main>

  <!-- MODAL: CRIAR / EDITAR AUTOMAÇÃO -->
  <div class="modal-backdrop" id="autoModal">
    <div class="modal">
      <div class="modal-header">
        <h3 id="modalTitle">Configurar Automação</h3>
        <button class="btn-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form id="automationForm">
          <input type="hidden" id="autoId">

          <div class="form-group">
            <label for="autoName">Nome da Automação *</label>
            <input type="text" id="autoName" class="form-control" placeholder="Ex: Atendimento Inicial Muay Thai" required>
          </div>

          <div class="form-group">
            <label for="autoDesc">Descrição</label>
            <input type="text" id="autoDesc" class="form-control" placeholder="Descreva brevemente o objetivo desta regra">
          </div>

          <div class="form-group">
            <label for="autoTrigger">Gatilho no Kommo CRM *</label>
            <select id="autoTrigger" class="form-control">
              <option value="message_add">Nova Mensagem Recebida (message[add])</option>
              <option value="lead_add">Novo Lead Criado (leads[add])</option>
              <option value="lead_stage_change">Mudança de Etapa / Status no Funil (leads[status])</option>
              <option value="lead_update">Atualização de Lead (leads[update])</option>
            </select>
          </div>

          <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin: 16px 0;">
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 12px; color: var(--text-main);">
              <i class="fas fa-filter" style="color: var(--primary);"></i> Filtros e Condições
            </h4>
            
            <div class="form-group">
              <label for="autoPipeline">Funil / Pipeline do Kommo</label>
              <select id="autoPipeline" class="form-control" onchange="updateStagesDropdown()">
                <option value="all">Todos os Funis</option>
              </select>
            </div>

            <div class="form-group">
              <label for="autoStage">Etapa / Status do Funil</label>
              <select id="autoStage" class="form-control">
                <option value="all">Todas as Etapas</option>
              </select>
            </div>

            <div class="form-group">
              <label for="autoRequiredTags">Tags Obrigatórias (separadas por vírgula)</label>
              <input type="text" id="autoRequiredTags" class="form-control" placeholder="Ex: Em Atendimento IA, Novo Lead">
            </div>

            <div class="form-group">
              <label for="autoExcludedTags">Tags Bloqueadas / Excluídas (separadas por vírgula)</label>
              <input type="text" id="autoExcludedTags" class="form-control" placeholder="Ex: Atendimento Humano, Não Perturbe">
            </div>

            <div class="form-group">
              <label for="autoKeywords">Palavras-chave no Texto (opcional)</label>
              <input type="text" id="autoKeywords" class="form-control" placeholder="Ex: humano, atendente, precos (deixe vazio para qualquer mensagem)">
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin: 16px 0;">
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 12px; color: var(--text-main);">
              <i class="fas fa-bolt" style="color: var(--primary);"></i> Ação Principal
            </h4>

            <div class="form-group">
              <label for="actionType">Tipo de Ação</label>
              <select id="actionType" class="form-control" onchange="toggleActionFields()">
                <option value="ai_chat">Resposta Inteligente com IA (OpenAI + Base de Conhecimento)</option>
                <option value="send_template">Enviar Mensagem WhatsApp Fixa / Template</option>
                <option value="change_stage">Apenas Mover de Etapa no Funil</option>
                <option value="manage_tags">Apenas Atualizar Tags</option>
              </select>
            </div>

            <div id="templateFields" style="display: none;">
              <div class="form-group">
                <label for="templateText">Mensagem do Template</label>
                <textarea id="templateText" class="form-control" rows="3" placeholder="Olá {{name}}, recebemos sua mensagem! Em breve nossa equipe entrará em contato."></textarea>
                <span style="font-size: 11px; color: var(--text-muted);">Variáveis disponíveis: {{name}}, {{first_name}}, {{phone}}, {{lead_id}}</span>
              </div>
            </div>

            <div class="form-group">
              <label for="actionAddTag">Adicionar Tag no Kommo ao executar (opcional)</label>
              <input type="text" id="actionAddTag" class="form-control" placeholder="Ex: Em Atendimento IA">
            </div>

            <div class="form-group">
              <label for="actionRemoveTag">Remover Tag no Kommo ao executar (opcional)</label>
              <input type="text" id="actionRemoveTag" class="form-control" placeholder="Ex: Atendimento Humano">
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="button" class="btn-create" onclick="saveAutomationFromModal()">
          <i class="fas fa-check"></i> Salvar Automação
        </button>
      </div>
    </div>
  </div>

  <!-- MODAL: CRIAR NOVO FUNIL (PIPELINE) -->
  <div class="modal-backdrop" id="pipelineModal">
    <div class="modal">
      <div class="modal-header">
        <h3>Criar Novo Funil de Vendas (Pipeline)</h3>
        <button class="btn-close" onclick="closePipelineModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="newPipelineName">Nome do Funil *</label>
          <input type="text" id="newPipelineName" class="form-control" placeholder="Ex: Muay Thai Adulto - Unidade Mercês" required>
        </div>
        <div class="form-group">
          <label for="newPipelineStages">Etapas Iniciais (uma por linha)</label>
          <textarea id="newPipelineStages" class="form-control" rows="4" placeholder="Primeiro Contato&#10;Qualificação&#10;Aula Agendada&#10;Matrícula Realizada"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closePipelineModal()">Cancelar</button>
        <button type="button" class="btn-create" onclick="savePipelineFromModal()">
          <i class="fas fa-check"></i> Criar Funil no Kommo
        </button>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = '/home/workflows/api';
    const START_TIME = Date.now();
    let currentAutomations = [];
    let kommoPipelines = [];

    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      event.currentTarget.classList.add('active');
    }

    function formatUptime() {
      const sec = Math.floor((Date.now() - START_TIME) / 1000);
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return h + 'h ' + m + 'm';
    }

    function copyWebhookUrl() {
      const url = document.getElementById('webhookUrlDisplay').textContent;
      navigator.clipboard.writeText(url).then(() => {
        alert('URL do Webhook copiada com sucesso!');
      });
    }

    // ===== GESTÃO DE AUTOMAÇÕES =====
    async function loadAutomations() {
      try {
        const r = await fetch(API_BASE + '/automations');
        if (!r.ok) return;
        currentAutomations = await r.json();
        renderAutomationsGrid();
      } catch (err) {
        console.error('Erro ao carregar automações:', err);
      }
    }

    function renderAutomationsGrid() {
      const grid = document.getElementById('automationsGrid');
      if (!currentAutomations || currentAutomations.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhuma automação cadastrada. Clique em "+ Nova Automação" para começar.</div>';
        return;
      }

      grid.innerHTML = currentAutomations.map(a => {
        const triggerMap = {
          'message_add': 'Nova Mensagem',
          'lead_add': 'Novo Lead',
          'lead_stage_change': 'Mudança de Etapa',
          'lead_update': 'Lead Atualizado'
        };

        const actionType = a.actions?.[0]?.type || 'ai_chat';
        const actionLabel = actionType === 'ai_chat' ? 'IA Chat + WhatsApp' : (actionType === 'send_template' ? 'Template WhatsApp' : 'CRM / Tags');

        return \`
          <div class="auto-card">
            <div>
              <div class="auto-card-header">
                <div class="auto-card-title">
                  <h3>\${escapeHtml(a.name)}</h3>
                  <p>\${escapeHtml(a.description || 'Sem descrição')}</p>
                </div>
                <label class="toggle">
                  <input type="checkbox" \${a.active ? 'checked' : ''} onchange="toggleAutoActive('\${a.id}', this.checked)">
                  <span class="slider"></span>
                </label>
              </div>

              <div class="tags-container">
                <span class="badge badge-trigger"><i class="fas fa-bolt"></i> \${triggerMap[a.trigger] || a.trigger}</span>
                <span class="badge badge-action"><i class="fas fa-robot"></i> \${actionLabel}</span>
                \${a.conditions?.keywordMatch ? '<span class="badge badge-condition"><i class="fas fa-key"></i> Palavras-chave</span>' : ''}
              </div>

              <div class="auto-card-stats">
                <div class="stat-item">
                  <div class="val">\${a.stats?.executionsCount || 0}</div>
                  <div class="lbl">Execuções</div>
                </div>
                <div class="stat-item">
                  <div class="val">\${a.stats?.lastRun ? new Date(a.stats.lastRun).toLocaleDateString('pt-BR') : '-'}</div>
                  <div class="lbl">Última Vez</div>
                </div>
              </div>
            </div>

            <div class="auto-card-footer">
              <span style="font-size: 12px; color: \${a.active ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">
                <i class="fas fa-circle" style="font-size: 8px;"></i> \${a.active ? 'Ativa' : 'Pausada'}
              </span>
              <div class="card-actions">
                <button class="btn-icon" onclick="openEditModal('\${a.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" onclick="deleteAuto('\${a.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    async function toggleAutoActive(id, active) {
      try {
        await fetch(API_BASE + '/automations/' + id + '/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active })
        });
        loadAutomations();
      } catch (err) {
        console.error(err);
      }
    }

    async function deleteAuto(id) {
      if (!confirm('Deseja realmente excluir esta automação?')) return;
      try {
        await fetch(API_BASE + '/automations/' + id, { method: 'DELETE' });
        loadAutomations();
      } catch (err) {
        console.error(err);
      }
    }

    function openCreateModal() {
      document.getElementById('modalTitle').textContent = 'Nova Automação';
      document.getElementById('autoId').value = '';
      document.getElementById('autoName').value = '';
      document.getElementById('autoDesc').value = '';
      document.getElementById('autoTrigger').value = 'message_add';
      document.getElementById('autoPipeline').value = 'all';
      updateStagesDropdown();
      document.getElementById('autoRequiredTags').value = '';
      document.getElementById('autoExcludedTags').value = '';
      document.getElementById('autoKeywords').value = '';
      document.getElementById('actionType').value = 'ai_chat';
      document.getElementById('templateText').value = '';
      document.getElementById('actionAddTag').value = '';
      document.getElementById('actionRemoveTag').value = '';
      toggleActionFields();
      document.getElementById('autoModal').style.display = 'flex';
    }

    function openEditModal(id) {
      const a = currentAutomations.find(item => item.id === id);
      if (!a) return;
      document.getElementById('modalTitle').textContent = 'Editar Automação';
      document.getElementById('autoId').value = a.id;
      document.getElementById('autoName').value = a.name || '';
      document.getElementById('autoDesc').value = a.description || '';
      document.getElementById('autoTrigger').value = a.trigger || 'message_add';
      document.getElementById('autoPipeline').value = a.conditions?.pipelineId || 'all';
      updateStagesDropdown(a.conditions?.stageId || 'all');
      document.getElementById('autoRequiredTags').value = (a.conditions?.requiredTags || []).join(', ');
      document.getElementById('autoExcludedTags').value = (a.conditions?.excludedTags || []).join(', ');
      document.getElementById('autoKeywords').value = a.conditions?.keywordMatch || '';
      
      const action = a.actions?.[0] || {};
      document.getElementById('actionType').value = action.type || 'ai_chat';
      document.getElementById('templateText').value = action.templateText || '';
      document.getElementById('actionAddTag').value = action.addTagOnSuccess || '';
      document.getElementById('actionRemoveTag').value = action.removeTagOnSuccess || '';
      toggleActionFields();
      document.getElementById('autoModal').style.display = 'flex';
    }

    function closeModal() {
      document.getElementById('autoModal').style.display = 'none';
    }

    function updateStagesDropdown(selectedStageId = 'all') {
      const pipelineId = document.getElementById('autoPipeline').value;
      const stageSelect = document.getElementById('autoStage');
      stageSelect.innerHTML = '<option value="all">Todas as Etapas</option>';
      
      if (pipelineId !== 'all') {
        const p = kommoPipelines.find(item => String(item.id) === String(pipelineId));
        const statuses = p?._embedded?.statuses || [];
        statuses.forEach(st => {
          stageSelect.innerHTML += \`<option value="\${st.id}" \${String(st.id) === String(selectedStageId) ? 'selected' : ''}>\${escapeHtml(st.name)}</option>\`;
        });
      }
    }

    function toggleActionFields() {
      const type = document.getElementById('actionType').value;
      document.getElementById('templateFields').style.display = type === 'send_template' ? 'block' : 'none';
    }

    async function saveAutomationFromModal() {
      const name = document.getElementById('autoName').value.trim();
      if (!name) {
        alert('Por favor, informe o nome da automação.');
        return;
      }

      const id = document.getElementById('autoId').value;
      const payload = {
        id: id || undefined,
        name,
        description: document.getElementById('autoDesc').value.trim(),
        trigger: document.getElementById('autoTrigger').value,
        conditions: {
          pipelineId: document.getElementById('autoPipeline').value,
          stageId: document.getElementById('autoStage').value,
          requiredTags: document.getElementById('autoRequiredTags').value.split(',').map(s => s.trim()).filter(Boolean),
          excludedTags: document.getElementById('autoExcludedTags').value.split(',').map(s => s.trim()).filter(Boolean),
          keywordMatch: document.getElementById('autoKeywords').value.trim(),
        },
        actions: [
          {
            type: document.getElementById('actionType').value,
            templateText: document.getElementById('templateText').value.trim(),
            sendChannel: 'whatsapp_uazapi',
            addTagOnSuccess: document.getElementById('actionAddTag').value.trim(),
            removeTagOnSuccess: document.getElementById('actionRemoveTag').value.trim(),
          }
        ]
      };

      try {
        const r = await fetch(API_BASE + '/automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (r.ok) {
          closeModal();
          loadAutomations();
        } else {
          alert('Erro ao salvar automação.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao salvar.');
      }
    }

    // ===== GESTÃO DE PIPELINES (FUNIS) =====
    async function loadKommoPipelines() {
      try {
        const r = await fetch(API_BASE + '/kommo/pipelines');
        if (!r.ok) return;
        kommoPipelines = await r.json();
        
        // Atualiza selects
        const sel = document.getElementById('autoPipeline');
        sel.innerHTML = '<option value="all">Todos os Funis</option>' + kommoPipelines.map(p => \`
          <option value="\${p.id}">\${escapeHtml(p.name)}</option>
        \`).join('');

        // Renderiza grid de pipelines
        renderPipelinesGrid();
      } catch (err) {
        console.error(err);
      }
    }

    function renderPipelinesGrid() {
      const grid = document.getElementById('pipelinesGrid');
      if (!kommoPipelines || kommoPipelines.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Nenhum funil encontrado no Kommo.</div>';
        return;
      }

      grid.innerHTML = kommoPipelines.map(p => {
        const statuses = p._embedded?.statuses || [];
        return \`
          <div class="pipeline-card">
            <div class="pipeline-header">
              <h3>\${escapeHtml(p.name)}</h3>
              <span class="badge badge-trigger">ID \${p.id}</span>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">\${statuses.length} Etapas configuradas:</p>
            <div>
              \${statuses.map(st => \`
                <div class="stage-item" style="border-left-color: \${st.color || 'var(--primary)'}">
                  <span>\${escapeHtml(st.name)}</span>
                  <span style="font-size: 11px; color: var(--text-muted);">ID \${st.id}</span>
                </div>
              \`).join('')}
            </div>
          </div>
        \`;
      }).join('');
    }

    function openCreatePipelineModal() {
      document.getElementById('newPipelineName').value = '';
      document.getElementById('newPipelineStages').value = 'Primeiro Contato\nQualificação\nAula Agendada\nMatrícula Realizada';
      document.getElementById('pipelineModal').style.display = 'flex';
    }

    function closePipelineModal() {
      document.getElementById('pipelineModal').style.display = 'none';
    }

    async function savePipelineFromModal() {
      const name = document.getElementById('newPipelineName').value.trim();
      if (!name) {
        alert('Informe o nome do funil.');
        return;
      }
      const rawStages = document.getElementById('newPipelineStages').value.split('\n').map(s => s.trim()).filter(Boolean);
      const statuses = rawStages.map(s => ({ name: s }));

      try {
        const r = await fetch(API_BASE + '/kommo/pipelines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, statuses })
        });
        if (r.ok) {
          alert('Funil criado com sucesso no Kommo CRM!');
          closePipelineModal();
          loadKommoPipelines();
        } else {
          alert('Erro ao criar funil no Kommo.');
        }
      } catch (err) {
        alert('Erro ao criar funil.');
      }
    }

    // ===== TOGGLE GERAL (Master) =====
    async function handleGlobalToggle() {
      const checkbox = document.getElementById('globalAutomationToggle');
      const active = checkbox.checked;
      try {
        const r = await fetch(API_BASE + '/automation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active })
        });
        const data = await r.json();
        updateGlobalUI(data.active);
      } catch (err) {
        console.error(err);
      }
    }

    function updateGlobalUI(active) {
      document.getElementById('globalAutomationToggle').checked = active;
      const icon = document.getElementById('globalSwitchIcon');
      const title = document.getElementById('globalSwitchTitle');
      const desc = document.getElementById('globalSwitchDesc');
      if (active) {
        icon.className = 'switch-icon active';
        icon.innerHTML = '<i class="fas fa-play"></i>';
        title.textContent = 'Motor de Automações Ativo';
        desc.textContent = 'O bot está processando eventos do Kommo e respondendo leads em tempo real.';
      } else {
        icon.className = 'switch-icon inactive';
        icon.innerHTML = '<i class="fas fa-pause"></i>';
        title.textContent = 'Motor de Automações Pausado';
        desc.textContent = 'Todas as automações estão temporariamente suspensas.';
      }
    }

    // ===== EXECUÇÕES & LOGS =====
    async function loadExecutions() {
      try {
        const r = await fetch(API_BASE + '/executions');
        if (!r.ok) return;
        const data = await r.json();
        
        document.getElementById('statTotalLeads').textContent = data.stats?.totalLeads || 0;
        document.getElementById('statSuccessRate').textContent = (data.stats?.successRate || 0) + '%';
        document.getElementById('statTotalMessages').textContent = data.stats?.totalMessages || 0;
        document.getElementById('statUptime').textContent = formatUptime();

        const tbody = document.getElementById('executionsTableBody');
        if (!data.executions || data.executions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">Nenhuma execução registrada</td></tr>';
          return;
        }

        tbody.innerHTML = data.executions.map(e => \`
          <tr>
            <td style="font-family: monospace; font-weight: 600;">\${e.id || '-'}</td>
            <td>Lead #\${e.leadId || '-'}</td>
            <td style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${escapeHtml((e.message || '').slice(0, 50))}</td>
            <td>
              <span class="status-badge \${e.status === 'success' ? 'success' : 'error'}">
                <i class="fas fa-\${e.status === 'success' ? 'check' : 'times'}"></i>
                \${e.status === 'success' ? 'Sucesso' : 'Erro'}
              </span>
            </td>
            <td style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${escapeHtml((e.response || '').slice(0, 60))}</td>
            <td style="color: var(--text-muted); font-size: 12px;">\${e.time ? new Date(e.time).toLocaleString('pt-BR') : '-'}</td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error(err);
      }
    }

    async function loadLogs() {
      try {
        const r = await fetch(API_BASE + '/logs');
        if (!r.ok) return;
        const data = await r.json();
        const c = document.getElementById('logsConsole');
        if (!data.logs || data.logs.length === 0) {
          c.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Nenhum log registrado</div>';
          return;
        }
        c.innerHTML = data.logs.map(l => \`
          <div class="log-row">
            <span class="log-tag \${l.type || 'info'}">\${(l.type || 'INFO').toUpperCase()}</span>
            <span style="flex: 1; color: var(--text-main);">\${escapeHtml(l.text || '')}</span>
            <span style="color: var(--text-muted); font-size: 11px;">\${l.time || ''}</span>
          </div>
        \`).join('');
      } catch (err) {
        console.error(err);
      }
    }

    // ===== CONTEXTO DA IA =====
    async function loadContextState() {
      try {
        const r = await fetch(API_BASE + '/context');
        if (!r.ok) return;
        const data = await r.json();
        const box = document.getElementById('contextInfoBox');
        const panel = document.getElementById('customContextPanel');

        if (data.source === 'google') {
          box.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i> <strong>Fonte Atual: Google Docs Oficial</strong> &bull; Conhecimento carregado dinamicamente do documento compartilhado.';
          panel.style.display = 'none';
        } else if (data.source === 'custom') {
          box.innerHTML = '<i class="fas fa-edit" style="color: var(--primary);"></i> <strong>Fonte Atual: Texto Personalizado</strong> &bull; ' + (data.text ? data.text.length + ' caracteres carregados.' : 'Vazio.');
          panel.style.display = 'block';
          document.getElementById('customTextContent').value = data.text || '';
        } else {
          box.innerHTML = '<i class="fas fa-ban" style="color: var(--danger);"></i> <strong>Fonte Atual: Apenas Prompt Base</strong> &bull; Sem FAQ externo.';
          panel.style.display = 'none';
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function setContextSource(source) {
      try {
        await fetch(API_BASE + '/context/source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source })
        });
        loadContextState();
      } catch (err) {
        console.error(err);
      }
    }

    async function saveCustomText() {
      const text = document.getElementById('customTextContent').value;
      try {
        await fetch(API_BASE + '/context/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        alert('Texto da IA salvo com sucesso!');
        loadContextState();
      } catch (err) {
        alert('Erro ao salvar texto.');
      }
    }

    async function uploadContextFile() {
      const fileInput = document.getElementById('contextFileInput');
      if (!fileInput.files[0]) {
        alert('Selecione um arquivo primeiro.');
        return;
      }
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      try {
        const r = await fetch(API_BASE + '/context/upload', {
          method: 'POST',
          body: formData
        });
        if (r.ok) {
          alert('Arquivo enviado com sucesso!');
          loadContextState();
        } else {
          alert('Erro ao enviar arquivo.');
        }
      } catch (err) {
        alert('Erro no envio.');
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // Inicialização
    loadAutomations();
    loadKommoPipelines();
    loadExecutions();
    loadLogs();
    loadContextState();

    setInterval(loadExecutions, 10000);
    setInterval(loadLogs, 15000);
  </script>
</body>
</html>`);
});

// ===== APIs DE AUTOMAÇÕES =====
router.get('/api/automations', requireAuth, (req, res) => {
  res.json(readAutomations());
});

router.post('/api/automations', requireAuth, (req, res) => {
  const data = req.body;
  const saved = saveAutomation(data);
  addLog('workflow', 'success', `Automação "${saved.name}" salva via painel`);
  res.json(saved);
});

router.post('/api/automations/:id/toggle', requireAuth, (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  const item = toggleAutomation(id, active);
  if (item) {
    addLog('toggle', 'info', `Automação "${item.name}" ${item.active ? 'ativada' : 'pausada'}`);
    return res.json(item);
  }
  res.status(404).json({ error: 'Automation not found' });
});

router.delete('/api/automations/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const success = deleteAutomation(id);
  if (success) {
    addLog('delete', 'warn', `Automação ID ${id} excluída`);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Automation not found' });
});

// ===== APIs: Pipelines do Kommo =====
router.get('/api/kommo/pipelines', requireAuth, async (req, res) => {
  try {
    const pipelines = await getPipelines();
    res.json(pipelines);
  } catch (err) {
    res.json([]);
  }
});

router.post('/api/kommo/pipelines', requireAuth, async (req, res) => {
  try {
    const { name, statuses } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome do pipeline é obrigatório' });
    const created = await createPipeline(name, statuses);
    addLog('pipeline', 'success', `Novo funil "${name}" criado no Kommo CRM`);
    res.json({ success: true, pipeline: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== API: Master Switch (Estado Geral) =====
const AUTOMATION_FILE = '/tmp/kommo-bot-automation.json';

function readAutomationState() {
  try {
    if (fs.existsSync(AUTOMATION_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTOMATION_FILE, 'utf8'));
      return data.active !== false;
    }
  } catch {}
  return true;
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
  addLog('power', active ? 'success' : 'warn',
    active ? 'Motor de automações REATIVADO globalmente' : 'Motor de automações PAUSADO globalmente');
  res.json({ active: !!active });
});

// ===== API: Execuções =====
router.get('/api/executions', requireAuth, async (req, res) => {
  try {
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
      executions: executions.slice(-30).reverse(),
      stats: {
        totalLeads: new Set(executions.map(e => e.leadId)).size,
        successRate: total > 0 ? Math.round(success / total * 100) : 0,
        totalMessages,
      }
    });
  } catch (err) {
    res.json({ executions: [], stats: { totalLeads: 0, successRate: 0, totalMessages: 0 } });
  }
});

// ===== API: Logs =====
router.get('/api/logs', requireAuth, async (req, res) => {
  try {
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

// ===== API: Contexto IA =====
router.get('/api/context', requireAuth, (req, res) => {
  const state = readContextState();
  res.json({
    source: state.source,
    text: state.text || '',
    fileName: state.fileName || null,
    updatedAt: state.updatedAt || null,
  });
});

router.post('/api/context/source', requireAuth, (req, res) => {
  const { source } = req.body;
  if (!['google', 'custom', 'none'].includes(source)) {
    return res.status(400).json({ error: 'source inválida' });
  }
  const state = readContextState();
  state.source = source;
  writeContextState(state);
  reloadContext().then(() => {
    addLog('context', 'success', `Fonte de contexto IA alterada para: ${source}`);
    res.json({ success: true, source });
  }).catch(err => res.status(500).json({ error: err.message }));
});

router.post('/api/context/text', requireAuth, (req, res) => {
  const { text } = req.body;
  if (typeof text !== 'string') return res.status(400).json({ error: 'text inválido' });
  saveContextText(text);
  reloadContext().then(() => {
    addLog('context', 'success', `Contexto de IA salvo por texto (${text.length} chars)`);
    res.json({ success: true });
  }).catch(err => res.status(500).json({ error: err.message }));
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

router.post('/api/context/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const name = (req.file.originalname || 'arquivo').toLowerCase();
  if (!name.endsWith('.txt') && !name.endsWith('.md') && !name.endsWith('.csv')) {
    return res.status(400).json({ error: 'Formato não suportado. Use .txt, .md ou .csv' });
  }
  const content = req.file.buffer.toString('utf8');
  if (!content.trim()) return res.status(400).json({ error: 'Arquivo vazio' });

  saveContextFile(req.file.originalname, content.trim());
  reloadContext().then(() => {
    addLog('context', 'success', `Arquivo de contexto carregado: ${req.file.originalname}`);
    res.json({ success: true, fileName: req.file.originalname, chars: content.length });
  }).catch(err => res.status(500).json({ error: err.message }));
});

export default router;
export { requireAuth };
