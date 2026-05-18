import bcrypt from "bcryptjs";
import { User } from "../../models/index.js";
import { signToken } from "../../utils/jwt.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { logger } from "../../lib/logger.js";

export interface RegisterDto {
  nome: string;
  email: string;
  senha: string;
  role?: "admin" | "user" | "editor";
}

export interface LoginDto {
  email: string;
  senha: string;
}

export class AuthService {
  async register(dto: RegisterDto) {
    const existing = await User.findOne({ where: { email: dto.email } });
    if (existing) throw new HttpError("Email já está em uso", 409);

    const hashed = await bcrypt.hash(dto.senha, 12);
    const user = await User.create({
      nome: dto.nome,
      email: dto.email,
      senha: hashed,
      role: dto.role ?? "user",
    });

    logger.info("User registered", { userId: user.id, email: user.email });

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    return { token, user: this.sanitize(user) };
  }

  async login(dto: LoginDto) {
    const user = await User.findOne({ where: { email: dto.email } });
    if (!user) throw new HttpError("Credenciais inválidas", 401);

    const valid = await bcrypt.compare(dto.senha, user.senha);
    if (!valid) throw new HttpError("Credenciais inválidas", 401);

    logger.info("User logged in", { userId: user.id });
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    return { token, user: this.sanitize(user) };
  }

  async recover(email: string) {
    const user = await User.findOne({ where: { email } });
    if (!user) throw new HttpError("Usuário não encontrado", 404);
    logger.info("Password recovery requested", { email });
    return { message: "Se o email existir, você receberá as instruções em breve" };
  }

  private sanitize(user: User) {
    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}

export const authService = new AuthService();
