// import { Module } from '@nestjs/common';
// import { MongooseModule } from '@nestjs/mongoose';
// import { CacheModule } from '@nestjs/cache-manager';

// import { CombinedAnalyzerService } from './combined-analyzer.service';
// import { Analysis, AnalysisSchema } from '../schemas/analysis.schema';
// import { Image, ImageSchema } from '../schemas/image.schema';
// import { Link, LinkSchema } from '../schemas/link.schema';
// import { Page, PageSchema } from '../schemas/page.schema';
// import { BrokenLink, BrokenLinkSchema } from '../schemas/broken-link.schema';
// import { CombinedAnalyzerController } from './combined-analyze.controller';

// @Module({
//   imports: [
//     CacheModule.register({ isGlobal: true, ttl: 3600 }),
//     MongooseModule.forFeature([
//       { name: BrokenLink.name, schema: BrokenLinkSchema },
//       { name: Page.name, schema: PageSchema },
//       { name: Link.name, schema: LinkSchema },
//       { name: Image.name, schema: ImageSchema },
//       { name: Analysis.name, schema: AnalysisSchema },
//     ]),
//   ],
//   controllers: [CombinedAnalyzerController],
//   providers: [CombinedAnalyzerService],
// })
// export class CombinedAnalyzerModule {}