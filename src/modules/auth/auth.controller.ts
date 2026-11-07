import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { AuthService } from './auth.service';
import { CATALOG } from '../../domain/catalog';
import { LoginDto, RegisterAcademyDto, RegisterStudentDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public() @Post('register/academy')
  registerAcademy(@Body() dto: RegisterAcademyDto) {
    return this.auth.registerAcademy(dto);
  }

  @Public() @Post('register/student')
  registerStudent(@Body() dto: RegisterStudentDto) {
    return this.auth.registerStudent(dto);
  }

  /** Catálogo padrão (para o cadastro de academia, antes do login). */
  @Public() @Get('catalog')
  catalog() {
    return CATALOG.map((c) => ({ id: c.id, name: c.name, color: c.color }));
  }

  @Public() @Get('tenants/:code')
  tenantByCode(@Param('code') code: string) {
    return this.auth.tenantByCode(code);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
