import {
  Controller,
  Get,
  Query,
  Post,
  Body,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { SeoAnalyzerService } from './seo-analyzer.service';
import { ContentAiService } from '../ai/content-ai.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import {
  AnalyzeSeoDto,
  GenerateContentDto,
  RefineContentDto,
} from '../dto/seo.dto';

@ApiTags('seo')
@Controller('seo-analyzer')
export class SeoAnalyzerController {
  constructor(
    private readonly seoAnalyzerService: SeoAnalyzerService,
    private readonly contentAiService: ContentAiService,
  ) {}

  @Get('analyze')
  // @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async analyzeSeo(@Query(ValidationPipe) analyzeSeoDto: AnalyzeSeoDto) {
    return this.seoAnalyzerService.analyzeSeo(analyzeSeoDto.url);
  }

  @Post('generate-content')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async generateContent(
    @Body(ValidationPipe) generateContentDto: GenerateContentDto,
  ) {
    return this.contentAiService.generateContent(
      generateContentDto.url,
      generateContentDto.keyword,
    );
  }

  @Post('refine-content')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async refineContent(
    @Body(ValidationPipe) refineContentDto: RefineContentDto,
  ) {
    return this.contentAiService.refineContent(
      refineContentDto.url,
      refineContentDto.content,
    );
  }
}

// // import { Controller, Get, Query, UseGuards, ApiBearerAuth, ApiTags } from '@nestjs/common';

// // import { AuthGuard } from '@nestjs/passport';

// import { Controller, Get, Query, UseGuards  } from '@nestjs/common';
// import { ApiBearerAuth,ApiTags } from '@nestjs/swagger';
// import { SeoAnalyzerService } from './seo-analyzer.service';
// import { AuthGuard } from '@nestjs/passport';
// import { CachedSeoAnalysis } from './seo-analyzer.service';

// // @ApiTags('seo')
// // @Controller('seo')
// // export class SeoAnalyzerController {
// //   constructor(private readonly seoAnalyzerService: SeoAnalyzerService) {}

// //   @Get('analyze')
// //   @UseGuards(AuthGuard('jwt'))
// //   @ApiBearerAuth()
// //   async analyzeSeo(@Query('url') url: string): Promise<CachedSeoAnalysis | { status: string; message?: string }> {
// //     return this.seoAnalyzerService.analyzeSeo(url);
// //   }
// // }

// @ApiTags('seo')
// @Controller('seo')
// export class SeoAnalyzerController {
//   constructor(private readonly seoAnalyzerService: SeoAnalyzerService) {}

//   @Get('analyze')
//   @UseGuards(AuthGuard('jwt'))
//   @ApiBearerAuth()
//   async analyzeSeo(@Query('url') url: string) {
//     return this.seoAnalyzerService.analyzeSeo(url);
//   }
// }
