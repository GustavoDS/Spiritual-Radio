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
        ContactMessage: {
          type: "object",
          properties: {
            id: { type: "integer" },
            nome: { type: "string" },
            email: { type: "string", format: "email", nullable: true },
            telefone: { type: "string", nullable: true },
            assunto: { type: "string" },
            mensagem: { type: "string" },
            tipo: { type: "string", enum: ["contato", "pedido_oracao", "testemunho", "sugestao"] },
            status: { type: "string", enum: ["novo", "em_analise", "respondido", "arquivado"] },
            prioridade: { type: "string", enum: ["baixa", "normal", "alta", "urgente"] },
            canal_origem: { type: "string", nullable: true },
            resposta_admin: { type: "string", nullable: true },
            respondido_por: { type: "integer", nullable: true },
            respondido_em: { type: "string", format: "date-time", nullable: true },
            lido_em: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    tags: [
      { name: "Público", description: "Endpoints públicos — sem autenticação necessária" },
      { name: "Auth", description: "Autenticação e autorização" },
      { name: "Users", description: "Gerenciamento de usuários" },
      { name: "Channels", description: "Gerenciamento de canais (requer auth)" },
      { name: "Contents", description: "Gerenciamento de conteúdos" },
      { name: "Categories", description: "Categorias de conteúdo" },
      { name: "Schedules", description: "Programação de canais" },
      { name: "Playlists", description: "Playlists dos canais" },
      { name: "Voices", description: "Vozes disponíveis para TTS" },
      { name: "Radio", description: "Player de rádio ao vivo (requer auth)" },
      { name: "IA", description: "Geração de conteúdo com inteligência artificial" },
      { name: "TTS", description: "Síntese de voz (Text-to-Speech)" },
      { name: "Admin", description: "Administração de filas e workers" },
      { name: "Mensagens", description: "Mensagens de contato e pedidos de oração" },
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
          summary: "Criar canal (admin only)",
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
        put: { tags: ["Channels"], summary: "Atualizar canal (admin only)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Channel" } } } }, responses: { "200": { description: "Canal atualizado" } } },
        delete: { tags: ["Channels"], summary: "Deletar canal (admin only)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "204": { description: "Canal removido" } } },
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
        delete: { tags: ["Categories"], summary: "Deletar categoria (editor+)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "204": { description: "Categoria removida" } } },
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
        post: {
          tags: ["Voices"],
          summary: "Criar voz TTS (editor+)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["nome", "provider"],
                  properties: {
                    nome: { type: "string", example: "Voz Feminina PT-BR" },
                    voice_id_externo: { type: "string", example: "nova", description: "ID técnico no provedor TTS (openai: alloy/echo/nova/…, elevenlabs: ID da voz)" },
                    provider: { type: "string", enum: ["openai", "elevenlabs"], example: "openai" },
                    idioma: { type: "string", example: "pt-BR" },
                    descricao: { type: "string" },
                    ativo: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Voz criada" } },
        },
      },
      "/voices/{id}": {
        get: {
          tags: ["Voices"],
          summary: "Buscar voz por ID",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Voz encontrada" }, "404": { description: "Não encontrada" } },
        },
        put: {
          tags: ["Voices"],
          summary: "Atualizar voz (editor+)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { nome: { type: "string" }, voice_id_externo: { type: "string" }, provider: { type: "string", enum: ["openai", "elevenlabs"] }, ativo: { type: "boolean" } } } } } },
          responses: { "200": { description: "Voz atualizada" }, "404": { description: "Não encontrada" } },
        },
        delete: {
          tags: ["Voices"],
          summary: "Deletar voz (admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "204": { description: "Voz removida" }, "404": { description: "Não encontrada" } },
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
      "/public/radio/current": {
        get: {
          tags: ["Público"],
          summary: "Conteúdo em reprodução no momento",
          description: "Endpoint público — não requer autenticação. Ideal para players e widgets embutidos.",
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
      "/public/radio/next": {
        get: {
          tags: ["Público"],
          summary: "Próximo conteúdo na fila",
          description: "Endpoint público — não requer autenticação.",
          parameters: [{ name: "channel_id", in: "query", schema: { type: "integer" } }],
          responses: { "200": { description: "Próximo conteúdo", content: { "application/json": { schema: { $ref: "#/components/schemas/Content" } } } } },
        },
      },
      "/public/radio/schedule": {
        get: {
          tags: ["Público"],
          summary: "Programação completa do dia",
          description: "Endpoint público — não requer autenticação.",
          parameters: [{ name: "channel_id", in: "query", schema: { type: "integer" } }],
          responses: {
            "200": {
              description: "Lista de slots de programação do dia",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Schedule" } } } },
            },
          },
        },
      },
      "/public/channels": {
        get: {
          tags: ["Público"],
          summary: "Listar canais ativos",
          description: "Endpoint público — não requer autenticação. Retorna canais disponíveis para o player.",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { "200": { description: "Lista de canais", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } } },
        },
      },
      "/public/stream": {
        get: {
          tags: ["Público"],
          summary: "Stream de áudio do canal",
          description: "Redireciona para a URL de áudio do conteúdo em reprodução no canal. Endpoint público.",
          parameters: [{ name: "channel_id", in: "query", schema: { type: "integer" }, description: "ID do canal" }],
          responses: {
            "302": { description: "Redireciona para a URL do áudio atual" },
            "404": { description: "Nenhum conteúdo em reprodução no momento" },
          },
        },
      },
      "/radio/current": {
        get: {
          tags: ["Radio"],
          summary: "Conteúdo em reprodução (requer auth)",
          security: [{ bearerAuth: [] }],
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
          summary: "Próximo conteúdo na fila (requer auth)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "channel_id", in: "query", schema: { type: "integer" } }],
          responses: { "200": { description: "Próximo conteúdo", content: { "application/json": { schema: { $ref: "#/components/schemas/Content" } } } } },
        },
      },
      "/radio/schedule": {
        get: {
          tags: ["Radio"],
          summary: "Programação completa do dia (requer auth)",
          security: [{ bearerAuth: [] }],
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
      "/public/contact": {
        post: {
          tags: ["Mensagens"],
          summary: "Enviar mensagem de contato",
          description: "Endpoint público — sem autenticação. Rate limit: 5 envios/hora por IP. Suporta tipos: contato, testemunho, sugestao.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["nome", "assunto", "mensagem"],
                  properties: {
                    nome: { type: "string", minLength: 2, maxLength: 255, example: "Maria Silva" },
                    email: { type: "string", format: "email", example: "maria@exemplo.com" },
                    telefone: { type: "string", maxLength: 50, example: "(11) 99999-9999" },
                    assunto: { type: "string", minLength: 3, maxLength: 255, example: "Dúvida sobre o programa" },
                    mensagem: { type: "string", minLength: 10, maxLength: 5000, example: "Gostaria de saber mais sobre..." },
                    canal_origem: { type: "string", maxLength: 100, example: "site", description: "Canal de origem (site, app, widget, etc.)" },
                    tipo: { type: "string", enum: ["contato", "testemunho", "sugestao"], default: "contato" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Mensagem recebida com sucesso", content: { "application/json": { schema: { $ref: "#/components/schemas/Success" } } } },
            "400": { description: "Dados inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "429": { description: "Muitos envios — aguarde antes de tentar novamente" },
          },
        },
      },
      "/public/prayer-request": {
        post: {
          tags: ["Mensagens"],
          summary: "Enviar pedido de oração",
          description: "Endpoint público — sem autenticação. Rate limit: 5 envios/hora por IP.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["nome", "mensagem"],
                  properties: {
                    nome: { type: "string", minLength: 2, maxLength: 255, example: "João da Silva" },
                    email: { type: "string", format: "email", example: "joao@exemplo.com" },
                    telefone: { type: "string", maxLength: 50, example: "(11) 98888-7777" },
                    mensagem: { type: "string", minLength: 10, maxLength: 5000, example: "Peço oração pela cura da minha mãe..." },
                    canal_origem: { type: "string", maxLength: 100, example: "app" },
                    prioridade: { type: "string", enum: ["baixa", "normal", "alta", "urgente"], default: "normal" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Pedido de oração recebido", content: { "application/json": { schema: { $ref: "#/components/schemas/Success" } } } },
            "400": { description: "Dados inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "429": { description: "Muitos envios — aguarde antes de tentar novamente" },
          },
        },
      },
      "/admin/messages": {
        get: {
          tags: ["Mensagens"],
          summary: "Listar mensagens e pedidos de oração (admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["novo", "em_analise", "respondido", "arquivado"] } },
            { name: "tipo", in: "query", schema: { type: "string", enum: ["contato", "pedido_oracao", "testemunho", "sugestao"] } },
            { name: "prioridade", in: "query", schema: { type: "string", enum: ["baixa", "normal", "alta", "urgente"] } },
            { name: "desde", in: "query", schema: { type: "string", format: "date" }, description: "Data início (YYYY-MM-DD)" },
            { name: "ate", in: "query", schema: { type: "string", format: "date" }, description: "Data fim (YYYY-MM-DD)" },
            { name: "q", in: "query", schema: { type: "string", maxLength: 200 }, description: "Busca textual em nome, assunto e mensagem" },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          ],
          responses: {
            "200": { description: "Lista paginada de mensagens", content: { "application/json": { schema: { $ref: "#/components/schemas/Paginated" } } } },
          },
        },
      },
      "/admin/messages/stats": {
        get: {
          tags: ["Mensagens"],
          summary: "Estatísticas do painel de mensagens (admin only)",
          security: [{ bearerAuth: [] }],
          description: "Retorna totais por status e tipo, pedidos de oração, pendentes e volume dos últimos 7 dias.",
          responses: {
            "200": {
              description: "Estatísticas",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          total: { type: "integer" },
                          novas: { type: "integer" },
                          pedidosOracao: { type: "integer" },
                          respondidas: { type: "integer" },
                          pendentes: { type: "integer" },
                          ultimos7dias: { type: "integer" },
                          porTipo: { type: "array", items: { type: "object" } },
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
      "/admin/messages/{id}": {
        get: {
          tags: ["Mensagens"],
          summary: "Buscar mensagem por ID (admin only) — marca como lida",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": { description: "Mensagem encontrada", content: { "application/json": { schema: { allOf: [{ $ref: "#/components/schemas/Success" }, { type: "object", properties: { data: { $ref: "#/components/schemas/ContactMessage" } } }] } } } },
            "404": { description: "Mensagem não encontrada" },
          },
        },
        delete: {
          tags: ["Mensagens"],
          summary: "Deletar mensagem (admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "204": { description: "Mensagem removida" },
            "404": { description: "Mensagem não encontrada" },
          },
        },
      },
      "/admin/messages/{id}/status": {
        patch: {
          tags: ["Mensagens"],
          summary: "Atualizar status da mensagem (admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status: { type: "string", enum: ["novo", "em_analise", "respondido", "arquivado"] },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Status atualizado" },
            "400": { description: "Status inválido" },
            "404": { description: "Mensagem não encontrada" },
          },
        },
      },
      "/admin/messages/{id}/respond": {
        patch: {
          tags: ["Mensagens"],
          summary: "Registrar resposta do admin (admin only) — muda status para 'respondido'",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["resposta_admin"],
                  properties: {
                    resposta_admin: { type: "string", minLength: 5, maxLength: 10000, example: "Obrigado pela sua mensagem! Estaremos orando por você." },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Resposta registrada e status alterado para 'respondido'" },
            "400": { description: "Resposta inválida" },
            "404": { description: "Mensagem não encontrada" },
          },
        },
      },
      "/admin/messages/unread-count": {
        get: {
          tags: ["Mensagens"],
          summary: "Contagem rápida de mensagens não lidas (admin only)",
          description: "Endpoint leve para badges e polling frequente no frontend — não carrega a listagem completa.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Contador de não lidas",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { type: "object", properties: { unread: { type: "integer", example: 5 } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/admin/messages/{id}/priority": {
        patch: {
          tags: ["Mensagens"],
          summary: "Alterar prioridade da mensagem (admin only)",
          description: "Triagem administrativa — define urgência de um pedido de oração ou contato.",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prioridade"],
                  properties: {
                    prioridade: { type: "string", enum: ["baixa", "normal", "alta", "urgente"] },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Prioridade atualizada" },
            "400": { description: "Prioridade inválida" },
            "404": { description: "Mensagem não encontrada" },
          },
        },
      },
      "/admin/playlists/{id}/regenerate": {
        post: {
          tags: ["Playlists"],
          summary: "Regenerar playlist manualmente (admin only)",
          description: "Remove todos os PlaylistItems existentes e reconstrói a playlist com os schedules e conteúdos atuais. Rate limit: 20 ops/min.",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": {
              description: "Playlist regenerada",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          playlistId: { type: "integer" },
                          itemsGerados: { type: "integer" },
                          data: { type: "string", format: "date" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "404": { description: "Playlist não encontrada" },
          },
        },
      },
      "/admin/schedule/run-now": {
        post: {
          tags: ["Schedules"],
          summary: "Executar geração de playlists imediatamente (admin only)",
          description: "Dispara a geração de playlists para hoje sem esperar o cron das 01:00. Usa BullMQ se Redis disponível, executa inline caso contrário. Rate limit: 20 ops/min.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    channel_id: { type: "integer", description: "ID do canal específico (omitir = todos os canais ativos)" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Geração iniciada",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          date: { type: "string", format: "date" },
                          channels: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                channelId: { type: "integer" },
                                queued: { type: "boolean", description: "true = enfileirado no BullMQ; false = executado inline" },
                                items: { type: "integer", description: "Itens gerados (apenas quando queued=false)" },
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
            "404": { description: "Canal não encontrado" },
          },
        },
      },
      "/admin/radio/status": {
        get: {
          tags: ["Radio"],
          summary: "Status operacional completo da rádio (admin only)",
          description: "Painel operacional em tempo real: faixa atual, próxima, saúde do Redis/Postgres, filas BullMQ, uso de memória/CPU, estatísticas do dia.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Status operacional",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          online: { type: "boolean" },
                          currentTrack: { nullable: true, $ref: "#/components/schemas/Content" },
                          nextTrack: { nullable: true, $ref: "#/components/schemas/Content" },
                          redis: { type: "object", properties: { ok: { type: "boolean" }, latencyMs: { type: "integer", nullable: true } } },
                          database: { type: "object", properties: { ok: { type: "boolean" }, latencyMs: { type: "integer", nullable: true } } },
                          queues: { type: "object" },
                          aiProvider: { type: "string" },
                          ttsProvider: { type: "string" },
                          activeChannels: { type: "integer" },
                          uptime: { type: "integer", description: "Uptime em segundos" },
                          memoryUsage: { type: "object", properties: { heapUsedMb: { type: "number" }, heapTotalMb: { type: "number" }, rssMb: { type: "number" } } },
                          cpuUsage: { type: "object", properties: { userMs: { type: "integer" }, systemMs: { type: "integer" } } },
                          generatedToday: { type: "integer" },
                          messagesPending: { type: "integer" },
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
      "/admin/system/health": {
        get: {
          tags: ["Admin"],
          summary: "Health check detalhado do sistema (admin only)",
          description: "Diagnóstico completo: Postgres, Redis, BullMQ, storage, memória, ambiente e versão.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Resultado do diagnóstico",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          status: { type: "string", enum: ["healthy", "degraded"] },
                          postgres: { type: "object", properties: { ok: { type: "boolean" }, latencyMs: { type: "integer" } } },
                          redis: { type: "object", properties: { ok: { type: "boolean" }, latencyMs: { type: "integer", nullable: true } } },
                          bullmq: { type: "object" },
                          storage: { type: "object", properties: { ok: { type: "boolean" }, provider: { type: "string" }, uploadDir: { type: "string" }, dirExists: { type: "boolean" } } },
                          memory: { type: "object" },
                          environment: { type: "object", properties: { nodeEnv: { type: "string" }, aiProvider: { type: "string" }, ttsProvider: { type: "string" }, storageProvider: { type: "string" }, nodeVersion: { type: "string" } } },
                          uptime: { type: "integer" },
                          checkedAt: { type: "string", format: "date-time" },
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
      "/admin/storage/status": {
        get: {
          tags: ["Admin"],
          summary: "Status do sistema de storage (admin only)",
          description: [
            "Retorna o provider ativo, bucket/diretório, URL pública e estatísticas de mídia armazenada.",
            "",
            "**Providers suportados:** `local` | `s3` | `r2`",
            "",
            "- `local` — arquivos em disco, serve via Express static. `status: ok` se o diretório existir e for gravável.",
            "- `s3` — AWS S3. `status: ok` se a chamada `HeadObject(__healthcheck__)` responder (pode ser 404, que confirma conectividade).",
            "- `r2` — Cloudflare R2 (S3-compatible). Mesmo critério do S3.",
          ].join("\n"),
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Status do storage",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          provider: { type: "string", enum: ["local", "s3", "r2"], example: "local" },
                          bucket: { type: "string", example: "uploads", description: "Bucket S3/R2 ou diretório local" },
                          publicUrl: { type: "string", nullable: true, example: "https://cdn.domain.com", description: "URL pública base do CDN (null para local)" },
                          status: { type: "string", enum: ["ok", "error"] },
                          error: { type: "string", nullable: true },
                          localDirExists: { type: "boolean", nullable: true, description: "Apenas para provider=local" },
                          stats: {
                            type: "object",
                            properties: {
                              contentsWithAudio: { type: "integer", description: "Total de conteúdos com audio_url" },
                              contentsWithImage: { type: "integer", description: "Total de conteúdos com imagem_url" },
                              uploadsToday: { type: "integer", description: "Conteúdos criados hoje com mídia" },
                            },
                          },
                          checkedAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                  example: {
                    success: true,
                    data: {
                      provider: "r2",
                      bucket: "radio-espiritual",
                      publicUrl: "https://pub-xxxx.r2.dev",
                      status: "ok",
                      error: null,
                      stats: { contentsWithAudio: 142, contentsWithImage: 38, uploadsToday: 5 },
                      checkedAt: "2026-05-20T10:00:00.000Z",
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/admin/contents/{id}/generate-tts": {
        post: {
          tags: ["Contents"],
          summary: "Gerar TTS manualmente para um conteúdo (admin only)",
          description: "Sintetiza áudio para o texto fornecido, salva em storage, atualiza audio_url do conteúdo e invalida o cache de rádio. Rate limit: 20 ops/min.",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: {
                    text: { type: "string", minLength: 5, maxLength: 10000, example: "Bem-vindos à Rádio Espiritual. Que a paz de Deus guarde seus corações." },
                    voice_id: { type: "integer", description: "ID da voz (omitir = auto-seleciona por horário)" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Áudio gerado com sucesso",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          contentId: { type: "integer" },
                          voiceId: { type: "integer" },
                          voiceNome: { type: "string" },
                          audioUrl: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "TTS_API_KEY não configurado" },
            "404": { description: "Conteúdo ou voz não encontrados" },
            "422": { description: "Voz inativa ou nenhuma voz disponível" },
          },
        },
      },
      "/realtime/events": {
        get: {
          tags: ["Realtime"],
          summary: "Stream de eventos Server-Sent Events (SSE)",
          description: [
            "Abre um stream SSE persistente. Sem token → eventos públicos. Com JWT válido (admin/editor) → todos os eventos.",
            "",
            "**Autenticação:** Como navegadores usando `EventSource` não suportam cabeçalhos customizados, o token pode ser passado via query string `?token=<JWT>`.",
            "",
            "**Eventos públicos:**",
            "- `connected` — confirmação de conexão com `clientId`",
            "- `current_track_changed` — faixa atual mudou `{ channelId, current, next, ts }`",
            "- `next_track_changed` — próxima faixa mudou `{ channelId, next, ts }`",
            "- `radio_online` — rádio voltou ao ar `{ channelId, ts }`",
            "- `radio_offline` — rádio sem conteúdo `{ channelId, ts }`",
            "- `playlist_updated` — playlist foi criada/regenerada `{ channelId, date, playlistId, ts }`",
            "",
            "**Eventos administrativos** (requer role admin ou editor):",
            "- `message_received` — nova mensagem/contato `{ id, tipo, nome, assunto, prioridade, ts }`",
            "- `prayer_urgent` — pedido de oração urgente/alto `{ id, nome, mensagem, prioridade, ts }`",
            "- `tts_completed` — síntese TTS concluída `{ contentId, voiceId, audioUrl, trigger, ts }`",
            "- `tts_failed` — síntese TTS falhou `{ contentId?, voiceId?, error, trigger, ts }`",
            "- `ai_generation_completed` — geração de IA concluída `{ contentId, ts }`",
            "- `ai_generation_failed` — geração de IA falhou `{ error, ts }`",
            "- `playlist_regenerated` — playlist regenerada manualmente `{ playlistId, channelId, date, items, ts }`",
            "- `schedule_executed` — job de schedule executou `{ trigger, channelId?, date, ts }`",
            "- `radio_status_changed` — cache de rádio invalidado `{ channelId, reason, ts }`",
            "- `queue_failed` — job de fila falhou `{ queue, jobId, error, ts }`",
            "- `queue_recovered` — fila recuperada `{ queue, ts }`",
            "- `system_warning` — alerta de sistema `{ message, ts }`",
            "",
            "**Limites:** 200 conexões simultâneas por servidor, 10 por IP. Heartbeat a cada 30s (`: ping`). Timeout após 90s sem atividade.",
          ].join("\n"),
          parameters: [
            {
              name: "token",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "JWT Bearer token para obter eventos administrativos (alternativa ao header Authorization)",
            },
          ],
          responses: {
            "200": {
              description: "Stream SSE ativo",
              content: {
                "text/event-stream": {
                  schema: {
                    type: "string",
                    description: "Fluxo de eventos no formato SSE: `id: <id>\\nevent: <tipo>\\ndata: <JSON>\\n\\n`",
                    example: "id: lp9x2a\nevent: connected\ndata: {\"clientId\":\"uuid\",\"isAdmin\":false,\"ts\":\"2026-01-01T00:00:00.000Z\"}\n\nid: lp9x3b\nevent: current_track_changed\ndata: {\"channelId\":1,\"current\":{\"id\":5,\"titulo\":\"Tempo de Adoração\"},\"next\":{\"id\":6,\"titulo\":\"Devocional Matinal\"},\"ts\":\"2026-01-01T06:00:00.000Z\"}\n\n",
                  },
                },
              },
            },
            "429": { description: "Limite de conexões SSE atingido" },
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
