import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Injectable, Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import puppeteer from 'puppeteer';
import { InjectModel } from '@nestjs/mongoose';
import { Page, PageDocument } from '../schemas/page.schema'; 
import { Model } from 'mongoose';

@Injectable()
export class WebsiteAnalyzerService {
  private browser: any; // Shared browser instance

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectModel(Page.name) private pageModel: Model<PageDocument>,
  ) {
    this.initializeBrowser();
  }

  private async initializeBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: 30000,
      });
    }
  }

  async analyzeWebsite(url: string) {
    const cacheKey = `website_${url}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    let pageDoc = await this.pageModel.findOne({ url }).exec();
    if (!pageDoc) {
      await this.crawlAndAnalyze(url);
      pageDoc = await this.pageModel.findOne({ url }).exec();
      if (!pageDoc) throw new Error(`Failed to crawl ${url}`);
    }

    const seoScore = this.calculateSeoScore(pageDoc);
    const siteHealth = this.calculateSiteHealth(pageDoc.loadTime, pageDoc.imageUrls.length);
    const internalLinksCount = pageDoc.linkedUrls.length;
    const metaDescription = pageDoc.metaTags.find(tag => tag.name === 'description')?.content || 'No meta description';

    const result = {
      url,
      seoScore,
      authorityScore: this.estimateAuthority(internalLinksCount),
      organicTraffic: this.estimateTraffic(internalLinksCount),
      organicKeywords: this.countKeywords(pageDoc.headings),
      paidKeywords: 0,
      backlinks: 0,
      siteHealth,
      analysisDate: new Date().toISOString().split('T')[0],
      metaDescription,
    };

    await this.cacheManager.set(cacheKey, result, 3600);
    return result;
  }

  async searchKeywords(url: string) {
    const cacheKey = `keywords_${url}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    let pageDoc = await this.pageModel.findOne({ url }).exec();
    if (!pageDoc) {
      await this.crawlAndAnalyze(url);
      pageDoc = await this.pageModel.findOne({ url }).exec();
      if (!pageDoc) throw new Error(`Failed to crawl ${url}`);
    }

    const keywords = this.extractKeywords(pageDoc);
    const result = { url, keywords };

    await this.cacheManager.set(cacheKey, result, 3600);
    return result;
  }

  async crawlAndAnalyze(url: string) {
    const page = await this.browser.newPage();
    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
        else req.continue();
      });

      const startTime = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); // Faster wait
      const loadTime = Date.now() - startTime;
      const content = await page.content();
      const metaTags = await page.$$eval('meta', metas =>
        metas.map(meta => ({ name: meta.getAttribute('name'), content: meta.getAttribute('content') }))
      );
      const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', hs => hs.map(h => h.textContent));
// need to change
      await this.pageModel.findOneAndUpdate(
        { url },
        { content, linkedUrls: [], imageUrls: [], metaTags, headings, loadTime, crawledAt: new Date() },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`Crawl failed for ${url}: ${error.message}`);
    } finally {
      await page.close();
    }
  }

  private calculateSeoScore(page: PageDocument): number {
    return Math.round((page.metaTags.length > 0 ? 50 : 0) + (page.headings.length > 0 ? 50 : 0));
  }

  private calculateSiteHealth(loadTime: number, imageCount: number): number {
    const loadScore = loadTime < 2000 ? 100 : Math.max(0, 100 - ((loadTime - 2000) / 20));
    const imageScore = imageCount < 10 ? 100 : Math.max(0, 100 - (imageCount - 10) * 5);
    return Math.round((loadScore + imageScore) / 2);
  }

  private estimateAuthority(internalLinksCount: number): number {
    return Math.min(100, internalLinksCount * 5);
  }

  private estimateTraffic(internalLinksCount: number): number {
    return Math.min(5000, internalLinksCount * 50);
  }

  private countKeywords(headings: string[]): number {
    return new Set(headings.join(' ').toLowerCase().match(/\b\w{4,}\b/g) || []).size;
  }

  private extractKeywords(page: PageDocument): string[] {
    const allText = [...page.headings, ...page.metaTags.map(tag => tag.content).filter(c => c)].join(' ').toLowerCase();
    return Array.from(new Map(
      allText.match(/\b\w{4,}\b/g)?.map(word => [word, (allText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length])
    ).entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(entry => entry[0]);
  }

  async onModuleDestroy() {
    if (this.browser) await this.browser.close();
  }
}

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