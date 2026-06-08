import { Module } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController],
  providers: [SupportService, AccessTokenGuard],
})
export class SupportModule {}
