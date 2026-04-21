import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminBookingController } from './admin-booking.controller';
import { AdminBookingService } from './admin-booking.service';

@Module({
  controllers: [AdminBookingController],
  providers: [AdminBookingService, JwtAuthGuard],
})
export class AdminBookingModule {}
