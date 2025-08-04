import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BrokenLink, BrokenLinkDocument } from '../schemas/broken-link.schema';
import { Page, PageDocument } from '../schemas/page.schema';
import { WebsiteAnalyzerService } from '../website-analyzer/website-analyzer.service';
import * as cheerio from 'cheerio';
import axios from 'axios';
import pLimit from 'p-limit';

@Injectable()
export class BrokenLinksService {
  private readonly logger = new Logger(BrokenLinksService.name);
  private readonly concurrencyLimit = 10;

  constructor(
    @InjectModel(Page.name) private pageModel: Model<PageDocument>,
    @InjectModel(BrokenLink.name) private brokenLinkModel: Model<BrokenLinkDocument>,
    private readonly websiteAnalyzerService: WebsiteAnalyzerService,
  ) {
    this.logger.log('BrokenLinksService initialized');
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

    const pages = await this.pageModel.find({ url: { $in: pageUrls } }).exec();
    if (!pages.length) {
      this.logger.warn(`No page documents found for URLs: ${pageUrls.join(', ')}`);
      return {
        message: 'No page documents found',
        pagesCrawled: pageUrls.length,
        brokenLinksFound: 0,
      };
    }

    const allLinks = new Map<string, string[]>();
    for (const page of pages) {
      const $ = cheerio.load(page.content);
      $('a[href]').each((_, element) => {
        let href = $(element).attr('href') || '';
        try {
          href = new URL(href, page.url).href;
          const sources = allLinks.get(href) || [];
          allLinks.set(href, [...sources, page.url]);
        } catch (err) {
          this.logger.warn(`Invalid URL: ${href} on ${page.url}`);
        }
      });
    }

    this.logger.log(`Found ${allLinks.size} unique links`);

    await this.brokenLinkModel.deleteMany({ baseUrl });

    const limit = pLimit(this.concurrencyLimit);
    const brokenLinks: BrokenLink[] = [];
    const linkChecks = Array.from(allLinks.entries()).map(([url, sourcePages]) =>
      limit(async () => {
        try {
          await new Promise((res) => setTimeout(res, 50));
          const response = await axios.head(url, { timeout: 5000 });
          if (response.status >= 400) {
            brokenLinks.push({
              url,
              baseUrl,
              status: response.status,
              sourcePage: sourcePages[0],
              checkedAt: new Date(),
            });
          }
        } catch (error) {
          brokenLinks.push({
            url,
            baseUrl,
            status: error.response?.status || 'Request Failed',
            sourcePage: sourcePages[0],
            checkedAt: new Date(),
          });
        }
      }),
    );

    await Promise.all(linkChecks);

    if (brokenLinks.length > 0) {
      await this.brokenLinkModel.insertMany(brokenLinks);
    }

    this.logger.log(`Found ${brokenLinks.length} broken links`);

    return {
      message: 'Broken link crawl completed',
      pagesCrawled: pageUrls.length,
      brokenLinksFound: brokenLinks.length,
    };
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
      .exec();

    return {
      status: 'Success',
      message: 'Broken links retrieved successfully',
      data: {
        baseUrl,
        totalBrokenLinks,
        brokenLinks: brokenLinks.map((link) => ({
          url: link.url,
          status: link.status,
          sourcePage: link.sourcePage,
          checkedAt: link.checkedAt,
        })),
        page: Math.floor(skip / limit) + 1,
        limit,
        totalPages: Math.ceil(totalBrokenLinks / limit),
      },
    };
  }
}