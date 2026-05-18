# Rádio Espiritual Inteligente — API

Backend Node.js API-first para plataforma de rádio espiritual com geração de conteúdo por IA, gerenciamento de canais, vozes TTS e programação automática.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — iniciar o servidor API (compila + sobe)
- `pnpm run typecheck` — typecheck completo de todos os pacotes
- `pnpm run build` — typecheck + build de todos os pacotes
- Swagger UI: `http://localhost:<PORT>/api/docs`
- Health check: `GET /api/healthz`

## Env Vars obrigatórias

Copie `.env.example` → `.env` e preencha:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret para assinar tokens JWT |
| `REDIS_URL` | Redis URL (opcional — filas ficam indisponíveis sem Redis) |
| `SESSION_SECRET` | Secret de sessão |

## Stack

- Node.js 24, TypeScript 5.9, pnpm workspaces
- API: Express 5
- ORM: **Sequelize v6** + PostgreSQL (`pg`)
- Cache/Filas: **IORedis** + **BullMQ**
- Auth: **JWT** (`jsonwebtoken`) + **bcryptjs**
- Upload: **Multer** (audio e imagens)
- Logging: **Winston**
- Docs: **Swagger UI** (`swagger-jsdoc` + `swagger-ui-express`)

## Where things live

```
artifacts/api-server/src/
├── modules/          # Módulos de negócio (auth, users, channels, contents, …)
│   ├── auth/         # POST /api/auth/register|login|recover
│   ├── users/        # CRUD /api/users
│   ├── channels/     # CRUD /api/channels
│   ├── contents/     # CRUD /api/contents (com upload de áudio/imagem)
│   ├── categories/   # CRUD /api/categories
│   ├── schedules/    # GET/POST /api/schedule
│   ├── playlists/    # CRUD /api/playlists
│   ├── voices/       # GET /api/voices
│   └── radio/        # GET /api/radio/current|next|schedule
├── models/           # Modelos Sequelize (User, Channel, Content, …)
├── services/         # AiService, VoiceService, ScheduleService, RadioService
├── queues/           # BullMQ queues (contentProcessing, voiceSynthesis, schedule)
├── jobs/             # Workers BullMQ
├── middlewares/      # auth (JWT), errorHandler, upload (Multer)
├── config/           # env, database, redis, swagger
├── utils/            # jwt.ts, response.ts
└── lib/logger.ts     # Winston logger
```

## Architecture decisions

- **Sequelize auto-sync** — em desenvolvimento, `sequelize.sync({ alter: true })` aplica alterações de schema automaticamente. Em produção, use migrations.
- **Redis/BullMQ opcional** — a API sobe mesmo sem Redis; as filas de processamento ficam indisponíveis mas não travam o servidor.
- **Roles via JWT** — middleware `authenticate` valida o token e popula `req.user`; `requireRole()` protege rotas sensíveis.
- **Upload via Multer** — arquivos de áudio salvos em `uploads/audio/`, imagens em `uploads/images/`. Configure um CDN/S3 em produção.
- **bcryptjs** (pure JS) usado em vez de `bcrypt` nativo para compatibilidade cross-platform.

## Product

Plataforma de rádio espiritual inteligente com:
- Canais de rádio com programação automática
- Gerenciamento de conteúdos (pregações, músicas, devocionais)
- Vozes TTS configuráveis por período do dia
- Player com estado em tempo real (atual, próximo, agenda do dia)
- Fila de processamento assíncrono de áudio via BullMQ
- Documentação interativa completa via Swagger

## Gotchas

- Sequelize é **externalizado** no esbuild (não é empacotado — fica em node_modules em runtime).
- `swagger-jsdoc` e `@jsdevtools/ono` também são externalizados por usarem carregamento dinâmico de arquivos.
- O `@workspace/db` (Drizzle) ainda está presente como dep mas não é usado pelo novo código — pode ser removido em limpeza futura.
- Sem Redis: as filas BullMQ logam erro de conexão mas o servidor continua funcionando normalmente.
