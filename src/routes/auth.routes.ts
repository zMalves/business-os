import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';

// Rastreador de tentativas incorretas para proteção contra Força Bruta (Ponto 8)
interface FailedAttempt {
  attempts: number;
  blockedUntil?: number;
}
const failedAttemptsMap = new Map<string, FailedAttempt>();

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/login
   * Autenticação com e-mail e senha + Proteção contra Força Bruta
   */
  app.post('/auth/login', async (req, reply) => {
    const loginSchema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'E-mail ou senha com formato inválido.',
      });
    }

    const { email, password } = parsed.data;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'client';
    const clientKey = `${ip}_${email.toLowerCase()}`;
    const attempt = failedAttemptsMap.get(clientKey);

    // Verifica se o IP/e-mail está em período de bloqueio temporário
    if (attempt?.blockedUntil && Date.now() < attempt.blockedUntil) {
      const waitMinutes = Math.ceil((attempt.blockedUntil - Date.now()) / (60 * 1000));
      return reply.status(429).send({
        success: false,
        error: `Muitas tentativas incorretas. Acesso temporariamente suspenso. Tente novamente em ${waitMinutes} minuto(s).`,
      });
    }

    const user = await authService.validateUser(email, password);

    if (!user) {
      const prev = failedAttemptsMap.get(clientKey) || { attempts: 0 };
      const currentAttempts = prev.attempts + 1;
      let blockedUntil: number | undefined;

      // Bloqueia por 15 minutos após 5 falhas consecutivas
      if (currentAttempts >= 5) {
        blockedUntil = Date.now() + 15 * 60 * 1000;
      }

      failedAttemptsMap.set(clientKey, { attempts: currentAttempts, blockedUntil });
      const remaining = Math.max(0, 5 - currentAttempts);
      const warning = remaining > 0 ? ` Restam ${remaining} tentativa(s) antes do bloqueio temporário.` : ' Limite de tentativas atingido. Bloqueado por 15 minutos.';

      return reply.status(401).send({
        success: false,
        error: `E-mail ou senha incorretos.${warning}`,
      });
    }

    // Sucesso: limpa tentativas falhas registradas
    failedAttemptsMap.delete(clientKey);

    const token = authService.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Detecta se a conexão é HTTPS (direta ou atrás de proxy) para garantir Secure Cookie (Ponto 18)
    const isHttpsOrProduction = 
      process.env.NODE_ENV === 'production' || 
      req.headers['x-forwarded-proto'] === 'https' ||
      (req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1'));

    reply.setCookie('secretary_token', token, {
      path: '/',
      httpOnly: true,
      secure: Boolean(isHttpsOrProduction),
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 dias em segundos
    });

    return reply.send({
      success: true,
      message: 'Login realizado com sucesso.',
      token,
      user,
    });
  });

  /**
   * GET /api/auth/me
   * Retorna os dados do usuário autenticado a partir do cookie ou Header Authorization
   */
  app.get('/auth/me', async (req, reply) => {
    const cookieToken = req.cookies?.secretary_token;
    const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const token = cookieToken || headerToken;

    if (!token) {
      return reply.status(401).send({
        success: false,
        error: 'Não autenticado.',
      });
    }

    const decoded = authService.verifyToken(token);
    if (!decoded) {
      return reply.status(401).send({
        success: false,
        error: 'Sessão expirada ou token inválido.',
      });
    }

    return reply.send({
      success: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      },
    });
  });

  /**
   * POST & GET /api/auth/logout
   * Limpa o cookie de autenticação e revoga a sessão
   */
  const handleLogoutAction = (reply: any) => {
    reply.setCookie('secretary_token', '', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      expires: new Date(0),
      maxAge: 0,
    });
    reply.clearCookie('secretary_token', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
  };

  app.post('/auth/logout', async (_req, reply) => {
    handleLogoutAction(reply);
    return reply.send({
      success: true,
      message: 'Logout realizado com sucesso.',
    });
  });

  app.get('/auth/logout', async (_req, reply) => {
    handleLogoutAction(reply);
    return reply.redirect('/login');
  });
}
