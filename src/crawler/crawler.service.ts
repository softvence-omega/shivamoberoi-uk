import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Page, PageDocument } from '../schemas/page.schema';
import { Model } from 'mongoose';
import { Link, LinkDocument } from '../schemas/link.schema';
import { Image, ImageDocument } from '../schemas/image.schema';
import puppeteer, { Browser, Page as PuppeteerPage } from 'puppeteer';
import axios from 'axios';
import { analyzeImage } from '../utils/image-analyzer';

@Injectable()
export class CrawlerService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(CrawlerService.name);
  private readonly MAX_CONCURRENT_PAGES = 5;
  private readonly CRAWL_TIMEOUT = 15000;
  private readonly CACHE_TTL = 3600;
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_PAGES_PER_REQUEST = 10;
  private readonly MAX_CRAWL_DEPTH = 3;
  private browser: Browser | null = null;
  private pagePool: PuppeteerPage[] = [];

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectModel(Page.name) private pageModel: Model<PageDocument>,
    @InjectModel(Link.name) private linkModel: Model<LinkDocument>,
    @InjectModel(Image.name) private imageModel: Model<ImageDocument>,
  ) {}

  async onModuleInit() {
    await this.initializeBrowser();
  }

  private async initializeBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
        timeout: this.CRAWL_TIMEOUT,
        executablePath: process.env.RENDER
          ? '/usr/bin/chromium'
          : undefined,
      });
      for (let i = 0; i < this.MAX_CONCURRENT_PAGES; i++) {
        this.pagePool.push(await this.browser.newPage());
      }
    }
  }

  async startCrawling(
    startUrl: string,
    continuationToken?: string,
  ): Promise<{
    status: string;
    message: string;
    data: {
      pagesCrawled: number;
      nextToken?: string | undefined;
      timestamp: string;
    };
  }> {
    const cacheKey = `crawl:${startUrl}:${continuationToken || Date.now()}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (
      cached &&
      typeof cached === 'object' &&
      'status' in cached &&
      'message' in cached &&
      'data' in cached
    ) {
      this.logger.debug(`Returning cached result for ${startUrl}`);
      return cached as {
        status: string;
        message: string;
        data: {
          pagesCrawled: number;
          nextToken?: string | undefined;
          timestamp: string;
        };
      };
    }

    const visited = new Set<string>(
      continuationToken ? JSON.parse(continuationToken) : [],
    );
    const queue: string[] = continuationToken ? [] : [startUrl];
    const activePages: Promise<void>[] = [];
    let pagesCrawled = 0;

    try {
      let depth = 0;
      const startTime = Date.now();

      while (
        queue.length > 0 &&
        pagesCrawled < this.MAX_PAGES_PER_REQUEST &&
        depth <= this.MAX_CRAWL_DEPTH &&
        Date.now() - startTime < this.CRAWL_TIMEOUT * 2
      ) {
        while (
          activePages.length < this.MAX_CONCURRENT_PAGES &&
          queue.length > 0 &&
          queue.length <= this.MAX_QUEUE_SIZE
        ) {
          const url = queue.shift()!;
          if (!visited.has(url)) {
            visited.add(url);
            const page =
              this.pagePool[activePages.length % this.MAX_CONCURRENT_PAGES];
            activePages.push(
              this.processPage(page, url, queue, visited, depth),
            );
            pagesCrawled++;
          }
        }

        if (activePages.length > 0) {
          const settled = await Promise.allSettled(activePages);
          activePages.length = 0;
          for (const result of settled) {
            if (result.status === 'rejected') {
              this.logger.error(`Page processing failed: ${result.reason}`);
            }
          }
        }
        depth++;
      }

      const result = {
        status: queue.length > 0 ? 'partial' : 'success',
        message:
          queue.length > 0
            ? 'Crawling completed partially'
            : 'Crawling completed successfully',
        data: {
          pagesCrawled,
          nextToken:
            queue.length > 0 ? JSON.stringify(Array.from(visited)) : undefined,
          timestamp: new Date().toISOString(),
        },
      };

      if (result.status === 'success') {
        await this.cacheManager.set(cacheKey, result, this.CACHE_TTL);
      }
      return result;
    } catch (err) {
      this.logger.error(`Crawling failed for ${startUrl}: ${err.message}`);
      throw err;
    }
  }

  private async processPage(
    page: PuppeteerPage,
    url: string,
    queue: string[],
    visited: Set<string>,
    depth: number,
  ): Promise<void> {
    try {
      // Reset page state and remove existing request listeners
      await page.setContent('');
      page.removeAllListeners('request');
      await page.setRequestInterception(true);

      page.on('request', (req) => {
        if (!['document', 'xhr', 'fetch'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      this.logger.debug(`Processing page: ${url} at depth ${depth}`);
      await page
        .goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.CRAWL_TIMEOUT,
        })
        .catch((err) => {
          throw new Error(`Navigation failed: ${err.message}`);
        });

      const [content, links, images] = await Promise.all([
        page.content(),
        page.$$eval('a', (as) =>
          as
            .map((a) => a.href)
            .filter((href) => href.startsWith('http'))
            .map((href) => new URL(href).href),
        ),
        page.$$eval('img', (imgs) =>
          imgs.map((img) => img.src).filter((src) => src.startsWith('http')),
        ),
      ]);

      await Promise.all([
        this.savePageData(url, content, links, images),
        this.processLinks(url, links, queue, visited, depth),
        this.processImages(url, images),
      ]);
    } catch (err) {
      this.logger.error(`Failed to process page ${url}: ${err.message}`);
      await this.pageModel.updateOne(
        { url },
        { $set: { error: err.message, lastCrawled: new Date() } },
        { upsert: true },
      );
    }
  }

  private async savePageData(
    url: string,
    content: string,
    links: string[],
    images: string[],
  ): Promise<void> {
    try {
      await this.pageModel.findOneAndUpdate(
        { url },
        {
          content,
          linkedUrls: links,
          imageUrls: images,
          crawledAt: new Date(),
          updatedAt: new Date(),
        },
        { upsert: true },
      );
    } catch (err) {
      this.logger.error(`Failed to save page data for ${url}: ${err}`);
    }
  }

  private async processLinks(
    sourceUrl: string,
    links: string[],
    queue: string[],
    visited: Set<string>,
    depth: number,
  ): Promise<void> {
    const bulkOps = links.map((link) => ({
      updateOne: {
        filter: { url: link, sourceUrl },
        update: {
          $set: {
            status: 'pending',
            checkedAt: new Date(),
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    try {
      if (bulkOps.length > 0) {
        await this.linkModel.bulkWrite(bulkOps, { ordered: false });
      }
      if (depth < this.MAX_CRAWL_DEPTH) {
        links
          .filter(
            (link) => !visited.has(link) && queue.length < this.MAX_QUEUE_SIZE,
          )
          .forEach((link) => queue.push(link));
      }
    } catch (err) {
      this.logger.error(`Failed to process links for ${sourceUrl}: ${err}`);
    }
  }

  private async processImages(
    sourceUrl: string,
    images: string[],
  ): Promise<void> {
    const MAX_CONCURRENT_IMAGES = 5;
    const imageUpdates: {
      updateOne: {
        filter: { url: string; sourceUrl: string };
        update: {
          $set: {
            analyzedAt: Date;
            updatedAt: Date;
            fileSize: number;
            width: number;
            height: number;
            isBlurry: boolean;
            name?: string;
          };
        };
        upsert: boolean;
      };
    }[] = [];

    for (let i = 0; i < images.length; i += MAX_CONCURRENT_IMAGES) {
      const batch = images.slice(i, i + MAX_CONCURRENT_IMAGES);
      const promises = batch.map(async (imageUrl) => {
        try {
          const analysis = await analyzeImage(imageUrl);
          const name = imageUrl.split('/').pop() || imageUrl; // Fallback
          return {
            updateOne: {
              filter: { url: imageUrl, sourceUrl },
              update: {
                $set: {
                  ...analysis,
                  analyzedAt: new Date(),
                  updatedAt: new Date(),
                  name,
                },
              },
              upsert: true,
            },
          };
        } catch (err) {
          this.logger.error(`Failed to analyze image ${imageUrl}: ${err}`);
          return null;
        }
      });
      imageUpdates.push(
        ...(await Promise.all(promises)).filter(
          (update): update is NonNullable<typeof update> => update !== null,
        ),
      );
    }

    try {
      if (imageUpdates.length > 0) {
        await this.imageModel.bulkWrite(imageUpdates, { ordered: false });
      }
    } catch (err) {
      this.logger.error(`Failed to save image data for ${sourceUrl}: ${err}`);
    }
  }

  async getIndex(
    url: string,
  ): Promise<{
    status: string;
    message: string;
    data: { page: any; links: any[]; images: any[]; timestamp: string };
  }> {
    const cacheKey = `index:${url}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached index for ${url}`);
      return cached as {
        status: string;
        message: string;
        data: { page: any; links: any[]; images: any[]; timestamp: string };
      };
    }

    try {
      const [page, links, images] = await Promise.all([
        this.pageModel.findOne({ url }).lean().exec(),
        this.linkModel.find({ sourceUrl: url }).lean().exec(),
        this.imageModel.find({ sourceUrl: url }).lean().exec(),
      ]);

      if (!page) {
        return {
          status: 'not_found',
          message: `Page not found for ${url}`,
          data: {
            page: null,
            links: [],
            images: [],
            timestamp: new Date().toISOString(),
          },
        };
      }

      const result = {
        status: 'success',
        message: 'Index retrieved successfully',
        data: {
          page,
          links,
          images,
          timestamp: new Date().toISOString(),
        },
      };

      await this.cacheManager.set(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (err) {
      this.logger.error(`Failed to get index for ${url}: ${err}`);
      throw err;
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      await Promise.all(
        this.pagePool.map((page) =>
          page
            .close()
            .catch((err) => this.logger.error(`Failed to close page: ${err}`)),
        ),
      );
      await this.browser
        .close()
        .catch((err) => this.logger.error(`Failed to close browser: ${err}`));
    }
  }
}
