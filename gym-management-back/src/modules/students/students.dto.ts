import { Type } from 'class-transformer';
import {
  Equals, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Gender, StudentStatus } from '@prisma/client';

export class StudentRankInput {
  @IsString() disciplineId: string;
  @IsInt() @Min(0) levelOrder: number;
  @IsOptional() @IsInt() @Min(0) degree?: number;
}

export class CreateStudentDto {
  @IsString() @MinLength(3) name: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsString() birthDate: string; // YYYY-MM-DD
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsNumber() @Min(0) monthlyFee: number;
  @IsInt() @Min(1) @Max(31) dueDay: number;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() planId?: string;
  @IsOptional() @IsString() medicalNotes?: string;
  @IsOptional() @IsString() guardianName?: string;
  @IsOptional() @IsString() guardianRelation?: string;
  @IsOptional() @IsString() guardianPhone?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => StudentRankInput) ranks: StudentRankInput[];
  @IsOptional() @IsArray() @IsString({ each: true }) classGroupIds?: string[];
  /** LGPD: autorização do aluno/responsável para o uso dos dados (obrigatória no cadastro) */
  @Equals(true, { message: 'Confirme o consentimento do aluno (ou responsável) para o uso dos dados.' }) consent: boolean;
}

export class UpdateStudentDto {
  @IsOptional() @IsString() @MinLength(3) name?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(StudentStatus) status?: StudentStatus;
  @IsOptional() @IsNumber() @Min(0) monthlyFee?: number;
  @IsOptional() @IsInt() @Min(1) @Max(31) dueDay?: number;
  @IsOptional() @IsString() planId?: string | null;
  @IsOptional() @IsString() medicalNotes?: string | null;
  @IsOptional() @IsString() guardianName?: string | null;
  @IsOptional() @IsString() guardianRelation?: string | null;
  @IsOptional() @IsString() guardianPhone?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) classGroupIds?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => StudentRankInput) addRanks?: StudentRankInput[];
  @IsOptional() @IsBoolean() consent?: boolean;
}

export class ListStudentsQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() disciplineId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'LOCKED', 'all']) status?: string;
  @IsOptional() @IsIn(['all', 'ok', 'today', 'late']) finance?: string;
}
