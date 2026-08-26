import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dtos/create-category.dto';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetCurrentUser() user: User,
    @Body() createCategoryDto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(user, createCategoryDto);
  }

  @Get()
  async findAll(
    @GetCurrentUser() user: User,
    @Query('type') type?: 'income' | 'expense',
  ) {
    return this.categoriesService.findAll(user, type);
  }

  @Get('tree')
  async getTreeStructure(@GetCurrentUser() user: User) {
    return this.categoriesService.getTreeStructure(user);
  }

  @Get('defaults/create')
  @HttpCode(HttpStatus.CREATED)
  async createDefaults(@GetCurrentUser() user: User) {
    return this.categoriesService.getDefaultCategories(user);
  }

  @Get('budget-status')
  async getBudgetStatus(@GetCurrentUser() user: User) {
    return this.categoriesService.getBudgetStatus(user);
  }

  @Get('spending/:categoryId/:month/:year')
  async getCategorySpending(
    @GetCurrentUser() user: User,
    @Param('categoryId') categoryId: string,
    @Param('month') month: string,
    @Param('year') year: string,
  ) {
    const spending = await this.categoriesService.getCategorySpending(
      user.id,
      categoryId,
      parseInt(month),
      parseInt(year),
    );
    return { spending };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    return this.categoriesService.findOne(id, user);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, user, updateCategoryDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @GetCurrentUser() user: User,
  ) {
    await this.categoriesService.delete(id, user);
  }
}
