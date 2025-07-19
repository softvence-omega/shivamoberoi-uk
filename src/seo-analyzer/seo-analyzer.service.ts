// import { Injectable, Inject, Logger } from '@nestjs/common';
// import { CACHE_MANAGER, CacheKey, Cache } from '@nestjs/cache-manager';
// import { InjectModel } from '@nestjs/mongoose';
// import { Page, PageDocument } from '../schemas/page.schema';
// import { Model } from 'mongoose';
// import { Link, LinkDocument } from '../schemas/link.schema';
// import { Image, ImageDocument } from '../schemas/image.schema';
// import { Analysis, AnalysisDocument } from '../schemas/analysis.schema';
// @Injectable()
// export class SeoAnalyzerService {
//   private readonly logger = new Logger(SeoAnalyzerService.name);
//   private readonly MAX_HTTP_CHECKS = 5;
//   private readonly IMAGE_SIZE_LIMIT = 1_000_000;
//   private readonly IMAGE_DIMENSION_LIMIT = { width: 1920, height: 1080 };
//   private readonly CACHE_TTL = 3600;
//   private readonly HTTP_CHECK_TIMEOUT = 10000;

//   constructor(
//     @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
//     @InjectModel(Page.name) private readonly pageModel: Model<PageDocument>,
//     @InjectModel(Link.name) private readonly linkModel: Model<LinkDocument>,
//     @InjectModel(Image.name) private readonly imageModel: Model<ImageDocument>,
//     @InjectModel(Analysis.name)
//     private readonly analysisModel: Model<AnalysisDocument>,
//   ) {}


// async analyzeSeo(url: string) {
//     const cacheKey = `seo_${url}`;
    
//     try {
//       // Check cache with proper type guard
//       const cached = await this.cacheManager.get<{
//         url: string;
//         brokenLinks: string[];
//         oversizedImages: string[];
//         blurryImages: string[];
//         analyzedAt: Date;
//       }>(cacheKey);
//       if(cached) {
//         this.logger.debug(`Returning cached SEO analysis for ${url}`);
//         return cached;
//       }

//       if(!this.isValidUrl(url)) {
//         throw new Error(`Invalid URL :${url}`);

//       }
//       const session = await this.pageModel.db.startSession();
//       session.startTransaction();

//       try {
//         const [page, links, images] =- await Promise.all([
//             this.pageModel.findOne({url}).session(session).exec(),
//             this.linkModel.find({sourceUrl: url}).session(session).exec(),
//             this.imageModel.find({sourceUrl: url}).session(session).exec(),
//         ]);

//         if(!page) {
//             await session.abortTransaction();
//             return { status: 'not_found', message: `Page not found for URL: ${url}`};
//         }
//         const brokenLinks =await this.processLinks(links, session);
//       }catch(err) {}

 
      
//     }catch(err) {

//     }
//   }
//        private isValidUrl(url: string): boolean {
//         try {
//             new URL(url);
//             return true;

//         } catch(err) {
//             return false;

//         }
//       }

//       private async processLinks(links: LinkDocument[], session: any): Promise<string[]>{
//         const brokenLinks: LinkDocument[] = [];
//         const linkCheckPromises : Promise<void>[] =[];
//         const activeChecks= new Set< string>();

//         for(const link of links) {

//         }
//         return 
//       }
// }
