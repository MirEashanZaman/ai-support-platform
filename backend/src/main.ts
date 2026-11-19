import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );

  app.use(cookieParser());
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Support Platform API')
    .setDescription(
      'Multi-tenant AI customer support platform with PostgreSQL RLS, pgvector RAG, RabbitMQ ingestion, and real-time human handoff. [Back to Admin Dashboard](http://localhost:3000) | [Back to Customer Portal](http://localhost:4000/widget-demo)',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, openApiDocument, {
    jsonDocumentUrl: 'api-docs-json',
    customSiteTitle: 'AI Support Platform — API Documentation',
    customJsStr: `
      document.addEventListener('click', function (e) {
        var link = e.target && e.target.closest ? e.target.closest('.swagger-ui .info .description a') : null;
        if (link && link.href) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = link.href;
        }
      }, true);
    `,
    customCss: `
      .swagger-ui .info .description a {
        display: inline-block;
        margin-top: 10px;
        margin-right: 10px;
        padding: 7px 14px;
        background: #2563eb;
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 13px;
      }
      .swagger-ui .info .description a:hover {
        background: #1d4ed8;
      }
    `,
  });

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
}

void bootstrap();
