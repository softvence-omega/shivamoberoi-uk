import { Module,forwardRef } from '@nestjs/common';
import { WebsiteAnalyzerController } from './website-analyzer.controller';
import { WebsiteAnalyzerService } from './website-analyzer.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../schemas/user.schema';
import { Page, PageSchema } from '../schemas/page.schema';
import { Migration, MigrationSchema } from '../schemas/migrations.schema'; 
import { AuthModule } from '../auth/auth.module';
import { MigrationService } from 'src/migration.service';
import { DiscoveryModule } from '@nestjs/core'; 
import { Migration001 } from 'src/migrations/001-initial-setup'; 

@Module({
  imports: [
    DiscoveryModule,
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Page.name, schema: PageSchema },
      { name: Migration.name, schema: MigrationSchema }, 
    ]),
  ],
  controllers: [WebsiteAnalyzerController],
  providers: [
    WebsiteAnalyzerService,
    MigrationService,
    {
      provide: 'MIGRATION_PROVIDERS',
      useValue: [Migration001], 
    },
  ],
  exports: [WebsiteAnalyzerService],
})
export class WebsiteAnalyzerModule {}
