---
name: sequelize.sync alter Docker fail
description: Por que alter-sync falha em Docker/Postgres e como evitar
---

**Rule:** `sequelize.sync({ alter: true })` lança "syntax error at or near REFERENCES" em ambientes Docker com PostgreSQL. O erro é global — nenhuma tabela existente é alterada no startup.

**Why:** O Sequelize gera SQL de ALTER com REFERENCES inline que o PostgreSQL rejeita em certas versões/configs Docker.

**How to apply:** Qualquer mudança de schema (nova coluna, novo índice) DEVE ter uma migration Umzug explícita em `runner.ts` com `IF NOT EXISTS`/`ON CONFLICT DO NOTHING` para idempotência. O fallback do sync só cria tabelas NOVAS, nunca altera existentes.
