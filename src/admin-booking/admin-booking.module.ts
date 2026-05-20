import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationModule } from '../notification/notification.module';
import { AdminBookingController } from './admin-booking.controller';
import { AdminBookingService } from './admin-booking.service';

@Module({
  imports: [NotificationModule],
  controllers: [AdminBookingController],
  providers: [AdminBookingService, JwtAuthGuard],
})
export class AdminBookingModule {}
