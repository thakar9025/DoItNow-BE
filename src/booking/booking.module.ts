import { Module } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { NotificationModule } from '../notification/notification.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [NotificationModule],
  controllers: [BookingController],
  providers: [BookingService, AccessTokenGuard],
})
export class BookingModule {}
