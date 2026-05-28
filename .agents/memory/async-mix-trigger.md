---
name: Async mix trigger pattern
description: Como e quando BackgroundTrackMixService.resolveAudioUrl() deve ser chamado.
---

## Regra
`resolveAudioUrl()` deve ser disparado **fire-and-forget** após cada `materializeDay()`, nunca de forma síncrona dentro do loop de materialização.

## Implementação
`PlaylistMaterializationService._triggerAsyncMixes(items)`:
- Filtra por `SPOKEN_TYPES = {oracao, reflexao, mensagem, versiculo}` E `audio_url != null`
- Deduplica por `content_id` (mesmo conteúdo pode aparecer N vezes no loop)
- Itera sequencialmente (não paralelo) para não saturar ffmpeg/upload
- Captura erros com `.catch()` e loga como warn — nunca lança

## Por que sequencial, não Promise.all
ffmpeg + upload R2 pode demorar 10–30s por item. Paralelismo causaria saturação de recursos e timeouts no upload. Sequencial garante que ao menos o primeiro item fica pronto antes do AutoDJ chegar nele.

**Why:** sem disparar o mix durante materialização, `mixed_audio_url` fica null indefinidamente; o AutoDJService usa `mixed_audio_url ?? audio_url` mas o front-end espera o mix com trilha de fundo.
