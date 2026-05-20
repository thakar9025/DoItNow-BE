import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveBookingDto } from './dto/approve-booking.dto';
import { PaginationDto } from './dto/pagination.dto';
import { RejectBookingDto } from './dto/reject-booking.dto';

type AdminBookingsResponse = {
  data: unknown[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

@Injectable()
export class AdminBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  private async assertAdminAccess(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    if (user.role === 'USER') {
      throw new ForbiddenException('Access denied');
    }

    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Access denied');
    }
  }

  async getBookings(userId: string, query: PaginationDto): Promise<AdminBookingsResponse> {
    await this.assertAdminAccess(userId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const status = query.status;

    const where: Prisma.BookingWhereInput = {};

    if (status) {
      where.status = status as unknown as Prisma.BookingWhereInput['status'];
    }

    const total = await this.prisma.booking.count({ where });
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    if (totalPages !== 0 && page > totalPages) {
      return {
        data: [],
        meta: {
          total,
          page,
          limit,
          totalPages,
        },
      };
    }

    if (total === 0) {
      return {
        data: [],
        meta: {
          total,
          page,
          limit,
          totalPages,
        },
      };
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        service: true,
        address: true,
        partner: true,
      },
    });

    return {
      data: bookings,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async approveBooking(userId: string, bookingId: string, body: ApproveBookingDto) {
    await this.assertAdminAccess(userId);

    const [booking, partner] = await Promise.all([
      this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          service: {
            select: { title: true },
          },
          user: {
            select: { id: true, fcmToken: true },
          },
        },
      }),
      this.prisma.partner.findUnique({ where: { id: body.partnerId } }),
    ]);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (!partner) {
      throw new NotFoundException('Partner not found');
    }

    if (!partner.isActive) {
      throw new BadRequestException('Partner is inactive');
    }

    const partnerService = await this.prisma.partnerService.findFirst({
      where: {
        partnerId: body.partnerId,
        serviceId: booking.serviceId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!partnerService) {
      throw new BadRequestException(
        'Partner is not mapped to the requested service',
      );
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CONFIRMED' as unknown as Prisma.BookingUpdateInput['status'],
        partnerId: body.partnerId,
        partnerName: partner.fullName,
        partnerPhone: partner.phone,
        confirmedAt: new Date(),
      },
      include: {
        user: true,
        service: true,
        address: true,
        partner: true,
      },
    });

    await this.sendStatusChangeNotification({
      userId: booking.user.id,
      bookingId: booking.id,
      serviceName: booking.service.title,
      status: 'CONFIRMED',
      title: 'Booking Approved',
      body: `Your ${booking.service.title} request has been approved.`,
    });

    return updatedBooking;
  }

  async rejectBooking(userId: string, bookingId: string, body: RejectBookingDto) {
    await this.assertAdminAccess(userId);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: {
          select: { title: true },
        },
        user: {
          select: { id: true, fcmToken: true },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED_BY_ADMIN' as unknown as Prisma.BookingUpdateInput['status'],
        rejectionReason: body.reason,
        cancelledAt: new Date(),
      },
      include: {
        user: true,
        service: true,
        address: true,
        partner: true,
      },
    });

    await this.sendStatusChangeNotification({
      userId: booking.user.id,
      bookingId: booking.id,
      serviceName: booking.service.title,
      status: 'CANCELLED_BY_ADMIN',
      title: 'Booking Rejected',
      body: `Your ${booking.service.title} request was cancelled by admin.`,
      rejectionReason: body.reason,
    });

    return updatedBooking;
  }

  async completeBooking(userId: string, bookingId: string) {
    await this.assertAdminAccess(userId);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: {
          select: { title: true },
        },
        user: {
          select: { id: true, fcmToken: true },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Only approved bookings can be marked complete. Current status: ${booking.status}`,
      );
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'COMPLETED' as unknown as Prisma.BookingUpdateInput['status'],
      },
      include: {
        user: true,
        service: true,
        address: true,
        partner: true,
      },
    });

    await this.sendStatusChangeNotification({
      userId: booking.user.id,
      bookingId: booking.id,
      serviceName: booking.service.title,
      status: 'COMPLETED',
      title: 'Booking Completed',
      body: `Your ${booking.service.title} request has been marked completed.`,
    });

    return updatedBooking;
  }

  private async sendStatusChangeNotification(input: {
    userId: string;
    bookingId: string;
    serviceName: string;
    status: string;
    title: string;
    body: string;
    rejectionReason?: string;
  }): Promise<void> {
    try {
      await this.notificationService.createBookingStatusNotification({
        userId: input.userId,
        bookingId: input.bookingId,
        serviceName: input.serviceName,
        status: input.status,
        title: input.title,
        message: input.body,
        rejectionReason: input.rejectionReason,
      });
    } catch (error) {
      // Best-effort push notification; booking status flow must not fail.
      // eslint-disable-next-line no-console
      console.error('user_push_notification_failed', error);
    }
  }
}
