import { AppRole } from './auth.types';

/**
 * Permissões da aplicação. As rotas declaram o que exigem com @Can(...); os
 * perfis são só listas de permissões. Na V1 existe apenas o ADMIN (com todas);
 * novos perfis (recepção, professor…) entram aqui sem mexer nos controllers.
 */
export const PERMISSIONS = [
  'dashboard.read',
  'students.read',
  'students.write',
  'students.import',
  'students.export',
  'students.delete',
  'invoices.write',
  'graduation.read',
  'graduation.write',
  'classes.read',
  'classes.write',
  'finance.read',
  'finance.write',
  'store.read',
  'store.write',
  'store.sell',
  'disciplines.read',
  'disciplines.write',
  'settings.read',
  'settings.write',
  'billing.run',
  'portal.self',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  ADMIN: PERMISSIONS.filter((p) => p !== 'portal.self'),
  STUDENT: ['portal.self'],
};

export function permissionsOf(role: AppRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasAll(role: AppRole, required: readonly Permission[]): boolean {
  const granted = permissionsOf(role);
  return required.every((p) => granted.includes(p));
}
