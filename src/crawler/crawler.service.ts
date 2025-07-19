// import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Page, PageDocument } from '../schemas/page.schema';
import { Model } from 'mongoose';
import { Link, LinkDocument } from 'src/schemas/link.schema';
import { Image, ImageDocument } from 'src/schemas/image.schema';
// import puppeteer from "puppeteer";
import axios from 'axios';
import { analyzeImage } from '../utils/image-analyzer';
import puppeteer, { Browser } from 'puppeteer';
import { error } from 'console';

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);
  private readonly MAX_CONCURRENT_PAGES = 5;
  private readonly CRAWL_TIMEOUT = 30000;
  private readonly CACHE_TTL = 3600;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectModel(Page.name) private pageModel: Model<PageDocument>,
    @InjectModel(Link.name) private linkModel: Model<LinkDocument>,
    @InjectModel(Image.name) private imageModel: Model<ImageDocument>,
  ) {}

  async startcrawling(startUrl: string) {
    const cacheKey = `crawl:${startUrl}`;
    const cached = await (this.cacheManager as Cache).get(cacheKey);
    // const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached result for ${startUrl}`);
      return cached;
    }
    const visited = new Set<string>();
    const queue: string[] = [startUrl];
    const browser = await puppeteer.launch({
      headless: true,
      timeout: this.CRAWL_TIMEOUT,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const activePages: Promise<void>[] = [];

      while (queue.length > 0 || activePages.length > 0) {
        while (
          activePages.length < this.MAX_CONCURRENT_PAGES &&
          queue.length > 0
        ) {
          const url = queue.shift()!;
          if (!visited.has(url)) {
            visited.add(url);
            activePages.push(this.processPage(browser, url, queue, visited));
          }
        }

        if (activePages.length > 0) {
          await Promise.race(activePages);

          const settled = await Promise.allSettled(activePages);
          for (let i = activePages.length - 1; i >= 0; i--) {
            if (settled[i].status === 'fulfilled' || settled[i].status === 'rejected') {
              activePages.splice(i, 1);
            }
          }
        }
      }
      const result = {
        status: 'success',
        url: startUrl,
        pagesCrawled: visited.size,
        timestamp: new Date().toISOString(),
      };
      await this.cacheManager.set(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (err) {
      this.logger.error(`Crawling failed for ${startUrl}: ${err.message}`);
      throw err;
    } finally {
      await browser.close();
      this.logger.error('Error closing browser:', error);
    }
  }

  private async processPage(
    browser: Browser,
    url: string,
    queue: string[],
    visited: Set<string>,
  ): Promise<void> {
    const page = await browser.newPage().catch((err) => {
      this.logger.error(`Failed to open new page for ${url}: ${err}`);
      return null;
    });

    if (!page) {
      return;
    }

    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (!['document', 'xhr', 'fetch'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      this.logger.debug(`Processing  page: ${url}`);
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.CRAWL_TIMEOUT,
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
        this.processLinks(url, links, queue, visited),
        this.processImages(url, images),
      ]);
    } catch (err) {
      this.logger.error(`Failed to process page ${url}: ${err.message}`);
      await this.pageModel.updateOne(
        { url },
        { $set: { error: err.message, lastCrawled: new Date() } },
        { upsert: true },
      );
    } finally {
      await page
        .close()
        .catch((err) =>
          this.logger.error(`Failed to close page for ${url}:`, err.message),
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
        await this.linkModel.bulkWrite(bulkOps);
      }
      links.forEach((link) => {
        if (!visited.has(link)) {
          queue.push(link);
        }
      });
    } catch (err) {
      this.logger.error(`Failed to process links for ${sourceUrl}: ${err}`);
    }
  }
  private async processImages(
    sourceUrl: string,
    images: string[],
  ): Promise<void> {
    const imageUpdates = await Promise.all(
      images.map(async (imageUrl) => {
        try {
          const analysis = await analyzeImage(imageUrl);
          return {
            updateOne: {
              filter: { url: imageUrl, sourceUrl },
              update: {
                $set: {
                  ...analysis,
                  analyzedAt: new Date(),
                  updatedAt: new Date(),
                },
              },
              upsert: true,
            },
          };
        } catch (err) {
          this.logger.error(`Failed to analyze image ${imageUrl}: ${err}`);
          return null;
        }
      }),
    );
    try {
      const validUpdates = imageUpdates.filter((update) => update !== null);
      if (validUpdates.length > 0) {
        await this.imageModel.bulkWrite(validUpdates);
      }
    } catch (err) {
      this.logger.error(`Failed to save image data for ${sourceUrl}: ${err}`);
    }
  }

  async getIndex(url: string) {
    const cacheKey = `index:${url}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached index for ${url}`);
      return cached;
    }

    try {
      const [page, links, images] = await Promise.all([
        this.pageModel.findOne({ url }).lean().exec(),
        this.linkModel.find({ sourceUrl: url }).lean().exec(),
        this.imageModel.find({ sourceUrl: url }).lean().exec(),
      ]);

      if (!page) {
        return { status: 'not_found', message: `Page not found for ${url}` };
      }

      const result = {
        status: 'success',
        page,
        links,
        images,
        timestamp: new Date().toISOString(),
      };

      await this.cacheManager.set(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (err) {
      this.logger.error(`Failed to get index for ${url}: ${err}`);
      throw err;
    }
  }
}
