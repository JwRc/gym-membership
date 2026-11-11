import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limite de tentativas de login por conta (e-mail), venha de qualquer IP.
 * Atrás do Cloudflare/Cloud Run o IP do cliente não é confiável
 * (X-Forwarded-For pode ser forjado), então a chave é só o e-mail.
 * O custo é que alguém pode bloquear uma conta por 1 minuto errando a senha.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email ? `login:${email}` : `login-ip:${req.ip}`;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Muitas tentativas de login. Aguarde um minuto e tente novamente.');
  }
}
