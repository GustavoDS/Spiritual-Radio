---
name: Vinheta materialization in day_block_items
description: Architecture decision to store vinheta slots inside day_block_items at resolve-day time rather than injecting at AutoDJ/PlaylistMaterializationService runtime.
---

## The rule
Vinhetas (abertura, antes_de_X, encerramento) are materialized into `day_block_items` rows during `resolveDay()` cache-miss, using `tipo='vinheta'`, `content_id=null`, `vinheta_id=<vinhetas.id>`. This makes the full daily sequence admin-editable via `PUT /day-block-items/bulk`.

**Why:** Previously vinhetas were injected at playlist-build time by PlaylistMaterializationService, making them invisible to the admin editing API and causing duplication on re-materialization.

**How to apply:**
- `grade-programas.service.ts` cache-miss path: calls `pickVinheta(channelId, bloco, tipoV)`, builds rows with vinheta interleaved, `bulkCreate`, then returns via `_buildBlockFromDayBlockItems` (same shape as cache-hit).
- `_buildBlockFromDayBlockItems`: batch-loads both Content AND Vinheta records. Vinheta items get `titulo=vinheta.nome`, `audio_url=vinheta.audio_url`.
- `PlaylistMaterializationService`: detects `block.items.some(i => i.tipo === 'vinheta')` — if true, pushes items verbatim from block.items (no re-injection), uses content-only items for loop fill.
- `day-block-items.controller.ts`: includes `{ model: Vinheta, as: 'vinheta', required: false }` in loadEnriched; serializeItem falls back to vinheta.nome/audio_url when content is null.
- Migration 33: `ALTER TABLE day_block_items ADD COLUMN IF NOT EXISTS vinheta_id INTEGER NULL REFERENCES vinhetas(id) ON DELETE SET NULL`.

## Edge cases
- If `pickVinheta` returns null (no audio_url on vinheta), the slot is silently skipped — no crash.
- If `bulkCreate` fails (race), fallback returns resolved items without vinhetas.
- Loop fill in PlaylistMaterializationService uses content-only items to avoid duplicating vinheta rows in repeated passes.
- `blocoFromHoraStr` and `beforeTipoVinheta` helpers are duplicated in grade-programas.service.ts (not imported from PlaylistMaterializationService to avoid circular dependencies).
