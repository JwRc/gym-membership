import { randomBytes } from 'node:crypto';

/** Senha forte gerada quando OPS_PASSWORD não é informado. */
export function generatePassword(): string {
  return randomBytes(12).toString('base64url');
}

export function passwordFromEnv(min = 8): { password: string; generated: boolean } {
  const env = process.env.OPS_PASSWORD;
  if (env) {
    if (env.length < min) throw new Error(`OPS_PASSWORD precisa ter pelo menos ${min} caracteres.`);
    return { password: env, generated: false };
  }
  return { password: generatePassword(), generated: true };
}
