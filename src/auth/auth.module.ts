import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { User, UserSchema } from '../schemas/user.schema';
// import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy'
import { AuthService } from "./auth.service";
import * as bcrypt from "bcrypt";
import { WebsiteAnalyzerModule } from '../website-analyzer/website-analyzer.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    WebsiteAnalyzerModule,
    AuthModule,
   
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'defaultSecret',
        signOptions: { expiresIn: '60m' },
      }),
      inject: [ConfigService],
    }),
    CacheModule.register({ isGlobal: true, ttl: 3600 }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [AuthService, JwtStrategy,
    {
      provide: "BCRYPT_SERVICE", // Custom token for bcrypt
      useValue: bcrypt,
    },

  ],
  exports: [AuthService],
})
export class AuthModule {}
