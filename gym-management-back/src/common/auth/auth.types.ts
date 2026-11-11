export type AppRole = 'ADMIN' | 'STUDENT';

/** Conteúdo do JWT (e de req.user). */
export interface AuthUser {
  sub: string;
  tenantId: string;
  role: AppRole;
  studentId: string | null;
  name: string;
  /** Versão das credenciais: trocar a senha incrementa e derruba sessões antigas. */
  ver: number;
}
