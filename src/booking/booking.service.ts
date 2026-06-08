import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Booking, BookingStatus, Prisma } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { validateSelectedAddons } from '../service-addon/service-addon.validation';
import { CreateBookingDto } from './dto/create-booking.dto';
import {
  BookingRequestFilter,
  ListBookingRequestsDto,
} from './dto/list-booking-requests.dto';

type CreateBookingResponse = {
  message: string;
  data: {
    id: string;
    status: BookingStatus;
    date: string;
    timeSlot: string;
    phone: string;
  };
};

type MyBookingItem = {
  id: string;
  serviceId: string;
  addressId: string;
  status: BookingStatus;
  date: string;
  timeSlot: string;
  price: number;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
};

type MyBookingsResponse = {
  message: string;
  data: MyBookingItem[];
};

type RequestedOrderItem = {
  requestId: string;
  status: BookingStatus;
  serviceName: string;
  description: string | null;
  rejectionReason: string | null;
};

type RequestedOrdersResponse = {
  message: string;
  data: RequestedOrderItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    filter: BookingRequestFilter;
  };
};

type RequestDetailsResponse = {
  message: string;
  data: {
    requestId: string;
    status: BookingStatus;
    serviceName: string;
    description: string | null;
    rejectionReason: string | null;
    scheduledAt: string;
    address: {
      fullAddress: string;
    };
    assignedWorker: {
      id: string;
      name: string;
      rating: number | null;
      avatarUrl: string | null;
      phone: string;
    } | null;
  };
};

type CancelRequestResponse = {
  message: string;
  data: {
    requestId: string;
    status: BookingStatus;
    rejectionReason: string | null;
    cancelledAt: string | null;
  };
};

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
  ) {}

  async createBooking(
    userId: string,
    body: CreateBookingDto,
  ): Promise<CreateBookingResponse> {
    const [service, address, user, addonGroups] = await Promise.all([
      this.prisma.service.findUnique({
        where: { id: body.serviceId },
        select: { id: true, title: true, isActive: true, startingPrice: true },
      }),
      this.prisma.address.findFirst({
        where: { id: body.addressId, userId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true, email: true },
      }),
      this.prisma.serviceAddonGroup.findMany({
        where: {
          serviceId: body.serviceId,
          isActive: true,
        },
        include: {
          addons: {
            where: { isActive: true },
          },
        },
      }),
    ]);

    if (!service) {
      throw new NotFoundException('Service not found');
    }
    if (!service.isActive) {
      throw new BadRequestException('Service is not available for booking');
    }

    if (!address) {
      throw new NotFoundException('Invalid address for this user');
    }

    const bookingDate = this.parseAndValidateBookingDate(body.date);
    const pricing = validateSelectedAddons({
      groups: addonGroups,
      selectedAddonIds: body.selectedAddonIds ?? [],
      basePrice: service.startingPrice,
    });

    if (pricing.totalPrice !== body.price) {
      throw new BadRequestException(
        'Booking price does not match selected service options. Please refresh and try again.',
      );
    }

    let booking: Booking;
    try {
      booking = await this.prisma.$transaction(async (tx) => {
        const createdBooking = await tx.booking.create({
          data: {
            userId,
            serviceId: body.serviceId,
            addressId: body.addressId,
            date: bookingDate,
            timeSlot: body.timeSlot,
            phone: body.phone,
            price: pricing.totalPrice,
            notes: body.notes ?? null,
            status: BookingStatus.PENDING,
          },
        });

        if (pricing.addons.length > 0) {
          await tx.bookingAddon.createMany({
            data: pricing.addons.map((addon) => ({
              bookingId: createdBooking.id,
              addonId: addon.addonId,
              label: addon.label,
              price: addon.price,
            })),
          });
        }

        return createdBooking;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException(
          'Unable to create booking with the selected service or address',
        );
      }

      throw new InternalServerErrorException(
        'Unable to create booking right now. Please try again.',
      );
    }

    const userName = user?.fullName ?? 'Someone';
    const serviceTitle = service.title;

    try {
      const tokens = await this.notificationService.getAdminPushTokens();

      if (tokens.length > 0) {
        await this.notificationService.sendPushNotification(
          tokens,
          'New Booking Request',
          `${userName} requested ${serviceTitle}`,
          {
            bookingId: booking.id,
            requestId: booking.id,
            type: 'NEW_BOOKING',
          },
          'admin',
        );
      }
    } catch (error) {
      // Best-effort push notification; booking flow must not fail.
      // eslint-disable-next-line no-console
      console.error('push_notification_failed', error);
    }

    try {
      await this.notificationService.createBookingRequestedNotification({
        userId,
        bookingId: booking.id,
        serviceName: serviceTitle,
        title: 'Request Submitted',
        message: `Your ${serviceTitle} request was submitted successfully.`,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('booking_requested_notification_failed', error);
    }

    if (user?.email?.trim()) {
      try {
        await this.emailService.sendBookingEmail({
          to: user.email,
          userName: user.fullName,
          serviceName: serviceTitle,
          bookingId: booking.id,
          event: 'BOOKING_REQUESTED',
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('booking_requested_email_failed', error);
      }
    }

    return {
      message: 'Booking created successfully',
      data: {
        id: booking.id,
        status: booking.status,
        date: this.toDateOnly(booking.date),
        timeSlot: booking.timeSlot,
        phone: booking.phone,
      },
    };
  }

  async getMyBookings(userId: string): Promise<MyBookingsResponse> {
    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'My bookings fetched successfully',
      data: bookings.map((booking) => this.mapBooking(booking)),
    };
  }

  async getAllRequestedOrders(
    userId: string,
    query: ListBookingRequestsDto,
  ): Promise<RequestedOrdersResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter = query.filter ?? 'all';
    const statusWhere = this.getStatusWhereByFilter(filter);

    const where: Prisma.BookingWhereInput = {
      userId,
      ...(statusWhere ? { status: statusWhere } : {}),
    };

    const total = await this.prisma.booking.count({ where });
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const bookings = await this.prisma.booking.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        service: {
          select: {
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Requested orders fetched successfully',
      data: bookings.map((booking) => ({
        requestId: booking.id,
        status: booking.status,
        serviceName: booking.service.title,
        description: booking.notes ?? null,
        rejectionReason: booking.rejectionReason ?? null,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages,
        filter,
      },
    };
  }

  async getRequestDetails(
    userId: string,
    requestId: string,
  ): Promise<RequestDetailsResponse> {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: requestId,
        userId,
      },
      include: {
        service: {
          select: { title: true },
        },
        address: {
          select: {
            fullAddress: true,
            label: true,
            houseNumber: true,
            building: true,
            landmark: true,
            area: true,
            city: true,
            state: true,
            pincode: true,
          },
        },
        partner: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Request not found');
    }

    const status = booking.status;
    const shouldShowAssignedWorker =
      status === BookingStatus.CONFIRMED || status === BookingStatus.COMPLETED;

    return {
      message: 'Request details fetched successfully',
      data: {
        requestId: booking.id,
        status,
        serviceName: booking.service.title,
        description: booking.notes ?? null,
        rejectionReason: booking.rejectionReason ?? null,
        scheduledAt: this.toScheduledAtIso(booking.date, booking.timeSlot),
        address: {
          fullAddress: this.resolveAddress(booking.address),
        },
        assignedWorker: shouldShowAssignedWorker
          ? this.resolveAssignedWorker(booking)
          : null,
      },
    };
  }

  async cancelRequest(
    userId: string,
    requestId: string,
    reason?: string,
  ): Promise<CancelRequestResponse> {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: requestId,
        userId,
      },
      include: {
        service: {
          select: { title: true },
        },
        user: {
          select: { email: true, fullName: true },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Request not found');
    }

    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        `Request cannot be cancelled from status ${booking.status}`,
      );
    }

    const normalizedReason = reason?.trim() || null;

    const cancelledBooking = await this.prisma.booking.update({
      where: { id: requestId },
      data: {
        status: BookingStatus.CANCELLED_BY_USER,
        rejectionReason: normalizedReason,
        cancelledAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        rejectionReason: true,
        cancelledAt: true,
      },
    });

    try {
      await this.notificationService.createBookingStatusNotification({
        userId,
        bookingId: booking.id,
        serviceName: booking.service.title,
        status: BookingStatus.CANCELLED_BY_USER,
        title: 'Request Cancelled',
        message: normalizedReason
          ? `Your ${booking.service.title} request was cancelled. Reason: ${normalizedReason}`
          : `Your ${booking.service.title} request was cancelled.`,
        rejectionReason: normalizedReason ?? undefined,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('booking_cancelled_notification_failed', error);
    }

    if (booking.user.email?.trim()) {
      try {
        await this.emailService.sendBookingEmail({
          to: booking.user.email,
          userName: booking.user.fullName,
          serviceName: booking.service.title,
          bookingId: booking.id,
          event: 'BOOKING_CANCELLED',
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('booking_cancelled_email_failed', error);
      }
    }

    return {
      message: 'Request cancelled successfully',
      data: {
        requestId: cancelledBooking.id,
        status: cancelledBooking.status,
        rejectionReason: cancelledBooking.rejectionReason,
        cancelledAt: cancelledBooking.cancelledAt?.toISOString() ?? null,
      },
    };
  }

  private getStatusWhereByFilter(
    filter: BookingRequestFilter,
  ): Prisma.EnumBookingStatusFilter | undefined {
    switch (filter) {
      case 'pending':
        return { equals: BookingStatus.PENDING };
      case 'approved':
        return { equals: BookingStatus.CONFIRMED };
      case 'completed':
        return { equals: BookingStatus.COMPLETED };
      case 'all':
      default:
        return undefined;
    }
  }

  private parseAndValidateBookingDate(date: string): Date {
    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('Invalid booking date');
    }

    const today = new Date();
    const utcToday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );

    if (parsedDate.getTime() < utcToday.getTime()) {
      throw new BadRequestException('Invalid booking date');
    }

    return parsedDate;
  }

  private toScheduledAtIso(date: Date, timeSlot: string): string {
    const parsed = this.parseTimeSlotStart(timeSlot);

    if (!parsed) {
      return date.toISOString();
    }

    const scheduledAt = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        parsed.hour,
        parsed.minute,
        0,
        0,
      ),
    );

    return scheduledAt.toISOString();
  }

  private parseTimeSlotStart(
    timeSlot: string,
  ): { hour: number; minute: number } | null {
    if (!timeSlot) {
      return null;
    }

    const normalized = timeSlot.trim();
    const startPart = normalized.split('-')[0]?.trim() ?? normalized;

    const twentyFourHourMatch = startPart.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (twentyFourHourMatch) {
      return {
        hour: Number(twentyFourHourMatch[1]),
        minute: Number(twentyFourHourMatch[2]),
      };
    }

    const twelveHourMatch = startPart.match(
      /^(1[0-2]|0?[1-9]):([0-5]\d)\s*([AaPp][Mm])$/,
    );
    if (twelveHourMatch) {
      const baseHour = Number(twelveHourMatch[1]) % 12;
      const minute = Number(twelveHourMatch[2]);
      const meridiem = twelveHourMatch[3].toUpperCase();

      return {
        hour: meridiem === 'PM' ? baseHour + 12 : baseHour,
        minute,
      };
    }

    return null;
  }

  private resolveAddress(address: {
    fullAddress: string;
    label: string;
    houseNumber: string | null;
    building: string | null;
    landmark: string | null;
    area: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  }): string {
    const fullAddress = address.fullAddress?.trim();

    if (fullAddress) {
      return fullAddress;
    }

    const composedParts = [
      address.houseNumber,
      address.building,
      address.landmark,
      address.area,
      address.city,
      address.state,
      address.pincode,
    ]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part));

    if (composedParts.length > 0) {
      return composedParts.join(', ');
    }

    return address.label;
  }

  private resolveAssignedWorker(booking: {
    partnerId: string | null;
    partnerName: string | null;
    partnerPhone: string | null;
    partner: {
      id: string;
      fullName: string;
      phone: string;
    } | null;
  }): {
    id: string;
    name: string;
    rating: number | null;
    avatarUrl: string | null;
    phone: string;
  } | null {
    const workerId = booking.partner?.id ?? booking.partnerId;
    const workerName = booking.partner?.fullName ?? booking.partnerName;
    const workerPhone = booking.partner?.phone ?? booking.partnerPhone;

    if (!workerId || !workerName || !workerPhone) {
      return null;
    }

    return {
      id: workerId,
      name: workerName,
      rating: null,
      avatarUrl: null,
      phone: workerPhone,
    };
  }

  private mapBooking(booking: Booking): MyBookingItem {
    return {
      id: booking.id,
      serviceId: booking.serviceId,
      addressId: booking.addressId,
      status: booking.status,
      date: this.toDateOnly(booking.date),
      timeSlot: booking.timeSlot,
      price: booking.price,
      notes: booking.notes,
      rejectionReason: booking.rejectionReason,
      createdAt: booking.createdAt.toISOString(),
    };
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
