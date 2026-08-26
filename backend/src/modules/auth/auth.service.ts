import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { FamiliesService } from '../families/families.service';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { AuthResponseDto } from './dtos/auth-response.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private familiesService: FamiliesService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    // Validate password confirmation
    if (registerDto.password !== registerDto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Create user
    const user = await this.usersService.create({
      name: registerDto.name,
      email: registerDto.email,
      password: registerDto.password,
    });

    // Todo usuário precisa de uma família: é o escopo de despesas, receitas e de
    // toda a inteligência financeira — sem ela esses endpoints respondem 403.
    // Quem for se juntar à família de outra pessoa pode sair desta depois.
    const family = await this.familiesService.createDefaultForUser(user);
    user.familyId = family.id;

    // Generate tokens
    const tokens = this.generateTokens(user);

    // Update refresh token in database
    await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const tokens = this.generateTokens(user);

    // Update refresh token in database
    await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return null;
    }

    const isPasswordValid = await this.usersService.validatePassword(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async refresh(user: User, refreshToken: string): Promise<AuthResponseDto> {
    // Verify refresh token is valid
    if (user.refreshToken !== refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generate new tokens
    const tokens = this.generateTokens(user);

    // Update refresh token in database
    await this.usersService.updateRefreshToken(user.id, tokens.refresh_token);

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async logout(user: User): Promise<void> {
    await this.usersService.updateRefreshToken(user.id, null);
  }

  private generateTokens(user: User): {
    access_token: string;
    refresh_token: string;
  } {
    const payload = { sub: user.id, email: user.email };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: (this.configService.get<string>('JWT_EXPIRATION') || '7d') as any,
    });

    const refresh_token = this.jwtService.sign(payload, {
      expiresIn: '30d' as any,
    });

    return { access_token, refresh_token };
  }
}
