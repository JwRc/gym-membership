import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { InvoicesService } from './invoices.service';

@Module({ controllers: [StudentsController], providers: [StudentsService, InvoicesService], exports: [InvoicesService, StudentsService] })
export class StudentsModule {}
