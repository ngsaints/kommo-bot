# 🤖 Kommo Bot - CWB Fight Club

Substituto do fluxo do n8n para atendimento de leads da CWB Fight Club.

## Como usar

### 1. Configurar
```bash
# Edite o arquivo .env com suas credenciais
# - KOMMO_ACCESS_TOKEN: token de longa duração
# - OPENAI_API_KEY: chave da OpenAI
nano .env
```

### 2. Iniciar
```bash
npm start
```

### 3. Configurar webhook no Kommo
No painel do Kommo, configure o webhook para:
```
POST https://SEU_DOMINIO/webhook/cwbfightclub
```
Para a automação principal, selecione obrigatoriamente: **Lead adicionado / Novo lead criado** (`leads → add`).

O evento **message → add** pode permanecer habilitado para automações separadas de mensagens, como transbordo humano, mas não substitui o evento de criação do lead.

## Rotas

| Rota | Método | Descrição |
|---|---|---|
| `/webhook/cwbfightclub` | POST | Webhook do Kommo |
| `/health` | GET | Health check |

## Estrutura

```
📁 kommo-bot/
├── src/
│   ├── index.js      # Servidor Express
│   ├── webhook.js    # Handler do webhook
│   ├── kommo.js      # API do Kommo
│   ├── agent.js      # IA (OpenAI)
│   ├── redis.js      # Histórico de chat
│   └── postgres.js   # Memória persistente
├── .env              # Configuração
├── package.json
└── README.md
```
