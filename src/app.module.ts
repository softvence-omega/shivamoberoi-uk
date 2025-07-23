import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { SeoAnalyzerController } from './seo-analyzer/seo-analyzer.controller';
import { SeoAnalyzerService } from './seo-analyzer/seo-analyzer.service';
import { CrawlerService } from './crawler/crawler.service';
import { CrawlerModule } from './crawler/crawler.module';
import { SeoModule } from './seo-analyzer/seo-analyzer.module';
import { ContentAiModule } from './ai/content-ai.module';
import { WebsiteAnalyzerModule } from './website-analyzer/website-analyzer.module';
import { MigrationService } from './migration.service';
import { Migration001 } from './migrations/001-initial-setup';
import {User, UserSchema } from './schemas/user.schema';
import {Page,  PageSchema } from './schemas/page.schema';
import { Link, LinkSchema } from './schemas/link.schema';
import { Image,ImageSchema } from './schemas/image.schema';
import { Analysis, AnalysisSchema } from './schemas/analysis.schema';
import { Content, ContentSchema } from './schemas/content.schema';
import { MigrationSchema } from './schemas/migrations.schema';
import { Migration } from './migration.decorator';
import { CrawlerController } from './crawler/crawler.controller';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AppService } from './app.service';
 
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config) => {
        if (!config.MONGODB_URI) {
          throw new Error('MONGODB_URI is not defined');
        }
        return config;
      },
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 3600,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
        MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Page.name, schema: PageSchema },
      { name: Link.name, schema: LinkSchema },
      { name: Image.name, schema: ImageSchema },
      { name: Analysis.name, schema: AnalysisSchema },
      { name: Content.name, schema: ContentSchema },
      { name: Migration.name, schema: MigrationSchema },
    ]),

    HttpModule,
    AuthModule,
    CrawlerModule,
    SeoModule,
    ContentAiModule,
    DiscoveryModule,
    WebsiteAnalyzerModule,
 
  ],
  controllers: [AppController, CrawlerController, SeoAnalyzerController],
  providers: [AppService, CrawlerService, SeoAnalyzerService,
    MigrationService,
    {
      provide: 'MIGRATION_PROVIDERS',
      useValue: [Migration001],
    },
  ],
})
export class AppModule {
  constructor(private migrationService: MigrationService) {
    this.migrationService.runMigrations();
  }
}

