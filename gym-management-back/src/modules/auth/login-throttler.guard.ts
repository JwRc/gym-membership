import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

/** Limite de tentativas de login por IP + e-mail (contra tentativa e erro de senha). */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${req.ip}|${email}`;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Muitas tentativas de login. Aguarde um minuto e tente novamente.');
  }
}
