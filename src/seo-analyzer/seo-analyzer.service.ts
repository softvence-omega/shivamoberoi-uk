import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { Page, PageDocument } from '../schemas/page.schema';
import { Link, LinkDocument } from '../schemas/link.schema';
import { Image, ImageDocument } from '../schemas/image.schema';
import { Analysis, AnalysisDocument } from '../schemas/analysis.schema';
import { HttpService } from '@nestjs/axios';
import { checkHttpStatus } from '../utils/http-checker';
// import type { AxiosError } from 'axios';

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { firstValueFrom } from 'rxjs';

export interface CachedSeoAnalysis {
  url: string;
  brokenLinks: string[];
  oversizedImages: string[];
  blurryImages: string[];
  analyzedAt: Date;
}

@Injectable()
export class SeoAnalyzerService {
  private readonly logger = new Logger(SeoAnalyzerService.name);
  private readonly config = {
    maxHttpChecks: 5,
    imageSizeLimit: 1_000_000,
    imageDimensionLimit: { width: 1920, height: 1080 },
    cacheTtl: 3600,
    httpCheckTimeout: 10000,
    maxConcurrentHttpChecks: 3,
  };

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectModel(Page.name) private readonly pageModel: Model<PageDocument>,
    @InjectModel(Link.name) private readonly linkModel: Model<LinkDocument>,
    @InjectModel(Image.name) private readonly imageModel: Model<ImageDocument>,
    // @InjectModel()
    @InjectModel(Analysis.name)
    private readonly analysisModel: Model<AnalysisDocument>,
    private readonly httpService: HttpService,
  ) {}

  async analyzeSeo(url: string): Promise<CachedSeoAnalysis | { status: string; message?: string }> {
    const cacheKey = `seo_${url}`;

    try {
      // Check cache with proper typing
      const cached = await this.cacheManager.get<CachedSeoAnalysis>(cacheKey);
      if (cached) {
        this.logger.debug(`Returning cached SEO analysis for ${url}`);
        return cached;
      }

      if (!this.isValidUrl(url)) {
        throw new Error(`Invalid URL: ${url}`);
      }

      const session = await this.pageModel.db.startSession();
      session.startTransaction();

      try {
        const [page, links, images] = await Promise.all([
          this.pageModel.findOne({ url }).session(session).lean().exec(),
          this.linkModel.find({ sourceUrl: url }).session(session).lean().exec(),
          this.imageModel.find({ sourceUrl: url }).session(session).lean().exec(),
        ]);

        if (!page) {
          await session.abortTransaction();
          return { status: 'not_found', message: `Page not found for URL: ${url}` };
        }

        const brokenLinks = await this.processLinks(links, session);
        const { oversizedImages, blurryImages } = this.analyzeImages(images);

        const analysis = await this.analysisModel.create(
          [
            {
              url,
              brokenLinks: brokenLinks,
              oversizedImages,
              blurryImages,
              analyzedAt: new Date(),
            },
          ],
          { session },
        );

        await session.commitTransaction();

        const result: CachedSeoAnalysis = {
          url,
          brokenLinks,
          oversizedImages,
          blurryImages,
          analyzedAt: analysis[0].analyzedAt,
        };

        await this.cacheManager.set(cacheKey, result, this.config.cacheTtl);
        return result;
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      this.logger.error(`SEO analysis failed for ${url}: ${error.message}`);
      return {
        status: 'error',
        message: error.message || 'SEO analysis failed',
      };
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  private async processLinks(
    links: LinkDocument[],
    session: ClientSession,
  ): Promise<string[]> {
    const brokenLinks: string[] = [];
    const linkCheckPromises: Promise<void>[] = [];
    const activeChecks = new Set<string>();

    for (const link of links) {
      if (activeChecks.size >= this.config.maxConcurrentHttpChecks) {
        await Promise.race(linkCheckPromises);
      }

      const checkPromise = checkHttpStatus(link.url) // Use the utility function
        .then(async (status) => {
          try {
            await this.linkModel.updateOne(
              { _id: link._id },
              {
                status: status >= 400 ? 'broken' : 'valid',
                lastChecked: new Date(),
              },
              { session },
            );
            if (status >= 400) {
              brokenLinks.push(link.url);
            }
          } catch (error) {
            this.logger.error(`Failed to update link ${link.url}: ${error.message}`);
          }
        })
        .finally(() => {
          activeChecks.delete(link.url);
        });

      activeChecks.add(link.url);
      linkCheckPromises.push(checkPromise);
    }

    await Promise.all(linkCheckPromises);
    return brokenLinks;
  }

 private async checkLinkStatus(link: LinkDocument): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const url = new URL(link.url);
        const protocol = url.protocol === 'https:' ? https : http;
        
        const req = protocol.request({
          method: 'HEAD',
          hostname: url.hostname,
          port: url.port || (protocol === https ? 443 : 80),
          path: url.pathname + url.search,
          timeout: this.config.httpCheckTimeout,
          rejectUnauthorized: false // Allows self-signed certs
        }, (res) => {
          res.on('data', () => {}); // Drain response
          resolve(res.statusCode ? res.statusCode >= 400 : true);
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(true);
        });

        req.on('error', () => {
          resolve(true);
        });

        req.end();
      } catch (error) {
        this.logger.error(`URL check failed for ${link.url}: ${error.message}`);
        return true;
      }
    });
  }

  private analyzeImages(images: ImageDocument[]): {
    oversizedImages: string[];
    blurryImages: string[];
  } {
    return {
      oversizedImages: images
        .filter(
          (img) =>
            img.fileSize > this.config.imageSizeLimit ||
            img.width > this.config.imageDimensionLimit.width ||
            img.height > this.config.imageDimensionLimit.height,
        )
        .map((img) => img.url),
      blurryImages: images
        .filter((img) => img.isBlurry)
        .map((img) => img.url),
    };
  }
}