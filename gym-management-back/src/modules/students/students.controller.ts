import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { StudentsService } from './students.service';
import { InvoicesService } from './invoices.service';
import { CreateStudentDto, ListStudentsQuery, UpdateStudentDto } from './students.dto';
import { LaunchInvoicesDto, PayInvoiceDto } from './invoices.dto';

@Roles('ADMIN')
@Controller()
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get('students')
  list(@CurrentUser() u: AuthUser, @Query() q: ListStudentsQuery) {
    return this.students.list(u.tenantId, q);
  }

  @Post('students')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateStudentDto) {
    return this.students.create(u.tenantId, dto);
  }

  @Get('students/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.students.detail(u.tenantId, id);
  }

  @Patch('students/:id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(u.tenantId, id, dto);
  }

  @Get('students/:id/invoices')
  invoicesOf(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.invoices.forStudent(u.tenantId, id);
  }

  @Post('students/:id/invoices')
  launch(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: LaunchInvoicesDto) {
    return this.invoices.launch(u.tenantId, id, dto);
  }

  @Post('invoices/:id/pay')
  pay(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PayInvoiceDto) {
    return this.invoices.pay(u.tenantId, id, dto);
  }
}
