---
name: Vinheta injection in PlaylistItem
description: Como vinhetas são persistidas em playlist_items e como o AutoDJService as trata.
---

## Schema change
`playlist_items` ganhou 3 colunas nullable via `sequelize.sync({ alter: true })`:
- `vinheta_url TEXT` — audio URL da vinheta
- `vinheta_duracao INTEGER` — duração em segundos
- `vinheta_titulo VARCHAR(500)` — nome exibível

Quando `vinheta_url IS NOT NULL`, `content_id` é NULL e vice-versa.

## Injection (PlaylistMaterializationService)
`materializeDay()` injeta por bloco:
1. **abertura** no início do bloco
2. **antes_de_X** antes de conteúdo spoken com `usa_vinheta_automatica=true`
3. **transicao** a cada 3 músicas consecutivas
4. **encerramento** se sobrar tempo no bloco

Looping de conteúdo (para preencher `duracao_min`) NÃO injeta vinhetas — só o first pass.

## AutoDJService
- Queries usam `[Op.or]: [{content_id: {Ne: null}}, {vinheta_url: {Ne: null}}]` em vez de só `content_id != null`.
- `contentId` de vinhetas = `-(PlaylistItem.id)` (negativo) para distinguir de content IDs positivos.
- RadioPlay.create() é pulado para itens de vinheta.
- Broadcasts (`radio_online`, `current_track_changed`) usam `track.*` em vez de `content.*` para funcionar com ambos tipos.

**Why:** vinhetas precisam aparecer no live.m3u8 e no now-playing.json; persistir em PlaylistItem evita geração virtual em tempo de execução e mantém o AutoDJService como única fonte de verdade.
