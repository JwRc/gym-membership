import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class LaunchInvoicesDto {
  @IsInt() @Min(2000) year: number;
  @IsInt() @Min(1) @Max(12) month: number;
  @IsIn([1, 3, 6, 12]) repeat: number;
  @IsNumber() @Min(0) amount: number;
  @IsString() dueDate: string; // vencimento do primeiro mês
  @IsBoolean() paid: boolean;
  @IsOptional() @IsString() paidAt?: string;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
}

export class PayInvoiceDto {
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() paidAt?: string;
}

export class GenerateInvoicesDto {
  @IsInt() @Min(2000) year: number;
  @IsInt() @Min(1) @Max(12) month: number;
}
