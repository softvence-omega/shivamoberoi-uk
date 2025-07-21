import { Module } from "@nestjs/common";
import { MongooseModule, Schema } from '@nestjs/mongoose';
import { Analysis, AnalysisSchema } from "src/schemas/analysis.schema";
import { Content, ContentSchema } from "src/schemas/content.schema";
import { SeoAnalyzerController } from "./seo-analyzer.controller";
import { SeoAnalyzerService } from "./seo-analyzer.service";
import { ContentAiService } from "src/ai/content-ai.service";




@Module({
    imports: [
        MongooseModule.forFeature([
            {name: Analysis.name, schema: AnalysisSchema},
            {name: Content.name, schema: ContentSchema}
        ]),
    ],
    controllers: [ SeoAnalyzerController],
    providers: [SeoAnalyzerService, ContentAiService],
    exports: [SeoAnalyzerService, ContentAiService],
})

export class SeoModule {}