# Rádio Espiritual Inteligente — API

Backend Node.js/TypeScript para plataforma de rádio espiritual com geração de conteúdo por IA, gerenciamento de canais, vozes TTS e programação automática.

---

## Pré-requisitos

| Ferramenta | Versão mínima | Observação |
|---|---|---|
| Node.js | 20 LTS | 24 recomendado |
| pnpm | 9+ | `npm install -g pnpm` |
| PostgreSQL | 14+ | banco local ou remoto |
| Redis | 7+ | **opcional** — filas BullMQ ficam inativas sem Redis, mas a API funciona normalmente |

---

## Instalação e configuração

### 1. Instalar dependências

Execute na **raiz do monorepo** (não dentro de `artifacts/api-server`):

```bash
pnpm install
```

### 2. Configurar variáveis de ambiente

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env
```

Abra o `.env` e preencha pelo menos as variáveis obrigatórias:

```dotenv
PORT=3000
DATABASE_URL=postgresql://usuario:senha@localhost:5432/radio_espiritual

# Gere com: openssl rand -base64 64
JWT_SECRET=<chave-longa-e-aleatoria>
JWT_REFRESH_SECRET=<outra-chave-longa-e-aleatoria>

# true no primeiro run — cria as tabelas automaticamente
SYNC_DB=true
```

As demais variáveis (IA, TTS, S3, CORS, rate limit) têm valores padrão no `.env.example` com comentários explicativos.

### 3. Criar o banco de dados

```bash
psql -U postgres -c "CREATE DATABASE radio_espiritual;"
```

---

## Rodando em desenvolvimento

```bash
pnpm --filter @workspace/api-server run dev
```

O servidor compila com esbuild e sobe. Nas próximas execuções, mude `SYNC_DB=false` no `.env` para não recriar o schema a cada restart.

| URL | Descrição |
|---|---|
| `http://localhost:3000/api/healthz` | Health check |
| `http://localhost:3000/api/docs` | Swagger UI interativo |
| `http://localhost:3000/api/docs.json` | OpenAPI spec (JSON) |

---

## Rodando em produção

### Build

```bash
pnpm --filter @workspace/api-server run build
```

Gera `artifacts/api-server/dist/index.mjs` — bundle único via esbuild.

### Executar

```bash
PORT=3000 \
DATABASE_URL=postgresql://... \
JWT_SECRET=... \
JWT_REFRESH_SECRET=... \
SESSION_SECRET=... \
NODE_ENV=production \
SYNC_DB=false \
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

> Em produção o servidor recusa iniciar se `JWT_SECRET` ou `JWT_REFRESH_SECRET` estiverem com os valores padrão (`changeme-*`).

---

## Variáveis de ambiente — referência completa

### Obrigatórias

| Variável | Exemplo | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta do servidor HTTP |
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/db` | Connection string PostgreSQL |
| `JWT_SECRET` | `<base64 64 bytes>` | Assina access tokens |
| `JWT_REFRESH_SECRET` | `<base64 64 bytes>` | Assina refresh tokens |

### Auth / Segurança

| Variável | Padrão | Descrição |
|---|---|---|
| `JWT_EXPIRES_IN` | `7d` | Expiração do access token |
| `SESSION_SECRET` | — | Secret de sessão (reservado para futuro uso) |
| `CORS_ORIGINS` | `*` | Origens permitidas, separadas por vírgula |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Janela do rate limit (ms) |
| `RATE_LIMIT_MAX` | `100` | Req/janela nas rotas gerais |
| `RATE_LIMIT_AUTH_MAX` | `20` | Req/janela nas rotas de auth |

### Banco e cache

| Variável | Padrão | Descrição |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis para BullMQ e cron (opcional) |
| `SYNC_DB` | `false` | `true` = Sequelize aplica `ALTER TABLE` automático |

### IA e TTS

| Variável | Padrão | Opções |
|---|---|---|
| `AI_PROVIDER` | `openai` | `openai` \| `anthropic` \| `gemini` \| `openrouter` |
| `AI_API_KEY` | — | Chave do provedor escolhido |
| `AI_MODEL` | *(padrão do provedor)* | Ex: `gpt-4o-mini`, `claude-3-5-haiku-20241022` |
| `TTS_PROVIDER` | `openai` | `openai` \| `elevenlabs` |
| `TTS_API_KEY` | — | Chave do provedor TTS |
| `TTS_MODEL` | *(padrão do provedor)* | Ex: `tts-1`, `eleven_multilingual_v2` |

### Upload de arquivos

| Variável | Padrão | Descrição |
|---|---|---|
| `UPLOAD_DIR` | `uploads` | Diretório local de uploads |
| `MAX_FILE_SIZE_MB` | `50` | Tamanho máximo de arquivo de áudio |
| `STORAGE_PROVIDER` | `local` | `local` \| `s3` |
| `S3_BUCKET` | — | Nome do bucket S3/R2 |
| `S3_REGION` | `us-east-1` | Região AWS |
| `S3_ACCESS_KEY_ID` | — | Access key ID |
| `S3_SECRET_ACCESS_KEY` | — | Secret access key |

### Rádio

| Variável | Padrão | Descrição |
|---|---|---|
| `DEFAULT_CHANNEL_ID` | `1` | Canal padrão do RadioService |
| `LOG_LEVEL` | `info` | `error` \| `warn` \| `info` \| `http` \| `debug` |

---

## Estrutura do projeto

```
artifacts/api-server/src/
├── modules/          # Módulos de negócio
│   ├── auth/         # POST /api/auth/register|login|logout|refresh|recover
│   ├── users/        # CRUD /api/users
│   ├── channels/     # CRUD /api/channels
│   ├── contents/     # CRUD /api/contents (upload de áudio/imagem)
│   ├── categories/   # CRUD /api/categories
│   ├── schedules/    # GET/POST/DELETE /api/schedule
│   ├── playlists/    # CRUD /api/playlists
│   ├── voices/       # CRUD /api/voices
│   ├── radio/        # GET /api/radio/current|next|schedule
│   ├── ai/           # POST /api/ai/generate
│   └── tts/          # POST /api/tts/synthesize
├── models/           # Modelos Sequelize
├── services/         # AiService, VoiceService, ScheduleService, RadioService
├── queues/           # Filas BullMQ
├── jobs/             # Workers BullMQ
├── middlewares/      # auth (JWT), errorHandler, upload (Multer), validateId, validate
├── config/           # env, database, redis, swagger
├── utils/            # jwt.ts, response.ts
└── lib/logger.ts     # Winston
```

---

## Autenticação

A API usa JWT com dois tokens:

- **Access token** — enviado no header `Authorization: Bearer <token>`. Expira em `JWT_EXPIRES_IN` (padrão 7 dias).
- **Refresh token** — usado em `POST /api/auth/refresh` para obter um novo access token sem novo login.

### Roles

| Role | Permissões |
|---|---|
| `admin` | Acesso total |
| `editor` | Criação e edição de conteúdos, playlists, vozes, programação |
| `user` | Leitura geral, edição do próprio perfil |

---

## Filas assíncronas (BullMQ)

Requerem Redis. Sem Redis, a API funciona mas as filas ficam inativas.

| Fila | Trigger | Função |
|---|---|---|
| `contentProcessing` | Upload de áudio | Valida e processa arquivo |
| `voiceSynthesis` | Geração TTS | Chama provider TTS e salva áudio |
| `schedule` | Cron `0 1 * * *` | Gera programação automática das playlists |
| `cleanup` | Cron `0 3 * * *` | Remove arquivos temporários antigos |

Dashboard das filas: `http://localhost:3000/api/queues` (acesso restrito a admin)

---

## Comandos úteis

```bash
# Verificar tipos TypeScript
pnpm --filter @workspace/api-server run typecheck

# Build de produção
pnpm --filter @workspace/api-server run build

# Rodar o build direto (sem pnpm)
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

---

## Notas de produção

- Troque `SYNC_DB=false` e execute migrations manuais para não perder dados.
- Configure `CORS_ORIGINS` com os domínios reais do frontend.
- Use um proxy reverso (nginx, Caddy) com TLS na frente do servidor.
- Para upload de arquivos em escala, configure `STORAGE_PROVIDER=s3` com um bucket S3 ou Cloudflare R2.
- Com Redis disponível, o token de logout é adicionado a uma blacklist. Sem Redis, logout não invalida o refresh token — comportamento esperado e documentado.
