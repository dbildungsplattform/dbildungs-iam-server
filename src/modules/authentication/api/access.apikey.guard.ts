import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class AccessApiKeyGuard extends AuthGuard('api-key') {
    public override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const request: Request = context.switchToHttp().getRequest<Request>();

        if (request.isAuthenticated()) {
            return true;
        } else {
            return super.canActivate(context);
        }
    }
}
