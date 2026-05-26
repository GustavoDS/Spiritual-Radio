---
name: Vinhetas ffmpeg pipeline
description: Arquitetura do gerarAudio com TTS + SFX + bed musical — decisões críticas de design
---

## Regra principal
`gerarAudio` chama `synthesizeElevenLabs`/`synthesizeOpenAI` diretamente (não `runSynthesis`)
para obter o buffer e gravá-lo em `/tmp`. Usar `runSynthesis` seria errado porque:
- Para storage=r2: `storageProvider.upload(voicePath, key)` apaga o localPath após upload
- `runSynthesis` já faz o upload internamente → voicePath seria deletado antes do ffmpeg

**Why:** runSynthesis é projetado para TTS final de conteúdo (grava + sobe para R2 + retorna URL).
No pipeline de vinheta, o TTS é só uma etapa intermediária — o arquivo final é o mix do ffmpeg.

## ffmpeg filter_complex builder (`buildFfmpegArgs`)
Inputs são ordenados: [intro?] voice [bed?] [outro?]
idx(name) devolve o índice na ordem exata → usado como `[N:a]` nas referências.

Casos:
- Voz apenas → `-af loudnorm=I=-16:LRA=11:TP=-1.5` (sem filter_complex)
- Com bed: aloop+volume, sidechaincompress (duck=true) ou amix (duck=false), apad 0.3s
- Concat de partes presentes: [intro?][voiced/bedded][outro?]
- loudnorm final: I=-16 LRA=11 TP=-1.5

## SFX cache — storageKey determinístico
`vinhetas/sfx/{tipo}.mp3` — um arquivo por tipo_vinheta.
Sem hash, sem timestamp → idempotente, `storageProvider.exists(key)` verifica antes de gerar.

## Arquivos de output — onde gravar
Gravar em `env.uploadDir/vinhetas/final/{id}_{ts}_mix.mp3` (não em /tmp) para que
LocalStorageProvider.exists() funcione e a URL retornada pelo upload local aponte para arquivo persistente.

## regenerarTodas — fire-and-forget
`setImmediate(() => { void runConcurrent(vinhetas, fn, 3); })` + retorna `{queued: N}` imediatamente.
runConcurrent: queue compartilhada, workers consomem com queue.shift() — sem race condition.
