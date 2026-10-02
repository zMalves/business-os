import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/client.js';
import { loggerService } from './logger.service.js';

const JWT_SECRET = process.env.JWT_SECRET || process.env.DEPLOY_KEY || 'victoria_jwt_secret_2026_malves';
const TOKEN_EXPIRY = '30d';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export class AuthService {
  /**
   * Inicializa e garante que o usuário admin padrão exista no banco de dados
   */
  async ensureDefaultUser(): Promise<void> {
    try {
      const defaultEmail = 'maychel.alvesz@gmail.com';
      const existingUser = await prisma.user.findUnique({
        where: { email: defaultEmail },
      });

      if (!existingUser) {
        const hashedPassword = await bcrypt.hash('M@ychel123', 10);
        await prisma.user.create({
          data: {
            email: defaultEmail,
            name: 'Maychel Alves',
            password: hashedPassword,
            role: 'admin',
          },
        });
        loggerService.system(`👤 Usuário administrador inicial (${defaultEmail}) criado com sucesso.`);
      }
    } catch (err: any) {
      loggerService.error('system', `Erro ao verificar/criar usuário padrão: ${err.message}`);
    }
  }

  /**
   * Realiza a autenticação de um usuário por e-mail e senha
   */
  async validateUser(email: string, passwordPlain: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(passwordPlain, user.password);
    if (!isValid) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  /**
   * Gera um token JWT para o usuário
   */
  generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  }

  /**
   * Verifica a validade de um token JWT
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();
