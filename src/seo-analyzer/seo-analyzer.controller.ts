// import { Controller, Get, Query, UseGuards, ApiBearerAuth, ApiTags } from '@nestjs/common';

// import { AuthGuard } from '@nestjs/passport';

import { Controller, Get, Query, UseGuards  } from '@nestjs/common';
import { ApiBearerAuth,ApiTags } from '@nestjs/swagger';
import { SeoAnalyzerService } from './seo-analyzer.service';
import { AuthGuard } from '@nestjs/passport';
import { CachedSeoAnalysis } from './seo-analyzer.service';

// @ApiTags('seo')
// @Controller('seo')
// export class SeoAnalyzerController {
//   constructor(private readonly seoAnalyzerService: SeoAnalyzerService) {}

//   @Get('analyze')
//   @UseGuards(AuthGuard('jwt'))
//   @ApiBearerAuth()
//   async analyzeSeo(@Query('url') url: string): Promise<CachedSeoAnalysis | { status: string; message?: string }> {
//     return this.seoAnalyzerService.analyzeSeo(url);
//   }
// }

@ApiTags('seo')
@Controller('seo')
export class SeoAnalyzerController {
  constructor(private readonly seoAnalyzerService: SeoAnalyzerService) {}

  @Get('analyze')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async analyzeSeo(@Query('url') url: string) {
    return this.seoAnalyzerService.analyzeSeo(url);
  }
}