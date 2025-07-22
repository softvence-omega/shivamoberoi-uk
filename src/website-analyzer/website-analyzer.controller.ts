import { Controller, Get, Query, Post, Body, Put, UseGuards, ValidationPipe } from '@nestjs/common';
import { WebsiteAnalyzerService } from './website-analyzer.service';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth/auth.service';
import { MigrationService } from '../migration.service';
import { RegisterDto, LoginDto } from '../dto/auth.dto';
import { ApiTags,ApiBearerAuth } from "@nestjs/swagger";
@ApiTags('analyze')
@Controller('analyze')
export class WebsiteAnalyzerController {
  constructor(
    private readonly websiteAnalyzerService: WebsiteAnalyzerService,
    private authService: AuthService,
    private migrationService: MigrationService,
  ) {}

  @Get('website')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async analyzeWebsite(@Query('url') url: string) {
    return this.websiteAnalyzerService.analyzeWebsite(url);
  }

  @Get('keywords')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async searchKeywords(@Query('url') url: string) {
    return this.websiteAnalyzerService.searchKeywords(url);
  }

  @Post('register')
  async register(@Body(ValidationPipe) registerDto: RegisterDto) {
    return this.authService.register(registerDto.username, registerDto.password);
  }

  @Get('login')
  async login(@Query(ValidationPipe) loginDto: LoginDto) {
    return this.authService.validateUser(loginDto.username,);
  }

  @Put('migrate')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async runMigrations() {
    await this.migrationService.runMigrations();
    return { status: 'success', message: 'Migrations applied' };
  }
}