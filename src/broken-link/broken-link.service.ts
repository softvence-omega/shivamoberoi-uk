import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { BrokenLink, BrokenLinkDocument } from '../schemas/broken-link.schema';
import { Page, PageDocument } from '../schemas/page.schema';
import { WebsiteAnalyzerService } from '../website-analyzer/website-analyzer.service';
import * as cheerio from 'cheerio';
import axios from 'axios';
import pLimit from 'p-limit';

// Define interface for lean documents to ensure TypeScript recognizes all fields
interface LeanBrokenLink {
  url: string;
  baseUrl: string;
  linkType: 'internal' | 'external';
  status: number | string;
  sourcePages: string[];
  reason?: string;
  checkedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
  _id: string;
  __v: number;
}

@Injectable()
export class BrokenLinksService {
  private readonly logger = new Logger(BrokenLinksService.name);
  private readonly config = {
    concurrencyLimit: 10,
    batchSize: 100,
    httpTimeout: 20000, // Increased to 20 seconds
    maxRetries: 3,
    retryDelay: 1000,
    userAgents: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    ],
  };

  constructor(
    @InjectModel(Page.name) private pageModel: Model<PageDocument>,
    @InjectModel(BrokenLink.name) private brokenLinkModel: Model<BrokenLinkDocument>,
    private readonly websiteAnalyzerService: WebsiteAnalyzerService,
  ) {
    this.logger.log('BrokenLinksService initialized');
  }

  private isValidHttpUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const validProtocols = ['http:', 'https:'];
      if (!validProtocols.includes(parsed.protocol)) {
        this.logger.debug(`Invalid protocol for ${url}: ${parsed.protocol}`);
        return false;
      }
      // Explicitly reject javascript: and other non-HTTP schemes
      if (url.toLowerCase().startsWith('javascript:') || url.toLowerCase().startsWith('mailto:') || url === '#') {
        return false;
      }
      return true;
    } catch {
      this.logger.debug(`Invalid URL format: ${url}`);
      return false;
    }
  }

  private async checkLinkStatus(url: string, retries = this.config.maxRetries): Promise<{ status: number | string; isBroken: boolean; reason?: string }> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      // Rotate user-agents to bypass bot detection
      const userAgent = this.config.userAgents[(attempt - 1) % this.config.userAgents.length];
      try {
        this.logger.debug(`Checking ${url} with HEAD (attempt ${attempt}/${retries}, UA: ${userAgent})`);
        const response = await axios.head(url, {
          timeout: this.config.httpTimeout,
          headers: { 'User-Agent': userAgent },
        });
        return { status: response.status, isBroken: response.status >= 400 };
      } catch (error) {
        if (error.response) {
          if (error.response.status === 429 && attempt < retries) {
            const delay = this.config.retryDelay * Math.pow(2, attempt);
            this.logger.warn(`Rate limit (429) for ${url}, retrying after ${delay}ms (attempt ${attempt}/${retries})`);
            await new Promise((res) => setTimeout(res, delay));
            continue;
          }
          return { status: error.response.status, isBroken: true };
        }
        if (attempt < retries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          this.logger.warn(`HEAD request failed for ${url}, retrying after ${delay}ms (attempt ${attempt}/${retries}): ${error.message}`);
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }
        try {
          this.logger.debug(`Checking ${url} with GET (attempt ${attempt}/${retries}, UA: ${userAgent})`);
          const response = await axios.get(url, {
            timeout: this.config.httpTimeout,
            headers: { 'User-Agent': userAgent },
          });
          return { status: response.status, isBroken: response.status >= 400 };
        } catch (getError) {
          let reason = 'Unknown Error';
          if (getError.code === 'ETIMEDOUT') reason = 'Timeout';
          else if (getError.code === 'ECONNREFUSED') reason = 'Connection Refused';
          else if (getError.code === 'ENOTFOUND') reason = 'DNS Resolution Failed';
          else if (getError.message) reason = getError.message;

          this.logger.error(`GET request failed for ${url} after ${retries} attempts: ${reason}`);
          return { status: 'Request Failed', isBroken: true, reason };
        }
      }
    }
    return { status: 'Request Failed', isBroken: true, reason: 'Max retries reached' };
  }

  async crawlBrokenLinks(
    baseUrl: string,
    maxDepth: number,
  ): Promise<{
    message: string;
    pagesCrawled: number;
    brokenLinksFound: number;
  }> {
    this.logger.log(`Initiating broken link crawl for ${baseUrl} with maxDepth ${maxDepth}`);

    const pageUrls = await this.websiteAnalyzerService.crawlWebsitePages(baseUrl, maxDepth);
    if (!pageUrls.length) {
      this.logger.warn(`No pages crawled for ${baseUrl}`);
      return {
        message: 'No pages found to crawl',
        pagesCrawled: 0,
        brokenLinksFound: 0,
      };
    }
    this.logger.log(`Crawled ${pageUrls.length} pages`);

    const pages = await this.pageModel.find({ url: { $in: pageUrls } }).lean().exec();
    if (!pages.length) {
      this.logger.warn(`No page documents found for URLs: ${pageUrls.join(', ')}`);
      return {
        message: 'No page documents found',
        pagesCrawled: pageUrls.length,
        brokenLinksFound: 0,
      };
    }

    const allLinks = new Map<string, { sourcePages: string[]; linkType: string }>();
    const origin = new URL(baseUrl).origin;
    for (const page of pages) {
      const $ = cheerio.load(page.content);
      $('a[href]').each((_, element) => {
        let href = $(element).attr('href') || '';
        if (!this.isValidHttpUrl(href)) {
          this.logger.debug(`Skipping non-HTTP link: ${href} on ${page.url}`);
          return;
        }
        try {
          href = new URL(href, page.url).href;
          const linkType = href.startsWith(origin) ? 'internal' : 'external';
          const existing = allLinks.get(href) || { sourcePages: [], linkType };
          allLinks.set(href, {
            sourcePages: [...existing.sourcePages, page.url],
            linkType,
          });
        } catch (err) {
          this.logger.warn(`Invalid URL: ${href} on ${page.url}`);
        }
      });
    }

    this.logger.log(`Found ${allLinks.size} unique links`);

    const session = await this.brokenLinkModel.db.startSession();
    if (!session) {
      throw new Error('Failed to start MongoDB session');
    }
    session.startTransaction();
    this.logger.debug(`Transaction started for ${baseUrl}`);

    try {
      await this.brokenLinkModel.deleteMany({ baseUrl }).session(session).exec();

      const limit = pLimit(this.config.concurrencyLimit);
      const brokenLinks: BrokenLink[] = [];
      let processed = 0;
      const linkChecks = Array.from(allLinks.entries()).map(([url, { sourcePages, linkType }]) =>
        limit(async () => {
          const { status, isBroken, reason } = await this.checkLinkStatus(url);
          if (isBroken) {
            brokenLinks.push({
              url,
              baseUrl,
              linkType,
              status,
              sourcePages,
              reason,
              checkedAt: new Date(),
            });
          }
          processed++;
          if (processed % this.config.batchSize === 0) {
            this.logger.log(`Processed ${processed}/${allLinks.size} links`);
          }
        }),
      );

      await Promise.all(linkChecks);

      if (brokenLinks.length > 0) {
        const batches: BrokenLink[][] = [];
        for (let i = 0; i < brokenLinks.length; i += this.config.batchSize) {
          batches.push(brokenLinks.slice(i, i + this.config.batchSize));
        }
        for (const batch of batches) {
          await this.brokenLinkModel.insertMany(batch, { session });
        }
      }

      await session.commitTransaction();
      this.logger.debug(`Transaction committed for ${baseUrl}`);

      this.logger.log(`Found ${brokenLinks.length} broken links`);

      return {
        message: 'Broken link crawl completed',
        pagesCrawled: pageUrls.length,
        brokenLinksFound: brokenLinks.length,
      };
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      this.logger.error(`Transaction aborted for ${baseUrl}: ${error.message}`, error.stack);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getBrokenLinks(baseUrl: string, skip: number, limit: number = 20): Promise<any> {
    if (limit <= 0 || limit > 100) {
      this.logger.warn(`Invalid limit ${limit}, defaulting to 20`);
      limit = 20;
    }

    if (skip < 0) {
      this.logger.warn(`Invalid skip ${skip}, defaulting to 0`);
      skip = 0;
    }

    this.logger.log(`Retrieving broken links for ${baseUrl}, skip: ${skip}, limit: ${limit}`);

    const totalBrokenLinks = await this.brokenLinkModel.countDocuments({ baseUrl });

    const brokenLinks = await this.brokenLinkModel
      .find({ baseUrl })
      .sort({ status: 1, url: 1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec() as unknown as LeanBrokenLink[];

    return {
      status: 'Success',
      message: 'Broken links retrieved successfully',
      data: {
        baseUrl,
        totalBrokenLinks,
        brokenLinks: brokenLinks.map((link) => ({
          url: link.url,
          linkType: link.linkType,
          status: link.status,
          sourcePages: Array.isArray(link.sourcePages) ? link.sourcePages : [link.sourcePages].filter(Boolean),
          reason: link.reason,
          checkedAt: link.checkedAt,
        })),
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(totalBrokenLinks / limit),
      },
    };
  }
}