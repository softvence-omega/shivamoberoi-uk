import { Controller, Post, Body, Request, Put, UnauthorizedException, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthService, AuthResponse } from './auth.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MigrationService } from 'src/migration.service';
import { ChangePasswordDto, ForgetPasswordDto, LoginDto, RegisterDto, VerifyForgetPasswordDto } from 'src/dto/auth.dto';
// import { RegisterDto } from './dto/register.dto';
// import { LoginDto } from './dto/login.dto';
// import { ChangePasswordDto } from './dto/change-password.dto';
// import { ForgetPasswordDto } from './dto/forget-password.dto';
// import { VerifyForgetPasswordDto } from './dto/verify-forget-password.dto';
// import { MigrationService } from '../migration/migration.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly migrationService: MigrationService,
  ) {}

  @Post('register')
  @UsePipes(new ValidationPipe({ transform: true }))
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(
      registerDto.username,
      registerDto.password,
      registerDto.email,
    );
  }

  @Post('login')
  @UsePipes(new ValidationPipe({ transform: true }))
  async login(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(loginDto.username, loginDto.password);
  }

  @Post('change-password')
  @ApiBearerAuth()
  async changePassword(
    @Request() req,
    @Body(new ValidationPipe({ transform: true })) changePasswordDto: ChangePasswordDto,
  ): Promise<AuthResponse> {
    if (!req.user?.sub) {
      throw new UnauthorizedException('Authentication failed: user.sub is undefined');
    }
    return this.authService.changePassword(
      req.user.sub,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  @Post('forget-password')
  @UsePipes(new ValidationPipe({ transform: true }))
  async forgetPassword(@Body() forgetPasswordDto: ForgetPasswordDto): Promise<AuthResponse> {
    return this.authService.forgetPassword(forgetPasswordDto.email);
  }

  @Post('verify-forget-password')
  @UsePipes(new ValidationPipe({ transform: true }))
  async verifyForgetPassword(@Body() verifyForgetPasswordDto: VerifyForgetPasswordDto): Promise<AuthResponse> {
    return this.authService.verifyForgetPassword(
      verifyForgetPasswordDto.email,
      verifyForgetPasswordDto.code,
      verifyForgetPasswordDto.newPassword,
    );
  }

  @Put('migrate')
  @ApiBearerAuth()
  async runMigrations(): Promise<{ status: string; message: string }> {
    await this.migrationService.runMigrations();
    return { status: 'success', message: 'Migrations applied' };
  }
}