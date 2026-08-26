import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@GetCurrentUser() user: User) {
    return user;
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getUserById(@GetCurrentUser() currentUser: User) {
    return currentUser;
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @GetCurrentUser() currentUser: User,
    @Body() updateData: Partial<User>,
  ) {
    // Prevent updating sensitive fields
    delete updateData.password;
    delete updateData.role;
    delete updateData.email;

    return this.usersService.update(currentUser.id, updateData);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@GetCurrentUser() currentUser: User) {
    await this.usersService.update(currentUser.id, {
      deletedAt: new Date(),
    });
  }
}
