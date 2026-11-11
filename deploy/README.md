# Deploy da V1 (Google Cloud Run + Cloudflare Pages + Postgres gerenciado)

```
navegador ──► Cloudflare Pages (front estático)
                 └─ /api/* (Pages Function) ──► Cloud Run "gym-api" (NestJS, 1 instância) ──► Postgres (Neon/Supabase)
Cloud Scheduler ─┬─ 03:00 ──► POST /api/internal/billing/daily (X-Cron-Secret)
                 └─ 04:00 ──► Cloud Run Job "gym-backup" (pg_dump → Cloud Storage)
```

- **Sem Redis/filas na V1:** o cache é em memória e a rotina diária é um endpoint chamado pelo Cloud Scheduler. Por isso a API roda com `--max-instances=1`.
- **Mesma origem:** uma Pages Function (`gym-management-front/functions/api/[[path]].ts`) encaminha `/api/*` para o Cloud Run, então não precisa de CORS em produção e a URL do Cloud Run não vai para o bundle.
- **Custo:** com uma academia, tudo deve caber nos níveis gratuitos (Cloud Run, Cloud Scheduler até 3 jobs, Secret Manager, Cloudflare Pages com até 100 mil chamadas/dia à Function, Neon ou Supabase free). O projeto GCP precisa de faturamento ativo para usar Cloud Run. **Confira os preços da região** `southamerica-east1`; se preferir, use `us-central1`.

## 0. Pré-requisitos

- `gcloud` autenticado (ou o Cloud Shell, no console) e um projeto GCP com faturamento.
- Conta na Cloudflare com acesso ao repositório do GitHub.
- Conta no [Neon](https://neon.tech): crie um projeto na região **AWS São Paulo (sa-east-1)** e copie as duas strings de conexão:
  - **pooled** (host com `-pooler`): vira `DATABASE_URL`, com `?sslmode=require&pgbouncer=true`;
  - **direct**: vira `DIRECT_URL`, com `?sslmode=require` (migrations e backup).

```bash
export PROJECT=seu-projeto-gcp
export REGION=southamerica-east1
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com
```

## 1. Segredos

```bash
printf '%s' 'postgresql://...-pooler.../neondb?sslmode=require&pgbouncer=true' | gcloud secrets create database-url --data-file=-
printf '%s' 'postgresql://.../neondb?sslmode=require'                          | gcloud secrets create direct-url --data-file=-
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create jwt-secret --data-file=-
export CRON_SECRET=$(openssl rand -hex 32)
printf '%s' "$CRON_SECRET" | gcloud secrets create cron-secret --data-file=-

# a conta de serviço padrão do Cloud Run precisa ler os segredos
export SA=$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com
for s in database-url direct-url jwt-secret cron-secret; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
done
```

## 2. API (Cloud Run)

```bash
gcloud artifacts repositories create gym --repository-format=docker --location=$REGION
export IMG=$REGION-docker.pkg.dev/$PROJECT/gym

gcloud builds submit gym-management-back --tag $IMG/api

gcloud run deploy gym-api --image $IMG/api --region $REGION \
  --allow-unauthenticated --max-instances=1 --min-instances=0 --memory=512Mi --cpu=1 \
  --set-secrets=DATABASE_URL=database-url:latest,DIRECT_URL=direct-url:latest,JWT_SECRET=jwt-secret:latest,CRON_SECRET=cron-secret:latest \
  --set-env-vars=APP_TIMEZONE=America/Sao_Paulo,JWT_EXPIRES_IN=12h,CORS_ORIGIN=https://SEU-PROJETO.pages.dev

export API_URL=$(gcloud run services describe gym-api --region $REGION --format='value(status.url)')
curl $API_URL/api/health      # {"status":"ok","db":"up"}
```

O container roda `prisma migrate deploy` antes de subir, então as migrations são aplicadas a cada deploy.

## 3. Criar a academia e o usuário

Não há cadastro aberto na V1. Rode localmente, apontando para o banco de produção (conexão **direta**):

```bash
cd gym-management-back
DATABASE_URL='<direct-url>' DIRECT_URL='<direct-url>' \
  npm run ops:create-academy -- --academy "Nome da Academia" --name "Nome do Usuário" --email usuario@academia.com --disciplines bjj,mt
```

A senha é gerada e mostrada uma única vez (ou defina `OPS_PASSWORD`). Peça para a pessoa trocar no primeiro acesso (ícone de cadeado no menu). Para redefinir depois: `npm run ops:reset-password -- --email ...`.

## 4. Front (Cloudflare Pages)

Tudo pelo painel da Cloudflare: **Workers & Pages › Criar › Pages › Conectar ao Git**, escolha o repositório e configure:

| Campo | Valor |
|---|---|
| Branch de produção | `main` |
| Predefinição de framework | Nenhuma (ou Vite) |
| Comando de build | `npm run build` |
| Diretório de saída do build | `dist` |
| Diretório raiz (avançado) | `gym-management-front` |
| Variável de ambiente | `API_ORIGIN` = URL do Cloud Run (`$API_URL`, sem barra no final) |

- A pasta `functions/` dentro do diretório raiz vira a Function que encaminha `/api/*`. A versão do Node vem do `.nvmrc` (22).
- Cada push na branch de produção publica de novo; outras branches e PRs ganham uma URL de prévia.
- Confira: `https://SEU-PROJETO.pages.dev` abre o login e `https://SEU-PROJETO.pages.dev/api/health` responde `{"status":"ok","db":"up"}`.
- Domínio próprio: projeto no Pages › **Domínios personalizados**. Depois atualize `CORS_ORIGIN` no Cloud Run.
- Mudou a URL do Cloud Run? Atualize `API_ORIGIN` e faça **Tentar implantar novamente** na última implantação.

## 5. Rotina diária de cobrança (Cloud Scheduler)

Gera as mensalidades do mês (só nas academias com "Gerar mensalidades automaticamente" ligado em Configurações) e marca os atrasos.

```bash
gcloud scheduler jobs create http gym-billing-daily --location=$REGION \
  --schedule="0 3 * * *" --time-zone="America/Sao_Paulo" \
  --uri="$API_URL/api/internal/billing/daily" --http-method=POST \
  --headers="X-Cron-Secret=$CRON_SECRET"

gcloud scheduler jobs run gym-billing-daily --location=$REGION   # teste manual
```

## 6. Backup diário (Cloud Run Job → Cloud Storage)

```bash
export BUCKET=$PROJECT-gym-backups
gcloud storage buckets create gs://$BUCKET --location=$REGION --uniform-bucket-level-access
cat > /tmp/lifecycle.json <<'JSON'
{ "rule": [ { "action": { "type": "Delete" }, "condition": { "age": 30 } } ] }
JSON
gcloud storage buckets update gs://$BUCKET --lifecycle-file=/tmp/lifecycle.json   # guarda 30 dias
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectCreator

gcloud builds submit deploy/backup --tag $IMG/backup
gcloud run jobs create gym-backup --image $IMG/backup --region $REGION \
  --set-secrets=DIRECT_URL=direct-url:latest --set-env-vars=BACKUP_BUCKET=$BUCKET \
  --max-retries=1 --task-timeout=10m

gcloud run jobs execute gym-backup --region $REGION --wait     # teste manual
gcloud storage ls gs://$BUCKET                                  # o arquivo .dump deve aparecer

# agenda às 04:00 (o Scheduler chama a API do Cloud Run com a conta de serviço)
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/run.invoker
gcloud scheduler jobs create http gym-backup-daily --location=$REGION \
  --schedule="0 4 * * *" --time-zone="America/Sao_Paulo" \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/gym-backup:run" \
  --http-method=POST --oauth-service-account-email=$SA
```

Os objetos do Cloud Storage são criptografados em repouso por padrão.

**Restaurar** (num banco vazio):

```bash
gcloud storage cp gs://$BUCKET/gymdb-AAAAMMDD-HHMMSS.dump .
pg_restore --no-owner --no-privileges --clean --if-exists --dbname='<direct-url>' gymdb-AAAAMMDD-HHMMSS.dump
```

## 7. Logs e erros

- Logs: `gcloud run services logs read gym-api --region $REGION` ou Console › Cloud Run › gym-api › Logs.
- Erros com stack trace aparecem agrupados no **Error Reporting** (Console › Error Reporting), sem configuração extra.
- Auditoria de ações (quem fez o quê): tabela `AuditLog` no banco.

## 8. Atualizar

```bash
gcloud builds submit gym-management-back --tag $IMG/api && gcloud run deploy gym-api --image $IMG/api --region $REGION
# front: push na branch de produção (o Cloudflare Pages faz o build e publica)
```
