import {
  Controller,
  Get,
  Query,
  Post,
  Body,
  Put,
  UseGuards,
  Request,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { WebsiteAnalyzerService } from './website-analyzer.service';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth/auth.service';
import { MigrationService } from '../migration.service';
import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  ForgetPasswordDto,
  VerifyForgetPasswordDto,
  SetNewPasswordDto,
} from '../dto/auth.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('analyze')
@Controller('analyze')
export class WebsiteAnalyzerController {
  constructor(
    private readonly websiteAnalyzerService: WebsiteAnalyzerService,
    private authService: AuthService,
    private migrationService: MigrationService,
  ) {}

  @Get('website')
  // @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async analyzeWebsite(
    @Query(ValidationPipe) { url }: { url: string },
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    return this.websiteAnalyzerService.analyzeWebsite(url);
  }

  @Get('keywords')
  // @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async searchKeywords(
    @Query(ValidationPipe) { url }: { url: string },
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    return this.websiteAnalyzerService.searchKeywords(url, skip, limit);
  }

  @Post('register')
  async register(@Body(ValidationPipe) registerDto: RegisterDto) {
    return this.authService.register(
      registerDto.username,
      registerDto.password,
      registerDto.email,
    );
  }

  @Post('login')
  async login(@Body(ValidationPipe) loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Post('change-password')
  // @UseGuards(AuthGuard('jwt'))
  // @ApiBearerAuth()
  async changePassword(
    @Request() req,
    @Body(new ValidationPipe({ transform: true }))
    changePasswordDto: ChangePasswordDto,
  ) {
    console.log('Full request object:', req);
    console.log('req.user:', req.user);
    if (!req.user?.sub) {
      console.log(
        'Authentication failed, checking headers:',
        req.headers.authorization,
      );
      throw new UnauthorizedException(
        'Authentication failed: user.sub is undefined',
      );
    }
    console.log('User ID from token:', req.user.sub);
    const result = await this.authService.changePassword(
      req.user.sub,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
    console.log('Change password result:', result);
    return result;
  }

  @Post('forget-password')
  async forgetPassword(
    @Body(ValidationPipe) forgetPasswordDto: ForgetPasswordDto,
  ) {
    return this.authService.forgetPassword(forgetPasswordDto.email);
  }

  @Post('verify-forget-password')
  async verifyForgetPassword(
    @Body(ValidationPipe) verifyForgetPasswordDto: VerifyForgetPasswordDto,
  ) {
    return this.authService.verifyForgetPassword(
      verifyForgetPasswordDto.email,
      verifyForgetPasswordDto.code,
    );
  }
  //   @Post('clear-cache')
  // @ApiBearerAuth()
  // async clearCache(@Query('url') url?: string) {
  //   await this.websiteAnalyzerService.clearCache(url);
  //   return { status: 'success', message: 'Cache cleared' };
  // }

  @Post('set-new-password')
  async setNewPassword(
    @Body(ValidationPipe) setNewPasswordDto: SetNewPasswordDto,
  ) {
    return this.authService.setNewPassword(
      setNewPasswordDto.email,
      setNewPasswordDto.newPassword,
    );
  }

  @Put('migrate')
  // @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async runMigrations() {
    await this.migrationService.runMigrations();
    return { status: 'success', message: 'Migrations applied' };
  }
}
