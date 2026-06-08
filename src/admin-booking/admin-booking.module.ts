import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notification/notification.module';
import { AdminBookingController } from './admin-booking.controller';
import { AdminBookingService } from './admin-booking.service';

@Module({
  imports: [NotificationModule, EmailModule],
  controllers: [AdminBookingController],
  providers: [AdminBookingService, JwtAuthGuard],
})
export class AdminBookingModule {}
