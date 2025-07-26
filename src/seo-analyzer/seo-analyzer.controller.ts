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
import { URL } from 'url';
import {
  AnalyzeContentDto,
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
  // @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async generateContent(@Body(ValidationPipe) generateContentDto: GenerateContentDto) {
    return this.contentAiService.generateContent(generateContentDto.prompt, generateContentDto.url);
  }
  // @Post('generate-content')
  // @UseGuards(AuthGuard('jwt'))
  // @ApiBearerAuth()
  // async generateContent(
  //   @Body(ValidationPipe) generateContentDto: GenerateContentDto,
  // ) {
  //   return this.contentAiService.generateContent(
  //     generateContentDto.url,
  //     generateContentDto.keyword,
  //   );
  // }

  @Post('refine-content')
  // @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async refineContent(
    @Body(ValidationPipe) refineContentDto: RefineContentDto,
  ) {
    return this.contentAiService.refineContent(
      refineContentDto.url,
      refineContentDto.content,
    );
  }
  @Post('analyze-content')
  // @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async analyzeContent(
    @Body(ValidationPipe) dto: AnalyzeContentDto
  ) {
    const analysis = await this.contentAiService.analyzeContent(dto.content);
    return {
      state: "true",
      status: "success",
      message: "Content analyzed successfully",
      data: { analysis }
    };
  }
}
