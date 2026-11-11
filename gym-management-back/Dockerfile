# API para o Google Cloud Run.
# Build:  docker build -t gym-api .
# Run:    docker run -p 8080:8080 -e DATABASE_URL=... -e DIRECT_URL=... -e JWT_SECRET=... gym-api

FROM node:22.16.0-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22.16.0-slim
ENV NODE_ENV=production \
    PORT=8080
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
# aplica as migrations pendentes e sobe a API (uma instância só na V1)
CMD ["npm", "run", "start:migrate"]
