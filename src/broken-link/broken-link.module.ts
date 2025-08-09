import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Mongoose } from 'mongoose';
import { BrokenLink, BrokenLinkSchema } from 'src/schemas/broken-link.schema';
import { Page, PageSchema } from 'src/schemas/page.schema';
import { WebsiteAnalyzerModule } from 'src/website-analyzer/website-analyzer.module';
import { BrokenLinksService } from './broken-link.service';
import { BrokenLinksController } from './broken-link.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Page.name, schema: PageSchema },
      { name: BrokenLink.name, schema: BrokenLinkSchema },
    ]),
    WebsiteAnalyzerModule,
  ],
  controllers: [BrokenLinksController],
  providers: [BrokenLinksService],
  exports: [
    MongooseModule.forFeature([
      { name: BrokenLink.name, schema: BrokenLinkSchema },
    ]),
    BrokenLinksService,
  ],
})
export class BrokenLinksModule {}