import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { UsersService } from '../../modules/users/users.service';
import { AccountsService } from '../../modules/accounts/accounts.service';
import { CategoriesService } from '../../modules/categories/categories.service';
import { AccountType } from '../../modules/accounts/dtos/create-account.dto';

async function seed() {
  const app = await NestFactory.create(AppModule);

  const usersService = app.get(UsersService);
  const accountsService = app.get(AccountsService);
  const categoriesService = app.get(CategoriesService);

  console.log('🌱 Seeding database...');

  try {
    // Check if data already exists
    const existingUsers = await usersService.find();
    if (existingUsers.length > 0) {
      console.log('ℹ️  Database already seeded. Skipping...');
      await app.close();
      return;
    }

    // Create default users
    console.log('Creating default users...');
    const bruno = await usersService.create({
      name: 'Bruno Alves',
      email: 'bruno@casa.com',
      password: 'senha@123',
    });

    const giovanna = await usersService.create({
      name: 'Giovanna Silva',
      email: 'giovanna@casa.com',
      password: 'senha@123',
    });

    console.log('✓ Users created');

    // Create default accounts for Bruno
    console.log('Creating default accounts...');
    const brunoChecking = await accountsService.create(bruno, {
      name: 'Conta Corrente',
      type: AccountType.CHECKING,
      institution: 'Itaú',
      initialBalance: 5000,
    });

    const brunoCreditCard = await accountsService.create(bruno, {
      name: 'Cartão Crédito Nubank',
      type: AccountType.CREDIT_CARD,
      institution: 'Nubank',
      limit: 10000,
      closingDay: 15,
      dueDay: 25,
    });

    // Create default accounts for Giovanna
    const giovannaChecking = await accountsService.create(giovanna, {
      name: 'Conta Corrente',
      type: AccountType.CHECKING,
      institution: 'Bradesco',
      initialBalance: 5000,
    });

    const giovannaCreditCard = await accountsService.create(giovanna, {
      name: 'Cartão Crédito Itaucard',
      type: AccountType.CREDIT_CARD,
      institution: 'Itaú',
      limit: 8000,
      closingDay: 10,
      dueDay: 20,
    });

    console.log('✓ Accounts created');

    // Create default categories
    console.log('Creating default categories...');
    const categories = [
      { name: 'Moradia', type: 'expense' },
      { name: 'Alimentação', type: 'expense' },
      { name: 'Supermercado', type: 'expense' },
      { name: 'Transporte', type: 'expense' },
      { name: 'Combustível', type: 'expense' },
      { name: 'Saúde', type: 'expense' },
      { name: 'Educação', type: 'expense' },
      { name: 'Lazer', type: 'expense' },
      { name: 'Compras', type: 'expense' },
      { name: 'Assinaturas', type: 'expense' },
      { name: 'Viagem', type: 'expense' },
      { name: 'Pets', type: 'expense' },
      { name: 'Impostos', type: 'expense' },
      { name: 'Seguros', type: 'expense' },
      { name: 'Investimentos', type: 'income' },
      { name: 'Salário', type: 'income' },
      { name: 'Freelance', type: 'income' },
      { name: 'Bonus', type: 'income' },
    ];

    for (const category of categories) {
      await categoriesService.create(bruno, category as any);
    }

    console.log('✓ Categories created');

    console.log('✅ Database seeding completed successfully!');
    console.log('');
    console.log('Default users created:');
    console.log('  Bruno: bruno@casa.com / senha@123');
    console.log('  Giovanna: giovanna@casa.com / senha@123');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

seed();
