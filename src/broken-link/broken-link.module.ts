import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Mongoose } from 'mongoose';
import { BrokenLink, BrokenLinkSchema } from 'src/schemas/brokenlink.schema';
import { Page, PageSchema } from 'src/schemas/page.schema';
import { WebsiteAnalyzerModule } from 'src/website-analyzer/website-analyzer.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Page.name, schema: PageSchema },
      { name: BrokenLink.name, schema: BrokenLinkSchema },
    ]),
    WebsiteAnalyzerModule,
  ],
  controllers: [],
  providers: []
})
export class BrokenLinksModule {}
