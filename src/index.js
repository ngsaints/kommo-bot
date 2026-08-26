import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { handleWebhook } from './webhook.js';
import dashboardRouter from './dashboard.js';
import { initLogger } from './logger.js';
import { initDocs } from './agent.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializa logger e docs antes de iniciar servidor
initLogger();

// Busca documentos do Google Docs (prompt + FAQ) em paralelo
initDocs().then(() => {
  console.log('[Docs] Documentos carregados');
}).catch(err => {
  console.error('[Docs] Erro ao carregar documentos:', err.message);
});

// Middleware - IMPORTANTE: extended=false para manter chaves planas (Kommo envia message[add][0][entity_id])
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Rotas públicas
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.post('/webhook/cwbfightclub', handleWebhook);

// Dashboard protegido
app.use('/home/workflows', dashboardRouter);

// Redirecionar /home para /home/workflows
app.get('/home', (req, res) => res.redirect('/home/workflows'));

app.listen(PORT, () => {
  console.log(`[Server] Kommo Bot rodando na porta ${PORT}`);
  console.log(`[Server] Webhook: POST /webhook/cwbfightclub`);
  console.log(`[Server] Dashboard: https://162-243-173-155.nip.io/home/workflows`);
  console.log(`[Server] Usuario: ${process.env.DASHBOARD_USER || 'admin'}`);
  console.log(`[Server] Senha: (definida em DASHBOARD_PASSWORD)`);
  console.log(`[Server] Health: GET /health`);
});
