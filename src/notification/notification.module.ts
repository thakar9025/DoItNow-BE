import { Module } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, AccessTokenGuard],
  exports: [NotificationService],
})
export class NotificationModule {}
