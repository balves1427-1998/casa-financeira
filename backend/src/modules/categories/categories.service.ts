import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dtos/create-category.dto';
import { User } from '../users/entities/user.entity';
import { Expense } from '../expenses/entities/expense.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
  ) {}

  async create(user: User, createCategoryDto: CreateCategoryDto): Promise<Category> {
    // Check if parent category exists and belongs to user
    if (createCategoryDto.parentCategoryId) {
      const parentCategory = await this.categoriesRepository.findOne({
        where: {
          id: createCategoryDto.parentCategoryId,
          userId: user.id,
        },
      });

      if (!parentCategory) {
        throw new BadRequestException('Parent category not found');
      }
    }

    const category = this.categoriesRepository.create({
      ...createCategoryDto,
      userId: user.id,
    });

    return this.categoriesRepository.save(category);
  }

  async findAll(user: User, type?: 'income' | 'expense'): Promise<Category[]> {
    const query = this.categoriesRepository
      .createQueryBuilder('category')
      .where('category.userId = :userId', { userId: user.id })
      .leftJoinAndSelect('category.subcategories', 'subcategories');

    if (type) {
      query.andWhere('category.type = :type', { type });
    }

    return query
      .orderBy('category.displayOrder', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .getMany();
  }

  async findOne(id: string, user: User): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id, userId: user.id },
      relations: ['subcategories', 'parentCategory'],
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(
    id: string,
    user: User,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.findOne(id, user);

    // Prevent updating certain fields
    const safeUpdateData = { ...updateCategoryDto };
    const updateAny = safeUpdateData as any;
    delete updateAny.userId;
    delete updateAny.createdAt;

    Object.assign(category, safeUpdateData);
    return this.categoriesRepository.save(category);
  }

  async delete(id: string, user: User): Promise<void> {
    const category = await this.findOne(id, user);

    // Check if category has subcategories
    const subcategoryCount = await this.categoriesRepository.count({
      where: { parentCategoryId: id },
    });

    if (subcategoryCount > 0) {
      throw new BadRequestException(
        'Cannot delete category with subcategories. Delete subcategories first.',
      );
    }

    await this.categoriesRepository.softRemove(category);
  }

  async getDefaultCategories(user: User): Promise<Category[]> {
    const defaultCategories = [
      { name: 'Moradia', type: 'expense' as const },
      { name: 'Alimentação', type: 'expense' as const },
      { name: 'Supermercado', type: 'expense' as const },
      { name: 'Transporte', type: 'expense' as const },
      { name: 'Combustível', type: 'expense' as const },
      { name: 'Saúde', type: 'expense' as const },
      { name: 'Educação', type: 'expense' as const },
      { name: 'Lazer', type: 'expense' as const },
      { name: 'Compras', type: 'expense' as const },
      { name: 'Assinaturas', type: 'expense' as const },
      { name: 'Viagem', type: 'expense' as const },
      { name: 'Pets', type: 'expense' as const },
      { name: 'Impostos', type: 'expense' as const },
      { name: 'Seguros', type: 'expense' as const },
      { name: 'Salário', type: 'income' as const },
      { name: 'Freelance', type: 'income' as const },
      { name: 'Bonus', type: 'income' as const },
      { name: 'Investimentos', type: 'income' as const },
    ];

    const existingCount = await this.categoriesRepository.count({
      where: { userId: user.id },
    });

    if (existingCount > 0) {
      throw new BadRequestException('User already has categories');
    }

    const categories = defaultCategories.map((cat, index) =>
      this.categoriesRepository.create({
        ...cat,
        userId: user.id,
        displayOrder: index,
      }),
    );

    return this.categoriesRepository.save(categories);
  }

  /**
   * Situação do orçamento do mês corrente para cada categoria com teto definido.
   *
   * Antes esta rota apenas devolvia a lista crua de categorias, sem nenhum
   * cálculo: o gasto realizado, o percentual e os alertas de 80%/100%
   * (previstos no escopo) nunca eram computados.
   */
  async getBudgetStatus(user: User): Promise<any[]> {
    const categories = await this.categoriesRepository
      .createQueryBuilder('category')
      .where('category.userId = :userId', { userId: user.id })
      .andWhere('category.type = :type', { type: 'expense' })
      .andWhere('category.monthlyBudget IS NOT NULL')
      .getMany();

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    return Promise.all(
      categories.map(async (category) => {
        const spent = await this.getCategorySpending(
          user.id,
          category.id,
          month,
          year,
        );
        const budget = Number(category.monthlyBudget) || 0;
        const percentage = budget > 0 ? (spent / budget) * 100 : 0;

        // Amarelo a partir de 80% do teto, vermelho ao atingir 100%.
        let status: 'ok' | 'warning' | 'exceeded' = 'ok';
        if (percentage >= 100) {
          status = 'exceeded';
        } else if (percentage >= 80) {
          status = 'warning';
        }

        return {
          categoryId: category.id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          monthlyBudget: budget,
          spent,
          remaining: budget - spent,
          percentage: Math.round(percentage * 100) / 100,
          status,
          month,
          year,
        };
      }),
    );
  }

  /**
   * Total gasto numa categoria em um mês/ano.
   *
   * As despesas guardam o NOME da categoria em `expenses.category` (não o id),
   * por isso o id recebido é primeiro resolvido para o nome correspondente.
   */
  async getCategorySpending(
    userId: string,
    categoryId: string,
    month: number,
    year: number,
  ): Promise<number> {
    const category = await this.categoriesRepository.findOne({
      where: { id: categoryId, userId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const result = await this.categoriesRepository.manager
      .createQueryBuilder(Expense, 'expense')
      .where('expense.userId = :userId', { userId })
      .andWhere('expense.category = :category', { category: category.name })
      .andWhere('EXTRACT(MONTH FROM expense.date) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM expense.date) = :year', { year })
      .select('SUM(expense.amount)', 'total')
      .getRawOne<{ total: string | null }>();

    return Number(result?.total ?? 0) || 0;
  }

  async getTreeStructure(user: User): Promise<any[]> {
    const rootCategories = await this.categoriesRepository.find({
      where: {
        userId: user.id,
        parentCategoryId: IsNull(),
      },
      relations: ['subcategories'],
      order: { displayOrder: 'ASC', name: 'ASC' },
    });

    return rootCategories;
  }
}
