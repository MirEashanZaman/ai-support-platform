import { Controller, Get, Header, Module } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { AuditLogModule } from './common/audit/audit-log.service';
import { validateEnv } from './common/config/env.validation';
import { Public } from './common/decorators/public.decorator';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { HandoffModule } from './handoff/handoff.module';
import { EmbeddingsModule } from './infra/embeddings/embeddings.module';
import { RabbitMqModule } from './infra/rabbitmq/rabbitmq.module';
import { RedisModule } from './infra/redis/redis.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { DemoTenantsBootstrapService } from './seed/demo-tenants.seed';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'ai-support-platform-backend',
      timestamp: new Date().toISOString(),
    };
  }
}

@ApiExcludeController()
@Controller()
export class WidgetStaticController {
  @Public()
  @Get('widget.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  getWidgetJs(): string {
    return readFileSync(resolve(process.cwd(), '../widget/src/widget.js'), 'utf8');
  }

  @Public()
  @Get('widget-demo')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getWidgetDemoHtml(): string {
    const apiUrl = (process.env.PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
    const dashboardUrl = (process.env.PUBLIC_DASHBOARD_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const html = readFileSync(resolve(process.cwd(), '../widget/demo.html'), 'utf8');
    return html
      .replace('src="./src/widget.js"', `src="${apiUrl}/widget.js"`)
      .replace(/http:\/\/localhost:4000/g, apiUrl)
      .replace(/http:\/\/localhost:3000/g, dashboardUrl);
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    AuditLogModule,
    RedisModule,
    RabbitMqModule,
    EmbeddingsModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    DocumentsModule,
    IngestionModule,
    ChatModule,
    HandoffModule,
    AnalyticsModule,
  ],
  controllers: [HealthController, WidgetStaticController],
  providers: [
    DemoTenantsBootstrapService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
})
export class AppModule {}
