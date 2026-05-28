---
name: Vinheta audio bootstrap
description: Por que vinhetas são silenciosamente ignoradas na playlist sem TTS gerado
---

**Rule:** `vinhetasService.pickVinheta()` filtra `audio_url IS NOT NULL`. Vinhetas seedadas só têm texto — sem TTS gerado, `audio_url = null`, então `pickVinheta()` sempre retorna null e `pushVinheta()` silenciosamente não injeta nada.

**Why:** As 54 vinhetas seed só têm campo `texto`; `gerarAudio()` precisa ser chamado explicitamente ou via `regenerarTodas(true)`.

**How to apply:** `index.ts` startup chama `vinhetasService.regenerarTodas(true)` fire-and-forget para sintetizar vinhetas sem audio. Em produção, isso falha se a chave OpenAI/ElevenLabs estiver inválida — verificar a key antes de depurar ausência de vinhetas.
