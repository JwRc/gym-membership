import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma.service';
import { CacheModule } from './common/cache/cache.module';
import { CacheInvalidationInterceptor } from './common/cache/cache-invalidation.interceptor';
import { AuthGuard } from './common/auth/auth.guard';
import { AuditModule } from './common/audit/audit.module';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { SharedModule } from './modules/shared/academy.queries';
import { AuthModule } from './modules/auth/auth.module';
import { StudentsModule } from './modules/students/students.module';
import { GraduationModule } from './modules/graduation/graduation.module';
import { ClassesModule } from './modules/classes/classes.module';
import { FinanceModule } from './modules/finance/finance.module';
import { StoreModule } from './modules/store/store.module';
import { DisciplinesModule } from './modules/disciplines/disciplines.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES_IN', '12h') },
      }),
    }),
    // limites por rota são definidos com @Throttle (hoje só no login)
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 1000 }]),
    PrismaModule,
    AuditModule,
    CacheModule,
    SharedModule,
    AuthModule,
    StudentsModule,
    GraduationModule,
    ClassesModule,
    FinanceModule,
    StoreModule,
    DisciplinesModule,
    TenantModule,
    DashboardModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: CacheInvalidationInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
