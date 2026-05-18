import { Model, DataTypes, type Sequelize } from "sequelize";

export class Voice extends Model {
  declare id: number;
  declare nome: string;
  declare provider: string;
  declare horario_preferencial: string | null;
  declare ativo: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initVoice(sequelize: Sequelize): void {
  Voice.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING(255), allowNull: false },
      provider: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Ex: elevenlabs, google, openai",
      },
      horario_preferencial: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Ex: manha, tarde, noite",
      },
      ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { sequelize, modelName: "Voice", tableName: "voices", timestamps: true },
  );
}
