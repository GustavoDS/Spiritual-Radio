import { Model, DataTypes, type Sequelize } from "sequelize";

export class Category extends Model {
  declare id: number;
  declare nome: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initCategory(sequelize: Sequelize): void {
  Category.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    },
    { sequelize, modelName: "Category", tableName: "categories", timestamps: true },
  );
}
