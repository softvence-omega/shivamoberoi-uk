import { Module } from '@nestjs/common';
import { WebsiteAnalyzerController } from './website-analyzer.controller';
import { WebsiteAnalyzerService } from './website-analyzer.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../schemas/user.schema';
import { Page, PageSchema } from '../schemas/page.schema';
import { Migration, MigrationSchema } from '../schemas/migrations.schema'; // ✅ Import migration schema
import { AuthModule } from 'src/auth/auth.module';
import { MigrationService } from 'src/migration.service';
import { DiscoveryModule } from '@nestjs/core'; 
import { Migration001 } from 'src/migrations/001-initial-setup'; // ✅ Import your migration class

@Module({
  imports: [
    DiscoveryModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Page.name, schema: PageSchema },
      { name: Migration.name, schema: MigrationSchema }, // ✅ Register Migration schema
    ]),
  ],
  controllers: [WebsiteAnalyzerController],
  providers: [
    WebsiteAnalyzerService,
    MigrationService,
    {
      provide: 'MIGRATION_PROVIDERS',
      useValue: [Migration001], // ✅ Provide your migrations
    },
  ],
  exports: [WebsiteAnalyzerService],
})
export class WebsiteAnalyzerModule {}
