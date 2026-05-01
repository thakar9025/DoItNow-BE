import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminBookingService } from './admin-booking.service';
import { ApproveBookingDto } from './dto/approve-booking.dto';
import { PaginationDto } from './dto/pagination.dto';
import { RejectBookingDto } from './dto/reject-booking.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin/bookings')
export class AdminBookingController {
  constructor(private readonly adminBookingService: AdminBookingService) {}

  @Get()
  getBookings(@Req() request: AuthenticatedRequest, @Query() query: PaginationDto) {
    const userId = request.auth.payload.userId;
    return this.adminBookingService.getBookings(userId, query);
  }

  @Patch(':id/approve')
  approveBooking(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ApproveBookingDto,
  ) {
    const userId = request.auth.payload.userId;
    return this.adminBookingService.approveBooking(userId, id, body);
  }

  @Patch(':id/reject')
  rejectBooking(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: RejectBookingDto,
  ) {
    const userId = request.auth.payload.userId;
    return this.adminBookingService.rejectBooking(userId, id, body);
  }

  @Patch(':id/complete')
  completeBooking(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const userId = request.auth.payload.userId;
    return this.adminBookingService.completeBooking(userId, id);
  }
}
