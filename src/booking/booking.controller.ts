import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CancelBookingRequestDto } from './dto/cancel-booking-request.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingRequestsDto } from './dto/list-booking-requests.dto';
import { BookingService } from './booking.service';

@UseGuards(AccessTokenGuard)
@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  createBooking(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateBookingDto,
  ) {
    const userId = request.auth.payload.userId;
    return this.bookingService.createBooking(userId, body);
  }

  @Get('my')
  getMyBookings(@Req() request: AuthenticatedRequest) {
    const userId = request.auth.payload.userId;
    return this.bookingService.getMyBookings(userId);
  }

  @Get('requests')
  getAllRequestedOrders(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListBookingRequestsDto,
  ) {
    const userId = request.auth.payload.userId;
    return this.bookingService.getAllRequestedOrders(userId, query);
  }

  @Get('requests/:requestId')
  getRequestDetails(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ) {
    const userId = request.auth.payload.userId;
    const normalizedRequestId = requestId?.trim();

    if (!normalizedRequestId) {
      throw new BadRequestException('requestId is required');
    }

    return this.bookingService.getRequestDetails(userId, normalizedRequestId);
  }

  @Patch('requests/:requestId/cancel')
  cancelRequest(
    @Req() request: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() body: CancelBookingRequestDto,
  ) {
    const userId = request.auth.payload.userId;
    const normalizedRequestId = requestId?.trim();

    if (!normalizedRequestId) {
      throw new BadRequestException('requestId is required');
    }

    return this.bookingService.cancelRequest(
      userId,
      normalizedRequestId,
      body.reason,
    );
  }
}
