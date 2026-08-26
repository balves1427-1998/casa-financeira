import {
  IsString,
  IsOptional,
  IsEmail,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateFamilyDto {
  @IsString()
  @MinLength(2, { message: 'O nome da família deve ter ao menos 2 caracteres' })
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateFamilyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Adiciona um usuário já cadastrado à família, identificado pelo e-mail.
 *
 * Usa e-mail em vez de id porque é o dado que uma pessoa consegue informar
 * sobre o cônjuge/parceiro sem precisar consultar o banco.
 */
export class AddFamilyMemberDto {
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email: string;
}

export class FamilyMemberDto {
  id: string;
  name: string;
  email: string;
  role: string;
}

export class FamilyDto {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  members: FamilyMemberDto[];
  memberCount: number;
  createdAt: Date;
}
