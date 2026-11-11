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

## Operação (sem cadastro aberto na V1)

```bash
# cria a academia + administrador (senha de OPS_PASSWORD ou gerada e mostrada uma vez)
npm run ops:create-academy -- --academy "Academia X" --name "Fulano" --email fulano@x.com --disciplines bjj,mt
# redefine a senha e encerra as sessões abertas
npm run ops:reset-password -- --email fulano@x.com
```

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
- **Permissões (base do RBAC):** cada rota declara o que exige com `@Can('students.write')` (na classe e/ou na rota). Os perfis são listas de permissões em `src/common/auth/permissions.ts`; na V1 só existe o `ADMIN`, com todas. Rotas sem `@Public()`, `@Authenticated()` ou `@Can()` são **negadas** pelo guard global.
- **Sessão:** JWT (padrão 12h) com `ver` = `User.tokenVersion`; o guard confere a versão no banco, então trocar a senha derruba as outras sessões. Login limitado a 5 tentativas por minuto por IP + e-mail.
- **Auditoria:** toda escrita bem-sucedida de usuário logado gera uma linha em `AuditLog` (método + rota, parâmetros da URL, usuário). Login e ações de operação também são registrados. O corpo da requisição não é gravado.
- **LGPD:** o cadastro exige o consentimento do aluno/responsável (`Student.consentAt`). `GET /students/:id/export` entrega todos os dados do aluno em JSON. `POST /students/:id/anonymize` apaga os dados pessoais a pedido do titular: mensalidades pagas e vendas ficam sem identificação, as em aberto são excluídas e o aluno some das listas (`anonymizedAt`). Exportação e anonimização ficam na auditoria.
- **Cache (Redis):** leituras pesadas (lista de alunos, painel) usam `CacheService.getOrSet`. Cada academia tem um contador de versão; qualquer escrita bem-sucedida (interceptor global) incrementa o contador e invalida o cache daquela academia.
- **Jobs (BullMQ):**
  - `billing` › `generate-invoices` — diário às 02:00; garante as mensalidades do mês e, a partir do dia 25, cria as do mês seguinte (Configurações › "Gerar mensalidades automaticamente"). Idempotente (`@@unique([studentId, year, month])`).
  - `billing` › `mark-overdue` — diário às 03:00; marca como atrasadas as vencidas além da tolerância e enfileira notificações.
  - `notifications` — estoque baixo e mensalidade atrasada. Hoje só registra no log; é o ponto para plugar e-mail/WhatsApp.
  - Sob demanda: `POST /api/jobs/invoices/generate`, `POST /api/jobs/invoices/mark-overdue`, `GET /api/jobs/:id`.
  - `DISABLE_SCHEDULER=true` desliga os agendamentos (útil com várias réplicas).

### Importação de alunos

Regras puras em `src/domain/student-import.ts` (com testes); leitura de arquivo e modelo em `src/modules/students/import/`.
- O modelo `.xlsx` traz as colunas, listas suspensas (sexo, status, plano, vencimento, consentimento) e uma aba de instruções.
- Aceita `.xlsx` e `.csv` (UTF-8 ou Windows-1252, separador `;` ou `,`). Datas em dd/mm/aaaa, ISO ou serial do Excel; valores como `R$ 1.234,56`.
- `analyze` só valida e devolve os erros por linha/coluna. `POST /students/import` revalida e **só grava se não houver nenhum erro**.
- Duplicado = mesmo e-mail **ou** mesmo nome (sem acento/caixa) + nascimento, contra o banco e dentro da planilha.
- Só cadastro: não cria mensalidades, modalidades nem matrículas. Limite de 2.000 linhas e 5 MB.

### Regras de graduação

**Na V1 a graduação é manual:** o professor decide e a recepção registra (`POST /graduation/promote`). A API não calcula aptidão, porque a presença não é registrada. As regras abaixo continuam em `src/domain/graduation.ts` (com testes), para quando a presença voltar:
- Modalidades com graus (Jiu-jitsu: 4 graus por faixa, 4 meses e 40 aulas entre graus). Depois do 4º grau, a próxima faixa exige o tempo mínimo da faixa atual (contado desde a data da faixa) e as aulas desde a última graduação. Na faixa preta os graus seguem até o 6º.
- Demais modalidades: cada nível tem tempo e aulas mínimos desde a última graduação; o último nível é o topo.

### Modalidades: catálogo × academia

O catálogo padrão (`src/domain/catalog.ts`) é sincronizado no boot. Ao adicionar uma modalidade, a academia recebe uma **cópia**. Editar marca a cópia como personalizada (`customizedAt`) e "Restaurar padrão" volta ao catálogo. Mudanças nunca afetam outras academias.

## Principais endpoints (`/api`)

| | |
| --- | --- |
| `POST /auth/login` · `GET /auth/me` · `POST /auth/change-password` | autenticação |
| `GET /dashboard` | painel |
| `GET/POST /students` · `GET/PATCH /students/:id` · `GET /students/:id/export` · `POST /students/:id/anonymize` | alunos (filtros `q`, `disciplineId`, `status`, `finance`) |
| `GET /students/import/template` · `POST /students/import/analyze` · `POST /students/import` | importação de alunos (multipart `file`, .xlsx/.csv) |
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
- **Recuperação de senha por e-mail:** não implementada. Na V1 o suporte redefine com `npm run ops:reset-password`.
- **Notificações:** o processor só registra no log.
- Ainda não há testes e2e da API; os testes cobrem as regras de domínio.
- `APP_TODAY=YYYY-MM-DD` fixa a data de "hoje" (útil para demonstrações; ignorado em produção).
