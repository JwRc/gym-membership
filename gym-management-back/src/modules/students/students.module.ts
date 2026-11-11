import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { InvoicesService } from './invoices.service';
import { StudentImportController } from './import/student-import.controller';
import { StudentImportService } from './import/student-import.service';

@Module({
  // StudentImportController antes, para /students/import não cair em /students/:id
  controllers: [StudentImportController, StudentsController],
  providers: [StudentsService, InvoicesService, StudentImportService],
  exports: [InvoicesService, StudentsService],
})
export class StudentsModule {}
