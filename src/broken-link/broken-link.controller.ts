import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';


import { AuthGuard } from '@nestjs/passport';
import { BrokenLinksService } from './broken-link.service';
import { CrawlBrokenLinksDto, GetBrokenLinksDto } from 'src/dto/broken-link.dto';

@ApiTags('broken-links')
@Controller('broken-links')
export class BrokenLinksController {
  constructor(private readonly brokenLinksService: BrokenLinksService) {}

  @Post('crawl')
//   @UseGuards(AuthGuard('jwt'))
//   @ApiBearerAuth()
  async crawlBrokenLinks(@Query(ValidationPipe) dto: CrawlBrokenLinksDto) {
    return this.brokenLinksService.crawlBrokenLinks(dto.url, dto.maxDepth);
  }

  @Get()
//   @UseGuards(AuthGuard('jwt'))
//   @ApiBearerAuth()
  async getBrokenLinks(
    @Query(ValidationPipe) { url, page, limit }: GetBrokenLinksDto,
  ) {
    const skip = (page - 1) * limit;
    return this.brokenLinksService.getBrokenLinks(url, skip, limit);
  }
}