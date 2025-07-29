import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
  aud?: string;
  iss?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);
  private static readonly ALGORITHM = 'HS256';

  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => req?.cookies?.access_token,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
      algorithms: [JwtStrategy.ALGORITHM],
      issuer: configService.get<string>('JWT_ISSUER', 'SHIVAMOBEROI'),
      audience: configService.get<string>('JWT_AUDIENCE', 'SHIVAMOBEROI'),
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload,
  ): Promise<{ sub: string }> {
    console.log('JWT Payload in validate:', payload);
    try {
      if (!payload?.sub || typeof payload.sub !== 'string') {
        this.logger.warn(`Malformed JWT payload: ${JSON.stringify(payload)}`);
        throw new UnauthorizedException('Invalid token structure');
      }
      return { sub: payload.sub }; // Return sub to match controller expectation
    } catch (err) {
      this.logger.error(`Validation failed`, {
        err: err.message,
        stack: err.stack,
        clientIp: req.ip,
        userAgent: req.headers['user-agent'],
      });
      throw new UnauthorizedException('Invalid authentication');
    }
  }
}