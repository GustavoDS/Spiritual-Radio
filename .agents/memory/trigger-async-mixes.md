---
name: _triggerAsyncMixes design
description: Como o fire-and-forget de mix deve funcionar para evitar re-misturar audio já mixado
---

**Rule:** `_triggerAsyncMixes` NÃO deve usar `ResolvedItem.audio_url` diretamente — esse campo já é `mixed_audio_url ?? audio_url` (calculado pelo ResolveService). Usar o URL mixado como entrada do ffmpeg re-mixaria áudio já processado.

**Why:** ResolveService calcula `audioUrl = c.mixed_audio_url ?? c.audio_url` para o player. Mas para gerar o mix, precisa do audio bruto (TTS puro) e confirmar que `mixed_audio_url` ainda é null.

**How to apply:** `_triggerAsyncMixes` deve: 1) coletar IDs spoken únicos, 2) refetch Content com `WHERE id IN (...) AND audio_url IS NOT NULL AND mixed_audio_url IS NULL`, 3) chamar `resolveAudioUrl` com o raw `audio_url` do DB. Isso evita o double-mix e pula itens já processados.
