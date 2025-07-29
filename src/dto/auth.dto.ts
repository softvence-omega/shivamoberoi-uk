import {
  IsNotEmpty,
  IsString,
  MinLength,
  IsEmail,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;
}
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  //   @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
  //     message: 'New password must be at least 8 characters long with letters, numbers, and special characters',
  //   })
  newPassword: string;
}

export class ForgetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class VerifyForgetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  //   @Matches(/^\d{6}$/, { message: 'Code must be a 6-digit number' })
  code: string;

  @IsString()
  @IsNotEmpty()
  //   @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
  //     message: 'New password must be at least 8 characters long with letters, numbers, and special characters',
  //   })
  newPassword: string;
}
