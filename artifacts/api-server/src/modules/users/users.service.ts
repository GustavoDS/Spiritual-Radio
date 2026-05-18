import bcrypt from "bcryptjs";
import { User } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export interface UpdateUserDto {
  nome?: string;
  email?: string;
  senha?: string;
  role?: "admin" | "user" | "editor";
}

export class UsersService {
  async findAll() {
    return User.findAll({
      attributes: { exclude: ["senha"] },
      order: [["createdAt", "DESC"]],
    });
  }

  async findById(id: number) {
    const user = await User.findByPk(id, { attributes: { exclude: ["senha"] } });
    if (!user) throw new HttpError("Usuário não encontrado", 404);
    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await User.findByPk(id);
    if (!user) throw new HttpError("Usuário não encontrado", 404);

    if (dto.email && dto.email !== user.email) {
      const existing = await User.findOne({ where: { email: dto.email } });
      if (existing) throw new HttpError("Email já está em uso", 409);
    }

    if (dto.senha) {
      dto = { ...dto, senha: await bcrypt.hash(dto.senha, 12) };
    }

    await user.update(dto);
    const { senha: _s, ...safe } = user.toJSON() as Record<string, unknown>;
    return safe;
  }

  async remove(id: number) {
    const user = await User.findByPk(id);
    if (!user) throw new HttpError("Usuário não encontrado", 404);
    await user.destroy();
    return { id };
  }
}

export const usersService = new UsersService();
