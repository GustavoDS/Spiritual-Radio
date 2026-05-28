---
name: BackgroundTrackMixService gotchas
description: Configuração da tabela background_track_settings e o que quebra sem ela
---

**Rule:** A tabela `background_track_settings` usa `content_type` como PK (não `tipo`). `findByPk(content.tipo)` funciona corretamente pois Sequelize usa o campo PK declarado no model.

**Why:** Quando `settings` retorna null (tipo sem linha na tabela), `mix()` retorna null silenciosamente — nenhum mix é gerado e `mixed_audio_url` fica null para sempre.

**How to apply:** Todo tipo spoken (oracao, reflexao, mensagem, versiculo) precisa de uma linha em `background_track_settings`. Migration 29 garante isso com `ON CONFLICT DO UPDATE`. Para `reflexao` e `mensagem` usar `default_category = 'oracao'` pois não existem tracks dessas categorias. `versiculo` tem categoria própria.
