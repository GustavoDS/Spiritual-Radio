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
            provider: { type: "string" },
            horario_preferencial: { type: "string" },
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
                    nome: { type: "string" },
                    email: { type: "string", format: "email" },
                    senha: { type: "string", minLength: 6 },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Usuário criado com sucesso" },
            "400": { description: "Dados inválidos" },
            "409": { description: "Email já cadastrado" },
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
                    email: { type: "string", format: "email" },
                    senha: { type: "string" },
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
                      token: { type: "string" },
                      user: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
            "401": { description: "Credenciais inválidas" },
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
            "200": { description: "Email de recuperação enviado" },
            "404": { description: "Usuário não encontrado" },
          },
        },
      },
      "/contents": {
        get: {
          tags: ["Contents"],
          summary: "Listar conteúdos",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "categoria_id", in: "query", schema: { type: "integer" } },
            { name: "channel_id", in: "query", schema: { type: "integer" } },
            { name: "tipo", in: "query", schema: { type: "string" } },
            { name: "ativo", in: "query", schema: { type: "boolean" } },
          ],
          responses: { "200": { description: "Lista de conteúdos" } },
        },
        post: {
          tags: ["Contents"],
          summary: "Criar conteúdo",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["titulo", "tipo"],
                  properties: {
                    titulo: { type: "string" },
                    tipo: { type: "string" },
                    categoria_id: { type: "integer" },
                    channel_id: { type: "integer" },
                    duracao: { type: "integer" },
                    tags: { type: "string", description: "JSON array de tags" },
                    audio: { type: "string", format: "binary" },
                    imagem: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Conteúdo criado" } },
        },
      },
      "/contents/{id}": {
        put: {
          tags: ["Contents"],
          summary: "Atualizar conteúdo",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "multipart/form-data": { schema: { $ref: "#/components/schemas/Content" } },
            },
          },
          responses: { "200": { description: "Conteúdo atualizado" }, "404": { description: "Não encontrado" } },
        },
        delete: {
          tags: ["Contents"],
          summary: "Deletar conteúdo",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Conteúdo removido" }, "404": { description: "Não encontrado" } },
        },
      },
      "/categories": {
        get: {
          tags: ["Categories"],
          summary: "Listar categorias",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Lista de categorias" } },
        },
        post: {
          tags: ["Categories"],
          summary: "Criar categoria",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["nome"], properties: { nome: { type: "string" } } },
              },
            },
          },
          responses: { "201": { description: "Categoria criada" } },
        },
      },
      "/categories/{id}": {
        get: {
          tags: ["Categories"],
          summary: "Buscar categoria",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Categoria encontrada" }, "404": { description: "Não encontrada" } },
        },
        put: {
          tags: ["Categories"],
          summary: "Atualizar categoria",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", properties: { nome: { type: "string" } } },
              },
            },
          },
          responses: { "200": { description: "Categoria atualizada" } },
        },
        delete: {
          tags: ["Categories"],
          summary: "Deletar categoria",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "Categoria removida" } },
        },
      },
      "/channels": {
        get: {
          tags: ["Channels"],
          summary: "Listar canais",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Lista de canais" } },
        },
        post: {
          tags: ["Channels"],
          summary: "Criar canal",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Canal criado" } },
        },
      },
      "/channels/{id}": {
        get: { tags: ["Channels"], summary: "Buscar canal", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Canal encontrado" } } },
        put: { tags: ["Channels"], summary: "Atualizar canal", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Canal atualizado" } } },
        delete: { tags: ["Channels"], summary: "Deletar canal", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Canal removido" } } },
      },
      "/schedule": {
        get: {
          tags: ["Schedules"],
          summary: "Listar programação",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "channel_id", in: "query", schema: { type: "integer" } },
            { name: "data", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: { "200": { description: "Programação do canal" } },
        },
        post: {
          tags: ["Schedules"],
          summary: "Criar programação",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Programação criada" } },
        },
      },
      "/playlists": {
        get: { tags: ["Playlists"], summary: "Listar playlists", security: [{ bearerAuth: [] }], responses: { "200": { description: "Playlists" } } },
        post: { tags: ["Playlists"], summary: "Criar playlist", security: [{ bearerAuth: [] }], responses: { "201": { description: "Playlist criada" } } },
      },
      "/voices": {
        get: {
          tags: ["Voices"],
          summary: "Listar vozes disponíveis",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Lista de vozes para TTS" } },
        },
      },
      "/radio/current": {
        get: {
          tags: ["Radio"],
          summary: "Conteúdo atual em reprodução",
          responses: { "200": { description: "Conteúdo em reprodução no momento" } },
        },
      },
      "/radio/next": {
        get: {
          tags: ["Radio"],
          summary: "Próximo conteúdo",
          responses: { "200": { description: "Próximo conteúdo na fila" } },
        },
      },
      "/radio/schedule": {
        get: {
          tags: ["Radio"],
          summary: "Programação atual da rádio",
          responses: { "200": { description: "Programação completa do dia" } },
        },
      },
      "/users": {
        get: { tags: ["Users"], summary: "Listar usuários", security: [{ bearerAuth: [] }], responses: { "200": { description: "Lista de usuários" } } },
      },
      "/users/{id}": {
        get: { tags: ["Users"], summary: "Buscar usuário", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Usuário" } } },
        put: { tags: ["Users"], summary: "Atualizar usuário", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Usuário atualizado" } } },
        delete: { tags: ["Users"], summary: "Deletar usuário", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Usuário removido" } } },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
