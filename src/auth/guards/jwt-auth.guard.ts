import { Injectable } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';

@Injectable()
export class JwtAuthGuard extends AccessTokenGuard {}
