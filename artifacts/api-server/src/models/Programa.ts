import { Model, DataTypes, type Sequelize } from "sequelize";

export interface ReceitaItem {
  tipo: string;
  pct: number;
}

export interface RegrasPrograma {
  abre_com?: string;
  fecha_com?: string;
  anti_repeticao_dias?: number;
  max_musicas_seguidas?: number;
}

export type BlocoPrograma =
  | "madrugada"
  | "amanhecer"
  | "manha"
  | "almoco"
  | "tarde"
  | "prime"
  | "noite"
  | "devocional"
  | "sleep"
  | "custom";

export class Programa extends Model {
  declare id: number;
  declare nome: string;
  declare descricao: string | null;
  declare duracao_min: number;
  declare bloco: BlocoPrograma;
  declare receita: ReceitaItem[];
  declare regras: RegrasPrograma;
  declare channel_id: number | null;
  declare ativo: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initPrograma(sequelize: Sequelize): void {
  Programa.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING(255), allowNull: false },
      descricao: { type: DataTypes.TEXT, allowNull: true },
      duracao_min: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Duração do programa em minutos (múltiplo de 5, 5–480)",
      },
      bloco: {
        type: DataTypes.ENUM(
          "madrugada", "amanhecer", "manha", "almoco", "tarde",
          "prime", "noite", "devocional", "sleep", "custom",
        ),
        allowNull: false,
      },
      receita: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: '[{ "tipo": "musica", "pct": 60 }, ...]  — soma deve ser 100',
      },
      regras: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: '{ abre_com, fecha_com, anti_repeticao_dias, max_musicas_seguidas }',
      },
      channel_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: "null = programa compartilhado (todos os canais)",
      },
      ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      sequelize,
      modelName: "Programa",
      tableName: "programas",
      timestamps: true,
      indexes: [
        { fields: ["channel_id"] },
        { fields: ["bloco"] },
        { fields: ["ativo"] },
        { unique: true, fields: ["channel_id", "nome"], where: { ativo: true } },
      ],
    },
  );
}
