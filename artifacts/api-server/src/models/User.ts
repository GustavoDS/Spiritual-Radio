import { Model, DataTypes, type Sequelize } from "sequelize";

export class User extends Model {
  declare id: number;
  declare nome: string;
  declare email: string;
  declare senha: string;
  declare role: "admin" | "user" | "editor";
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initUser(sequelize: Sequelize): void {
  User.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING(255), allowNull: false },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      senha: { type: DataTypes.STRING(255), allowNull: false },
      role: {
        type: DataTypes.ENUM("admin", "user", "editor"),
        defaultValue: "user",
        allowNull: false,
      },
    },
    { sequelize, modelName: "User", tableName: "users", timestamps: true },
  );
}
