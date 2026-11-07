import { ArrayMinSize, IsArray, IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' }) email: string;
  @IsString() @MinLength(1, { message: 'Informe a senha.' }) password: string;
}

export class RegisterAcademyDto {
  @IsString() @MinLength(2, { message: 'Informe o nome da academia.' }) academyName: string;
  @IsString() @MinLength(3, { message: 'Informe seu nome.' }) name: string;
  @IsEmail({}, { message: 'Informe um e-mail válido.' }) email: string;
  @IsString() @MinLength(6, { message: 'A senha precisa ter pelo menos 6 caracteres.' }) password: string;
  @IsArray() @ArrayMinSize(1, { message: 'Escolha pelo menos uma modalidade.' }) @IsString({ each: true }) disciplines: string[];
}

export class RegisterStudentDto {
  @IsString() @MinLength(3, { message: 'Informe o código da academia.' }) code: string;
  @IsString() @MinLength(3, { message: 'Informe seu nome.' }) name: string;
  @IsEmail({}, { message: 'Informe um e-mail válido.' }) email: string;
  @IsString() @MinLength(6, { message: 'A senha precisa ter pelo menos 6 caracteres.' }) password: string;
}
