import { Module } from '@nestjs/common';
import { MongooseModule, Schema } from '@nestjs/mongoose';
import { Analysis, AnalysisSchema } from 'src/schemas/analysis.schema';
import { Content, ContentSchema } from 'src/schemas/content.schema';
import { SeoAnalyzerController } from './seo-analyzer.controller';
import { SeoAnalyzerService } from './seo-analyzer.service';
import { ContentAiService } from '../ai/content-ai.service';
import { HttpModule } from '@nestjs/axios';
import { Link, LinkSchema } from 'src/schemas/link.schema';
import { Image, ImageSchema } from 'src/schemas/image.schema';
import { PageSchema } from 'src/schemas/page.schema';
import { Page } from 'puppeteer';

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: Analysis.name, schema: AnalysisSchema },
      { name: Content.name, schema: ContentSchema },
      { name: Page.name, schema: PageSchema },
      { name: Link.name, schema: LinkSchema }, 
      { name: Image.name, schema: ImageSchema },
    ]),
  ],
  controllers: [SeoAnalyzerController],
  providers: [SeoAnalyzerService, ContentAiService],
  exports: [SeoAnalyzerService, ContentAiService],
})
export class SeoModule {}
