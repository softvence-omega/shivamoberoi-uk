import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { BrokenLink, BrokenLinkDocument } from '../schemas/broken-link.schema';
import { Page, PageDocument } from '../schemas/page.schema';
import { Link, LinkDocument } from '../schemas/link.schema';
import { Image, ImageDocument } from '../schemas/image.schema';
import { Analysis, AnalysisDocument } from '../schemas/analysis.schema';

interface CachedSeoAnalysis {
  url: string;
  websiteLink: {
    internalLinks: number;
    externalLinks: number;
    brokenLinks: number;
  };
  oversizedImages: number;
  blurryImages: number;
  analyzedAt: Date;
}
@Injectable()
export class CombinedAnalyzerService {
  private readonly logger = new Logger(CombinedAnalyzerService.name);
  private readonly config = { cacheTtl: 3600 };

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectModel(BrokenLink.name) private brokenLinkModel: Model<BrokenLinkDocument>,
    @InjectModel(Page.name) private pageModel: Model<PageDocument>,
    @InjectModel(Link.name) private linkModel: Model<LinkDocument>,
    @InjectModel(Image.name) private imageModel: Model<ImageDocument>,
    @InjectModel(Analysis.name) private analysisModel: Model<AnalysisDocument>,
  ) {
    this.logger.log('CombinedAnalyzerService initialized');
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private async processLinks(links: Link[], session: ClientSession): Promise<{
    internalLinks: number;
    externalLinks: number;
    brokenLinks: number;
  }> {
    const internalLinks = links.filter((link) =>
      link.url.startsWith(new URL(link.sourceUrl).origin),
    ).length;
    const externalLinks = links.length - internalLinks;
    const brokenLinks = links.filter((link) => link.status === 'failed').length;

    return { internalLinks, externalLinks, brokenLinks };
  }

  private analyzeImages(images: Image[]): {
    oversizedImages: number;
    blurryImages: number;
  } {
    const oversizedImages = images.filter(
      (img) => img.fileSize && img.fileSize > 1000000,
    ).length;
    const blurryImages = images.filter((img) => img.isBlurry).length;
    return { oversizedImages, blurryImages };
  }

  async getCombinedAnalysis(
    url: string,
    skip: number,
    limit: number = 20,
  ): Promise<any> {
    if (limit <= 0 || limit > 100) {
      this.logger.warn(`Invalid limit ${limit}, defaulting to 20`);
      limit = 20;
    }

    if (skip < 0) {
      this.logger.warn(`Invalid skip ${skip}, defaulting to 0`);
      skip = 0;
    }

    if (!this.isValidUrl(url)) {
      this.logger.error(`Invalid URL: ${url}`);
      return { status: 'error', message: `Invalid URL: ${url}` };
    }

    const cacheKey = `combined_${url}_${skip}_${limit}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached combined analysis for ${url}`);
      return cached;
    }

    this.logger.log(`Retrieving combined analysis for ${url}, skip: ${skip}, limit: ${limit}`);

    let session: ClientSession | null = null;
    try {
      session = await this.pageModel.db.startSession();
      if (!session) {
        throw new Error('Failed to start MongoDB session');
      }
      await session.startTransaction();
      this.logger.debug(`Transaction started for ${url}`);

      const [page, brokenLinks, totalBrokenLinks, links, images] = await Promise.all([
        this.pageModel.findOne({ url }).session(session).lean().exec(),
        this.brokenLinkModel
          .find({ baseUrl: url })
          .sort({ status: 1, url: 1 })
          .skip(skip)
          .limit(limit)
          .session(session)
          .lean()
          .exec(),
        this.brokenLinkModel.countDocuments({ baseUrl: url }).session(session).exec(),
        this.linkModel.find({ sourceUrl: url }).session(session).lean().exec(),
        this.imageModel.find({ sourceUrl: url }).session(session).lean().exec(),
      ]);

      if (!page) {
        await session.abortTransaction();
        this.logger.warn(`No page data found for ${url}`);
        return {
          status: 'not_found',
          message: `Page not found for URL: ${url}. Please run /crawler/start or /broken-links/crawl first.`,
        };
      }

      const websiteLink = await this.processLinks(links, session);
      const { oversizedImages, blurryImages } = this.analyzeImages(images);

      const analysis = await this.analysisModel.create(
        [
          {
            name: url.split('/').pop() || url,
            url,
            websiteLink,
            oversizedImages,
            blurryImages,
            analyzedAt: new Date(),
          },
        ],
        { session },
      );

      await session.commitTransaction();
      this.logger.debug(`Transaction committed for ${url}`);

      const result = {
        status: 'success',
        message: 'Combined analysis retrieved successfully',
        data: {
          url,
          brokenLinks: {
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
          seoAnalysis: {
            websiteLink,
            oversizedImages,
            blurryImages,
            analyzedAt: analysis[0].analyzedAt,
          },
        },
      };

      await this.cacheManager.set(cacheKey, result, this.config.cacheTtl);
      return result;
    } catch (error) {
      if (session && session.inTransaction()) {
        await session.abortTransaction();
      }
      this.logger.error(`Transaction aborted for ${url}: ${error.message}`, error.stack);
      throw error;
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }
}