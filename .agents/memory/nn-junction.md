---
name: N:N junction tables contents/vinhetas↔channels
description: Design e convenções das tabelas content_channels e vinheta_channels que substituem channel_id como fonte verdade para associação N:N.
---

## Regra
`content_channels` e `vinheta_channels` são a fonte verdade para associações contents/vinhetas ↔ channels. O campo `channel_id` em ambas as tabelas é mantido apenas por compatibilidade legada e é sincronizado automaticamente para `channel_ids[0]` em toda escrita.

**Why:** a plataforma precisa de conteúdos e vinhetas pertencendo a múltiplos canais sem duplicar registros.

## Como aplicar
- Novos writes (create/update) devem passar `channel_ids: number[]`; o service sincroniza o legado `channel_id = channel_ids[0]` e faz upsert na junction.
- Para writes bulk, use `bulkAssignChannels(ids, channelIds, mode)` com mode `add | replace | remove`.
- `findAll` com filtro `channel_id` usa `include Channel as "channels" where id=X, required:true` — nunca `where: { channel_id: X }`.
- Responses incluem tanto `channels: [{id,nome}]` quanto `channel_ids: number[]` (mapeado no service via `.toJSON()`).
- Operações de junction usam `bulkCreate({ignoreDuplicates:true})` e `destroy({where:{...}})` diretamente — sem usar os métodos dinâmicos `.setChannels()` do Sequelize (que precisariam de `as any`).
- Limite hard de 500 ids por chamada no bulkAssignChannels.

## Modelos junction
- `ContentChannel` — PK composta (content_id, channel_id), timestamps:false, created_at manual.
- `VinhetaChannel` — PK composta (vinheta_id, channel_id), timestamps:false, created_at manual.
- Aliases: Content→Channel as "channels", Channel→Content as "channelContents"; Vinheta→Channel as "channels", Channel→Vinheta as "channelVinhetas".

## Migration
Migration 27 cria as tabelas e faz backfill com `INSERT ... SELECT id, channel_id FROM contents/vinhetas WHERE channel_id IS NOT NULL ON CONFLICT DO NOTHING`.
