import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Rádio Espiritual Inteligente API",
      version: "1.0.0",
      description:
        "API backend para plataforma de rádio espiritual inteligente com geração de conteúdo por IA.",
    },
    servers: [{ url: "/api", description: "API Server" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "integer" },
            nome: { type: "string" },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["admin", "user", "editor"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Channel: {
          type: "object",
          properties: {
            id: { type: "integer" },
            nome: { type: "string" },
            descricao: { type: "string" },
            ativo: { type: "boolean" },
          },
        },
        Content: {
          type: "object",
          properties: {
            id: { type: "integer" },
            titulo: { type: "string" },
            tipo: { type: "string" },
            categoria_id: { type: "integer" },
            audio_url: { type: "string" },
            imagem_url: { type: "string" },
            duracao: { type: "integer" },
            tags: { type: "array", items: { type: "string" } },
            ativo: { type: "boolean" },
            channel_id: { type: "integer" },
          },
        },
        Category: {
          type: "object",
          properties: {
            id: { type: "integer" },
            nome: { type: "string" },
          },
        },
        Voice: {
          type: "object",
          properties: {
            id: { type: "integer" },
            nome: { type: "string" },
            provider: { type: "string", enum: ["openai", "elevenlabs"] },
            voice_id_externo: { type: "string", nullable: true },
            horario_preferencial: { type: "string", enum: ["manha", "tarde", "noite"] },
            ativo: { type: "boolean" },
          },
        },
        Schedule: {
          type: "object",
          properties: {
            id: { type: "integer" },
            channel_id: { type: "integer" },
            horario_inicio: { type: "string", format: "date-time" },
            horario_fim: { type: "string", format: "date-time" },
            tipo: { type: "string" },
          },
        },
        Playlist: {
          type: "object",
          properties: {
            id: { type: "integer" },
            channel_id: { type: "integer" },
            data: { type: "string", format: "date" },
          },
        },
        Paginated: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "object",
              properties: {
                items: { type: "array", items: {} },
                total: { type: "integer" },
                page: { type: "integer" },
                limit: { type: "integer" },
                totalPages: { type: "integer" },
              },
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object" },
            message: { type: "string" },
          },
        },
      },
    },
    tags: [
      { name: "Auth", description: "Autenticação e autorização" },
      { name: "Users", description: "Gerenciamento de usuários" },
      { name: "Channels", description: "Gerenciamento de canais" },
      { name: "Contents", description: "Gerenciamento de conteúdos" },
      { name: "Categories", description: "Categorias de conteúdo" },
      { name: "Schedules", description: "Programação de canais" },
      { name: "Playlists", description: "Playlists dos canais" },
      { name: "Voices", description: "Vozes disponíveis para TTS" },
      { name: "Radio", description: "Player de rádio ao vivo" },
      { name: "IA", description: "Geração de conteúdo com inteligência artificial" },
      { name: "TTS", description: "Síntese de voz (Text-to-Speech)" },
      { name: "Admin", description: "Administração de filas e workers" },
    ],
    paths: {
      "/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Registrar novo usuário",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["nome", "email", "senha"],
                  properties: {
                    nome: { type: "string", example: "João Silva" },
                    email: { type: "string", format: "email", example: "joao@example.com" },
                    senha: { type: "string", minLength: 6, example: "minhasenha123" },
                    role: { type: "string", enum: ["admin", "user", "editor"], default: "user" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Usuário criado com sucesso",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          token: { type: "string" },
                          refreshToken: { type: "string" },
                          user: { $ref: "#/components/schemas/User" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "Dados inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "409": { description: "Email já cadastrado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "senha"],
                  properties: {
                    email: { type: "string", format: "email", example: "joao@example.com" },
                    senha: { type: "string", example: "minhasenha123" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Login realizado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          token: { type: "string", description: "Access token JWT (validade: 7d)" },
                          refreshToken: { type: "string", description: "Refresh token JWT (validade: 30d)" },
                          user: { $ref: "#/components/schemas/User" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "Credenciais inválidas", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/auth/refresh": {
        post: {
          tags: ["Auth"],
          summary: "Renovar access token usando refresh token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["refreshToken"],
                  properties: {
                    refreshToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIs..." },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Tokens renovados com sucesso",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          token: { type: "string" },
                          refreshToken: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "Refresh token inválido, expirado ou revogado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Revogar tokens e encerrar sessão",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    refreshToken: { type: "string", description: "Opcional — revoga também o refresh token" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Logout realizado — tokens revogados na blacklist Redis" },
            "401": { description: "Token de acesso inválido", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/auth/recover": {
        post: {
          tags: ["Auth"],
          summary: "Solicitar recuperação de senha",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: { email: { type: "string", format: "email" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Instruções de recuperação enviadas" },
            "404": { description: "Usuário não encontrado" },
          },
        },
      },
      "/users": {
        get: {
          tags: ["Users"],
          summary: "Listar usuários (admin only)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Lista de usuários" },
            "403": { description: "Somente admins", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/users/{id}": {
        get: {
          tags: ["Users"],
          summary: "Buscar usuário (próprio ou admin)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": { description: "Dados do usuário" },
            "403": { description: "Acesso negado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "404": { description: "Não encontrado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
        put: {
          tags: ["Users"],
          summary: "Atualizar usuário (próprio ou admin)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    nome: { type: "string" },
                    email: { type: "string", format: "email" },
                    senha: { type: "string", minLength: 6 },
                    role: { type: "string", enum: ["admin", "user", "editor"], description: "Somente admin pode alterar role" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Usuário atualizado" },
            "403": { description: "Acesso negado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
        delete: {
          tags: ["Users"],
          summary: "Deletar usuário (admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "204": { description: "Usuário removido" },
            "403": { description: "Somente admins" },
          },
        },
      },
      "/channels": {
        get: {
          tags: ["Channels"],
          summary: "Listar canais",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { "200": { description: "Lista paginada de canais", content: { "application/json": { schema: { $ref: "#/components/schemas/Paginated" } } } } },
        },
        post: {
          tags: ["Channels"],
          summary: "Criar canal (editor+)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["nome"],
                  properties: {
                    nome: { type: "string", example: "Rádio Fé & Vida" },
                    descricao: { type: "string" },
                    ativo: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Canal criado" } },
        },
      },
      "/channels/{id}": {
        get: { tags: ["Channels"], summary: "Buscar canal por ID", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Canal encontrado" }, "404": { description: "Não encontrado" } } },
        put: { tags: ["Channels"], summary: "Atualizar canal (editor+)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Channel" } } } }, responses: { "200": { description: "Canal atualizado" } } },
        delete: { tags: ["Channels"], summary: "Deletar canal (admin)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "204": { description: "Canal removido" } } },
      },
      "/categories": {
        get: {
          tags: ["Categories"],
          summary: "Listar categorias",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          ],
          responses: { "200": { description: "Lista de categorias" } },
        },
        post: {
          tags: ["Categories"],
          summary: "Criar categoria (editor+)",
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["nome"], properties: { nome: { type: "string" } } } } } },
          responses: { "201": { description: "Categoria criada" } },
        },
      },
      "/categories/{id}": {
        get: { tags: ["Categories"], summary: "Buscar categoria", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Categoria" }, "404": { description: "Não encontrada" } } },
        put: { tags: ["Categories"], summary: "Atualizar categoria (editor+)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { nome: { type: "string" } } } } } }, responses: { "200": { description: "Categoria atualizada" } } },
        delete: { tags: ["Categories"], summary: "Deletar categoria (admin)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "204": { description: "Categoria removida" } } },
      },
      "/contents": {
        get: {
          tags: ["Contents"],
          summary: "Listar conteúdos com filtros e paginação",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "categoria_id", in: "query", schema: { type: "integer" } },
            { name: "channel_id", in: "query", schema: { type: "integer" } },
            { name: "tipo", in: "query", schema: { type: "string" } },
            { name: "ativo", in: "query", schema: { type: "boolean" } },
            { name: "search", in: "query", schema: { type: "string" }, description: "Busca por título" },
          ],
          responses: { "200": { description: "Lista paginada de conteúdos", content: { "application/json": { schema: { $ref: "#/components/schemas/Paginated" } } } } },
        },
        post: {
          tags: ["Contents"],
          summary: "Criar conteúdo com upload de áudio e imagem (editor+)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["titulo", "tipo"],
                  properties: {
                    titulo: { type: "string", example: "Devocional da Manhã" },
                    tipo: { type: "string", example: "devocional" },
                    categoria_id: { type: "integer" },
                    channel_id: { type: "integer" },
                    duracao: { type: "integer", description: "Duração em segundos" },
                    tags: { type: "string", description: "JSON array de tags: [\"oração\",\"fé\"]" },
                    ativo: { type: "boolean" },
                    audio_url: { type: "string", format: "uri", description: "URL externa (alternativa ao upload)" },
                    imagem_url: { type: "string", format: "uri" },
                    audio: { type: "string", format: "binary", description: "Arquivo de áudio (mp3/wav/ogg)" },
                    imagem: { type: "string", format: "binary", description: "Imagem de capa" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Conteúdo criado" },
            "400": { description: "Dados inválidos ou tipo de arquivo não permitido" },
          },
        },
      },
      "/contents/{id}": {
        get: { tags: ["Contents"], summary: "Buscar conteúdo por ID", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Conteúdo" }, "404": { description: "Não encontrado" } } },
        put: {
          tags: ["Contents"],
          summary: "Atualizar conteúdo (editor+)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/Content" } } } },
          responses: { "200": { description: "Conteúdo atualizado" }, "404": { description: "Não encontrado" } },
        },
        delete: { tags: ["Contents"], summary: "Deletar conteúdo (editor+)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "204": { description: "Conteúdo removido" } } },
      },
      "/voices": {
        get: {
          tags: ["Voices"],
          summary: "Listar vozes disponíveis para TTS",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          ],
          responses: { "200": { description: "Lista de vozes TTS" } },
        },
      },
      "/schedule": {
        get: {
          tags: ["Schedules"],
          summary: "Listar slots de programação com paginação",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "channel_id", in: "query", schema: { type: "integer" } },
            { name: "data", in: "query", schema: { type: "string", format: "date" }, description: "Filtrar por data YYYY-MM-DD" },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          ],
          responses: { "200": { description: "Programação do canal" } },
        },
        post: {
          tags: ["Schedules"],
          summary: "Criar slot de programação (editor+)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["channel_id", "horario_inicio", "horario_fim", "tipo"],
                  properties: {
                    channel_id: { type: "integer" },
                    horario_inicio: { type: "string", format: "date-time", example: "2025-12-01T06:00:00" },
                    horario_fim: { type: "string", format: "date-time", example: "2025-12-01T07:00:00" },
                    tipo: { type: "string", example: "devocional" },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Slot criado" } },
        },
      },
      "/schedule/{id}": {
        delete: {
          tags: ["Schedules"],
          summary: "Deletar slot de programação (editor+)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "204": { description: "Slot removido" },
            "404": { description: "Slot não encontrado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/playlists": {
        get: {
          tags: ["Playlists"],
          summary: "Listar playlists com paginação",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "channel_id", in: "query", schema: { type: "integer" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { "200": { description: "Playlists paginadas" } },
        },
        post: {
          tags: ["Playlists"],
          summary: "Gerar/criar playlist para canal e data (editor+)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["channel_id", "data"],
                  properties: {
                    channel_id: { type: "integer" },
                    data: { type: "string", format: "date", example: "2025-12-01" },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Playlist criada (idempotente)" } },
        },
      },
      "/playlists/{id}": {
        get: { tags: ["Playlists"], summary: "Buscar playlist por ID com itens", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Playlist com itens" }, "404": { description: "Não encontrada" } } },
        put: {
          tags: ["Playlists"],
          summary: "Atualizar playlist (editor+)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    channel_id: { type: "integer" },
                    data: { type: "string", format: "date" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Playlist atualizada" }, "404": { description: "Não encontrada" } },
        },
        delete: {
          tags: ["Playlists"],
          summary: "Deletar playlist e seus itens (editor+)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "204": { description: "Playlist removida" }, "404": { description: "Não encontrada" } },
        },
      },
      "/radio/current": {
        get: {
          tags: ["Radio"],
          summary: "Conteúdo em reprodução no momento (público — sem auth)",
          parameters: [{ name: "channel_id", in: "query", schema: { type: "integer" }, description: "ID do canal (usa DEFAULT_CHANNEL_ID se omitido)" }],
          responses: {
            "200": {
              description: "Conteúdo atual e metadados",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          current: { $ref: "#/components/schemas/Content" },
                          schedule: { $ref: "#/components/schemas/Schedule" },
                          channel: { $ref: "#/components/schemas/Channel" },
                          startedAt: { type: "string", format: "date-time" },
                          source: { type: "string", enum: ["playlist", "schedule"] },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/radio/next": {
        get: {
          tags: ["Radio"],
          summary: "Próximo conteúdo na fila (público)",
          parameters: [{ name: "channel_id", in: "query", schema: { type: "integer" } }],
          responses: { "200": { description: "Próximo conteúdo", content: { "application/json": { schema: { $ref: "#/components/schemas/Content" } } } } },
        },
      },
      "/radio/schedule": {
        get: {
          tags: ["Radio"],
          summary: "Programação completa do dia para o canal (público)",
          parameters: [{ name: "channel_id", in: "query", schema: { type: "integer" } }],
          responses: {
            "200": {
              description: "Lista de slots de programação do dia",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Schedule" } } } },
            },
          },
        },
      },
      "/ai/generate": {
        post: {
          tags: ["IA"],
          summary: "Gerar conteúdo de rádio espiritual com IA (editor+)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["tema", "tipo"],
                  properties: {
                    tema: { type: "string", example: "A paz que transcende o entendimento", description: "Tema central do conteúdo" },
                    tipo: { type: "string", example: "devocional", description: "Tipo: devocional, pregação, oração, música, etc." },
                    duracao: { type: "integer", example: 120, description: "Duração estimada em segundos" },
                    estilo: { type: "string", example: "reflexivo e encorajador", description: "Estilo narrativo desejado" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Conteúdo gerado pela IA",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          titulo: { type: "string" },
                          texto: { type: "string" },
                          tags: { type: "array", items: { type: "string" } },
                          tipo: { type: "string" },
                          duracao_estimada: { type: "integer" },
                          cached: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "Token inválido" },
            "403": { description: "Permissão insuficiente" },
            "429": { description: "Rate limit excedido" },
            "502": { description: "Erro no provedor de IA" },
          },
        },
      },
      "/ai/script": {
        post: {
          tags: ["IA"],
          summary: "Gerar roteiro completo de programa de rádio (editor+)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["tema"],
                  properties: {
                    tema: { type: "string", example: "Gratidão e esperança" },
                    duracao: { type: "integer", example: 120, description: "Duração estimada em segundos (default: 120)" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Roteiro gerado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          roteiro: { type: "string" },
                          tema: { type: "string" },
                          duracao: { type: "integer" },
                          cached: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/ai/summarize": {
        post: {
          tags: ["IA"],
          summary: "Resumir conteúdo textual com IA (editor+)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: {
                    text: { type: "string", maxLength: 50000, example: "Texto longo para resumir..." },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Resumo gerado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          resumo: { type: "string" },
                          tamanho_original: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/tts/synthesize": {
        post: {
          tags: ["TTS"],
          summary: "Sintetizar áudio via Text-to-Speech (editor+)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["voiceId", "text"],
                  properties: {
                    voiceId: { type: "integer", example: 1, description: "ID da voz cadastrada no sistema" },
                    text: { type: "string", maxLength: 10000, example: "Que a paz de Deus guarde o seu coração." },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Resultado da síntese",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          url: { type: "string", description: "URL do áudio sintetizado" },
                          queued: { type: "boolean", description: "true se processado via fila BullMQ" },
                          cached: { type: "boolean", description: "true se resultado do cache Redis (7 dias)" },
                          jobId: { type: "string", description: "ID do job BullMQ (quando queued=true)" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "Texto ou voz inválidos" },
            "404": { description: "Voz não encontrada" },
            "503": { description: "TTS_API_KEY não configurado" },
          },
        },
      },
      "/admin/queues": {
        get: {
          tags: ["Admin"],
          summary: "Bull Board — interface de monitoramento de filas (admin only)",
          security: [{ bearerAuth: [] }],
          description: "Retorna a interface web do Bull Board para monitorar as filas BullMQ: content-processing, voice-synthesis, schedule e cleanup. Acesse via navegador em /api/admin/queues.",
          responses: {
            "200": { description: "Interface HTML do Bull Board" },
            "401": { description: "Token inválido" },
            "403": { description: "Somente admins" },
          },
        },
      },
      "/healthz": {
        get: {
          tags: ["Admin"],
          summary: "Health check — verifica disponibilidade da API",
          responses: {
            "200": {
              description: "Serviço saudável",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      uptime: { type: "number" },
                      timestamp: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [],
};

const rawSpec = swaggerJsdoc(options) as {
  paths?: Record<string, Record<string, { security?: unknown[]; responses?: Record<string, unknown> }>>;
  components?: Record<string, unknown>;
};

/* Post-process: inject 401 response into every operation that carries security */
if (rawSpec.paths) {
  for (const methods of Object.values(rawSpec.paths)) {
    for (const op of Object.values(methods)) {
      if (op.security && op.security.length > 0) {
        op.responses ??= {};
        op.responses["401"] ??= {
          description: "Não autorizado — token JWT ausente, inválido ou expirado",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        };
      }
    }
  }
}

export const swaggerSpec = rawSpec;
