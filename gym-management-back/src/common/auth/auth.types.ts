export type AppRole = 'ADMIN' | 'STUDENT';

export interface AuthUser {
  sub: string;
  tenantId: string;
  role: AppRole;
  studentId: string | null;
  name: string;
}
