import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User } from '../../modules/users/entities/user.entity';

/**
 * Resolve o `familyId` do usuário autenticado.
 *
 * Todo o módulo de inteligência financeira é escopado por família. Antes deste
 * decorator, os controllers liam `@Param('familyId')` de rotas que nunca
 * declararam esse parâmetro, então os serviços sempre recebiam `undefined` e
 * nenhuma consulta retornava dados.
 *
 * A família vem do usuário autenticado (`users.family_id`), garantindo que um
 * usuário nunca consiga ler dados de outra família passando um id na URL.
 * Se o usuário ainda não estiver associado a uma família, a requisição é
 * rejeitada com 403 em vez de seguir com um escopo indefinido.
 */
export const CurrentFamily = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user: User | undefined = request.user;

    if (!user?.familyId) {
      throw new ForbiddenException(
        'Usuário não está associado a nenhuma família. ' +
          'Associe o usuário a uma família para acessar a inteligência financeira.',
      );
    }

    return user.familyId;
  },
);
