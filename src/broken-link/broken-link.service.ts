import { Injectable, Logger } from "@nestjs/common";
import { BrokenLink, BrokenLinkDocument } from '../schemas/brokenlink.schema';
import { InjectModel } from "@nestjs/mongoose";
import { Page } from "puppeteer";
import { Model } from "mongoose";
import { PageDocument } from "src/schemas/page.schema";
import { WebsiteAnalyzerService } from '../website-analyzer/website-analyzer.service';
import * as cheerio from 'cheerio';
import axios from 'axios';
import pLimit from 'p-limit';



@Injectable()
export class BrokenLinkService {
    private readonly logger = new Logger(BrokenLinkService.name);
    private readonly concurrencyLimit =10;


    constructor(
        @InjectModel(Page.name) private pageModel: Model<PageDocument>,
        @InjectModel(BrokenLink.name) private brokenLinkModel: Model<BrokenLinkDocument>,
        private readonly WebsiteAnalyzerService: WebsiteAnalyzerService,
    ){}


    async crawlBrokenLinks(baseUrl: string, maxDepth: number): Promise<{message:string; pagesCrawled: number; brokenLinksFound: number}> {
        this.logger.log(`Initiating broken link crawl for ${baseUrl} with maxDepth ${maxDepth}`);

        const pageUrls = await this.WebsiteAnalyzerService.crawlWebsitePages(baseUrl,maxDepth);
        this.logger.log(`Crawled ${pageUrls.length} pages`);

        const pages =await this.pageModel.find({url: {$in: pageUrls}}).exec();
        const allLinks = new Map<string, string[]>();

        for(const page of pages) {
            const $ = cheerio.load(page.content);
            $('a[href]').each((_, element)=> {
                let href = $(element).attr('href') || ' ';
                try{
                    href = new URL(href, page.url).href;
                    const sources =allLinks.get(href) || [];
                    allLinks.set(href, [...sources, page.url]);

                } catch(err) {
                    this.logger.warn(`Invalid URL: ${href} on ${page.url}`);
                }
            });
        }

        this.logger.log(`Found ${allLinks.size} unique links`);

        await this.brokenLinkModel.deleteMany({baseUrl});

        //check link status with concurrency control
        const limit = pLimit(this.concurrencyLimit);
         const brokenLinks: BrokenLink[] = [];
        const linkChecks = Array.from(allLinks.entries()).map(([url, sourcePages]) =>
            limit(async () => {

                /////// need start work from monday

            })
        )

        return{
            message: 'Broken link crawl completed',
            pagesCrawled: pageUrls.length,
            brokenLinksFound: brokenLinks.length,


        }

    }
}