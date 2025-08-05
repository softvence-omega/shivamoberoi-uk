import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import * as puppeteer from 'puppeteer';
import { InjectModel } from '@nestjs/mongoose';
import { Page, PageDocument } from '../schemas/page.schema';
import { Model } from 'mongoose';
import { chunk } from 'lodash';

interface SeoAnalysis {
  seoScore: number;
}

interface KeywordMetrics {
  keyword: string;
  intent: string;
  value: number;
  trend: string;
  kdPercentage: number;
  result: number;
  lastUpdate: string;
}

@Injectable()
export class WebsiteAnalyzerService {
  private readonly logger = new Logger(WebsiteAnalyzerService.name);
  private browser: puppeteer.Browser | null = null; // Shared browser instance
  private readonly chunkSize = 5; // Number of items to process per chunk

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectModel(Page.name) private pageModel: Model<PageDocument>,
  ) {
    // Initialize browser asynchronously to avoid blocking constructor
    this.initializeBrowser().catch((err) =>
      this.logger.error(`Browser initialization failed: ${err.message}`),
    );
  }

  private async initializeBrowser() {
    if (!this.browser) {
      try {
        this.browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'], // Safe for local and Render
          timeout: 30000,
        });
        this.logger.log('Puppeteer browser initialized');
      } catch (error) {
        this.logger.error(`Failed to initialize browser: ${error.message}`);
        throw error;
      }
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.log('Puppeteer browser closed');
    }
  }

  async crawlWebsitePages(
    baseUrl: string,
    maxDepth: number = 2,
  ): Promise<string[]> {
    const visitedPages = new Set<string>();
    const allLinks = new Set<string>([baseUrl]);

    async function crawl(url: string, depth: number) {
      if (depth > maxDepth || visitedPages.has(url)) return;
      visitedPages.add(url);
      this.logger.log(`Crawling page: ${url}`);

      try {
        const linkedUrls = await this.crawlAndAnalyze(url);
        // Ensure linkedUrls is iterable; default to empty array if not
        const urls = Array.isArray(linkedUrls) ? linkedUrls : [];
        for (const link of urls) {
          if (link.startsWith(baseUrl) && !visitedPages.has(link)) {
            allLinks.add(link);
            await crawl.call(this, link, depth + 1);
          }
        }
      } catch (err) {
        this.logger.error(`Failed to crawl ${url}: ${err.message}`);
      }
    }
    await crawl.call(this, baseUrl, 0);
    return Array.from(allLinks);
  }

  async crawlAndAnalyze(url: string): Promise<string[]> {
    if (!this.browser) {
      await this.initializeBrowser();
    }
    const page = await this.browser!.newPage();
    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType()))
          req.abort();
        else req.continue();
      });

      const startTime = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const loadTime = Date.now() - startTime;
      const content = await page.content();
      const metaTags = await page.$$eval('meta', (metas) =>
        metas
          .map((meta) => ({
            name: meta.getAttribute('name'),
            content: meta.getAttribute('content'),
          }))
          .filter((meta) => meta.name && meta.content),
      );
      const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', (hs) =>
        hs.map((h) => h.textContent || '').filter((text) => text.trim()),
      );
      const linkedUrls = await page.$$eval('a[href]', (anchors) =>
        anchors
          .map((a) => a.getAttribute('href'))
          .filter((href): href is string => !!href)
          .map((href) => {
            try {
              return new URL(href, url).href;
            } catch {
              return null;
            }
          })
          .filter((href): href is string => !!href),
      );
      const imageUrls = await page.$$eval('img[src]', (imgs) =>
        imgs
          .map((img) => img.getAttribute('src'))
          .filter((src): src is string => !!src)
          .map((src) => {
            try {
              return new URL(src, url).href;
            } catch {
              return null;
            }
          })
          .filter((src): src is string => !!src),
      );

      // Store data in the database
      await this.pageModel.findOneAndUpdate(
        { url },
        {
          content,
          linkedUrls,
          imageUrls,
          metaTags,
          headings,
          loadTime,
          crawledAt: new Date(),
        },
        { upsert: true, new: true },
      );

      return linkedUrls;
    } catch (error) {
      this.logger.error(
        `Crawl failed for ${url}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Crawl failed: ${error.message}`);
    } finally {
      await page.close();
    }
  }

  async analyzeWebsite(
    url: string,
    skip: number = 0,
    limit: number = 10,
  ): Promise<any> {
    const cacheKey = `website_${url}_${skip}_${limit}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    let pageDoc = await this.pageModel.findOne({ url }).exec();
    if (!pageDoc) {
      await this.crawlAndAnalyze(url);
      pageDoc = await this.pageModel.findOne({ url }).exec();
      if (!pageDoc) throw new Error(`Failed to crawl ${url}`);
    }

    // Paginate the headings for analysis
    const totalHeadings = pageDoc.headings.length;
    const paginatedHeadings = pageDoc.headings.slice(skip, skip + limit);

    // Process headings in chunks
    const chunks = chunk(paginatedHeadings, this.chunkSize);
    const analysisResults: SeoAnalysis[] = [];

    for (const chunkData of chunks) {
      const chunkAnalysis: SeoAnalysis = this.calculateSeoScoreForChunk(
        chunkData,
        pageDoc.metaTags.length > 0,
        pageDoc.linkedUrls.length,
        pageDoc,
      );
      analysisResults.push(chunkAnalysis);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate async delay
    }

    const seoScore = Math.round(
      analysisResults.reduce((sum, a) => sum + a.seoScore, 0) / chunks.length,
    );
    const siteHealth = this.calculateSiteHealth(
      pageDoc.loadTime,
      pageDoc.imageUrls.length,
    );
    const internalLinksCount = pageDoc.linkedUrls.length;
    const metaDescription =
      pageDoc.metaTags.find((tag) => tag.name === 'description')?.content ||
      'No meta description';

    // Estimate backlinks and paid keywords
    const estimatedBacklinks = this.estimateBacklinks(
      internalLinksCount,
      this.estimateAuthority(internalLinksCount),
    );
    const organicKeywordsCount = this.countKeywords(paginatedHeadings);
    const estimatedPaidKeywords = this.estimatePaidKeywords(
      organicKeywordsCount,
      this.estimateAuthority(internalLinksCount),
    );

    const result = {
      status: 'success',
      message: 'Analysis completed successfully',
      data: {
        url,
        seoScore,
        authorityScore: this.estimateAuthority(internalLinksCount),
        organicTraffic: this.estimateTraffic(internalLinksCount),
        organicKeywords: organicKeywordsCount,
        paidKeywords: estimatedPaidKeywords,
        backlinks: estimatedBacklinks,
        siteHealth,
        analysisDate: new Date().toISOString().split('T')[0],
        metaDescription,
        totalHeadings,
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(totalHeadings / limit),
      },
    };

    await this.cacheManager.set(cacheKey, result, 3600);
    return result;
  }

   


  async searchKeywords(
    url: string,
    skip: number = 0,
    limit: number = 20,
  ): Promise<any> {
    const cacheKey = `keywords_${url}_${skip}_${limit}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    let pageDoc = await this.pageModel.findOne({ url }).exec();
    if (!pageDoc) {
      await this.crawlAndAnalyze(url);
      pageDoc = await this.pageModel.findOne({ url }).exec();
      if (!pageDoc) throw new Error(`Failed to crawl ${url}`);
    }

    // Extract and paginate keywords
    const allText = [
      ...pageDoc.headings,
      ...pageDoc.metaTags.map((tag) => tag.content).filter((c) => c),
    ]
      .join(' ')
      .toLowerCase();
    const allKeywords = Array.from(
      new Map(
        allText
          .match(/\b\w{4,}\b/g)
          ?.map((word) => [
            word,
            (allText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length,
          ]),
      ).entries(),
    )
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0]);

    const totalKeywords = allKeywords.length;
    const paginatedKeywords = allKeywords.slice(skip, skip + limit);

    const keywordResults: KeywordMetrics[] = paginatedKeywords.map(
      (keyword) => {
        const frequency = (
          allText.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []
        ).length;
        const intent = this.determineIntent(keyword, pageDoc);
        const value = this.calculateKeywordValue(frequency, totalKeywords);
        const trend = this.estimateTrend(frequency, pageDoc.crawledAt);
        const kdPercentage = this.calculateKDPercentage(
          totalKeywords,
          pageDoc.linkedUrls.length,
        );
        const result = this.estimateSearchResults(
          totalKeywords,
          pageDoc.content.length,
        );
        const lastUpdate = pageDoc.crawledAt
          ? pageDoc.crawledAt.toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        return {
          keyword,
          intent,
          value,
          trend,
          kdPercentage,
          result,
          lastUpdate,
        };
      },
    );

    const result = {
      status: 'success',
      message: 'Keywords retrieved successfully',
      data: {
        url,
        totalKeywords,
        keywords: keywordResults,
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(totalKeywords / limit),
      },
    };

    await this.cacheManager.set(cacheKey, result, 3600);
    return result;
  }

  private calculateSeoScoreForChunk(
    chunk: string[],
    hasMetaTags: boolean,
    internalLinksCount: number,
    pageDoc: PageDocument,
  ): SeoAnalysis {
    const headingScore = chunk.length > 0 ? 50 : 0; // Base score for headings
    const metaScore = hasMetaTags ? 30 : 0; // Score for meta tags
    const keywordDensityScore =
      this.calculateKeywordDensity(pageDoc) > 0.02 ? 20 : 0; // 2% keyword density threshold
    const backlinkImpact = Math.min(
      20,
      Math.round((internalLinksCount / 10) * 2),
    ); // Estimated backlink influence
    return {
      seoScore: Math.round(
        headingScore + metaScore + keywordDensityScore + backlinkImpact,
      ),
    };
  }

  private calculateKeywordDensity(pageDoc: PageDocument): number {
    if (!pageDoc.headings.length) return 0;
    const text = [
      ...pageDoc.headings,
      ...pageDoc.metaTags.map((tag) => tag.content).filter((c) => c),
    ]
      .join(' ')
      .toLowerCase();
    const keywords = this.extractKeywords(pageDoc);
    const totalWords = text.split(/\s+/).length;
    const keywordCount = keywords.reduce(
      (sum, kw) =>
        sum + (text.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length,
      0,
    );
    return totalWords > 0 ? keywordCount / totalWords : 0;
  }

  private calculateSiteHealth(loadTime: number, imageCount: number): number {
    const loadScore =
      loadTime < 2000 ? 100 : Math.max(0, 100 - (loadTime - 2000) / 20);
    const imageScore =
      imageCount < 10 ? 100 : Math.max(0, 100 - (imageCount - 10) * 5);
    return Math.round((loadScore + imageScore) / 2);
  }

  private estimateAuthority(internalLinksCount: number): number {
    return Math.min(100, internalLinksCount * 5);
  }

  private estimateTraffic(internalLinksCount: number): number {
    return Math.min(5000, internalLinksCount * 50);
  }

  private countKeywords(headings: string[]): number {
    return new Set(
      headings
        .join(' ')
        .toLowerCase()
        .match(/\b\w{4,}\b/g) || [],
    ).size;
  }

  private extractKeywords(page: PageDocument): string[] {
    const allText = [
      ...page.headings,
      ...page.metaTags.map((tag) => tag.content).filter((c) => c),
    ]
      .join(' ')
      .toLowerCase();
    return Array.from(
      new Map(
        allText
          .match(/\b\w{4,}\b/g)
          ?.map((word) => [
            word,
            (allText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length,
          ]),
      ).entries(),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map((entry) => entry[0]);
  }

  async onModuleDestroy() {
    await this.closeBrowser();
  }

  private estimateBacklinks(
    internalLinksCount: number,
    authorityScore: number,
  ): number {
    const baseBacklinks = Math.min(1000, internalLinksCount * 10);
    const authorityFactor = Math.min(1, authorityScore / 100);
    return Math.round(baseBacklinks * authorityFactor);
  }

  private estimatePaidKeywords(
    organicKeywordsCount: number,
    authorityScore: number,
  ): number {
    const basePaidKeywords = Math.round(organicKeywordsCount * 0.05);
    const authorityFactor = Math.min(1, authorityScore / 100);
    return Math.round(basePaidKeywords * authorityFactor);
  }

  private determineIntent(keyword: string, pageDoc: PageDocument): string {
    const lowerKeyword = keyword.toLowerCase();
    if (['check', 'status'].includes(lowerKeyword)) return 'informational';
    if (['online', 'buy'].includes(lowerKeyword)) return 'transactional';
    if (['smart', 'card'].includes(lowerKeyword)) return 'commercial';
    return 'informational';
  }

  private calculateKeywordValue(
    frequency: number,
    totalKeywords: number,
  ): number {
    return Math.round((frequency / totalKeywords) * 100);
  }

  private estimateTrend(frequency: number, crawledAt: Date): string {
    const monthsSinceCrawl =
      (new Date().getTime() - crawledAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return frequency > 1 && monthsSinceCrawl < 6 ? 'upward' : 'stable';
  }

  private calculateKDPercentage(
    totalKeywords: number,
    internalLinksCount: number,
  ): number {
    const baseDifficulty = Math.min(100, (totalKeywords / 10) * 5);
    const linkImpact = Math.min(50, internalLinksCount * 2);
    return Math.round((baseDifficulty + linkImpact) / 1.5);
  }

  private estimateSearchResults(
    totalKeywords: number,
    contentLength: number,
  ): number {
    const baseResults = totalKeywords * 1000;
    const contentFactor = Math.log(contentLength / 1000 + 1) * 1000;
    return Math.round(baseResults + contentFactor);
  }
}


//=================== don't touch the comment code until code writer permit you

// import { CACHE_MANAGER } from '@nestjs/cache-manager';
// import { Injectable, Inject, Logger } from '@nestjs/common';
// import { Cache } from 'cache-manager';
// import * as puppeteer from 'puppeteer';
// import { InjectModel } from '@nestjs/mongoose';
// import { Page, PageDocument } from '../schemas/page.schema';
// import { Model } from 'mongoose';
// import { chunk } from 'lodash';

// interface SeoAnalysis {
//   seoScore: number;
// }

// interface KeywordMetrics {
//   keyword: string;
//   intent: string;
//   value: number;
//   trend: string;
//   kdPercentage: number;
//   result: number;
//   lastUpdate: string;
// }

// @Injectable()
// export class WebsiteAnalyzerService {
//   private readonly logger = new Logger(WebsiteAnalyzerService.name);
//   private browser: puppeteer.Browser | null = null; // Shared browser instance
//   private readonly chunkSize = 5; // Number of items to process per chunk

//   constructor(
//     @Inject(CACHE_MANAGER) private cacheManager: Cache,
//     @InjectModel(Page.name) private pageModel: Model<PageDocument>,
//   ) {
//     // Initialize browser asynchronously to avoid blocking constructor
//     this.initializeBrowser().catch((err) =>
//       this.logger.error(`Browser initialization failed: ${err.message}`),
//     );
//   }

//   private async initializeBrowser() {
//     if (!this.browser) {
//       try {
//         this.browser = await puppeteer.launch({
//           headless: true,
//           args: ['--no-sandbox', '--disable-setuid-sandbox'], // Safe for local and Render
//           timeout: 30000,
//         });
//         this.logger.log('Puppeteer browser initialized');
//       } catch (error) {
//         this.logger.error(`Failed to initialize browser: ${error.message}`);
//         throw error;
//       }
//     }
//   }

//   async closeBrowser() {
//     if (this.browser) {
//       await this.browser.close();
//       this.browser = null;
//       this.logger.log('Puppeteer browser closed');
//     }
//   }

//   //  async clearCache(url?: string) {
//   //        try {
//   //          if (url) {
//   //            const keys = await this.cacheManager.store.keys();
//   //            const matchingKeys = keys.filter(
//   //              (key: string) => key.startsWith(`keywords_${url}_`) || key.startsWith(`website_${url}_`),
//   //            );
//   //            await Promise.all(matchingKeys.map((key: string) => this.cacheManager.del(key)));
//   //            this.logger.log(`Cleared cache for ${url}`);
//   //          } else {
//   //            await this.cacheManager.store.reset();
//   //            this.logger.log('Cleared all cache');
//   //          }
//   //        } catch (error) {
//   //          this.logger.error(`Cache clearing failed: ${error.message}`);
//   //          throw new Error(`Cache clearing failed: ${error.message}`);
//   //        }
//   //      }

//   //this is function use at broken link crawled

//   async crawlWebsitePages(
//     baseUrl: string,
//     maxDepth: number = 2,
//   ): Promise<string[]> {
//     const visitedPages = new Set<string>();
//     const allLinks = new Set<string>([baseUrl]);

//     async function crawl(url: string, depth: number) {
//       if (depth > maxDepth || visitedPages.has(url)) return;
//       visitedPages.add(url);
//       this.logger.log(`Crawling page: ${url}`);

//       try {
//         const linkedUrls = await this.crawlAndAnalyze(url);
//         for (const link of linkedUrls) {
//           if (link.startsWith(baseUrl) && !visitedPages.has(link)) {
//             allLinks.add(link);
//             await crawl.call(this, link, depth + 1);
//           }
//         }
//       } catch (err) {
//         this.logger.error(`Failed to crawl ${url}: ${err.message}`);
//       }
//     }
//     await crawl.call(this, baseUrl,0);
//     return Array.from(allLinks)
//   }
 

//   async analyzeWebsite(
//     url: string,
//     skip: number = 0,
//     limit: number = 10,
//   ): Promise<any> {
//     const cacheKey = `website_${url}_${skip}_${limit}`;
//     const cached = await this.cacheManager.get(cacheKey);
//     if (cached) return cached;

//     let pageDoc = await this.pageModel.findOne({ url }).exec();
//     if (!pageDoc) {
//       await this.crawlAndAnalyze(url);
//       pageDoc = await this.pageModel.findOne({ url }).exec();
//       if (!pageDoc) throw new Error(`Failed to crawl ${url}`);
//     }

//     // Paginate the headings for analysis
//     const totalHeadings = pageDoc.headings.length;
//     const paginatedHeadings = pageDoc.headings.slice(skip, skip + limit);

//     // Process headings in chunks
//     const chunks = chunk(paginatedHeadings, this.chunkSize);
//     const analysisResults: SeoAnalysis[] = [];

//     for (const chunkData of chunks) {
//       const chunkAnalysis: SeoAnalysis = this.calculateSeoScoreForChunk(
//         chunkData,
//         pageDoc.metaTags.length > 0,
//         pageDoc.linkedUrls.length,
//         pageDoc,
//       );
//       analysisResults.push(chunkAnalysis);
//       await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate async delay
//     }

//     const seoScore = Math.round(
//       analysisResults.reduce((sum, a) => sum + a.seoScore, 0) / chunks.length,
//     );
//     const siteHealth = this.calculateSiteHealth(
//       pageDoc.loadTime,
//       pageDoc.imageUrls.length,
//     );
//     const internalLinksCount = pageDoc.linkedUrls.length;
//     const metaDescription =
//       pageDoc.metaTags.find((tag) => tag.name === 'description')?.content ||
//       'No meta description';

//     // Estimate backlinks and paid keywords
//     const estimatedBacklinks = this.estimateBacklinks(
//       internalLinksCount,
//       this.estimateAuthority(internalLinksCount),
//     );
//     const organicKeywordsCount = this.countKeywords(paginatedHeadings);
//     const estimatedPaidKeywords = this.estimatePaidKeywords(
//       organicKeywordsCount,
//       this.estimateAuthority(internalLinksCount),
//     );

//     const result = {
//       status: 'success',
//       message: 'Analysis completed successfully',
//       data: {
//         url,
//         seoScore,
//         authorityScore: this.estimateAuthority(internalLinksCount),
//         organicTraffic: this.estimateTraffic(internalLinksCount),
//         organicKeywords: organicKeywordsCount,
//         paidKeywords: estimatedPaidKeywords,
//         backlinks: estimatedBacklinks,
//         siteHealth,
//         analysisDate: new Date().toISOString().split('T')[0],
//         metaDescription,
//         totalHeadings,
//         page: Math.floor(skip / limit) + 1,
//         limit,
//         totalPages: Math.ceil(totalHeadings / limit),
//       },
//     };

//     await this.cacheManager.set(cacheKey, result, 3600);
//     return result;
//   }

//   async searchKeywords(
//     url: string,
//     skip: number = 0,
//     limit: number = 20,
//   ): Promise<any> {
//     const cacheKey = `keywords_${url}_${skip}_${limit}`;
//     const cached = await this.cacheManager.get(cacheKey);
//     if (cached) return cached;

//     let pageDoc = await this.pageModel.findOne({ url }).exec();
//     if (!pageDoc) {
//       await this.crawlAndAnalyze(url);
//       pageDoc = await this.pageModel.findOne({ url }).exec();
//       if (!pageDoc) throw new Error(`Failed to crawl ${url}`);
//     }

//     // Extract and paginate keywords
//     const allText = [
//       ...pageDoc.headings,
//       ...pageDoc.metaTags.map((tag) => tag.content).filter((c) => c),
//     ]
//       .join(' ')
//       .toLowerCase();
//     const allKeywords = Array.from(
//       new Map(
//         allText
//           .match(/\b\w{4,}\b/g)
//           ?.map((word) => [
//             word,
//             (allText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length,
//           ]),
//       ).entries(),
//     )
//       .sort((a, b) => b[1] - a[1])
//       .map((entry) => entry[0]);

//     const totalKeywords = allKeywords.length;
//     const paginatedKeywords = allKeywords.slice(skip, skip + limit);

//     const keywordResults: KeywordMetrics[] = paginatedKeywords.map(
//       (keyword) => {
//         const frequency = (
//           allText.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []
//         ).length;
//         const intent = this.determineIntent(keyword, pageDoc);
//         const value = this.calculateKeywordValue(frequency, totalKeywords);
//         const trend = this.estimateTrend(frequency, pageDoc.crawledAt);
//         const kdPercentage = this.calculateKDPercentage(
//           totalKeywords,
//           pageDoc.linkedUrls.length,
//         );
//         const result = this.estimateSearchResults(
//           totalKeywords,
//           pageDoc.content.length,
//         );
//         const lastUpdate = pageDoc.crawledAt
//           ? pageDoc.crawledAt.toISOString().split('T')[0]
//           : new Date().toISOString().split('T')[0];

//         return {
//           keyword,
//           intent,
//           value,
//           trend,
//           kdPercentage,
//           result,
//           lastUpdate,
//         };
//       },
//     );

//     const result = {
//       status: 'success',
//       message: 'Keywords retrieved successfully',
//       data: {
//         url,
//         totalKeywords,
//         keywords: keywordResults,
//         page: Math.floor(skip / limit) + 1,
//         limit,
//         totalPages: Math.ceil(totalKeywords / limit),
//       },
//     };

//     await this.cacheManager.set(cacheKey, result, 3600);
//     return result;
//   }

//   async crawlAndAnalyze(url: string) {
//     if (!this.browser) {
//       await this.initializeBrowser();
//     }
//     const page = await this.browser!.newPage();
//     try {
//       await page.setRequestInterception(true);
//       page.on('request', (req) => {
//         if (['image', 'stylesheet', 'font'].includes(req.resourceType()))
//           req.abort();
//         else req.continue();
//       });

//       const startTime = Date.now();
//       await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
//       const loadTime = Date.now() - startTime;
//       const content = await page.content();
//       const metaTags = await page.$$eval('meta', (metas) =>
//         metas.map((meta) => ({
//           name: meta.getAttribute('name'),
//           content: meta.getAttribute('content'),
//         })),
//       );
//       const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', (hs) =>
//         hs.map((h) => h.textContent || ''),
//       );

//       // Store raw data without immediate full processing
//       await this.pageModel.findOneAndUpdate(
//         { url },
//         {
//           content,
//           linkedUrls: [],
//           imageUrls: [],
//           metaTags,
//           headings,
//           loadTime,
//           crawledAt: new Date(),
//         },
//         { upsert: true, new: true },
//       );
//     } catch (error) {
//       this.logger.error(
//         `Crawl failed for ${url}: ${error.message}`,
//         error.stack,
//       );
//       throw new Error(`Crawl failed: ${error.message}`);
//     } finally {
//       await page.close();
//     }
//   }

//   private calculateSeoScoreForChunk(
//     chunk: string[],
//     hasMetaTags: boolean,
//     internalLinksCount: number,
//     pageDoc: PageDocument,
//   ): SeoAnalysis {
//     const headingScore = chunk.length > 0 ? 50 : 0; // Base score for headings
//     const metaScore = hasMetaTags ? 30 : 0; // Score for meta tags
//     const keywordDensityScore =
//       this.calculateKeywordDensity(pageDoc) > 0.02 ? 20 : 0; // 2% keyword density threshold
//     const backlinkImpact = Math.min(
//       20,
//       Math.round((internalLinksCount / 10) * 2),
//     ); // Estimated backlink influence
//     return {
//       seoScore: Math.round(
//         headingScore + metaScore + keywordDensityScore + backlinkImpact,
//       ),
//     };
//   }

//   private calculateKeywordDensity(pageDoc: PageDocument): number {
//     if (!pageDoc.headings.length) return 0;
//     const text = [
//       ...pageDoc.headings,
//       ...pageDoc.metaTags.map((tag) => tag.content).filter((c) => c),
//     ]
//       .join(' ')
//       .toLowerCase();
//     const keywords = this.extractKeywords(pageDoc);
//     const totalWords = text.split(/\s+/).length;
//     const keywordCount = keywords.reduce(
//       (sum, kw) =>
//         sum + (text.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length,
//       0,
//     );
//     return totalWords > 0 ? keywordCount / totalWords : 0;
//   }

//   private calculateSiteHealth(loadTime: number, imageCount: number): number {
//     const loadScore =
//       loadTime < 2000 ? 100 : Math.max(0, 100 - (loadTime - 2000) / 20);
//     const imageScore =
//       imageCount < 10 ? 100 : Math.max(0, 100 - (imageCount - 10) * 5);
//     return Math.round((loadScore + imageScore) / 2);
//   }

//   private estimateAuthority(internalLinksCount: number): number {
//     return Math.min(100, internalLinksCount * 5);
//   }

//   private estimateTraffic(internalLinksCount: number): number {
//     return Math.min(5000, internalLinksCount * 50);
//   }

//   private countKeywords(headings: string[]): number {
//     return new Set(
//       headings
//         .join(' ')
//         .toLowerCase()
//         .match(/\b\w{4,}\b/g) || [],
//     ).size;
//   }

//   private extractKeywords(page: PageDocument): string[] {
//     const allText = [
//       ...page.headings,
//       ...page.metaTags.map((tag) => tag.content).filter((c) => c),
//     ]
//       .join(' ')
//       .toLowerCase();
//     return Array.from(
//       new Map(
//         allText
//           .match(/\b\w{4,}\b/g)
//           ?.map((word) => [
//             word,
//             (allText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length,
//           ]),
//       ).entries(),
//     )
//       .sort((a, b) => b[1] - a[1])
//       .slice(0, 10)
//       .map((entry) => entry[0]);
//   }

//   async onModuleDestroy() {
//     await this.closeBrowser();
//   }

//   private estimateBacklinks(
//     internalLinksCount: number,
//     authorityScore: number,
//   ): number {
//     const baseBacklinks = Math.min(1000, internalLinksCount * 10);
//     const authorityFactor = Math.min(1, authorityScore / 100);
//     return Math.round(baseBacklinks * authorityFactor);
//   }

//   private estimatePaidKeywords(
//     organicKeywordsCount: number,
//     authorityScore: number,
//   ): number {
//     const basePaidKeywords = Math.round(organicKeywordsCount * 0.05);
//     const authorityFactor = Math.min(1, authorityScore / 100);
//     return Math.round(basePaidKeywords * authorityFactor);
//   }

//   private determineIntent(keyword: string, pageDoc: PageDocument): string {
//     const lowerKeyword = keyword.toLowerCase();
//     if (['check', 'status'].includes(lowerKeyword)) return 'informational';
//     if (['online', 'buy'].includes(lowerKeyword)) return 'transactional';
//     if (['smart', 'card'].includes(lowerKeyword)) return 'commercial';
//     return 'informational';
//   }

//   private calculateKeywordValue(
//     frequency: number,
//     totalKeywords: number,
//   ): number {
//     return Math.round((frequency / totalKeywords) * 100);
//   }

//   private estimateTrend(frequency: number, crawledAt: Date): string {
//     const monthsSinceCrawl =
//       (new Date().getTime() - crawledAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
//     return frequency > 1 && monthsSinceCrawl < 6 ? 'upward' : 'stable';
//   }

//   private calculateKDPercentage(
//     totalKeywords: number,
//     internalLinksCount: number,
//   ): number {
//     const baseDifficulty = Math.min(100, (totalKeywords / 10) * 5);
//     const linkImpact = Math.min(50, internalLinksCount * 2);
//     return Math.round((baseDifficulty + linkImpact) / 1.5);
//   }

//   private estimateSearchResults(
//     totalKeywords: number,
//     contentLength: number,
//   ): number {
//     const baseResults = totalKeywords * 1000;
//     const contentFactor = Math.log(contentLength / 1000 + 1) * 1000;
//     return Math.round(baseResults + contentFactor);
//   }
// }

// import { CACHE_MANAGER } from '@nestjs/cache-manager';
// import { Injectable, Inject } from '@nestjs/common';
// import { Cache } from 'cache-manager';
// import puppeteer from 'puppeteer';
// import { InjectModel } from '@nestjs/mongoose';
// import { Page, PageDocument } from '../schemas/page.schema';
// import { Model } from 'mongoose';

// @Injectable()
// export class WebsiteAnalyzerService {
//   constructor(
//     @Inject(CACHE_MANAGER) private cacheManager: Cache,
//     @InjectModel(Page.name) private pageModel: Model<PageDocument>,
//   ) {}

//   async analyzeWebsite(url: string) {
//     const cacheKey = `website_${url}`;
//     const cached = await this.cacheManager.get(cacheKey);
//     if (cached) return cached;

//     const page = await this.pageModel.findOne({ url }).exec();
//     if (!page) {
//       await this.crawlAndAnalyze(url); // Crawl if not indexed
//       return await this.analyzeWebsite(url); // Retry
//     }

//     const seoScore = this.calculateSeoScore(page);
//     const siteHealth = this.calculateSiteHealth(page.loadTime, page.imageUrls.length);
//     const internalLinksCount = page.linkedUrls.length;
//     const metaDescription = page.metaTags.find(tag => tag.name === 'description')?.content || 'No meta description';

//     const result = {
//       url,
//       seoScore,
//       authorityScore: this.estimateAuthority(internalLinksCount),
//       organicTraffic: this.estimateTraffic(internalLinksCount),
//       organicKeywords: this.countKeywords(page.headings),
//       paidKeywords: 0,
//       backlinks: 0,
//       siteHealth,
//       analysisDate: new Date().toISOString().split('T')[0],
//       metaDescription,
//     };

//     await this.cacheManager.set(cacheKey, result, 3600);
//     return result;
//   }

//   async searchKeywords(url: string) {
//     const cacheKey = `keywords_${url}`;
//     const cached = await this.cacheManager.get(cacheKey);
//     if (cached) return cached;

//     const page = await this.pageModel.findOne({ url }).exec();
//     if (!page) {
//       await this.crawlAndAnalyze(url); // Crawl if not indexed
//       return await this.searchKeywords(url); // Retry
//     }

//     const keywords = this.extractKeywords(page);
//     const result = { url, keywords };

//     await this.cacheManager.set(cacheKey, result, 3600);
//     return result;
//   }

//   async crawlAndAnalyze(url: string) {
//     const browser = await puppeteer.launch();
//     const page = await browser.newPage();
//     const startTime = Date.now();
//     await page.goto(url, { waitUntil: 'networkidle2' });
//     const loadTime = Date.now() - startTime;
//     const content = await page.content();
//     const metaTags = await page.$$eval('meta', metas =>
//       metas.map(meta => ({ name: meta.getAttribute('name'), content: meta.getAttribute('content') }))
//     );
//     const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', hs => hs.map(h => h.textContent));
//     await browser.close();

//     await this.pageModel.findOneAndUpdate(
//       { url },
//       { content, linkedUrls: [], imageUrls: [], metaTags, headings, loadTime, crawledAt: new Date() },
//       { upsert: true }
//     );
//   }

//   private calculateSeoScore(page: PageDocument): number {
//     const hasMeta = page.metaTags.length > 0;
//     const hasHeadings = page.headings.length > 0;
//     return Math.round((hasMeta ? 50 : 0) + (hasHeadings ? 50 : 0));
//   }

//   private calculateSiteHealth(loadTime: number, imageCount: number): number {
//     const loadScore = loadTime < 2000 ? 100 : Math.max(0, 100 - ((loadTime - 2000) / 20));
//     const imageScore = imageCount < 10 ? 100 : Math.max(0, 100 - (imageCount - 10) * 5);
//     return Math.round((loadScore + imageScore) / 2);
//   }

//   private estimateAuthority(internalLinksCount: number): number {
//     return Math.min(100, internalLinksCount * 5);
//   }

//   private estimateTraffic(internalLinksCount: number): number {
//     return Math.min(5000, internalLinksCount * 50);
//   }

//   private countKeywords(headings: string[]): number {
//     const uniqueWords = new Set(headings.join(' ').toLowerCase().match(/\b\w{4,}\b/g) || []);
//     return uniqueWords.size;
//   }

//   private extractKeywords(page: PageDocument): string[] {
//     const allText = [...page.headings, ...page.metaTags.map(tag => tag.content).filter(c => c)].join(' ').toLowerCase();
//     const words = allText.match(/\b\w{4,}\b/g) || [];
//     const keywordCount = new Map<string, number>();
//     words.forEach(word => keywordCount.set(word, (keywordCount.get(word) || 0) + 1));
//     return Array.from(keywordCount.entries())
//       .sort((a, b) => b[1] - a[1])
//       .slice(0, 10)
//       .map(entry => entry[0]);
//   }
// }
