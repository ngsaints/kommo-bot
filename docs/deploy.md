# Deploy - Kommo Bot

## Servidor

- **Provider**: DigitalOcean
- **Droplet**: ubuntu-s-1vcpu-2gb-nyc1
- **IP**: 162.243.173.155
- **Região**: NYC1

## Endereços de Acesso

| Serviço | URL | Porta |
|---------|-----|-------|
| **Kommo Bot (Dashboard)** | https://162-243-173-155.nip.io | 3000 |
| **Kommo Bot (Webhook)** | https://162-243-173-155.nip.io/webhook/cwbfightclub | 3000 |
| **n8n** | http://162.243.173.155:5678 | 5678 |
| **Evolution API** | http://162.243.173.155:8080 | 8080 |

## Credenciais

### Dashboard Kommo Bot
- **Usuário**: admin
- **Senha**: definida em `DASHBOARD_PASSWORD` no `.env`

### Kommo CRM
- **Subdomínio**: contatocwbfightclubcombr
- **Domínio API**: api-c.kommo.com

### OpenAI
- **Modelo**: gpt-4o-mini

### Banco de Dados (Postgres)
- **Host n8n**: n8n_postgres (interno)
- **Host Evolution**: evolution_postgres (interno)
- **Database**: n8n_chat
- **User**: n8n
- **Porta**: 5432

### Redis
- **Host**: evolution_redis (interno)
- **Porta**: 6379

## Containers Docker

| Container | Imagem | Porta | Status |
|-----------|--------|-------|--------|
| kommo-bot | kommo-bot-kommo-bot | 3000 | Rodando |
| n8n | n8nio/n8n:latest | 5678 | Rodando |
| evolution_api | evoapicloud/evolution-api | 8080 | Rodando |
| n8n_postgres | pgvector/pgvector:pg16 | 5432 (interno) | Rodando |
| evolution_postgres | postgres:15 | 5432 (interno) | Rodando |
| evolution_redis | redis:7-alpine | 6379 (interno) | Rodando |

## Redes Docker

| Rede | Tipo | Conecta |
|------|------|---------|
| n8n_default | bridge | kommo-bot, n8n, n8n_postgres |
| evolution_default | bridge | kommo-bot, evolution_api, evolution_postgres, evolution_redis |

## Comandos Úteis

```bash
# Ver status dos containers
docker ps

# Ver logs do kommo-bot
docker logs kommo-bot -f

# Reiniciar kommo-bot
docker compose down && docker compose up -d --build

# Verificar health check
curl http://localhost:3000/health
```

## Deploy (passo a passo)

O projeto roda em `/home/daniel/kommo-bot` na VPS. O deploy é feito direto no servidor (não precisa de SSH externo).

```bash
# 1. Entrar no diretório do projeto
cd /home/daniel/kommo-bot

# 2. Puxar as últimas alterações do GitHub
git pull origin main

# 3. Rebuild e reiniciar o container
docker compose down && docker compose up -d --build

# 4. Verificar se subiu
docker logs kommo-bot --tail 5
curl http://localhost:3000/health
```

### Notas
- O `.env` já está configurado no servidor (não versionado).
- As variáveis de ambiente são carregadas automaticamente pelo `docker-compose.yml`.
- O volume `./data:/app/data` mantém os dados persistentes entre deploys.
- Se houver conflito de merge no `data/automations.json`, resolver manualmente antes do deploy.

## Webhook Kommo

Configurar no painel do Kommo:
- **URL**: `https://162-243-173-155.nip.io/webhook/cwbfightclub`
- **Evento**: message → add
