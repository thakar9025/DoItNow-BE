import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, user_role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { ListPartnersDto } from './dto/list-partners.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

type ApiResponse<T> = {
  message: string;
  data: T;
};

type PartnerListItem = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  services: Array<{ id: string; title: string; isActiveMapping: boolean }>;
  addresses: Array<{
    id: string;
    label: string;
    fullAddress: string;
    city: string | null;
    state: string | null;
    pincode: string | null;
    latitude: number | null;
    longitude: number | null;
    isDefault: boolean;
  }>;
  activeApprovedBookingCount: number;
  activeApprovedBookings: Array<{
    id: string;
    serviceId: string;
    serviceTitle: string;
    date: string;
    timeSlot: string;
    userId: string;
    userName: string | null;
    userPhone: string | null;
  }>;
};

@Injectable()
export class AdminPartnerService {
  constructor(private readonly prisma: PrismaService) {}

  private buildSearchWhere(search: string): Prisma.PartnerWhereInput {
    const trimmed = search.trim();
    if (!trimmed) {
      return {};
    }

    return {
      OR: [
        { fullName: { contains: trimmed, mode: 'insensitive' } },
        { email: { contains: trimmed, mode: 'insensitive' } },
        { phone: { contains: trimmed, mode: 'insensitive' } },
        { id: trimmed },
        {
          services: {
            some: {
              service: {
                title: { contains: trimmed, mode: 'insensitive' },
              },
            },
          },
        },
      ],
    };
  }

  private async assertAdminAccess(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    if (user.role === user_role.USER) {
      throw new ForbiddenException('Access denied');
    }

    if (user.role !== user_role.ADMIN && user.role !== user_role.SUPER_ADMIN) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async assertServicesExist(serviceIds: string[]): Promise<void> {
    if (serviceIds.length === 0) {
      return;
    }

    const existing = await this.prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true },
    });

    const existingSet = new Set(existing.map((s) => s.id));
    const missing = serviceIds.filter((id) => !existingSet.has(id));

    if (missing.length > 0) {
      throw new BadRequestException(
        `Invalid serviceIds: ${missing.join(', ')}`,
      );
    }
  }

  async createPartner(
    userId: string,
    body: CreatePartnerDto,
  ): Promise<ApiResponse<{ id: string }>> {
    await this.assertAdminAccess(userId);
    await this.assertServicesExist(body.serviceIds);

    const partnerId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.partner.create({
        data: {
          id: partnerId,
          fullName: body.fullName,
          phone: body.phone,
          email: body.email ?? null,
          isActive: true,
        },
      });

      await tx.partnerAddress.create({
        data: {
          partnerId,
          label: body.address.label,
          fullAddress: body.address.fullAddress,
          latitude: body.address.latitude ?? null,
          longitude: body.address.longitude ?? null,
          area: body.address.area ?? null,
          city: body.address.city,
          state: body.address.state,
          pincode: body.address.pincode,
          houseNumber: body.address.houseNumber ?? null,
          building: body.address.building ?? null,
          landmark: body.address.landmark ?? null,
          addressType: body.address.addressType ?? null,
          contactName: body.address.contactName ?? null,
          phone: body.address.phone ?? null,
          isDefault: body.address.isDefault ?? true,
        },
      });

      if (body.serviceIds.length > 0) {
        await tx.partnerService.createMany({
          data: body.serviceIds.map((serviceId) => ({
            id: randomUUID(),
            partnerId,
            serviceId,
            isActive: true,
          })),
          skipDuplicates: true,
        });
      }
    });

    return {
      message: 'Partner created successfully',
      data: { id: partnerId },
    };
  }

  async listPartners(
    userId: string,
    query: ListPartnersDto,
  ): Promise<ApiResponse<PartnerListItem[]>> {
    await this.assertAdminAccess(userId);

    const onlyActive = query.onlyActive ?? true;
    const searchWhere = query.search
      ? this.buildSearchWhere(query.search)
      : {};

    const partners = await this.prisma.partner.findMany({
      where: {
        ...(onlyActive ? { isActive: true } : {}),
        ...searchWhere,
        ...(query.serviceId
          ? {
              services: {
                some: {
                  serviceId: query.serviceId,
                  isActive: true,
                },
              },
            }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: {
        services: {
          include: {
            service: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
        bookings: {
          where: {
            status: BookingStatus.CONFIRMED,
          },
          select: {
            id: true,
            serviceId: true,
            date: true,
            timeSlot: true,
            userId: true,
            user: {
              select: {
                fullName: true,
                phone: true,
              },
            },
            service: {
              select: {
                title: true,
              },
            },
          },
          orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
        },
      },
    });

    return {
      message: 'Partners fetched successfully',
      data: partners.map((partner) => ({
        id: partner.id,
        fullName: partner.fullName,
        phone: partner.phone,
        email: partner.email,
        isActive: partner.isActive,
        createdAt: partner.createdAt.toISOString(),
        updatedAt: partner.updatedAt.toISOString(),
        services: partner.services.map((entry) => ({
          id: entry.service.id,
          title: entry.service.title,
          isActiveMapping: entry.isActive,
        })),
        addresses: partner.addresses.map((address) => ({
          id: address.id,
          label: address.label,
          fullAddress: address.fullAddress,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          latitude: address.latitude,
          longitude: address.longitude,
          isDefault: address.isDefault,
        })),
        activeApprovedBookingCount: partner.bookings.length,
        activeApprovedBookings: partner.bookings.map((booking) => ({
          id: booking.id,
          serviceId: booking.serviceId,
          serviceTitle: booking.service.title,
          date: booking.date.toISOString().slice(0, 10),
          timeSlot: booking.timeSlot,
          userId: booking.userId,
          userName: booking.user.fullName,
          userPhone: booking.user.phone,
        })),
      })),
    };
  }

  async getPartner(
    userId: string,
    id: string,
  ): Promise<ApiResponse<PartnerListItem>> {
    await this.assertAdminAccess(userId);

    const partner = await this.prisma.partner.findUnique({
      where: { id },
      include: {
        services: {
          include: {
            service: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
        bookings: {
          where: {
            status: BookingStatus.CONFIRMED,
          },
          select: {
            id: true,
            serviceId: true,
            date: true,
            timeSlot: true,
            userId: true,
            user: {
              select: {
                fullName: true,
                phone: true,
              },
            },
            service: {
              select: {
                title: true,
              },
            },
          },
          orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
        },
      },
    });

    if (!partner) {
      throw new NotFoundException('Partner not found');
    }

    return {
      message: 'Partner fetched successfully',
      data: {
        id: partner.id,
        fullName: partner.fullName,
        phone: partner.phone,
        email: partner.email,
        isActive: partner.isActive,
        createdAt: partner.createdAt.toISOString(),
        updatedAt: partner.updatedAt.toISOString(),
        services: partner.services.map((entry) => ({
          id: entry.service.id,
          title: entry.service.title,
          isActiveMapping: entry.isActive,
        })),
        addresses: partner.addresses.map((address) => ({
          id: address.id,
          label: address.label,
          fullAddress: address.fullAddress,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          latitude: address.latitude,
          longitude: address.longitude,
          isDefault: address.isDefault,
        })),
        activeApprovedBookingCount: partner.bookings.length,
        activeApprovedBookings: partner.bookings.map((booking) => ({
          id: booking.id,
          serviceId: booking.serviceId,
          serviceTitle: booking.service.title,
          date: booking.date.toISOString().slice(0, 10),
          timeSlot: booking.timeSlot,
          userId: booking.userId,
          userName: booking.user.fullName,
          userPhone: booking.user.phone,
        })),
      },
    };
  }

  async updatePartner(
    userId: string,
    id: string,
    body: UpdatePartnerDto,
  ): Promise<ApiResponse<{ id: string }>> {
    await this.assertAdminAccess(userId);

    const partner = await this.prisma.partner.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!partner) {
      throw new NotFoundException('Partner not found');
    }

    if (body.serviceIds) {
      await this.assertServicesExist(body.serviceIds);
    }

    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.PartnerUpdateInput = {
        fullName: body.fullName,
        phone: body.phone,
        email: body.email === undefined ? undefined : body.email ?? null,
        isActive: body.isActive,
      };

      await tx.partner.update({
        where: { id },
        data,
      });

      if (body.serviceIds) {
        await tx.partnerService.deleteMany({ where: { partnerId: id } });

        if (body.serviceIds.length > 0) {
          await tx.partnerService.createMany({
            data: body.serviceIds.map((serviceId) => ({
              id: randomUUID(),
              partnerId: id,
              serviceId,
              isActive: true,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (body.address) {
        const defaultAddress = await tx.partnerAddress.findFirst({
          where: { partnerId: id, isDefault: true },
          select: { id: true },
        });

        if (defaultAddress) {
          await tx.partnerAddress.update({
            where: { id: defaultAddress.id },
            data: {
              label: body.address.label,
              fullAddress: body.address.fullAddress,
              latitude:
                body.address.latitude === undefined
                  ? undefined
                  : body.address.latitude ?? null,
              longitude:
                body.address.longitude === undefined
                  ? undefined
                  : body.address.longitude ?? null,
              area: body.address.area === undefined ? undefined : body.address.area ?? null,
              city: body.address.city,
              state: body.address.state,
              pincode: body.address.pincode,
              houseNumber:
                body.address.houseNumber === undefined
                  ? undefined
                  : body.address.houseNumber ?? null,
              building:
                body.address.building === undefined
                  ? undefined
                  : body.address.building ?? null,
              landmark:
                body.address.landmark === undefined
                  ? undefined
                  : body.address.landmark ?? null,
              addressType:
                body.address.addressType === undefined
                  ? undefined
                  : body.address.addressType ?? null,
              contactName:
                body.address.contactName === undefined
                  ? undefined
                  : body.address.contactName ?? null,
              phone:
                body.address.phone === undefined
                  ? undefined
                  : body.address.phone ?? null,
              isDefault: body.address.isDefault,
            },
          });
        } else {
          if (!body.address.label || !body.address.fullAddress) {
            throw new BadRequestException(
              'address.label and address.fullAddress are required to add new address',
            );
          }

          await tx.partnerAddress.create({
            data: {
              partnerId: id,
              label: body.address.label,
              fullAddress: body.address.fullAddress,
              latitude: body.address.latitude ?? null,
              longitude: body.address.longitude ?? null,
              area: body.address.area ?? null,
              city: body.address.city ?? null,
              state: body.address.state ?? null,
              pincode: body.address.pincode ?? null,
              houseNumber: body.address.houseNumber ?? null,
              building: body.address.building ?? null,
              landmark: body.address.landmark ?? null,
              addressType: body.address.addressType ?? null,
              contactName: body.address.contactName ?? null,
              phone: body.address.phone ?? null,
              isDefault: body.address.isDefault ?? true,
            },
          });
        }
      }
    });

    return {
      message: 'Partner updated successfully',
      data: { id },
    };
  }

  async searchPartners(
    userId: string,
    query: ListPartnersDto,
  ): Promise<ApiResponse<PartnerListItem[]>> {
    await this.assertAdminAccess(userId);
    return this.listPartners(userId, {
      ...query,
      onlyActive: query.onlyActive ?? true,
    });
  }

  async deletePartner(
    userId: string,
    id: string,
  ): Promise<ApiResponse<{ id: string }>> {
    await this.assertAdminAccess(userId);

    const partner = await this.prisma.partner.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!partner) {
      throw new NotFoundException('Partner not found');
    }

    const activeAssignedCount = await this.prisma.booking.count({
      where: {
        partnerId: id,
        status: BookingStatus.CONFIRMED,
      },
    });

    if (activeAssignedCount > 0) {
      throw new BadRequestException(
        'Cannot delete partner with active approved bookings. Mark partner inactive instead.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.partnerService.updateMany({
        where: { partnerId: id },
        data: { isActive: false },
      }),
      this.prisma.partner.update({
        where: { id },
        data: { isActive: false },
      }),
    ]);

    return {
      message: 'Partner deleted successfully',
      data: { id },
    };
  }
}
