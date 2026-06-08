import { Module } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notification/notification.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [NotificationModule, EmailModule],
  controllers: [BookingController],
  providers: [BookingService, AccessTokenGuard],
})
export class BookingModule {}
