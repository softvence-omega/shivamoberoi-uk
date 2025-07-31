import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Injectable, Logger,Inject } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';
import * as nodemailer from 'nodemailer';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { error } from 'console';

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
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.JWT_EXPIRES_IN = this.configService.get<string>('JWT_EXPIRES_IN', '1h');
    this.JWT_SECRET = this.configService.get<string>('JWT_SECRET', 'defaultSecret');
  }

  async register(
    username: string,
    password: string,
    email: string,
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
        email: email.trim(),
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


  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthResponse> {
   try {
      const user = await this.userModel.findById(userId).select('+password').lean();
      if (!user) {
        return { state: false, message: 'User not found' };
      }

      if (!await bcrypt.compare(currentPassword, user.password)) {
        return { state: false, message: 'Current password is incorrect' };
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
      await this.userModel.findByIdAndUpdate(userId, { password: hashedNewPassword });

      return {
        state: true,
        message: 'Password changed successfully',
      };
    } catch (error) {
      this.logger.error(`Password change failed for user ID ${userId}`, error.stack);
      return { state: false, message: 'Password change failed due to server issues' };
    }
  }
  async forgetPassword(email: string): Promise<AuthResponse> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const user = await this.userModel.findOne({ email: normalizedEmail }).lean();
      if (!user) {
        return { state: false, message: 'Email not found' };
      }

      const verificationCode = this.generateVerificationCode(); 
      await this.cacheManager.set(`forget_${normalizedEmail}`, verificationCode, 86400000);

      await this.sendVerificationEmail(normalizedEmail, verificationCode);

      return {
        state: true,
        message: 'Verification code sent to your email',
      };
    } catch (error) {
      this.logger.error(`Forget password failed for email ${email}`, error.stack);
      return { state: false, message: 'Failed to send verification code' };
    }
  }

  async verifyForgetPassword(email: string, code: string): Promise<AuthResponse> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const cachedCode  = await this.cacheManager.get(`forget_${normalizedEmail}`);
  
      if(!cachedCode || cachedCode!== code) {
        return {state: false, message: 'Invalid or expired verification code. Please try again.'};
      }
      return {
        state: true,
        message: 'Validation successful, you can now reset your password',
      }

    } catch(err) {
      this.logger.error(`Failed to Verify Code _${email}`, err);
      return { state: false, message: " Password reset failed due to server issues"}

    }
  }


async setNewPassword(email: string, newPassword: string): Promise<AuthResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    
    try {
        const hashedNewPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
        
        const result = await this.userModel.findOneAndUpdate(
            { email: normalizedEmail },
            { password: hashedNewPassword },
            { new: true } // Returns the updated document
        );

        if (!result) {
            this.logger.error(`User not found with email: ${email}`);
            return { 
                state: false, 
                message: "Password reset failed - user not found" 
            };
        }

        await this.cacheManager.del(`forget_${normalizedEmail}`);
        
        return {
            state: true,
            message: "Your new password was successfully set"
        };

    } catch (err) {
        this.logger.error(`Failed to set new password for ${email}`, err);
        return { 
            state: false, 
            message: "Password reset failed due to server issues" 
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

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }


  private async sendVerificationEmail(email: string, code: string): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: parseInt(this.configService.get<string>('MAIL_PORT', '587'),10),
      secure:false,
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
    const mailOptions = {
      from: this.configService.get<string>('MAIL_USER'),
      to: email,
      subject: 'Password Reset Verification Code',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Verification</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
            }
            .container {
              width: 100%;
              max-width: 600px;
              margin: 0 auto;
              background-color: #f0f0f0;
              border: 1px solid #e0e0e0;
              border-radius: 5px;
            }
            .header {
              background-color: #003087;
              color: #ffffff;
              text-align: center;
              padding: 20px;
            }
            .header img {
              max-width: 150px;
            }
            .content {
              padding: 20px;
              color: #333333;
            }
            .code {
              font-size: 24px;
              font-weight: bold;
              color: #003087;
              text-align: center;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              padding: 10px;
              font-size: 12px;
              color: #777777;
              background-color: #f0f0f0;
            }
            a {
              color: #003087;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://nidbd.org/logo.png" alt="NIDBD Logo" style="display: block; margin: 0 auto;">
              <h1>Password Reset Verification</h1>
            </div>
            <div class="content">
              <p>Dear User,</p>
              <p>We received a request to reset your password. Please use the verification code below to proceed:</p>
              <div class="code">${code}</div>
              <p>This code is valid for 1 hour. If you did not request a password reset, please ignore this email or contact support at <a href="mailto:support@nidbd.org">support@nidbd.org</a>.</p>
            </div>
            <div class="footer">
              <p>&copy; 2025 National Identity Database. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };
    await transporter.sendMail(mailOptions);
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