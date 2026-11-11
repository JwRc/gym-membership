import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Configuração HTTP comum à API e aos testes e2e. */
export function configureApp(app: NestExpressApplication) {
  // atrás do proxy do Cloud Run / Cloudflare: req.ip vem do X-Forwarded-For (só para log; o limite de login é por e-mail)
  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','), credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // devolve a primeira mensagem de validação como texto simples (o front mostra direto)
      exceptionFactory: (errors) => {
        const first = errors[0];
        const msg = first?.constraints ? Object.values(first.constraints)[0] : 'Dados inválidos.';
        return new BadRequestException(msg);
      },
    }),
  );
  return app;
}
