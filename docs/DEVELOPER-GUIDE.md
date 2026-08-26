# Casa Financeira - Developer Guide

## 🎯 Project Overview

Casa Financeira is a complete home financial management system for two people (Bruno and Giovanna) with 30+ features including:
- Financial dashboard with KPIs
- Income/expense tracking
- Automatic PDF import with AI categorization
- Cash flow analysis
- Financial forecasting
- Goal tracking
- Automated alerts

**Tech Stack:**
- Backend: NestJS + PostgreSQL + TypeORM
- Frontend: Next.js + React + Tailwind CSS
- State: Zustand + localStorage
- Auth: JWT tokens + bcryptjs

---

## 📦 Quick Setup

### Prerequisites:
- Node.js 18+
- Docker & Docker Compose
- Git

### First-time Setup:
```bash
# Mac/Linux
./setup.sh

# Windows
setup.bat
```

This will:
1. Create .env file
2. Start Docker containers
3. Install all dependencies
4. Run migrations
5. Seed initial data

### Development:
```bash
# Mac/Linux
./dev.sh

# Windows
dev.bat
```

Or manually:
```bash
# Terminal 1: Backend
cd backend
npm run start:dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

---

## 🏗️ Architecture

### Backend Structure:
```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/          - JWT authentication
│   │   ├── users/         - User management
│   │   ├── accounts/      - Bank accounts & credit cards
│   │   ├── receipts/      - Income tracking
│   │   ├── expenses/      - Expense tracking
│   │   ├── categories/    - Category management
│   │   └── [others]
│   ├── common/
│   │   ├── decorators/    - Custom decorators (@GetCurrentUser)
│   │   ├── guards/        - Route guards
│   │   └── exceptions/    - Global exception handling
│   └── database/
│       ├── migrations/    - Database migrations
│       └── seeds/         - Initial data
├── package.json
└── tsconfig.json
```

### Frontend Structure:
```
frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/        - Login/Register pages
│   │   ├── (dashboard)/   - Main app pages
│   │   └── layout.tsx     - Root layout
│   ├── components/        - Reusable React components
│   ├── hooks/             - Custom React hooks
│   ├── lib/               - Utilities (API client, etc)
│   ├── styles/            - Global styles
│   └── types/             - TypeScript types
├── package.json
└── tailwind.config.js
```

---

## 🔑 Key Concepts

### Authentication Flow:
1. User registers/logs in
2. Backend validates credentials
3. Backend returns access_token (15 min) + refresh_token
4. Frontend stores both in localStorage
5. Frontend includes token in Authorization header
6. Backend validates token via JwtAuthGuard
7. On 401, frontend auto-refreshes or redirects to login

### User Isolation:
All queries filter by `userId` to ensure users only see their own data:
```typescript
// In service
async findAll(user: User): Promise<Account[]> {
  return this.accountsRepository.find({
    where: { userId: user.id },
  });
}
```

### Module Pattern:
Each module follows this structure:
```
module/
├── entities/          - Database entities (TypeORM)
├── dtos/              - Data Transfer Objects (validation)
├── [module].service.ts - Business logic
├── [module].controller.ts - HTTP endpoints
└── [module].module.ts - Module configuration
```

---

## 📚 Common Tasks

### Creating a New API Endpoint:

**1. Create DTO:**
```typescript
// src/modules/mymodule/dtos/create-item.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateItemDto {
  @IsNotEmpty()
  @IsString()
  name: string;
}
```

**2. Update Service:**
```typescript
// src/modules/mymodule/mymodule.service.ts
async create(user: User, dto: CreateItemDto) {
  const item = this.repo.create({
    ...dto,
    userId: user.id,
  });
  return this.repo.save(item);
}
```

**3. Update Controller:**
```typescript
// src/modules/mymodule/mymodule.controller.ts
@Post()
@UseGuards(JwtAuthGuard)
async create(
  @GetCurrentUser() user: User,
  @Body() dto: CreateItemDto,
) {
  return this.service.create(user, dto);
}
```

### Using Hooks on Frontend:

```typescript
import { useExpenses } from '@/hooks/useExpenses';

export function MyComponent() {
  const { expenses, createExpense, isLoading, error } = useExpenses();

  const handleCreate = async (data) => {
    try {
      await createExpense(data);
    } catch (err) {
      console.error('Failed:', err);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {expenses.map(exp => (
        <div key={exp.id}>{exp.description}</div>
      ))}
    </div>
  );
}
```

### Database Queries:

```typescript
// Find with relations
const user = await this.usersRepository.findOne({
  where: { id: userId },
  relations: ['accounts', 'expenses'],
});

// Advanced query
const expenses = await this.expensesRepository
  .createQueryBuilder('expense')
  .where('expense.userId = :userId', { userId })
  .andWhere('expense.date >= :date', { date: startDate })
  .orderBy('expense.date', 'DESC')
  .getMany();

// Aggregation
const result = await this.expensesRepository
  .createQueryBuilder('expense')
  .where('expense.userId = :userId', { userId })
  .select('SUM(expense.amount)', 'total')
  .getRawOne();
```

---

## 🧪 Testing Workflow

### Test Data:
```
User 1:
  Email: bruno@casa.com
  Password: senha@123

User 2:
  Email: giovanna@casa.com
  Password: senha@123
```

### Manual Testing:
1. Login with test credentials
2. Create test expense/receipt
3. Verify dashboard updates
4. Test API endpoints directly:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/expenses
   ```

### API Testing:
Use Postman/Insomnia with:
- Base URL: `http://localhost:3000/api`
- Auth: Bearer token in header
- Example: `Authorization: Bearer eyJhbGc...`

---

## 🐛 Debugging

### Backend Debugging:
```bash
# Enable debug logs
DEBUG=casa-financeira npm run start:dev

# View logs
docker-compose logs backend -f

# Access database
docker-compose exec postgres psql -U postgres -d casa_financeira
```

### Frontend Debugging:
```bash
# Chrome DevTools
# 1. Open http://localhost:3001
# 2. F12 → Console tab
# 3. Check localStorage: localStorage.getItem('access_token')

# View API requests
# DevTools → Network tab
```

### Common Issues:

**"Cannot find module"**
- Run: `npm install` in that directory
- Clear cache: `rm -rf node_modules package-lock.json && npm install`

**"Connection refused" on port 3000/3001**
- Check if Docker is running: `docker ps`
- Start containers: `docker-compose up -d`

**"Token expired"**
- This is normal, frontend auto-refreshes
- If stuck on login, clear localStorage: `localStorage.clear()`

**Database errors**
- View logs: `docker-compose logs postgres`
- Reset database: `docker-compose down && docker-compose up -d`

---

## 📝 Coding Standards

### TypeScript:
- Always define types explicitly
- Use interfaces for objects
- Avoid `any` type
- Use enums for constants

```typescript
// Good
interface User {
  id: string;
  email: string;
  role: UserRole;
}

enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

// Avoid
const user: any = { id: 1 };
```

### Naming:
- Classes: PascalCase (`UserService`)
- Functions/variables: camelCase (`getUserById`)
- Constants: UPPER_SNAKE_CASE (`MAX_LOGIN_ATTEMPTS`)
- Files: kebab-case (`user.service.ts`)

### Error Handling:
```typescript
// Backend
throw new NotFoundException('User not found');
throw new BadRequestException('Invalid email');

// Frontend
try {
  await apiClient.getExpenses();
} catch (err) {
  setError(err.message);
}
```

### Comments:
```typescript
// Use for WHY, not WHAT
// Bad: increment counter by 1
count++;

// Good: prevent infinite loop on retries
if (attempts < MAX_ATTEMPTS) {
  attempts++;
}
```

---

## 🚀 Deployment Checklist

### Before Deploying:
- [ ] Update environment variables
- [ ] Run all tests
- [ ] Build for production: `npm run build`
- [ ] Run migrations: `npm run migration:run`
- [ ] Clear sensitive data from logs
- [ ] Setup SSL certificates
- [ ] Configure CORS
- [ ] Setup monitoring/logging

### Environment Variables:
```
# Backend (.env)
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
REDIS_URL=redis://...
CORS_ORIGIN=http://frontend-domain.com

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=https://api-domain.com
```

### Docker Deployment:
```bash
# Build images
docker-compose build

# Start production
docker-compose up -d

# View logs
docker-compose logs -f backend
```

---

## 📖 Useful Resources

- [NestJS Docs](https://docs.nestjs.com)
- [TypeORM Docs](https://typeorm.io)
- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [React Hook Form](https://react-hook-form.com)
- [Zod Validation](https://zod.dev)

---

## 💡 Tips & Tricks

### Frontend Performance:
```typescript
// Use useCallback to prevent re-renders
const handleClick = useCallback(() => {
  // ...
}, [dependencies]);

// Lazy load components
const Dashboard = lazy(() => import('./Dashboard'));
```

### Backend Performance:
```typescript
// Add indexes for frequently queried fields
@Index(['userId'])
@Index(['date'])

// Use select to limit columns
.select(['expense.id', 'expense.amount'])
```

### Database:
```bash
# View active connections
docker-compose exec postgres psql -U postgres -c "SELECT * FROM pg_stat_activity;"

# Backup database
docker-compose exec postgres pg_dump -U postgres casa_financeira > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres casa_financeira < backup.sql
```

---

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Follow coding standards above
3. Test thoroughly
4. Commit with clear messages: `git commit -m "feat: add expense filtering"`
5. Push to branch: `git push origin feature/my-feature`
6. Create Pull Request

---

## 📞 Support

For issues or questions:
1. Check existing documentation
2. Search GitHub issues
3. Create new issue with:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots/logs if applicable

---

Happy coding! 🎉
