import { Controller, Get, HttpCode, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Can, CurrentUser, NoAutoAudit } from '../../../common/auth/decorators';
import { AuthUser } from '../../../common/auth/auth.types';
import { MAX_FILE_BYTES } from './sheet-reader';
import { StudentImportService } from './student-import.service';

const upload = FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

@Can('students.import')
@Controller('students/import')
export class StudentImportController {
  constructor(private readonly svc: StudentImportService) {}

  @Get('template')
  async template(@CurrentUser() u: AuthUser) {
    const buf = await this.svc.template(u.tenantId);
    return new StreamableFile(buf, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="modelo-importacao-alunos.xlsx"',
    });
  }

  @Post('analyze') @HttpCode(200) @NoAutoAudit()
  @UseInterceptors(upload)
  async analyze(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.svc.summary(await this.svc.analyze(u.tenantId, file));
  }

  @Post() @NoAutoAudit()
  @UseInterceptors(upload)
  import(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.svc.import(u, file);
  }
}
