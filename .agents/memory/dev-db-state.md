---
name: Dev DB content library state
description: Dev environment has a nearly empty content library — bugs must be verified in production
---

## State (May 2026)

Only 7 content rows exist in dev:
- `musica` (1): `audio_url = null`, linked to channel 1 → unplayable, correctly filtered by the new pool query.
- `pregacao` (6): most missing `audio_url` or not linked to channel 1 via `content_channels`.

No `oracao`, `mensagem`, `versiculo`, `reflexao` content exists in dev.

**Why this matters**: `ResolveService: content pool` logs will always show `total: 0` for all spoken types in dev. This is a data problem, not a code bug. All stream/pool fixes must be verified in the production environment where the full content library exists.

**How to populate dev for local testing**: Use Swagger UI to POST content items with `tipo: musica/oracao/mensagem/versiculo`, `audio_url` set, `ativo: true`, then link them to channel 1 via `POST /api/contents/:id/channels`.
