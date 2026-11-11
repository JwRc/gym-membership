import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN = 8;

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' }) email: string;
  @IsString() @MinLength(1, { message: 'Informe a senha.' }) @MaxLength(200) password: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1, { message: 'Informe a senha atual.' }) currentPassword: string;
  @IsString() @MinLength(PASSWORD_MIN, { message: `A nova senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.` }) @MaxLength(200) newPassword: string;
}
