import { BadRequestException, Body, Controller, Get, Injectable, Logger, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { Can, CurrentUser } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma.service';
import { PAYMENT_LABEL, dateOnly, iso, money, monthRange, num, today } from '../../common/util';
import { PRODUCT_CATEGORIES } from '../../domain/catalog';

class ProductDto {
  @IsString() @MinLength(2) name: string;
  @IsString() category: string;
  @IsNumber() @Min(0) price: number;
  @IsNumber() @Min(0) cost: number;
  @IsInt() @Min(0) stock: number;
  @IsInt() @Min(0) minStock: number;
}
class SaleItemDto {
  @IsString() productId: string;
  @IsInt() @Min(1) qty: number;
}
class SaleDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SaleItemDto) items: SaleItemDto[];
  @IsOptional() @IsString() studentId?: string;
  @IsEnum(PaymentMethod) paymentMethod: PaymentMethod;
  @IsOptional() @IsString() date?: string;
}

@Injectable()
export class StoreService {
  private readonly log = new Logger(StoreService.name);
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string) {
    const t = today();
    const range = monthRange(t.getUTCFullYear(), t.getUTCMonth() + 1);
    const [products, sales] = await Promise.all([
      this.prisma.product.findMany({ where: { tenantId }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      this.prisma.sale.findMany({
        where: { tenantId },
        include: { items: { include: { product: { select: { name: true } } } }, student: { select: { name: true } } },
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        take: 200,
      }),
    ]);
    const monthSales = sales.filter((s) => s.date >= range.gte && s.date < range.lt);
    const soldMonth = new Map<string, number>();
    monthSales.forEach((s) => s.items.forEach((i) => soldMonth.set(i.productId, (soldMonth.get(i.productId) ?? 0) + i.qty)));
    const revenue = monthSales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.qty * num(i.unitPrice), 0), 0);
    const cost = monthSales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.qty * num(i.unitCost), 0), 0);
    const units = monthSales.reduce((a, s) => a + s.items.reduce((b, i) => b + i.qty, 0), 0);
    const stockValue = products.reduce((a, p) => a + p.stock * num(p.cost), 0);
    return {
      categories: PRODUCT_CATEGORIES,
      summary: {
        revenue: money(revenue), salesCount: monthSales.length, units,
        cost: money(cost), profit: money(revenue - cost), margin: revenue ? (revenue - cost) / revenue : 0,
        stockValue: money(stockValue), stockUnits: products.reduce((a, p) => a + p.stock, 0),
        lowStock: products.filter((p) => p.stock <= p.minStock).length,
      },
      products: products.map((p) => ({
        id: p.id, name: p.name, category: p.category, price: num(p.price), cost: num(p.cost),
        margin: num(p.price) ? (num(p.price) - num(p.cost)) / num(p.price) : 0,
        stock: p.stock, minStock: p.minStock, low: p.stock <= p.minStock, soldMonth: soldMonth.get(p.id) ?? 0,
      })),
      sales: sales.map((s) => {
        const total = s.items.reduce((a, i) => a + i.qty * num(i.unitPrice), 0);
        const c = s.items.reduce((a, i) => a + i.qty * num(i.unitCost), 0);
        return {
          id: s.id, number: s.number, date: iso(s.date),
          items: s.items.map((i) => `${i.qty > 1 ? i.qty + '× ' : ''}${i.product.name}`).join(', '),
          student: s.student?.name ?? null, paymentMethod: PAYMENT_LABEL[s.paymentMethod],
          total: money(total), profit: money(total - c),
        };
      }),
    };
  }

  async createProduct(tenantId: string, dto: ProductDto) {
    const p = await this.prisma.product.create({ data: { tenantId, ...dto, name: dto.name.trim() } });
    return { id: p.id };
  }

  async updateProduct(tenantId: string, id: string, dto: ProductDto) {
    const p = await this.prisma.product.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Produto não encontrado.');
    await this.prisma.product.update({ where: { id }, data: dto });
    return { id };
  }

  /** Venda: baixa o estoque e lança entrada (Loja) + saída (Custo de produtos) no financeiro. */
  async createSale(tenantId: string, dto: SaleDto) {
    const ids = [...new Set(dto.items.map((i) => i.productId))];
    if (ids.length !== dto.items.length) throw new BadRequestException('Produto repetido na venda.');
    const products = await this.prisma.product.findMany({ where: { tenantId, id: { in: ids } } });
    if (products.length !== ids.length) throw new BadRequestException('Produto inválido.');
    const P = new Map(products.map((p) => [p.id, p]));
    for (const i of dto.items) {
      const p = P.get(i.productId)!;
      if (p.stock < i.qty) throw new BadRequestException(`Estoque insuficiente de ${p.name} (${p.stock} em estoque).`);
    }
    if (dto.studentId && !(await this.prisma.student.findFirst({ where: { id: dto.studentId, tenantId, anonymizedAt: null } })))
      throw new BadRequestException('Aluno inválido.');

    const date = dto.date ? dateOnly(dto.date) : today();
    const total = money(dto.items.reduce((a, i) => a + i.qty * num(P.get(i.productId)!.price), 0));
    const cost = money(dto.items.reduce((a, i) => a + i.qty * num(P.get(i.productId)!.cost), 0));
    const label = dto.items.map((i) => `${i.qty > 1 ? i.qty + '× ' : ''}${P.get(i.productId)!.name}`).join(', ');

    const sale = await this.prisma.$transaction(async (tx) => {
      const last = await tx.sale.aggregate({ where: { tenantId }, _max: { number: true } });
      const sale = await tx.sale.create({
        data: {
          tenantId, number: (last._max.number ?? 0) + 1, date, studentId: dto.studentId || null, paymentMethod: dto.paymentMethod,
          items: { create: dto.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: P.get(i.productId)!.price, unitCost: P.get(i.productId)!.cost })) },
        },
      });
      for (const i of dto.items) {
        // decremento condicional evita estoque negativo em vendas simultâneas
        const r = await tx.product.updateMany({ where: { id: i.productId, stock: { gte: i.qty } }, data: { stock: { decrement: i.qty } } });
        if (!r.count) throw new BadRequestException(`Estoque insuficiente de ${P.get(i.productId)!.name}.`);
      }
      await tx.transaction.createMany({
        data: [
          { tenantId, saleId: sale.id, date, type: 'INCOME', status: 'PAID', source: 'SALE', category: 'Loja', amount: total, description: `Venda nº ${sale.number}`, note: label },
          { tenantId, saleId: sale.id, date, type: 'EXPENSE', status: 'PAID', source: 'SALE', category: 'Custo de produtos', amount: cost, description: `Custo · venda nº ${sale.number}`, note: label },
        ],
      });
      return sale;
    });

    const low = await this.prisma.product.findMany({ where: { id: { in: ids } } });
    // aviso de estoque baixo: na V1 só no log (notificações ficam para a V2)
    for (const p of low.filter((p) => p.stock <= p.minStock)) this.log.warn(`Estoque baixo: ${p.name} (${p.stock} un.) · academia ${tenantId}`);
    return { id: sale.id, number: sale.number, total, cost, profit: money(total - cost) };
  }
}

@Can('store.read')
@Controller('store')
export class StoreController {
  constructor(private readonly svc: StoreService) {}

  @Get() overview(@CurrentUser() u: AuthUser) {
    return this.svc.overview(u.tenantId);
  }
  @Can('store.write') @Post('products') createProduct(@CurrentUser() u: AuthUser, @Body() dto: ProductDto) {
    return this.svc.createProduct(u.tenantId, dto);
  }
  @Can('store.write') @Patch('products/:id') updateProduct(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ProductDto) {
    return this.svc.updateProduct(u.tenantId, id, dto);
  }
  @Can('store.sell') @Post('sales') createSale(@CurrentUser() u: AuthUser, @Body() dto: SaleDto) {
    return this.svc.createSale(u.tenantId, dto);
  }
}

@Module({
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule {}
