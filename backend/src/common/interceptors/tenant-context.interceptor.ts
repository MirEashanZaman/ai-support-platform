import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from '../context/tenant-context.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request?.user;

    if (user?.tenantId) {
      return new Observable((subscriber) => {
        this.tenantContext.run(
          {
            tenantId: user.tenantId,
            userId: user.userId,
            role: user.role,
          },
          () => {
            next.handle().subscribe(subscriber);
          },
        );
      });
    }

    return next.handle();
  }
}
