import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

dotenv.config({
  path: path.resolve(
    process.cwd(),
    `.env${process.env.NODE_ENV ? `.${process.env.NODE_ENV}` : ''}`,
  ),
  override: true,
});

const logger = new Logger('Bootstrap');

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    abortOnError: false,
    snapshot: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000)
  const environment = configService.get<string>('NODE_ENV', 'development');
  const apiPrefix = configService.get<string>('API_PREFIX', 'api');
  const apiVersion = configService.get<string>('API_VERSION', '1');

  app.use(helmet(
    {
      contentSecurityPolicy: environment === 'production' ? {
        directives: {
          defaultSrc: [`'self`],
          sriptSrc: [`'self`, `'unsafe-inline'`, 'cdn.jsdelivr.net'],
          styleSrc: [`'self'`, 'data', 'validator.swagger.io'],
        }
      } :  false,
    })
  );

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
      }
    })
  );

  app.enableCors({
    origin: configService.get('CORS_ORIGINS', '*').split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-Api-Version',
    ],
    maxAge:86400,

  });
  if (environment !== 'production') {
      const swaggerConfig = new DocumentBuilder()
        .setTitle(configService.get('SWAGGER_TITLE', 'Website Analyzer API'))
        .setDescription(configService.get('SWAGGER_DESCRIPTION', 'Comprehensive API for analyzing website SEO, performance, and keywords'))
        .setVersion(apiVersion)
        .addBearerAuth({
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        })
        .addServer(configService.get('SWAGGER_LOCAL_SERVER', `http://localhost:${port}`), 'Local Development')
        .addServer(configService.get('SWAGGER_PROD_SERVER', 'https://api.example.com'), 'Production')
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
    }

    await app.listen(port);
    logger.log(`Application running in ${environment}`);
    logger.log(`Server listening on port ${port}`);
    logger.log(`Api prefix: ${apiPrefix}/v${apiVersion}`);

    if(environment !== 'production') {
      logger.log(`Swagger UI: http://localhost:${port}/${apiPrefix}/docs`)
    }

 // const port = await app.listen(process.env.PORT ?? 3000);
  console.log(`Application runnug on ${port}`);

  } catch(err) {
    logger.error('Application startup failed', err.stack);
    process.exit(1);

  }
}
bootstrap();
