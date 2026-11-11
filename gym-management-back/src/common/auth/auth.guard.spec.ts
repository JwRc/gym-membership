import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { AuthUser } from './auth.types';
import { Authenticated, Can, Public } from './decorators';
import { PrismaService } from '../prisma.service';

class Routes {
  @Public() open() {}
  @Authenticated() me() {}
  @Can('students.read') read() {}
  @Can('portal.self') portal() {}
  forgotten() {}
}

@Can('finance.read')
class ClassLevel {
  list() {}
  @Can('finance.write') write() {}
}

const jwt = new JwtService({ secret: 'test' });
const users = new Map<string, { role: 'ADMIN' | 'STUDENT'; tenantId: string; tokenVersion: number }>([
  ['admin', { role: 'ADMIN', tenantId: 't1', tokenVersion: 2 }],
  ['student', { role: 'STUDENT', tenantId: 't1', tokenVersion: 0 }],
]);
const prisma = { user: { findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null } } as unknown as PrismaService;
const guard = new AuthGuard(new Reflector(), jwt, prisma);

const token = (sub: string, ver: number, tenantId = 't1', role: AuthUser['role'] = 'ADMIN') =>
  jwt.sign({ sub, tenantId, role, studentId: null, name: 'x', ver } satisfies AuthUser);

function ctx(cls: object, method: string, authorization?: string) {
  const req: { headers: Record<string, string>; user?: AuthUser } = { headers: authorization ? { authorization } : {} };
  const c = {
    getHandler: () => (cls as Record<string, unknown>)[method],
    getClass: () => (cls as { constructor: unknown }).constructor,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { c, req };
}
const run = (cls: object, method: string, auth?: string) => guard.canActivate(ctx(cls, method, auth).c);
const R = Routes.prototype;
const C = ClassLevel.prototype;
const admin = `Bearer ${token('admin', 2)}`;

test('@Public passa sem token', async () => {
  assert.equal(await run(R, 'open'), true);
});

test('sem token ou com token inválido: 401', async () => {
  await assert.rejects(run(R, 'me'), UnauthorizedException);
  await assert.rejects(run(R, 'me', 'Bearer lixo'), UnauthorizedException);
});

test('rota sem @Public/@Authenticated/@Can é negada por padrão', async () => {
  await assert.rejects(run(R, 'forgotten', admin), ForbiddenException);
});

test('@Authenticated basta estar logado', async () => {
  assert.equal(await run(R, 'me', admin), true);
});

test('@Can confere as permissões do perfil', async () => {
  assert.equal(await run(R, 'read', admin), true);
  await assert.rejects(run(R, 'portal', admin), ForbiddenException);
  const student = `Bearer ${token('student', 0, 't1', 'STUDENT')}`;
  await assert.rejects(run(R, 'read', student), ForbiddenException);
  assert.equal(await run(R, 'portal', student), true);
});

test('@Can na classe vale para as rotas e a rota pode sobrescrever', async () => {
  assert.equal(await run(C, 'list', admin), true);
  assert.equal(await run(C, 'write', admin), true);
  const student = `Bearer ${token('student', 0, 't1', 'STUDENT')}`;
  await assert.rejects(run(C, 'list', student), ForbiddenException);
});

test('token com versão antiga (senha trocada) é recusado', async () => {
  await assert.rejects(run(R, 'me', `Bearer ${token('admin', 1)}`), UnauthorizedException);
});

test('token de usuário inexistente ou de outra academia é recusado', async () => {
  await assert.rejects(run(R, 'me', `Bearer ${token('ghost', 0)}`), UnauthorizedException);
  await assert.rejects(run(R, 'me', `Bearer ${token('admin', 2, 't2')}`), UnauthorizedException);
});

test('o perfil vem do banco, não do token', async () => {
  // token forjado com role ADMIN para um usuário que é STUDENT no banco
  const forged = `Bearer ${token('student', 0, 't1', 'ADMIN')}`;
  await assert.rejects(run(R, 'read', forged), ForbiddenException);
});
