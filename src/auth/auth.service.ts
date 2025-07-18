import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserSchema } from '../schemas/user.schema';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { exec } from 'child_process';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly SALT_ROUNDS = 10,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async register(
    username: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const existingUser = await this.userModel.exists({ username }).lean();
    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);
    const user = await this.userModel.create({
      username,
      password: hashedPassword,
    });
    return this.generateToken(user);
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.userModel
      .findOne({ username })
      .select('+password')
      .exec();

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.generateToken(user);
  }

  private generateToken(user: UserDocument): { accessToken: string } {
    const payload = {
      sub: user._id.toString(),
    };
    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1h'),
        secret: this.configService.get<string>('JWT_SECRET'),
      }),
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userModel.findById(userId).select('-password').exec();
  }
}
