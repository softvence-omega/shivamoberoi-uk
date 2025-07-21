import { Controller, Post,Get,Query,UseGuards } from "@nestjs/common";
import { ApiTags,ApiBearerAuth } from "@nestjs/swagger";
import { CrawlerService } from "./crawler.service";
import { AuthGuard } from "@nestjs/passport";
import { url } from "inspector";



@ApiTags('crawler')
@Controller('crawler')
export class CrawlerController {
    constructor(private readonly crawlerService: CrawlerService) {}


    @Post('start')
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth()
    async startCrawling(@Query('url') url: string) {
        return this.crawlerService.startcrawling(url);
    }

    @Get('index')
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth()
    async getIndex(@Query('url') url: string){
        return this.crawlerService.getIndex(url);
    }

}