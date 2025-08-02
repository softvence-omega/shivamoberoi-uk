import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// ======== Load .env file =========
const envPath = path.resolve(
  process.cwd(),
  `.env${process.env.NODE_ENV ? `.${process.env.NODE_ENV}` : ''}`,
);
console.log(`📦 Loading environment from: ${envPath}`);

dotenv.config({
  path: envPath,
  override: true,
});

const logger = new Logger('Bootstrap');

async function bootstrap() {
  try {
    logger.log('🚀 Starting NestJS application...');
    const app = await NestFactory.create(AppModule, {
      bufferLogs: true,
      abortOnError: false,
      snapshot: true,
    });

    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT', 3000);
    const environment = configService.get<string>('NODE_ENV', 'development');
    const apiPrefix = configService.get<string>('API_PREFIX', 'api');
    const apiVersion = configService.get<string>('API_VERSION', '1');

    logger.log(`📌 Environment: ${environment}`);
    logger.log(`📌 PORT: ${port}`);
    logger.log(`📌 API Prefix: ${apiPrefix}`);
    logger.log(`📌 API Version: ${apiVersion}`);

    // ======== Helmet CSP =========
    app.use(
      helmet({
        contentSecurityPolicy:
          environment === 'production'
            ? {
                directives: {
                  defaultSrc: [`'self'`],
                  scriptSrc: [`'self'`, `'unsafe-inline'`, 'cdn.jsdelivr.net'],
                  styleSrc: [`'self'`, 'data:', 'validator.swagger.io'],
                },
              }
            : false,
      }),
    );

    // ======== Global Setup =========
    app.setGlobalPrefix(apiPrefix);
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: apiVersion,
    });

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // ======== CORS =========
    const corsOrigins = configService.get('CORS_ORIGINS', '*').split(',');
    logger.log(`🛡️ CORS Origins: ${corsOrigins.join(', ')}`);
    app.enableCors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'X-Requested-With',
        'X-Api-Version',
      ],
      credentials: true,
      maxAge: 86400,
    });

    // ======== Swagger =========
    if (environment !== 'production') {
      const swaggerConfig = new DocumentBuilder()
        .setTitle(configService.get('SWAGGER_TITLE', 'Website Analyzer API'))
        .setDescription(
          configService.get(
            'SWAGGER_DESCRIPTION',
            'Comprehensive API for analyzing website SEO, performance, and keywords',
          ),
        )
        .setVersion(apiVersion)
        .addBearerAuth({
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        })
        .addServer(
          configService.get('SWAGGER_LOCAL_SERVER', `http://localhost:${port}`),
          'Local Development',
        )
        .addServer(
          configService.get('SWAGGER_PROD_SERVER', 'https://api.example.com'),
          'Production',
        )
        .build();

      const document = SwaggerModule.createDocument(app, swaggerConfig);
      SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
        explorer: true,
        swaggerOptions: {
          filter: true,
          showRequestDuration: true,
          persistAuthorization: true,
        },
      });

      logger.log(`📚 Swagger UI: http://localhost:${port}/${apiPrefix}/docs`);
    }

    await app.listen(port);
    logger.log(`✅ Application running in ${environment}`);
    logger.log(`✅ Server listening on http://localhost:${port}`);
    logger.log(`✅ API available at /${apiPrefix}/v${apiVersion}`);

    console.log(`✅ Bootstrapped successfully on port ${port}`);
  } catch (err) {
    logger.error('❌ Application startup failed', err);
    console.error('❌ Fatal error:', err.stack || err.message || err);
    process.exit(1);
  }
}
bootstrap();
