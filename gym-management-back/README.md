# gym-management-back

API de gestão de academias de artes marciais — multi-academia (cada academia tem seus dados isolados), com alunos, turmas, graduação, mensalidades, financeiro e loja.

**Stack:** Node.js 22 · NestJS 11 · Prisma 6 · PostgreSQL 17 · Redis 7 (cache) · BullMQ 5 (jobs)

## Rodando localmente

```bash
cp .env.example .env
docker compose up -d          # PostgreSQL (5432) + Redis (6379)
npm install
npm run prisma:migrate        # aplica as migrations
npm run db:seed               # dados de demonstração (datas relativas a hoje)
npm run start:dev             # http://localhost:3000/api
```

Contas de demonstração (criadas pelo seed, **só para desenvolvimento local**; o seed se recusa a rodar com `NODE_ENV=production`):

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Admin · Academia Tatame (92 alunos) | ricardo@academiatatame.com.br | tatame123 |
| Aluno · Academia Tatame | joao.santos@gmail.com | aluno123 |
| Admin · CT Kaizen (academia nova, onboarding) | helena@ctkaizen.com.br | kaizen123 |

O seed é idempotente: apaga e recria só as duas academias de demonstração.

## Scripts

| Script | O que faz |
| --- | --- |
| `npm run start:dev` | API com reload |
| `npm run build` / `start:prod` | build e execução de produção |
| `npm test` | testes unitários das regras de domínio (`node:test`) |
| `npm run typecheck` | checagem de tipos |
| `npm run prisma:migrate` / `prisma:deploy` | migrations (dev / produção) |
| `npm run db:seed` | dados de demonstração |

## Arquitetura

```
src/
  common/            prisma, redis (cache por academia), auth guard/decorators, utilitários de data e dinheiro
  domain/            regras puras e testadas: graduação, mensalidades, grade horária, catálogo
  modules/
    auth/            login, cadastro de academia, cadastro de aluno por código
    students/        alunos + mensalidades (lançar, pagar, gerar mês, marcar atrasos)
    graduation/      visão por modalidade, preview e registro de graduação
    classes/         turmas, horários (com detecção de conflito), matrículas, presença
    finance/         lançamentos + visão mensal (mensalidades agrupadas por vencimento)
    store/           produtos, estoque e vendas (geram entrada + custo no financeiro)
    disciplines/     modalidades da academia e catálogo padrão
    tenant/          configurações, planos, professores, onboarding
    dashboard/       painel inicial (aniversariantes, financeiro, turmas de hoje, atrasos, aptos)
    portal/          área do aluno (/me)
    jobs/            filas BullMQ: cobrança e notificações
```

- **Multi-tenant:** todo registro tem `tenantId`; o JWT carrega o `tenantId` e todos os serviços filtram por ele.
- **Perfis:** `ADMIN` (gestão) e `STUDENT` (só `/me`). Guard global com `@Public()` e `@Roles()`.
- **Cache (Redis):** leituras pesadas (lista de alunos, painel) usam `CacheService.getOrSet`. Cada academia tem um contador de versão; qualquer escrita bem-sucedida (interceptor global) incrementa o contador e invalida o cache daquela academia.
- **Jobs (BullMQ):**
  - `billing` › `generate-invoices` — diário às 02:00; garante as mensalidades do mês e, a partir do dia 25, cria as do mês seguinte (Configurações › "Gerar mensalidades automaticamente"). Idempotente (`@@unique([studentId, year, month])`).
  - `billing` › `mark-overdue` — diário às 03:00; marca como atrasadas as vencidas além da tolerância e enfileira notificações.
  - `notifications` — estoque baixo e mensalidade atrasada. Hoje só registra no log; é o ponto para plugar e-mail/WhatsApp.
  - Sob demanda: `POST /api/jobs/invoices/generate`, `POST /api/jobs/invoices/mark-overdue`, `GET /api/jobs/:id`.
  - `DISABLE_SCHEDULER=true` desliga os agendamentos (útil com várias réplicas).

### Regras de graduação

Em `src/domain/graduation.ts` (com testes):
- Modalidades com graus (Jiu-jitsu: 4 graus por faixa, 4 meses e 40 aulas entre graus). Depois do 4º grau, a próxima faixa exige o tempo mínimo da faixa atual (contado desde a data da faixa) e as aulas desde a última graduação. Na faixa preta os graus seguem até o 6º.
- Demais modalidades: cada nível tem tempo e aulas mínimos desde a última graduação; o último nível é o topo.
- Na V1 a presença está desligada: a graduação é registrada manualmente.

### Modalidades: catálogo × academia

O catálogo padrão (`src/domain/catalog.ts`) é sincronizado no boot. Ao adicionar uma modalidade, a academia recebe uma **cópia**. Editar marca a cópia como personalizada (`customizedAt`) e "Restaurar padrão" volta ao catálogo. Mudanças nunca afetam outras academias.

## Principais endpoints (`/api`)

| | |
| --- | --- |
| `POST /auth/login` · `GET /auth/me` | autenticação |
| `GET /dashboard` | painel |
| `GET/POST /students` · `GET/PATCH /students/:id` | alunos (filtros `q`, `disciplineId`, `status`, `finance`) |
| `GET/POST /students/:id/invoices` · `POST /invoices/:id/pay` | mensalidades |
| `GET /graduation` · `GET /graduation/preview` · `POST /graduation/promote` | graduação |
| `GET/POST /classes` · `PATCH/DELETE /classes/:id` · `POST /classes/:id/slots` · `PATCH/DELETE /classes/slots/:slotId` · `GET /classes/conflicts` · `POST/DELETE /classes/:id/students` | turmas |
| `GET /finance?year&month&type&category` · `POST/PATCH/DELETE /finance/transactions` | financeiro |
| `GET /store` · `POST/PATCH /store/products` · `POST /store/sales` | loja |
| `GET /disciplines` · `POST /disciplines` · `POST /disciplines/from-catalog/:id` · `PATCH/DELETE /disciplines/:id` · `POST /disciplines/:id/restore` | modalidades |
| `GET/PATCH /tenant` · `GET /tenant/onboarding` · `POST/DELETE /tenant/plans` · `POST /tenant/instructors` | configurações |
| `GET /health` | saúde (DB + Redis) |

## Pendências conhecidas

- **Área do aluno (V3):** o `PortalModule` existe em `src/modules/portal/`, mas não está registrado. O Pix dele é fictício.
- **Recuperação de senha:** não implementada (a tela orienta a falar com a recepção).
- **Notificações:** o processor só registra no log.
- Ainda não há testes e2e da API; os testes cobrem as regras de domínio.
- `APP_TODAY=YYYY-MM-DD` fixa a data de "hoje" (útil para demonstrações; ignorado em produção).
