import bcrypt from "bcryptjs";
import { User } from "../../models/index.js";
import { signToken, signRefreshToken, verifyRefreshToken, decodeTokenExpiry } from "../../utils/jwt.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { logger } from "../../lib/logger.js";
import { redis } from "../../config/redis.js";

export interface RegisterDto {
  nome: string;
  email: string;
  senha: string;
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
      role: "user",
    });

    logger.info("User registered", { userId: user.id, email: user.email });
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id, email: user.email, role: user.role });
    return { token, refreshToken, user: this.sanitize(user) };
  }

  async login(dto: LoginDto) {
    const user = await User.findOne({ where: { email: dto.email } });
    if (!user) throw new HttpError("Credenciais inválidas", 401);

    const valid = await bcrypt.compare(dto.senha, user.senha);
    if (!valid) throw new HttpError("Credenciais inválidas", 401);

    logger.info("User logged in", { userId: user.id });
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id, email: user.email, role: user.role });
    return { token, refreshToken, user: this.sanitize(user) };
  }

  async refresh(refreshToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new HttpError("Refresh token inválido ou expirado", 401);
    }

    try {
      const blacklisted = await redis.exists(`blacklist:refresh:${refreshToken}`);
      if (blacklisted) throw new HttpError("Refresh token revogado", 401);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      logger.warn("Redis unavailable during refresh token blacklist check — failing open");
    }

    const user = await User.findByPk(payload.id);
    if (!user) throw new HttpError("Usuário não encontrado", 404);

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    const newRefreshToken = signRefreshToken({ id: user.id, email: user.email, role: user.role });

    try {
      const oldExp = decodeTokenExpiry(refreshToken);
      const ttl = oldExp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await redis.setex(`blacklist:refresh:${refreshToken}`, ttl, "1");
    } catch { /* ignore */ }

    logger.info("Token refreshed", { userId: user.id });
    return { token, refreshToken: newRefreshToken };
  }

  async logout(accessToken: string, refreshToken?: string) {
    try {
      const exp = decodeTokenExpiry(accessToken);
      const ttl = exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await redis.setex(`blacklist:${accessToken}`, ttl, "1");
    } catch { /* Redis unavailable */ }

    if (refreshToken) {
      try {
        await redis.setex(`blacklist:refresh:${refreshToken}`, 30 * 24 * 3600, "1");
      } catch { /* ignore */ }
    }

    logger.info("User logged out");
    return { message: "Logout realizado com sucesso" };
  }

  async recover(email: string) {
    const user = await User.findOne({ where: { email } });
    if (!user) throw new HttpError("Usuário não encontrado", 404);
    logger.info("Password recovery requested", { email });
    return { message: "Se o email existir, você receberá as instruções em breve" };
  }

  private sanitize(user: User) {
    return { id: user.id, nome: user.nome, email: user.email, role: user.role, createdAt: user.createdAt };
  }
}

export const authService = new AuthService();
