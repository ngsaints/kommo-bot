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
import { hasExplicitAutomationScope } from './automationEvaluator.js';
import { readAutomationState, writeAutomationState } from './automationStateStore.js';

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
    .login-container { width: 100%; max-width: 420px; }
    .brand-header { text-align: center; margin-bottom: 28px; }
    .brand-icon {
      width: 48px; height: 48px; background: #1f5f63; color: #ffffff;
      border-radius: 12px; display: inline-flex; align-items: center; justify-content: center;
      font-size: 22px; margin-bottom: 12px; box-shadow: 0 3px 10px rgba(31, 95, 99, 0.18);
    }
    .brand-header h1 { font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em; }
    .brand-header p { font-size: 14px; color: #64748b; margin-top: 4px; }
    .login-card {
      background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.05), 0 8px 10px -6px rgba(15, 23, 42, 0.02);
      padding: 32px;
    }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px; }
    .input-wrapper { position: relative; display: flex; align-items: center; }
    .input-wrapper i { position: absolute; left: 14px; color: #94a3b8; font-size: 15px; }
    .input-wrapper input {
      width: 100%; padding: 12px 14px 12px 40px; border: 1px solid #cbd5e1;
      border-radius: 10px; font-size: 14px; color: #0f172a; background: #ffffff; outline: none; transition: all 0.2s ease;
    }
    .input-wrapper input:focus { border-color: #1f5f63; box-shadow: 0 0 0 3px rgba(31,95,99,.12); }
    .btn-primary {
      width: 100%; padding: 12px 16px; background: #1f5f63; color: #ffffff; border: none;
      border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex;
      align-items: center; justify-content: center; gap: 8px; transition: background 0.2s ease;
    }
    .btn-primary:hover { background: #16484b; }
    .error-alert {
      background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 12px 14px;
      border-radius: 10px; font-size: 13px; margin-bottom: 20px; display: none; align-items: center; gap: 8px;
    }
    .login-footer { text-align: center; margin-top: 24px; font-size: 12px; color: #94a3b8; }
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
    <div class="login-footer">Ambiente de Produção &bull; Conexão Segura</div>
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
        if (r.ok) window.location.href = '/home/workflows';
        else {
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

// ===== DASHBOARD PRINCIPAL (Interface Visual Moderna) =====
router.get('/', requireAuth, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Painel de Automações & Funis - Kommo Bot</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #1f5f63;
      --primary-hover: #16484b;
      --primary-soft: #edf4f3;
      --primary-border: #d4e3e1;
      --navy: #172033;
      --bg: #f4f6f8;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text-main: #172033;
      --text-muted: #64748b;
      --success: #16a34a;
      --danger: #dc2626;
      --warning: #d97706;
      --radius: 12px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    body { background-color: var(--bg); color: var(--text-main); min-height: 100vh; display: flex; flex-direction: column; overflow-x: hidden; }
    
    /* Top Header */
    .top-header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      height: 64px;
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
      width: 36px; height: 36px; background: var(--primary); color: #fff;
      border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 16px;
      box-shadow: 0 1px 2px rgba(15,23,42,.12);
    }
    .brand-title h1 { font-size: 17px; font-weight: 700; color: var(--text-main); line-height: 1.2; }
    .brand-title span { font-size: 12px; color: var(--text-muted); }
    .header-actions { display: flex; align-items: center; gap: 16px; }
    .status-indicator {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 10px; border-radius: 8px; font-size: 11px; font-weight: 600;
      background: #f8fafc; color: #475569; border: 1px solid var(--border);
    }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
    .btn-logout {
      color: var(--text-muted); text-decoration: none; font-size: 13px; font-weight: 500;
      padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border);
      transition: all 0.2s ease; display: flex; align-items: center; gap: 6px;
    }
    .btn-logout:hover { background: #fef2f2; color: var(--danger); border-color: #fecaca; }

    /* Navigation Bar / Tabs */
    .tab-nav-wrapper { background: var(--card-bg); border-bottom: 1px solid var(--border); padding: 0 32px; }
    .tab-nav { max-width: 1300px; margin: 0 auto; display: flex; gap: 22px; overflow-x: auto; }
    .tab-btn {
      padding: 16px 4px; background: none; border: none; border-bottom: 2px solid transparent;
      font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; white-space: nowrap;
      display: flex; align-items: center; gap: 8px; transition: all 0.2s ease;
    }
    .tab-btn:hover { color: var(--text-main); }
    .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }

    /* Main Container */
    .main-container { max-width: 1300px; margin: 0 auto; padding: 28px 32px; width: 100%; flex: 1; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Global Automation Switch */
    .master-switch-bar {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 14px 18px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;
      box-shadow: 0 1px 2px rgba(15,23,42,.035);
    }
    .switch-left { display: flex; align-items: center; gap: 14px; }
    .switch-icon {
      width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center;
      justify-content: center; font-size: 18px;
    }
    .switch-icon.active { background: var(--primary-soft); color: var(--primary); }
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
    input:checked + .slider { background-color: var(--primary); }
    input:checked + .slider:before { transform: translateX(22px); }
    .toggle input:disabled + .slider { opacity: .55; cursor: wait; }

    /* Action Toolbar */
    .section-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .section-title h2 { font-size: 18px; font-weight: 700; color: var(--text-main); }
    .section-title p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
    .btn-create {
      background: var(--primary); color: #fff; border: none; border-radius: 10px;
      padding: 11px 20px; font-size: 13px; font-weight: 600; cursor: pointer;
      display: inline-flex; align-items: center; gap: 8px; transition: background 0.2s ease, transform 0.1s ease;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .12);
    }
    .btn-create:hover { background: var(--primary-hover); transform: translateY(-1px); }

    /* Automations Grid */
    .automations-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; }
    .auto-card {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 20px; box-shadow: 0 1px 2px rgba(15,23,42,.035); display: flex; flex-direction: column;
      justify-content: space-between; transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .auto-card:hover { border-color: #cbd5e1; box-shadow: 0 5px 14px rgba(15, 23, 42, 0.055); }
    .auto-card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
    .auto-card-title { min-width: 0; flex: 1; }
    .auto-card-title h3 { font-size: 15px; font-weight: 700; color: var(--text-main); }
    .auto-card-title p { font-size: 13px; color: var(--text-muted); margin-top: 4px; line-height: 1.4; }
    
    .tags-container { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0; }
    .badge {
      display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 6px;
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;
    }
    .badge-trigger { background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; }
    .badge-action { background: var(--primary-soft); color: var(--primary); border: 1px solid var(--primary-border); }
    .badge-condition { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }

    .auto-card-stats {
      background: #f8fafc; border-radius: 10px; padding: 12px; display: flex;
      justify-content: space-around; margin: 14px 0; border: 1px solid #f1f5f9;
    }
    .stat-item { text-align: center; }
    .stat-item .val { font-size: 15px; font-weight: 700; color: var(--text-main); }
    .stat-item .lbl { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

    .auto-card-footer {
      border-top: 1px solid var(--border); padding-top: 14px; display: flex;
      align-items: center; justify-content: space-between;
    }
    .card-actions { display: flex; gap: 8px; }
    .btn-icon {
      background: #fff; border: 1px solid var(--border); border-radius: 8px;
      padding: 7px 12px; font-size: 12px; color: var(--text-muted); cursor: pointer; transition: all 0.2s ease;
    }
    .btn-icon:hover { background: #f1f5f9; color: var(--text-main); }
    .btn-icon.delete:hover { background: #fef2f2; color: var(--danger); border-color: #fecaca; }

    /* Visual Pipelines Board */
    .pipelines-grid { display: flex; flex-direction: column; gap: 24px; }
    .pipeline-card {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);
    }
    .pipeline-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid #f1f5f9;
    }
    .pipeline-header-title { display: flex; align-items: center; gap: 12px; }
    .pipeline-header-title h3 { font-size: 17px; font-weight: 700; color: var(--text-main); }
    
    /* Horizontal Visual Kanban Flow */
    .stages-flow-wrapper {
      display: flex; align-items: center; gap: 10px; overflow-x: auto; padding: 10px 0 16px 0;
    }
    .stage-flow-node {
      background: #f8fafc; border: 1px solid var(--border); border-radius: 12px;
      padding: 16px 20px; min-width: 180px; flex: 1; display: flex; flex-direction: column;
      gap: 6px; border-top: 4px solid var(--primary); box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .stage-node-title { font-size: 14px; font-weight: 700; color: var(--text-main); }
    .stage-node-meta { font-size: 11px; color: var(--text-muted); font-family: monospace; }
    .flow-arrow { color: #cbd5e1; font-size: 16px; flex-shrink: 0; }

    /* Visual Flow Step Cards inside Automation Builder Modal */
    .flow-step-card {
      background: #ffffff; border: 1px solid var(--border); border-radius: 12px;
      padding: 18px; margin-bottom: 18px;
    }
    .flow-step-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .step-number {
      width: 26px; height: 26px; border-radius: 7px; background: var(--navy); color: #fff;
      display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
    }
    .flow-step-title { font-size: 14px; font-weight: 700; color: var(--text-main); }
    
    .visual-options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .visual-choice-card {
      background: #ffffff; border: 2px solid var(--border); border-radius: 10px;
      padding: 14px; cursor: pointer; transition: all 0.2s ease; text-align: left;
    }
    .visual-choice-card:hover { border-color: #9bbfbc; background: #f8fbfa; }
    .visual-choice-card.selected { border-color: var(--primary); background: var(--primary-soft); box-shadow: 0 0 0 2px rgba(31,95,99,.10); }
    .visual-choice-icon { font-size: 20px; color: var(--primary); margin-bottom: 8px; }
    .visual-choice-title { font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 2px; }
    .visual-choice-desc { font-size: 11px; color: var(--text-muted); line-height: 1.3; }

    /* Easy visual automation canvas */
    .builder-quick-start {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      margin: 18px 0 12px; padding: 12px 14px; border: 1px solid var(--border);
      background: #f8fafc; border-radius: 12px;
    }
    .builder-quick-start strong { display: block; font-size: 12px; color: var(--navy); margin-bottom: 2px; }
    .builder-quick-start span { display: block; font-size: 11px; color: var(--text-muted); }
    .automation-presets { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .automation-preset {
      border: 1px solid #cbd5e1; background: #fff; color: #334155; border-radius: 8px;
      padding: 7px 10px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .automation-preset:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }
    .automation-builder {
      display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 14px;
      overflow: hidden; background: #f8fafc; margin-bottom: 22px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .03);
    }
    .node-library {
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap; background: #fff;
      border-bottom: 1px solid var(--border); padding: 12px 14px;
    }
    .node-library-intro { width: 165px; flex-shrink: 0; }
    .node-library-title { font-size: 12px; font-weight: 700; color: var(--text-main); margin-bottom: 3px; }
    .node-library-help { font-size: 10px; color: var(--text-muted); line-height: 1.35; }
    .node-group { display: flex; align-items: center; gap: 6px; margin-left: auto; }
    .node-group-label {
      font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: .08em;
      font-weight: 700; margin-right: 2px;
    }
    .palette-node {
      width: auto; display: flex; align-items: center; gap: 7px; padding: 7px 9px;
      border: 1px solid var(--border); border-radius: 9px; background: #fff; cursor: grab;
      text-align: left; transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
    }
    .palette-node:hover { border-color: #9bbfbc; box-shadow: 0 2px 7px rgba(15,23,42,.05); transform: translateY(-1px); }
    .palette-node:active { cursor: grabbing; }
    .palette-node-icon {
      width: 27px; height: 27px; border-radius: 7px; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0; font-size: 12px;
    }
    .palette-node-icon.trigger { background: #f1f5f9; color: #475569; }
    .palette-node-icon.action { background: var(--primary-soft); color: var(--primary); }
    .palette-node-copy strong { display: block; font-size: 10px; color: #334155; white-space: nowrap; }
    .palette-node-copy span { display: none; }
    .workflow-canvas {
      position: relative; padding: 18px 22px 24px; overflow: auto;
      background-color: #f8fafc;
      background-image: radial-gradient(#dbe3ec 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .workflow-canvas.drag-over { background-color: var(--primary-soft); box-shadow: inset 0 0 0 2px #7da9a6; }
    .canvas-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .canvas-header strong { font-size: 12px; color: #334155; }
    .canvas-header span { font-size: 10px; color: #94a3b8; }
    .workflow-flow { display: flex; align-items: stretch; max-width: 920px; margin: 0 auto; }
    .workflow-node {
      position: relative; display: flex; align-items: center; gap: 11px; flex: 1; min-width: 0;
      padding: 14px; border: 1px solid #cbd5e1; background: #fff; border-radius: 12px;
      box-shadow: 0 3px 10px rgba(15,23,42,.055); cursor: pointer; text-align: left;
      transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
    }
    .workflow-node:hover, .workflow-node.selected { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(31,95,99,.09); transform: translateY(-1px); }
    .workflow-node-kind {
      width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0; font-size: 15px;
    }
    .workflow-node.trigger .workflow-node-kind { background: #f1f5f9; color: #475569; }
    .workflow-node.condition .workflow-node-kind { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }
    .workflow-node.action .workflow-node-kind { background: var(--primary-soft); color: var(--primary); }
    .workflow-node-copy { min-width: 0; flex: 1; }
    .workflow-node-eyebrow { display: block; font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 3px; }
    .workflow-node-title { display: block; font-size: 13px; font-weight: 700; color: var(--text-main); }
    .workflow-node-summary { display: block; font-size: 10px; color: var(--text-muted); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .workflow-node-edit { color: #94a3b8; font-size: 11px; }
    .workflow-connector { width: 38px; height: 2px; background: #94a3b8; margin: auto 7px; position: relative; flex-shrink: 0; }
    .workflow-connector:after {
      content: ''; position: absolute; width: 7px; height: 7px; border-right: 2px solid #94a3b8;
      border-bottom: 2px solid #94a3b8; transform: rotate(-45deg); right: 0; top: -4px;
    }
    .builder-config-title {
      display: flex; align-items: center; gap: 8px; margin: 4px 0 14px; font-size: 13px;
      font-weight: 700; color: var(--text-main);
    }
    .builder-config-title:after { content: ''; height: 1px; background: var(--border); flex: 1; }
    .rules-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .rules-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .safety-options {
      margin-top: 14px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px;
      background: #fff; display: grid; grid-template-columns: 110px 1fr 1fr; gap: 12px; align-items: center;
    }
    .safety-check { display: flex; align-items: flex-start; gap: 8px; font-size: 11px; color: #475569; line-height: 1.35; cursor: pointer; }
    .safety-check input { margin-top: 2px; accent-color: var(--primary); }
    .safety-check.danger { color: #991b1b; }

    /* Interactive Pipeline Modal Stages Builder */
    .stages-builder-list {
      display: flex; flex-direction: column; gap: 10px; margin: 14px 0; max-height: 280px;
      overflow-y: auto; padding-right: 4px;
    }
    .stage-builder-item {
      display: flex; align-items: center; gap: 10px; background: #ffffff;
      border: 1px solid var(--border); border-radius: 10px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    }
    .color-chip {
      width: 26px; height: 26px; border-radius: 6px; cursor: pointer; border: 2px solid #fff;
      box-shadow: 0 0 0 1px #cbd5e1; flex-shrink: 0;
    }
    .preset-templates-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .preset-chip {
      background: var(--primary-soft); color: var(--primary); border: 1px solid var(--primary-border); padding: 7px 14px;
      border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;
    }
    .preset-chip:hover { background: #dfecea; }

    /* Live Preview Bar */
    .live-preview-box { background: #ffffff; border: 1px solid var(--border); border-radius: 10px; padding: 14px; margin-top: 16px; }

    /* Stats Overview */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .stat-card-icon {
      width: 46px; height: 46px; border-radius: 10px; display: flex; align-items: center;
      justify-content: center; font-size: 20px;
    }
    .stat-card-icon.blue { background: var(--primary-soft); color: var(--primary); }
    .stat-card-icon.green { background: #f0fdf4; color: #16a34a; }
    .stat-card-icon.purple { background: #f1f5f9; color: #475569; }
    .stat-card-icon.amber { background: #fffbeb; color: #d97706; }
    .stat-card-info h3 { font-size: 22px; font-weight: 700; color: var(--text-main); line-height: 1.2; }
    .stat-card-info p { font-size: 12px; font-weight: 500; color: var(--text-muted); margin-top: 2px; }

    /* Standard Cards & Tables */
    .card {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .card-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;
      padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;
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
      display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px;
      font-size: 12px; font-weight: 600;
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
    .form-control:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(31,95,99,.10); }
    textarea.form-control { resize: vertical; min-height: 90px; }

    /* Modal */
    .modal-backdrop {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.5);
      backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
    }
    .modal {
      background: #fff; border-radius: 18px; max-width: 1160px; width: 100%; max-height: 92vh;
      overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    }
    .modal-header {
      padding: 22px 26px; border-bottom: 1px solid var(--border); display: flex;
      align-items: center; justify-content: space-between;
    }
    .modal-header h3 { font-size: 17px; font-weight: 700; }
    .btn-close { background: none; border: none; font-size: 18px; color: var(--text-muted); cursor: pointer; }
    .modal-body { padding: 26px; overflow-y: auto; }
    .modal-footer {
      padding: 18px 26px; border-top: 1px solid var(--border); display: flex;
      justify-content: flex-end; gap: 12px; background: #f8fafc; border-radius: 0 0 18px 18px;
    }
    .btn-secondary {
      background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 10px 18px;
      font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer;
    }

    /* Logs view */
    .log-row {
      padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-family: monospace; font-size: 12px;
      display: flex; align-items: center; gap: 12px;
    }
    .log-row:last-child { border-bottom: none; }
    .log-tag { font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
    .log-tag.info { background: var(--primary-soft); color: var(--primary); }
    .log-tag.success { background: #f0fdf4; color: #16a34a; }
    .log-tag.warn { background: #fffbeb; color: #d97706; }
    .log-tag.error { background: #fef2f2; color: #dc2626; }

    /* Webhook URL display */
    .url-box {
      background: #f8fafc; border: 1px solid var(--border); border-radius: 8px;
      padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .url-box code { font-family: monospace; font-size: 13px; color: var(--text-main); word-break: break-all; }
    @media (max-width: 760px) {
      .top-header { height: 60px; padding: 0 14px; }
      .header-brand { min-width: 0; gap: 9px; }
      .brand-icon { width: 32px; height: 32px; font-size: 14px; flex-shrink: 0; }
      .brand-title { min-width: 0; }
      .brand-title h1 { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .brand-title span, .status-indicator, .btn-logout span { display: none; }
      .header-actions { gap: 6px; }
      .btn-logout { padding: 8px 10px; }
      .tab-nav-wrapper { padding: 0 14px; overflow: hidden; }
      .tab-nav { gap: 16px; overflow-x: auto; scrollbar-width: none; }
      .tab-nav::-webkit-scrollbar { display: none; }
      .tab-btn { padding: 12px 2px; font-size: 12px; }
      .main-container { padding: 20px 14px; }
      .master-switch-bar { padding: 13px 14px; gap: 10px; }
      .switch-left { min-width: 0; gap: 10px; }
      .switch-icon { width: 36px; height: 36px; font-size: 14px; flex-shrink: 0; }
      .switch-text { min-width: 0; }
      .switch-text h3 { font-size: 13px; }
      .switch-text p { font-size: 11px; line-height: 1.35; }
      .master-switch-bar > .toggle, .auto-card-header > .toggle { flex-shrink: 0; }
      .section-toolbar { align-items: flex-start; gap: 12px; }
      .section-title h2 { font-size: 17px; }
      .section-title p { font-size: 11px; line-height: 1.4; }
      .btn-create { padding: 10px 13px; flex-shrink: 0; }
      .automations-grid { grid-template-columns: 1fr; gap: 14px; }
      .auto-card { padding: 18px; }
      .auto-card-title { padding-right: 8px; }
      .badge { font-size: 9px; padding: 5px 8px; }
      .modal-backdrop { padding: 0; align-items: flex-end; }
      .modal { max-height: 96vh; border-radius: 18px 18px 0 0; }
      .modal-body { padding: 18px; }
      .node-library { align-items: flex-start; }
      .node-library-intro { width: 100%; }
      .node-group { width: 100%; margin-left: 0; overflow-x: auto; padding-bottom: 3px; }
      .workflow-canvas { padding: 18px 14px; }
      .workflow-flow { flex-direction: column; }
      .workflow-connector { width: 2px; height: 24px; margin: 0 auto; }
      .workflow-connector:after { transform: rotate(45deg); right: -3px; top: auto; bottom: 0; }
      .builder-quick-start { align-items: flex-start; flex-direction: column; }
      .automation-presets { justify-content: flex-start; }
      .visual-options-grid { grid-template-columns: 1fr; }
      .rules-grid, .rules-grid.three { grid-template-columns: 1fr; }
      .safety-options { grid-template-columns: 1fr; }
    }
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
        <input type="checkbox" id="globalAutomationToggle" onchange="handleGlobalToggle()" disabled>
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

    <!-- TAB 2: FUNIS / PIPELINES (VISUAL ROADMAP FLOW) -->
    <div id="tab-pipelines" class="tab-content">
      <div class="section-toolbar">
        <div class="section-title">
          <h2>Funis de Vendas do Kommo (Pipelines)</h2>
          <p>Visualize o fluxo de etapas de cada funil ou crie novos funis de forma 100% visual</p>
        </div>
        <button class="btn-create" onclick="openCreatePipelineModal()">
          <i class="fas fa-plus"></i>
          <span>Novo Funil / Pipeline</span>
        </button>
      </div>

      <div class="pipelines-grid" id="pipelinesGrid">
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
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

  <!-- MODAL: CONSTRUTOR VISUAL DE AUTOMAÇÃO EM PASSOS -->
  <div class="modal-backdrop" id="autoModal">
    <div class="modal">
      <div class="modal-header">
        <h3 id="modalTitle"><i class="fas fa-magic" style="color: var(--primary); margin-right: 8px;"></i> Construtor Visual de Automação</h3>
        <button class="btn-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <form id="automationForm">
          <input type="hidden" id="autoId">
          <input type="hidden" id="autoTrigger" value="message_add">
          <input type="hidden" id="actionType" value="ai_chat">

          <div class="form-group">
            <label for="autoName">Nome da Automação *</label>
            <input type="text" id="autoName" class="form-control" placeholder="Ex: Atendimento Inteligente - Muay Thai Adulto" required>
          </div>

          <div class="form-group">
            <label for="autoDesc">Descrição (opcional)</label>
            <input type="text" id="autoDesc" class="form-control" placeholder="Ex: Responde automaticamente leads que chegam pelo WhatsApp">
          </div>

          <div class="builder-quick-start">
            <div>
              <strong>Comece com um modelo pronto</strong>
              <span>Escolha um exemplo e ajuste os nós conforme a sua operação.</span>
            </div>
            <div class="automation-presets">
              <button type="button" class="automation-preset" onclick="applyAutomationPreset('ai')"><i class="fas fa-robot"></i> Atendimento com IA</button>
              <button type="button" class="automation-preset" onclick="applyAutomationPreset('human')"><i class="fas fa-headset"></i> Transbordo humano</button>
              <button type="button" class="automation-preset" onclick="applyAutomationPreset('qualification')"><i class="fas fa-user-check"></i> Qualificar lead</button>
            </div>
          </div>

          <div class="automation-builder">
            <aside class="node-library">
              <div class="node-library-intro">
                <div class="node-library-title">Adicionar ao fluxo</div>
                <div class="node-library-help">Arraste ou clique em uma opção.</div>
              </div>

              <div class="node-group">
                <div class="node-group-label">Gatilhos</div>
                <button type="button" class="palette-node" draggable="true" ondragstart="beginNodeDrag(event, 'trigger', 'message_add')" onclick="addNodeFromPalette('trigger', 'message_add')">
                  <span class="palette-node-icon trigger"><i class="fas fa-comment-dots"></i></span>
                  <span class="palette-node-copy"><strong>Nova mensagem</strong><span>WhatsApp recebido</span></span>
                </button>
                <button type="button" class="palette-node" draggable="true" ondragstart="beginNodeDrag(event, 'trigger', 'lead_add')" onclick="addNodeFromPalette('trigger', 'lead_add')">
                  <span class="palette-node-icon trigger"><i class="fas fa-user-plus"></i></span>
                  <span class="palette-node-copy"><strong>Novo lead</strong><span>Entrada no Kommo</span></span>
                </button>
                <button type="button" class="palette-node" draggable="true" ondragstart="beginNodeDrag(event, 'trigger', 'lead_stage_change')" onclick="addNodeFromPalette('trigger', 'lead_stage_change')">
                  <span class="palette-node-icon trigger"><i class="fas fa-arrow-right-arrow-left"></i></span>
                  <span class="palette-node-copy"><strong>Mudança de etapa</strong><span>Movido no funil</span></span>
                </button>
              </div>

              <div class="node-group">
                <div class="node-group-label">Ações</div>
                <button type="button" class="palette-node" draggable="true" ondragstart="beginNodeDrag(event, 'action', 'ai_chat')" onclick="addNodeFromPalette('action', 'ai_chat')">
                  <span class="palette-node-icon action"><i class="fas fa-robot"></i></span>
                  <span class="palette-node-copy"><strong>Responder com IA</strong><span>Resposta contextual</span></span>
                </button>
                <button type="button" class="palette-node" draggable="true" ondragstart="beginNodeDrag(event, 'action', 'send_template')" onclick="addNodeFromPalette('action', 'send_template')">
                  <span class="palette-node-icon action"><i class="fas fa-paper-plane"></i></span>
                  <span class="palette-node-copy"><strong>Enviar mensagem</strong><span>Texto predefinido</span></span>
                </button>
                <button type="button" class="palette-node" draggable="true" ondragstart="beginNodeDrag(event, 'action', 'change_stage')" onclick="addNodeFromPalette('action', 'change_stage')">
                  <span class="palette-node-icon action"><i class="fas fa-tags"></i></span>
                  <span class="palette-node-copy"><strong>Atualizar CRM</strong><span>Etapa e tags</span></span>
                </button>
              </div>
            </aside>

            <section class="workflow-canvas" id="workflowCanvas" ondragover="allowNodeDrop(event)" ondragleave="leaveNodeDrop(event)" ondrop="dropNodeOnCanvas(event)">
              <div class="canvas-header">
                <strong>Fluxo da automação</strong>
                <span>Entrada → regras → ação</span>
              </div>
              <div class="workflow-flow" id="workflowFlow"></div>
            </section>
          </div>

          <div class="builder-config-title"><i class="fas fa-sliders"></i> Configuração detalhada dos nós</div>

          <!-- PASSO 1: GATILHO VISUAL -->
          <div class="flow-step-card" id="configTrigger">
            <div class="flow-step-header">
              <span class="step-number">1</span>
              <span class="flow-step-title">Quando acontecer este evento no Kommo CRM:</span>
            </div>
            <div class="visual-options-grid">
              <div class="visual-choice-card selected" id="trigCard_message_add" onclick="selectTrigger('message_add')">
                <div class="visual-choice-icon"><i class="fas fa-comments"></i></div>
                <div class="visual-choice-title">Nova Mensagem</div>
                <div class="visual-choice-desc">Quando o lead enviar uma mensagem no WhatsApp</div>
              </div>
              <div class="visual-choice-card" id="trigCard_lead_add" onclick="selectTrigger('lead_add')">
                <div class="visual-choice-icon"><i class="fas fa-user-plus"></i></div>
                <div class="visual-choice-title">Novo Lead Criado</div>
                <div class="visual-choice-desc">Quando um lead novo entrar no funil de vendas</div>
              </div>
              <div class="visual-choice-card" id="trigCard_lead_stage_change" onclick="selectTrigger('lead_stage_change')">
                <div class="visual-choice-icon"><i class="fas fa-exchange-alt"></i></div>
                <div class="visual-choice-title">Mudança de Etapa</div>
                <div class="visual-choice-desc">Quando o lead for movido de fase no funil</div>
              </div>
            </div>
          </div>

          <!-- PASSO 2: FUNIL E ETAPAS -->
          <div class="flow-step-card" id="configConditions">
            <div class="flow-step-header">
              <span class="step-number">2</span>
              <span class="flow-step-title">Em qual Funil (Pipeline) aplicar esta regra:</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="autoPipeline">Funil / Pipeline</label>
                <select id="autoPipeline" class="form-control" onchange="updateStagesDropdown()">
                  <option value="all">Ambos os Funis Ativos</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="autoStage">Etapa Específica</label>
                <select id="autoStage" class="form-control">
                  <option value="all">Todas as Etapas</option>
                </select>
              </div>
            </div>
            <div class="form-group" style="margin:14px 0 0;">
              <label for="autoStopAtStage">Desligar a automação a partir da etapa</label>
              <select id="autoStopAtStage" class="form-control">
                <option value="">Não desligar por avanço no funil</option>
                <option value="Lead">Lead e todas as etapas seguintes</option>
              </select>
              <span style="display:block;font-size:10px;color:var(--text-muted);margin-top:4px;">Mesmo que a tag continue no contato, a IA não responde ao alcançar esta etapa.</span>
            </div>
          </div>

          <!-- PASSO 3: AÇÃO PRINCIPAL -->
          <div class="flow-step-card" id="configAction">
            <div class="flow-step-header">
              <span class="step-number">3</span>
              <span class="flow-step-title">O que o sistema deve fazer automaticamente:</span>
            </div>
            <div class="visual-options-grid">
              <div class="visual-choice-card selected" id="actCard_ai_chat" onclick="selectAction('ai_chat')">
                <div class="visual-choice-icon"><i class="fas fa-robot"></i></div>
                <div class="visual-choice-title">Responder com IA</div>
                <div class="visual-choice-desc">A IA lê o FAQ oficial e responde de forma humana e persuasiva</div>
              </div>
              <div class="visual-choice-card" id="actCard_send_template" onclick="selectAction('send_template')">
                <div class="visual-choice-icon"><i class="fas fa-paper-plane"></i></div>
                <div class="visual-choice-title">Mensagem Pronta</div>
                <div class="visual-choice-desc">Enviar template fixo com nome e variáveis do cliente</div>
              </div>
              <div class="visual-choice-card" id="actCard_change_stage" onclick="selectAction('change_stage')">
                <div class="visual-choice-icon"><i class="fas fa-tags"></i></div>
                <div class="visual-choice-title">Atualizar CRM / Tags</div>
                <div class="visual-choice-desc">Apenas gerenciar tags e avançar etapa no funil</div>
              </div>
            </div>

            <div id="aiPromptFields" style="margin-top: 14px;">
              <label for="aiCustomPrompt" style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px;">Prompt inicial da IA</label>
              <textarea id="aiCustomPrompt" class="form-control" rows="6" placeholder="Ex: Atue como Márcia, consultora da CWB Fight Club. Converse de forma acolhedora, objetiva e profissional..."></textarea>
              <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:5px;">Define identidade, tom de voz e regras de atendimento. A base de conhecimento continua sendo usada para informações como preços, horários e unidades.</span>
            </div>

            <!-- Template text (se selecionado) -->
            <div id="templateFields" style="display: none; margin-top: 14px;">
              <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px;">Texto da Mensagem Pronta:</label>
              <textarea id="templateText" class="form-control" rows="3" placeholder="Olá {{name}}, recebemos sua mensagem! Em instantes entraremos em contato."></textarea>
              <span style="font-size: 11px; color: var(--text-muted);">Variáveis automáticas: {{name}}, {{first_name}}, {{phone}}, {{lead_id}}</span>
            </div>
          </div>

          <!-- PASSO 4: FILTROS E TAGS OPCIONAIS -->
          <div class="flow-step-card" id="configRules" style="margin-bottom: 0;">
            <div class="flow-step-header">
              <span class="step-number">4</span>
              <span class="flow-step-title">Regras Adicionais e Tags (Opcional):</span>
            </div>
            <div class="rules-grid" style="margin-bottom: 12px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="actionAddTag">Adicionar Tag no Kommo</label>
                <input type="text" id="actionAddTag" class="form-control" placeholder="Ex: Em Atendimento IA">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="actionRemoveTag">Remover Tag no Kommo</label>
                <input type="text" id="actionRemoveTag" class="form-control" placeholder="Ex: Atendimento Humano">
              </div>
            </div>
            <div class="rules-grid three">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="autoRequiredTags">Exigir a tag:</label>
                <input type="text" id="autoRequiredTags" class="form-control" placeholder="Ex: Contato Inicial">
                <span style="display:block;font-size:10px;color:var(--text-muted);margin-top:4px;">O lead precisa ter todas as tags informadas.</span>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="autoExcludedTags">Bloquear se tiver a tag:</label>
                <input type="text" id="autoExcludedTags" class="form-control" placeholder="Ex: Atendimento Humano, VIP">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="autoKeywords">Palavras-chave no texto:</label>
                <input type="text" id="autoKeywords" class="form-control" placeholder="Ex: humano, gerente (vazio = todas)">
              </div>
            </div>
            <div class="safety-options">
              <div class="form-group" style="margin-bottom:0;">
                <label for="autoPriority">Prioridade</label>
                <input type="number" id="autoPriority" class="form-control" value="0" min="0" max="999">
              </div>
              <label class="safety-check">
                <input type="checkbox" id="autoStopAfterMatch">
                <span><strong>Resposta exclusiva</strong><br>Se executar, não permite outra automação responder ao mesmo evento.</span>
              </label>
              <label class="safety-check danger">
                <input type="checkbox" id="autoAllowAll">
                <span><strong>Executar em todos os leads</strong><br>Alto impacto: ignora a exigência de coluna ou tag.</span>
              </label>
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="button" class="btn-create" onclick="saveAutomationFromModal()">
          <i class="fas fa-check"></i> Salvar e Ativar Automação
        </button>
      </div>
    </div>
  </div>

  <!-- MODAL: CONSTRUTOR VISUAL DE NOVO FUNIL (PIPELINE) -->
  <div class="modal-backdrop" id="pipelineModal">
    <div class="modal">
      <div class="modal-header">
        <h3><i class="fas fa-filter" style="color: var(--primary); margin-right: 8px;"></i> Construtor Visual de Funil (Pipeline)</h3>
        <button class="btn-close" onclick="closePipelineModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="newPipelineName">Nome do Novo Funil *</label>
          <input type="text" id="newPipelineName" class="form-control" placeholder="Ex: Vendas Muay Thai - Unidade Mercês" oninput="renderStageLivePreview()" required>
        </div>

        <div style="margin: 16px 0;">
          <label style="font-size: 12px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 8px;">Modelos Rápidos de Funil (1 Clique):</label>
          <div class="preset-templates-bar">
            <button type="button" class="preset-chip" onclick="applyPipelinePreset('cwb')"><i class="fas fa-shield-alt"></i> Vendas Academia (CWB)</button>
            <button type="button" class="preset-chip" onclick="applyPipelinePreset('whatsapp')"><i class="fas fa-robot"></i> Atendimento IA WhatsApp</button>
            <button type="button" class="preset-chip" onclick="applyPipelinePreset('reactivation')"><i class="fas fa-redo"></i> Reativação de Alunos</button>
          </div>
        </div>

        <div class="form-group">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <label style="margin-bottom: 0;">Etapas do Funil</label>
            <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="addStageBuilderItem()">
              <i class="fas fa-plus"></i> Adicionar Etapa
            </button>
          </div>
          
          <div class="stages-builder-list" id="stagesBuilderList"></div>
        </div>

        <!-- Live Visual Preview -->
        <div class="live-preview-box">
          <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Visualização do Fluxo em Tempo Real:</label>
          <div class="stages-flow-wrapper" id="modalLiveFlowPreview" style="margin-top: 8px; padding-bottom: 4px;"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" onclick="closePipelineModal()">Cancelar</button>
        <button type="button" class="btn-create" onclick="savePipelineFromModal()">
          <i class="fas fa-check"></i> Criar Funil no Kommo CRM
        </button>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = '/home/workflows/api';
    const START_TIME = Date.now();
    let currentAutomations = [];
    let kommoPipelines = [];

    // Stage colors palette
    const PRESET_COLORS = ['#1f5f63', '#334155', '#64748b', '#15803d', '#a16207', '#b42318'];
    let builderStages = [];
    let draggedAutomationNode = null;

    const AUTOMATION_NODE_CATALOG = {
      trigger: {
        message_add: { title: 'Nova mensagem recebida', summary: 'Quando um lead enviar uma mensagem', icon: 'fa-comment-dots' },
        lead_add: { title: 'Novo lead criado', summary: 'Quando um lead entrar no Kommo', icon: 'fa-user-plus' },
        lead_stage_change: { title: 'Mudança de etapa', summary: 'Quando o lead avançar no funil', icon: 'fa-arrow-right-arrow-left' }
      },
      action: {
        ai_chat: { title: 'Responder com inteligência artificial', summary: 'Usa a base de conhecimento e envia no WhatsApp', icon: 'fa-robot' },
        send_template: { title: 'Enviar mensagem pronta', summary: 'Envia um texto predefinido ao contato', icon: 'fa-paper-plane' },
        change_stage: { title: 'Atualizar CRM e tags', summary: 'Move a oportunidade e organiza o atendimento', icon: 'fa-tags' }
      }
    };

    function beginNodeDrag(e, kind, value) {
      draggedAutomationNode = { kind, value };
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', kind + ':' + value);
    }

    function allowNodeDrop(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      document.getElementById('workflowCanvas').classList.add('drag-over');
    }

    function leaveNodeDrop(e) {
      if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
      }
    }

    function dropNodeOnCanvas(e) {
      e.preventDefault();
      document.getElementById('workflowCanvas').classList.remove('drag-over');
      let node = draggedAutomationNode;
      const raw = e.dataTransfer.getData('text/plain');
      if (!node && raw.includes(':')) {
        const parts = raw.split(':');
        node = { kind: parts[0], value: parts[1] };
      }
      if (node) addNodeFromPalette(node.kind, node.value);
      draggedAutomationNode = null;
    }

    function addNodeFromPalette(kind, value) {
      if (kind === 'trigger') selectTrigger(value);
      if (kind === 'action') selectAction(value);
      renderAutomationCanvas(kind);
    }

    function getConditionSummary() {
      const pipeline = document.getElementById('autoPipeline');
      const stage = document.getElementById('autoStage');
      const keywords = document.getElementById('autoKeywords').value.trim();
      const requiredTags = document.getElementById('autoRequiredTags').value.trim();
      const blockedTags = document.getElementById('autoExcludedTags').value.trim();
      const stopAtStage = document.getElementById('autoStopAtStage').value;
      const allowAll = document.getElementById('autoAllowAll').checked;
      const parts = [];
      if (pipeline && pipeline.value !== 'all') parts.push(pipeline.options[pipeline.selectedIndex]?.text || 'Funil específico');
      if (stage && stage.value !== 'all') parts.push(stage.options[stage.selectedIndex]?.text || 'Etapa específica');
      if (requiredTags) parts.push('Exige: ' + requiredTags);
      if (keywords) parts.push('Palavras: ' + keywords);
      if (blockedTags) parts.push('Bloqueia: ' + blockedTags);
      if (stopAtStage) parts.push('Desliga em: ' + stopAtStage);
      if (allowAll) parts.push('Escopo global confirmado');
      return parts.length ? parts.join(' · ') : 'Bloqueada — defina uma coluna, tag ou palavra-chave';
    }

    function focusBuilderSection(sectionId, nodeKind) {
      document.querySelectorAll('.workflow-node').forEach(el => el.classList.remove('selected'));
      const activeNode = document.querySelector('.workflow-node[data-kind="' + nodeKind + '"]');
      if (activeNode) activeNode.classList.add('selected');
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        section.style.boxShadow = '0 0 0 3px rgba(31,95,99,.12)';
        setTimeout(() => { section.style.boxShadow = ''; }, 900);
      }
    }

    function renderAutomationCanvas(selectedKind = '') {
      const flow = document.getElementById('workflowFlow');
      if (!flow) return;
      const triggerType = document.getElementById('autoTrigger').value || 'message_add';
      const actionType = document.getElementById('actionType').value || 'ai_chat';
      const trigger = AUTOMATION_NODE_CATALOG.trigger[triggerType] || AUTOMATION_NODE_CATALOG.trigger.message_add;
      const action = AUTOMATION_NODE_CATALOG.action[actionType] || AUTOMATION_NODE_CATALOG.action.ai_chat;
      const conditionSummary = getConditionSummary();

      function nodeHtml(kind, eyebrow, title, summary, icon, sectionId) {
        const selected = selectedKind === kind ? ' selected' : '';
        return '<button type="button" class="workflow-node ' + kind + selected + '" data-kind="' + kind + '" onclick="focusBuilderSection(&quot;' + sectionId + '&quot;, &quot;' + kind + '&quot;)">' +
          '<span class="workflow-node-kind"><i class="fas ' + icon + '"></i></span>' +
          '<span class="workflow-node-copy"><span class="workflow-node-eyebrow">' + eyebrow + '</span>' +
          '<span class="workflow-node-title">' + escapeHtml(title) + '</span>' +
          '<span class="workflow-node-summary">' + escapeHtml(summary) + '</span></span>' +
          '<span class="workflow-node-edit"><i class="fas fa-pen"></i></span></button>';
      }

      flow.innerHTML =
        nodeHtml('trigger', 'Quando acontecer', trigger.title, trigger.summary, trigger.icon, 'configTrigger') +
        '<div class="workflow-connector"></div>' +
        nodeHtml('condition', 'Somente se', 'Filtros e condições', conditionSummary, 'fa-filter', 'configConditions') +
        '<div class="workflow-connector"></div>' +
        nodeHtml('action', 'Então faça', action.title, action.summary, action.icon, 'configAction');
    }

    function applyAutomationPreset(preset) {
      if (preset === 'human') {
        document.getElementById('autoName').value = 'Transbordo para atendimento humano';
        document.getElementById('autoDesc').value = 'Identifica pedidos de atendimento humano e encaminha a conversa para a equipe.';
        selectTrigger('message_add');
        selectAction('send_template');
        document.getElementById('autoKeywords').value = 'humano, atendente, falar com pessoa, gerente, suporte';
        document.getElementById('autoRequiredTags').value = 'Contato Inicial';
        document.getElementById('autoExcludedTags').value = 'Atendimento Humano';
        document.getElementById('templateText').value = 'Entendido! Vou encaminhar seu atendimento para uma pessoa da nossa equipe.';
        document.getElementById('actionAddTag').value = 'Atendimento Humano';
        document.getElementById('actionRemoveTag').value = 'Em Atendimento IA';
        document.getElementById('autoPriority').value = '100';
        document.getElementById('autoStopAfterMatch').checked = true;
        document.getElementById('autoAllowAll').checked = false;
        ensureStopStageOption('Lead');
      } else if (preset === 'qualification') {
        document.getElementById('autoName').value = 'Qualificação automática de novos leads';
        document.getElementById('autoDesc').value = 'Organiza novos contatos no CRM para acelerar o primeiro atendimento.';
        selectTrigger('lead_add');
        selectAction('change_stage');
        document.getElementById('autoKeywords').value = '';
        document.getElementById('autoRequiredTags').value = 'Contato Inicial';
        document.getElementById('autoExcludedTags').value = '';
        document.getElementById('actionAddTag').value = 'Lead Qualificado';
        document.getElementById('actionRemoveTag').value = '';
        document.getElementById('autoPriority').value = '20';
        document.getElementById('autoStopAfterMatch').checked = false;
        document.getElementById('autoAllowAll').checked = false;
        ensureStopStageOption('Lead');
      } else {
        document.getElementById('autoName').value = 'Atendimento inteligente com IA';
        document.getElementById('autoDesc').value = 'Responde automaticamente mensagens usando a base de conhecimento da empresa.';
        selectTrigger('message_add');
        selectAction('ai_chat');
        document.getElementById('autoKeywords').value = '';
        document.getElementById('autoRequiredTags').value = 'Contato Inicial';
        document.getElementById('autoExcludedTags').value = 'Atendimento Humano, Nao Perturbe';
        document.getElementById('actionAddTag').value = 'Em Atendimento IA';
        document.getElementById('actionRemoveTag').value = '';
        document.getElementById('autoPriority').value = '10';
        document.getElementById('autoStopAfterMatch').checked = false;
        document.getElementById('autoAllowAll').checked = false;
        ensureStopStageOption('Lead');
      }
      renderAutomationCanvas();
    }

    function setupVisualAutomationBuilder() {
      ['autoPipeline', 'autoStage', 'autoStopAtStage', 'autoRequiredTags', 'autoExcludedTags', 'autoKeywords', 'autoAllowAll', 'templateText', 'actionAddTag', 'actionRemoveTag'].forEach(id => {
        const field = document.getElementById(id);
        if (field) {
          field.addEventListener('input', () => renderAutomationCanvas());
          field.addEventListener('change', () => renderAutomationCanvas());
        }
      });
      renderAutomationCanvas();
    }

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
          'message_add': 'Nova Mensagem WhatsApp',
          'lead_add': 'Novo Lead no CRM',
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
                \${a.conditions?.requiredTags?.length ? '<span class="badge badge-condition"><i class="fas fa-tag"></i> Exige ' + escapeHtml(a.conditions.requiredTags.join(', ')) + '</span>' : ''}
                \${a.conditions?.stopAtStageName ? '<span class="badge badge-condition"><i class="fas fa-stop-circle"></i> Para em ' + escapeHtml(a.conditions.stopAtStageName) + '</span>' : ''}
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

    function selectTrigger(triggerType) {
      document.getElementById('autoTrigger').value = triggerType;
      document.querySelectorAll('[id^="trigCard_"]').forEach(el => el.classList.remove('selected'));
      const active = document.getElementById('trigCard_' + triggerType);
      if (active) active.classList.add('selected');
      renderAutomationCanvas('trigger');
    }

    function selectAction(actionType) {
      document.getElementById('actionType').value = actionType;
      document.querySelectorAll('[id^="actCard_"]').forEach(el => el.classList.remove('selected'));
      const active = document.getElementById('actCard_' + actionType);
      if (active) active.classList.add('selected');
      document.getElementById('templateFields').style.display = actionType === 'send_template' ? 'block' : 'none';
      document.getElementById('aiPromptFields').style.display = actionType === 'ai_chat' ? 'block' : 'none';
      renderAutomationCanvas('action');
    }

    function openCreateModal(defaultPipelineId = null) {
      document.getElementById('modalTitle').innerHTML = '<i class="fas fa-magic" style="color: var(--primary); margin-right: 8px;"></i> Nova Automação Visual';
      document.getElementById('autoId').value = '';
      document.getElementById('autoName').value = '';
      document.getElementById('autoDesc').value = '';
      selectTrigger('message_add');
      selectAction('ai_chat');
      document.getElementById('autoPipeline').value = defaultPipelineId || 'all';
      updateStagesDropdown();
      document.getElementById('autoExcludedTags').value = 'Atendimento Humano, Nao Perturbe';
      document.getElementById('autoRequiredTags').value = 'Contato Inicial';
      document.getElementById('autoKeywords').value = '';
      document.getElementById('templateText').value = '';
      document.getElementById('aiCustomPrompt').value = '';
      document.getElementById('actionAddTag').value = 'Em Atendimento IA';
      document.getElementById('actionRemoveTag').value = '';
      document.getElementById('autoPriority').value = '0';
      document.getElementById('autoStopAfterMatch').checked = false;
      document.getElementById('autoAllowAll').checked = false;
      ensureStopStageOption('Lead');
      document.getElementById('autoModal').style.display = 'flex';
      renderAutomationCanvas();
    }

    function openEditModal(id) {
      const a = currentAutomations.find(item => item.id === id);
      if (!a) return;
      document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit" style="color: var(--primary); margin-right: 8px;"></i> Editar Automação';
      document.getElementById('autoId').value = a.id;
      document.getElementById('autoName').value = a.name || '';
      document.getElementById('autoDesc').value = a.description || '';
      selectTrigger(a.trigger || 'message_add');
      
      document.getElementById('autoPipeline').value = a.conditions?.pipelineId || 'all';
      updateStagesDropdown(a.conditions?.stageId || 'all');
      document.getElementById('autoExcludedTags').value = (a.conditions?.excludedTags || []).join(', ');
      document.getElementById('autoRequiredTags').value = (a.conditions?.requiredTags || []).join(', ');
      document.getElementById('autoKeywords').value = a.conditions?.keywordMatch || '';
      
      const action = a.actions?.[0] || {};
      selectAction(action.type || 'ai_chat');
      document.getElementById('templateText').value = action.templateText || '';
      document.getElementById('aiCustomPrompt').value = action.customPrompt || '';
      document.getElementById('actionAddTag').value = action.addTagOnSuccess || '';
      document.getElementById('actionRemoveTag').value = action.removeTagOnSuccess || '';
      document.getElementById('autoPriority').value = String(a.priority || 0);
      document.getElementById('autoStopAfterMatch').checked = a.stopAfterMatch === true;
      document.getElementById('autoAllowAll').checked = a.conditions?.allowAllLeads === true;
      ensureStopStageOption(a.conditions?.stopAtStageName || '');
      document.getElementById('autoModal').style.display = 'flex';
      renderAutomationCanvas();
    }

    function closeModal() {
      document.getElementById('autoModal').style.display = 'none';
    }

    function updateStagesDropdown(selectedStageId = 'all') {
      const pipelineId = document.getElementById('autoPipeline').value;
      const stageSelect = document.getElementById('autoStage');
      stageSelect.innerHTML = '<option value="all">Todas as Etapas (Qualquer Fase)</option>';
      
      if (pipelineId !== 'all') {
        const p = kommoPipelines.find(item => String(item.id) === String(pipelineId));
        const statuses = p?._embedded?.statuses || [];
        statuses.forEach(st => {
          stageSelect.innerHTML += \`<option value="\${st.id}" \${String(st.id) === String(selectedStageId) ? 'selected' : ''}>\${escapeHtml(st.name)}</option>\`;
        });
      }
      renderAutomationCanvas();
    }

    async function saveAutomationFromModal() {
      const name = document.getElementById('autoName').value.trim();
      if (!name) {
        alert('Por favor, informe o nome da automação.');
        return;
      }

      const id = document.getElementById('autoId').value;
      const conditions = {
        pipelineId: document.getElementById('autoPipeline').value,
        stageId: document.getElementById('autoStage').value,
        requiredTags: document.getElementById('autoRequiredTags').value.split(',').map(s => s.trim()).filter(Boolean),
        excludedTags: document.getElementById('autoExcludedTags').value.split(',').map(s => s.trim()).filter(Boolean),
        keywordMatch: document.getElementById('autoKeywords').value.trim(),
        stopAtStageName: document.getElementById('autoStopAtStage').value,
        allowAllLeads: document.getElementById('autoAllowAll').checked,
      };
      const hasScope = conditions.allowAllLeads || conditions.pipelineId !== 'all' || conditions.stageId !== 'all' || conditions.requiredTags.length > 0 || conditions.keywordMatch;
      if (!hasScope) {
        alert('Defina onde esta automação pode atuar: selecione uma coluna, exija uma tag, informe palavras-chave ou confirme conscientemente todos os leads.');
        return;
      }
      const payload = {
        id: id || undefined,
        name,
        description: document.getElementById('autoDesc').value.trim(),
        priority: Number(document.getElementById('autoPriority').value || 0),
        stopAfterMatch: document.getElementById('autoStopAfterMatch').checked,
        trigger: document.getElementById('autoTrigger').value,
        conditions,
        actions: [
          {
            type: document.getElementById('actionType').value,
            templateText: document.getElementById('templateText').value.trim(),
            useCustomPrompt: Boolean(document.getElementById('aiCustomPrompt').value.trim()),
            customPrompt: document.getElementById('aiCustomPrompt').value.trim(),
            sendChannel: 'whatsapp_uazapi',
            addTagOnSuccess: document.getElementById('actionAddTag').value.trim(),
            removeTagOnSuccess: document.getElementById('actionRemoveTag').value.trim(),
            pipelineId: document.getElementById('autoPipeline').value,
            stageId: document.getElementById('autoStage').value,
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

    // ===== GESTÃO DE PIPELINES (FUNIS) VISUAL ROADMAP =====
    async function loadKommoPipelines() {
      try {
        const r = await fetch(API_BASE + '/kommo/pipelines');
        if (!r.ok) return;
        kommoPipelines = await r.json();
        
        // Atualiza selects
        const sel = document.getElementById('autoPipeline');
        sel.innerHTML = '<option value="all">Ambos os Funis Ativos (Geral)</option>' + kommoPipelines.map(p => \`
          <option value="\${p.id}">Funil: \${escapeHtml(p.name)}</option>
        \`).join('');
        populateStopStageOptions();

        // Renderiza grid de pipelines
        renderPipelinesGrid();
      } catch (err) {
        console.error(err);
      }
    }

    function populateStopStageOptions(selectedValue) {
      const select = document.getElementById('autoStopAtStage');
      if (!select) return;
      const previous = selectedValue !== undefined ? selectedValue : select.value;
      const names = [...new Set([
        'Lead',
        ...kommoPipelines.flatMap(p =>
          (p._embedded?.statuses || []).map(status => status.name).filter(Boolean)
        ),
      ])];
      select.innerHTML = '<option value="">Não desligar por avanço no funil</option>' + names.map(name =>
        '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + ' e etapas seguintes</option>'
      ).join('');
      ensureStopStageOption(previous);
    }

    function ensureStopStageOption(value) {
      const select = document.getElementById('autoStopAtStage');
      if (!select) return;
      const normalized = String(value || '');
      if (normalized && ![...select.options].some(option => option.value === normalized)) {
        select.add(new Option(normalized + ' e etapas seguintes', normalized));
      }
      select.value = normalized;
    }

    function renderPipelinesGrid() {
      const grid = document.getElementById('pipelinesGrid');
      if (!kommoPipelines || kommoPipelines.length === 0) {
        grid.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhum funil encontrado no Kommo CRM.</div>';
        return;
      }

      grid.innerHTML = kommoPipelines.map((p, pIdx) => {
        const statuses = p._embedded?.statuses || [];
        return \`
          <div class="pipeline-card">
            <div class="pipeline-header">
              <div class="pipeline-header-title">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--primary-soft); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;">
                  #\${pIdx + 1}
                </div>
                <div>
                  <h3>\${escapeHtml(p.name)}</h3>
                  <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
                    <span class="badge badge-trigger" style="font-size: 10px;">ID \${p.id}</span>
                    <span style="font-size: 12px; color: var(--text-muted);">\${statuses.length} Etapas no Fluxo</span>
                  </div>
                </div>
              </div>
              <button class="btn-create" style="padding: 8px 14px; font-size: 12px;" onclick="openCreateModal('\${p.id}')">
                <i class="fas fa-plus"></i> Criar Automação neste Funil
              </button>
            </div>
            
            <div class="stages-flow-wrapper">
              \${statuses.map((st, idx) => \`
                <div class="stage-flow-node" style="border-top-color: \${st.color || 'var(--primary)'}">
                  <span style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Etapa \${idx + 1}</span>
                  <span class="stage-node-title">\${escapeHtml(st.name)}</span>
                  <span class="stage-node-meta">ID \${st.id}</span>
                </div>
                \${idx < statuses.length - 1 ? '<i class="fas fa-arrow-right flow-arrow"></i>' : ''}
              \`).join('')}
            </div>
          </div>
        \`;
      }).join('');
    }

    // ===== CONSTRUTOR VISUAL DE PIPELINE NO MODAL =====
    function openCreatePipelineModal() {
      document.getElementById('newPipelineName').value = '';
      applyPipelinePreset('cwb');
      document.getElementById('pipelineModal').style.display = 'flex';
    }

    function closePipelineModal() {
      document.getElementById('pipelineModal').style.display = 'none';
    }

    function applyPipelinePreset(type) {
      if (type === 'cwb') {
        builderStages = [
          { name: 'Primeiro Contato', color: '#2563eb' },
          { name: 'Qualificação', color: '#0891b2' },
          { name: 'Aula Experimental', color: '#d97706' },
          { name: 'Matrícula Realizada', color: '#16a34a' }
        ];
      } else if (type === 'whatsapp') {
        builderStages = [
          { name: 'Novo Lead', color: '#2563eb' },
          { name: 'Em Atendimento IA', color: '#7c3aed' },
          { name: 'Horário Agendado', color: '#d97706' },
          { name: 'Atendimento Concluído', color: '#16a34a' }
        ];
      } else if (type === 'reactivation') {
        builderStages = [
          { name: 'Lead Inativo', color: '#dc2626' },
          { name: 'Mensagem Enviada', color: '#2563eb' },
          { name: 'Respondeu / Negociando', color: '#d97706' },
          { name: 'Rematriculado', color: '#16a34a' }
        ];
      }
      renderStageBuilderList();
    }

    function renderStageBuilderList() {
      const container = document.getElementById('stagesBuilderList');
      container.innerHTML = builderStages.map((st, idx) => \`
        <div class="stage-builder-item">
          <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); width: 22px;">#\${idx + 1}</span>
          <input type="color" class="color-chip" value="\${st.color}" onchange="builderStages[\${idx}].color=this.value; renderStageLivePreview()" title="Escolha a cor da etapa">
          <input type="text" class="form-control" value="\${escapeHtml(st.name)}" placeholder="Nome da etapa" oninput="builderStages[\${idx}].name=this.value; renderStageLivePreview()" style="flex: 1;">
          
          <button type="button" class="btn-icon" onclick="moveStageUp(\${idx})" title="Mover para cima" \${idx === 0 ? 'disabled style="opacity:0.3"' : ''}><i class="fas fa-arrow-up"></i></button>
          <button type="button" class="btn-icon" onclick="moveStageDown(\${idx})" title="Mover para baixo" \${idx === builderStages.length - 1 ? 'disabled style="opacity:0.3"' : ''}><i class="fas fa-arrow-down"></i></button>
          <button type="button" class="btn-icon delete" onclick="removeStageBuilderItem(\${idx})" title="Excluir"><i class="fas fa-trash"></i></button>
        </div>
      \`).join('');
      renderStageLivePreview();
    }

    function addStageBuilderItem() {
      const color = PRESET_COLORS[builderStages.length % PRESET_COLORS.length];
      builderStages.push({ name: 'Nova Etapa', color });
      renderStageBuilderList();
    }

    function removeStageBuilderItem(idx) {
      if (builderStages.length <= 1) {
        alert('O funil deve conter pelo menos 1 etapa.');
        return;
      }
      builderStages.splice(idx, 1);
      renderStageBuilderList();
    }

    function moveStageUp(idx) {
      if (idx <= 0) return;
      const temp = builderStages[idx];
      builderStages[idx] = builderStages[idx - 1];
      builderStages[idx - 1] = temp;
      renderStageBuilderList();
    }

    function moveStageDown(idx) {
      if (idx >= builderStages.length - 1) return;
      const temp = builderStages[idx];
      builderStages[idx] = builderStages[idx + 1];
      builderStages[idx + 1] = temp;
      renderStageBuilderList();
    }

    function renderStageLivePreview() {
      const preview = document.getElementById('modalLiveFlowPreview');
      if (!builderStages || builderStages.length === 0) {
        preview.innerHTML = '<span style="font-size: 12px; color: var(--text-muted);">Nenhuma etapa configurada</span>';
        return;
      }
      preview.innerHTML = builderStages.map((st, idx) => \`
        <div class="stage-flow-node" style="border-top-color: \${st.color || 'var(--primary)'}; min-width: 140px; padding: 10px 14px;">
          <span style="font-size: 10px; font-weight: 700; color: var(--text-muted);">Etapa \${idx + 1}</span>
          <span style="font-size: 13px; font-weight: 700; color: var(--text-main);">\${escapeHtml(st.name || 'Sem nome')}</span>
        </div>
        \${idx < builderStages.length - 1 ? '<i class="fas fa-arrow-right flow-arrow"></i>' : ''}
      \`).join('');
    }

    async function savePipelineFromModal() {
      const name = document.getElementById('newPipelineName').value.trim();
      if (!name) {
        alert('Por favor, informe o nome do funil.');
        return;
      }
      const validStages = builderStages.filter(s => s.name && s.name.trim());
      if (validStages.length === 0) {
        alert('Configure pelo menos 1 etapa válida.');
        return;
      }

      try {
        const r = await fetch(API_BASE + '/kommo/pipelines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, statuses: validStages })
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
      if (!active && !confirm('Pausar o motor? Nenhuma automação responderá aos leads até ele ser reativado.')) {
        checkbox.checked = true;
        return;
      }
      checkbox.disabled = true;
      try {
        const r = await fetch(API_BASE + '/automation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active })
        });
        if (!r.ok) throw new Error('Falha ao salvar estado');
        const data = await r.json();
        updateGlobalUI(data.active);
      } catch (err) {
        console.error(err);
        await loadGlobalAutomationState();
      } finally {
        checkbox.disabled = false;
      }
    }

    async function loadGlobalAutomationState() {
      const checkbox = document.getElementById('globalAutomationToggle');
      checkbox.disabled = true;
      try {
        const r = await fetch(API_BASE + '/automation', { cache: 'no-store' });
        if (!r.ok) throw new Error('Falha ao consultar estado');
        const data = await r.json();
        updateGlobalUI(data.active === true);
      } catch (err) {
        console.error(err);
        document.getElementById('globalSwitchTitle').textContent = 'Estado do motor indisponível';
        document.getElementById('globalSwitchDesc').textContent = 'Atualize a página ou verifique a conexão com o servidor.';
      } finally {
        checkbox.disabled = false;
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
    setupVisualAutomationBuilder();
    loadGlobalAutomationState();
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
  if (!hasExplicitAutomationScope(data.conditions)) {
    return res.status(400).json({
      error: 'Defina um escopo explícito para a automação ou confirme allowAllLeads.',
    });
  }
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
