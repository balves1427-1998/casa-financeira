import { Exclude } from 'class-transformer';

export class UserDto {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'user';
  emailVerified: boolean;

  @Exclude()
  password: string;

  @Exclude()
  refreshToken?: string;

  createdAt: Date;
  updatedAt: Date;
}
