import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';

export interface AuthResponse {
  state: boolean;
  message: string;
  accessToken?: string;
  user?: Omit<User, 'password'>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;
  private readonly JWT_EXPIRES_IN: string;
  private readonly JWT_SECRET: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    this.JWT_EXPIRES_IN = this.configService.get<string>('JWT_EXPIRES_IN', '1h');
    this.JWT_SECRET = this.configService.get<string>('JWT_SECRET', 'defaultSecret');
  }

  async register(
    username: string,
    password: string,
  ): Promise<AuthResponse> {
    try {
      const cleanedUsername = username.trim();
      const existingUser = await this.userModel.findOne({
        username: { $regex: new RegExp(`^${cleanedUsername}$`, 'i') }
      }).lean();

      if (existingUser) {
        return {
          state: false,
          message: 'Username already exists'
        };
      }

      const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);
      const user = await this.userModel.create({
        username: cleanedUsername,
        password: hashedPassword,
      });

      const { password: _, ...userWithoutPassword } = user.toObject();

      return {
        state: true,
        message: 'User registered successfully',
        ...this.generateToken(user),
        user: userWithoutPassword
      };
    } catch (error) {
      this.logger.error(`Registration failed for ${username}`, error.stack);
      
      if (error.code === 11000) { // MongoDB duplicate key error
        return {
          state: false,
          message: 'Username already exists'
        };
      }

      return {
        state: false,
        message: 'Registration failed due to server error'
      };
    }
  }

  async login(
    username: string,
    password: string,
  ): Promise<AuthResponse> {
    try {
      const user = await this.userModel
        .findOne({ username: username.trim() })
        .select('+password')
        .lean();

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return {
          state: false,
          message: 'Invalid credentials'
        };
      }

      const { password: _, ...userWithoutPassword } = user;

      return {
        state: true,
        message: 'User logged in successfully',
        ...this.generateToken(user),
        user: userWithoutPassword
      };
    } catch (error) {
      this.logger.error(`Login failed for ${username}`, error.stack);
      return {
        state: false,
        message: 'Login failed due to server error'
      };
    }
  }

  private generateToken(user: UserDocument | { _id: string }): { accessToken: string } {
    const payload = {
      sub: user._id.toString(),
    };
    
    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: this.JWT_EXPIRES_IN,
        secret: this.JWT_SECRET,
      }),
    };
  }

  async validateUser(userId: string): Promise<{ state: boolean; user?: Omit<User, 'password'> }> {
    try {
      const user = await this.userModel.findById(userId).select('-password').lean();
      return {
        state: !!user,
        user: user || undefined
      };
    } catch (error) {
      this.logger.error(`User validation failed for ID ${userId}`, error.stack);
      return {
        state: false
      };
    }
  }
}
// import { ConfigService } from '@nestjs/config';
// import { JwtService } from '@nestjs/jwt';
// import { InjectModel } from '@nestjs/mongoose';
// import { Model } from 'mongoose';
// // import { User, UserDocument } from '../schemas/user.schema';
// import {
//   ConflictException,
//   Injectable,
//   UnauthorizedException,
//   Inject,
//   Logger,
// } from '@nestjs/common';
// import * as bcrypt from 'bcrypt';
// import { User, UserDocument } from '../schemas/user.schema';
// // import { User } from 'dist/schemas/user.schema';

// export interface AuthResponse {
//   state: boolean;
//   message: string;
//   accessToken?: string;
// }

// @Injectable()
// export class AuthService {
//   private readonly logger = new Logger(AuthService.name);
//   private readonly SALT_ROUNDS = 10;
//   private readonly JWT_EXPIRES_IN: string;
//   private readonly JWT_SECRET: string;

//   constructor(
//     private readonly jwtService: JwtService,
//     private readonly configService: ConfigService,
//     @Inject('BCRYPT_SERVICE') private readonly bcryptService: typeof bcrypt,
//     @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
//   ) {
//     this.JWT_EXPIRES_IN = this.configService.get<string>('JWT_EXPIRES_IN', '1h');
//     this.JWT_SECRET = this.configService.get<string>('JWT_SECRET', 'defaultSecret');
//   }

//   async register(
//     username: string,
//     password: string,
//   ): Promise<AuthResponse> {
//     try {
//       const existingUser = await this.userModel.findOne({ username }).lean();
//       if (existingUser) {
//         return {
//           state: false,
//           message: 'Username already exists'
//         };
//       }

//       const hashedPassword = await this.bcryptService.hash(password, this.SALT_ROUNDS);
//       const user = await this.userModel.create({
//         username,
//         password: hashedPassword,
//       });

//       return {
//         state: true,
//         message: 'User registered successfully',
//         ...this.generateToken(user),
//       };
//     } catch (error) {
//       this.logger.error(`Registration failed for ${username}`, error.stack);
//       return {
//         state: false,
//         message: 'Registration failed due to server issues'
//       };
//     }
//   }

//   async login(
//     username: string,
//     password: string,
//   ): Promise<AuthResponse> {
//     try {
//       const user = await this.userModel
//         .findOne({ username })
//         .select('+password')
//         .lean();

//       if (!user || !(await this.bcryptService.compare(password, user.password))) {
//         return {
//           state: false,
//           message: 'Invalid credentials'
//         };
//       }

//       return {
//         state: true,
//         message: 'User logged in successfully',
//         ...this.generateToken(user),
//       };
//     } catch (error) {
//       this.logger.error(`Login failed for ${username}`, error.stack);
//       return {
//         state: false,
//         message: 'Login failed due to server issues'
//       };
//     }
//   }

//   private generateToken(user: UserDocument | { _id: string }): { accessToken: string } {
//     const payload = {
//       sub: user._id.toString(),
//     };
    
//     return {
//       accessToken: this.jwtService.sign(payload, {
//         expiresIn: this.JWT_EXPIRES_IN,
//         secret: this.JWT_SECRET,
//       }),
//     };
//   }

//   async validateUser(userId: string): Promise<{ state: boolean; user?: Omit<User, 'password'> }> {
//     try {
//       const user = await this.userModel.findById(userId).select('-password').lean();
//       return {
//         state: !!user,
//         user: user || undefined
//       };
//     } catch (error) {
//       this.logger.error(`User validation failed for ID ${userId}`, error.stack);
//       return {
//         state: false
//       };
//     }
//   }
// }