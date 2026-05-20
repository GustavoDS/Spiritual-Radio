import { DataTypes, Model, type Sequelize, type InferAttributes, type InferCreationAttributes, type CreationOptional } from "sequelize";

export class RadioPlay extends Model<
  InferAttributes<RadioPlay>,
  InferCreationAttributes<RadioPlay>
> {
  declare id: CreationOptional<number>;
  declare channel_id: number | null;
  declare content_id: number | null;
  declare titulo: string;
  declare tipo: string;
  declare played_at: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;
}

export function initRadioPlay(sequelize: Sequelize): void {
  RadioPlay.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      channel_id: { type: DataTypes.INTEGER, allowNull: true },
      content_id: { type: DataTypes.INTEGER, allowNull: true },
      titulo: { type: DataTypes.STRING(512), allowNull: false, defaultValue: "(desconhecido)" },
      tipo: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "desconhecido" },
      played_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: "radio_plays",
      timestamps: false,
      indexes: [
        { fields: ["channel_id"] },
        { fields: ["content_id"] },
        { fields: ["played_at"] },
      ],
    },
  );
}
