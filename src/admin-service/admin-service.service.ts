import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  DisplayType,
  Prisma,
  Service as ServiceRecord,
  user_role,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

type AdminServiceItem = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  startingPrice: number;
  currency: string;
  imageUrl: string | null;
  iconUrl: string | null;
  displayType: DisplayType;
  colorClass: string | null;
  tag: string | null;
  isPopular: boolean;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiResponse<T> = {
  message: string;
  data: T;
};

@Injectable()
export class AdminServiceService {
  private static readonly SERVICE_IMAGE_FOLDER = 'services/imgs';
  private static readonly SERVICE_ICON_FOLDER = 'services/icons';
  private readonly logger = new Logger(AdminServiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

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

  async uploadServiceImage(
    userId: string,
    serviceId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<ApiResponse<{ imageUrl: string }>> {
    await this.assertAdminAccess(userId);

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, imageUrl: true },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.imageUrl) {
      await this.deleteFile(service.imageUrl);
    }

    const timestamp = Date.now();
    const extension = this.getFileExtensionFromMimeType(file.mimetype);
    const objectPath = `${AdminServiceService.SERVICE_IMAGE_FOLDER}/${serviceId}-${timestamp}.${extension}`;
    const imagePath = await this.uploadFile(file, objectPath);

    await this.prisma.service.update({
      where: { id: serviceId },
      data: { imageUrl: imagePath },
      select: { id: true },
    });

    return {
      message: 'Image uploaded successfully',
      data: { imageUrl: this.buildPublicStorageUrl(imagePath) },
    };
  }

  async uploadServiceIcon(
    userId: string,
    serviceId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<ApiResponse<{ iconUrl: string }>> {
    await this.assertAdminAccess(userId);

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, iconUrl: true },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.iconUrl) {
      await this.deleteFile(service.iconUrl);
    }

    const timestamp = Date.now();
    const extension = this.getFileExtensionFromMimeType(file.mimetype);
    const objectPath = `${AdminServiceService.SERVICE_ICON_FOLDER}/${serviceId}-${timestamp}.${extension}`;
    const iconPath = await this.uploadFile(file, objectPath);

    await this.prisma.service.update({
      where: { id: serviceId },
      data: { iconUrl: iconPath },
      select: { id: true },
    });

    return {
      message: 'Icon uploaded successfully',
      data: { iconUrl: this.buildPublicStorageUrl(iconPath) },
    };
  }

  async deleteServiceImage(
    userId: string,
    serviceId: string,
  ): Promise<ApiResponse<{ imageUrl: null }>> {
    await this.assertAdminAccess(userId);

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, imageUrl: true },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.imageUrl) {
      await this.deleteFile(service.imageUrl);
    }

    await this.prisma.service.update({
      where: { id: serviceId },
      data: { imageUrl: null },
      select: { id: true },
    });

    return {
      message: 'Image deleted successfully',
      data: { imageUrl: null },
    };
  }

  async deleteServiceIcon(
    userId: string,
    serviceId: string,
  ): Promise<ApiResponse<{ iconUrl: null }>> {
    await this.assertAdminAccess(userId);

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, iconUrl: true },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.iconUrl) {
      await this.deleteFile(service.iconUrl);
    }

    await this.prisma.service.update({
      where: { id: serviceId },
      data: { iconUrl: null },
      select: { id: true },
    });

    return {
      message: 'Icon deleted successfully',
      data: { iconUrl: null },
    };
  }

  async createService(
    userId: string,
    body: CreateServiceDto,
  ): Promise<ApiResponse<Pick<AdminServiceItem, 'id'>>> {
    await this.assertAdminAccess(userId);

    const baseSlug = this.slugify(body.title);
    const slug = await this.generateUniqueSlug(baseSlug);

    const created = await this.prisma.service.create({
      data: {
        id: randomUUID(),
        slug,
        title: body.title,
        subtitle: body.subtitle ?? null,
        description: body.description ?? null,
        startingPrice: body.startingPrice,
        currency: body.currency,
        imageUrl: this.normalizeStoragePathInput(body.imageUrl),
        iconUrl: this.normalizeStoragePathInput(body.iconUrl),
        displayType: body.displayType
          ? (body.displayType as DisplayType)
          : DisplayType.ICON,
        colorClass: body.colorClass ?? null,
        tag: body.tag ?? null,
        isPopular: body.isPopular ?? false,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    return {
      message: 'Service created successfully',
      data: { id: created.id },
    };
  }

  async updateService(
    userId: string,
    id: string,
    body: UpdateServiceDto,
  ): Promise<ApiResponse<Pick<AdminServiceItem, 'id'>>> {
    await this.assertAdminAccess(userId);

    const existing = await this.prisma.service.findUnique({
      where: { id },
      select: { id: true, title: true },
    });

    if (!existing) {
      throw new NotFoundException('Service not found');
    }

    const data: Prisma.ServiceUpdateInput = {
      title: body.title,
      subtitle: body.subtitle === undefined ? undefined : body.subtitle ?? null,
      description:
        body.description === undefined ? undefined : body.description ?? null,
      startingPrice: body.startingPrice,
      currency: body.currency,
      imageUrl:
        body.imageUrl === undefined
          ? undefined
          : this.normalizeStoragePathInput(body.imageUrl),
      iconUrl:
        body.iconUrl === undefined
          ? undefined
          : this.normalizeStoragePathInput(body.iconUrl),
      displayType: body.displayType
        ? (body.displayType as DisplayType)
        : undefined,
      colorClass:
        body.colorClass === undefined ? undefined : body.colorClass ?? null,
      tag: body.tag === undefined ? undefined : body.tag ?? null,
      isPopular: body.isPopular,
      // Any update to service content makes it active again if it was archived.
      isActive: true,
      deletedAt: null,
    };

    if (body.title !== undefined) {
      const baseSlug = this.slugify(body.title);
      const slug = await this.generateUniqueSlug(baseSlug, id);
      data.slug = slug;
    }

    const updated = await this.prisma.service.update({
      where: { id },
      data,
      select: { id: true },
    });

    return {
      message: 'Service updated successfully',
      data: { id: updated.id },
    };
  }

  async deleteService(
    userId: string,
    id: string,
  ): Promise<ApiResponse<Pick<AdminServiceItem, 'id'>>> {
    await this.assertAdminAccess(userId);

    const existing = await this.prisma.service.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException('Service not found');
    }

    const activeBookingCount = await this.prisma.booking.count({
      where: {
        serviceId: id,
        status: {
          in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
        },
      },
    });

    if (activeBookingCount > 0) {
      throw new BadRequestException({
        message:
          'Cannot delete service while pending/approved bookings exist. Cancelled/completed bookings are allowed for deletion.',
        errorCode: 'ACTIVE_BOOKINGS_EXIST',
        data: {
          serviceId: id,
          activeBookingCount,
          blockedStatuses: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
        },
      });
    }

    if (!existing.isActive) {
      return {
        message: 'Service already deleted',
        data: { id: existing.id },
      };
    }

    const archived = await this.prisma.$transaction(async (tx) => {
      await tx.partnerService.updateMany({
        where: { serviceId: id },
        data: { isActive: false },
      });

      return tx.service.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date(),
          isPopular: false,
        },
        select: { id: true },
      });
    });

    return {
      message: 'Service deleted successfully (archived for history)',
      data: { id: archived.id },
    };
  }

  async listServices(userId: string): Promise<ApiResponse<AdminServiceItem[]>> {
    await this.assertAdminAccess(userId);

    const services = await this.prisma.service.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
        startingPrice: true,
        currency: true,
        imageUrl: true,
        iconUrl: true,
        displayType: true,
        colorClass: true,
        tag: true,
        isPopular: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Services fetched successfully',
      data: services.map((service) => this.mapService(service)),
    };
  }

  private mapService(service: ServiceRecord): AdminServiceItem {
    return {
      id: service.id,
      slug: service.slug,
      title: service.title,
      subtitle: service.subtitle,
      description: service.description,
      startingPrice: service.startingPrice,
      currency: service.currency,
      imageUrl: this.normalizeStorageUrl(service.imageUrl),
      iconUrl: this.normalizeStorageUrl(service.iconUrl),
      displayType: service.displayType,
      colorClass: service.colorClass,
      tag: service.tag,
      isPopular: service.isPopular,
      isActive: service.isActive,
      deletedAt: service.deletedAt ? service.deletedAt.toISOString() : null,
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    };
  }

  private normalizeStorageUrl(value: string | null): string | null {
    if (!value) return null;
    const path = this.extractStoragePath(value);
    if (!path) {
      return value;
    }

    return this.buildPublicStorageUrl(path);
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async generateUniqueSlug(
    baseSlug: string,
    excludeServiceId?: string,
  ): Promise<string> {
    const sanitizedBase = baseSlug || randomUUID();

    for (let suffix = 0; suffix < 50; suffix += 1) {
      const candidate = suffix === 0 ? sanitizedBase : `${sanitizedBase}-${suffix}`;
      const existing = await this.prisma.service.findFirst({
        where: {
          slug: candidate,
          ...(excludeServiceId ? { NOT: { id: excludeServiceId } } : {}),
        },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }
    }

    return `${sanitizedBase}-${randomUUID()}`;
  }

  private async uploadFile(
    file: { buffer: Buffer; mimetype: string },
    path: string,
  ): Promise<string> {
    const supabaseUrl = this.getSupabaseUrl();
    const serviceRoleKey = this.getSupabaseServiceRoleKey();

    const normalizedPath = path.replace(/^\/+/, '');
    const encodedPath = normalizedPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const bucket = this.getSupabaseStorageBucket();
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceRoleKey}`,
        'x-upsert': 'true',
        'content-type': file.mimetype,
      },
      body: new Uint8Array(file.buffer),
    });

    if (!response.ok) {
      throw new InternalServerErrorException('Unable to upload file');
    }

    return normalizedPath;
  }

  private async deleteFile(fileUrl: string): Promise<void> {
    const path = this.extractStoragePath(fileUrl);
    if (!path) {
      return;
    }

    const supabaseUrl = this.getSupabaseUrl();
    const serviceRoleKey = this.getSupabaseServiceRoleKey();

    const normalizedPath = path.replace(/^\/+/, '');
    const encodedPath = normalizedPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const bucket = this.getSupabaseStorageBucket();
    const deleteUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`;

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (response.ok || response.status === 404) {
      return;
    }

    const responseBody = await response.text().catch(() => '');
    const looksLikeNotFound = this.isSupabaseObjectNotFoundResponse(
      response.status,
      responseBody,
    );
    if (looksLikeNotFound) {
      this.logger.warn('Supabase delete returned not-found for object', {
        status: response.status,
        statusText: response.statusText,
        bucket,
        path: normalizedPath,
      });
      return;
    }

    this.logger.error('Supabase delete failed', {
      status: response.status,
      statusText: response.statusText,
      bucket,
      path: normalizedPath,
      supabaseUrl,
      responseBody: responseBody.slice(0, 500),
    });
    throw new InternalServerErrorException('Unable to delete file');
  }

  private getSupabaseUrl(): string {
    const supabaseUrl =
      this.configService.get<string>('SUPABASE_URL') ??
      process.env.SUPABASE_URL ??
      'https://znikkgrdbzagvjllimvo.supabase.co';

    return supabaseUrl.replace(/\/+$/, '');
  }

  private getSupabaseServiceRoleKey(): string {
    const rawKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!rawKey) {
      throw new InternalServerErrorException(
        'SUPABASE_SERVICE_ROLE_KEY is not set',
      );
    }

    // Defend against common .env copy/paste mistakes like trailing commas/quotes.
    const normalizedKey = rawKey
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/,+$/, '');

    if (!normalizedKey) {
      throw new InternalServerErrorException(
        'SUPABASE_SERVICE_ROLE_KEY is empty after normalization',
      );
    }

    if (normalizedKey !== rawKey) {
      this.logger.warn(
        'SUPABASE_SERVICE_ROLE_KEY had extra formatting characters and was normalized',
      );
    }

    return normalizedKey;
  }

  private buildPublicStorageUrl(objectPath: string): string {
    const supabaseUrl = this.getSupabaseUrl();
    const bucket = this.getSupabaseStorageBucket();
    const encodedPath = objectPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;
  }

  private extractStoragePath(fileUrl: string): string | null {
    const supabaseUrl = this.getSupabaseUrl();
    const bucket = this.getSupabaseStorageBucket();

    if (!fileUrl.startsWith('http')) {
      const trimmed = fileUrl.replace(/^\/+/, '');
      if (trimmed.startsWith('services/')) {
        return trimmed;
      }
      return null;
    }

    const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${bucket}/`;
    if (!fileUrl.startsWith(publicPrefix)) {
      return null;
    }

    const encodedPath = fileUrl.slice(publicPrefix.length);
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  }

  private getSupabaseStorageBucket(): string {
    const rawBucket =
      this.configService.get<string>('SUPABASE_STORAGE_BUCKET') ??
      process.env.SUPABASE_STORAGE_BUCKET ??
      'imgs';

    return rawBucket.trim().replace(/,+$/, '').replace(/^\/+|\/+$/g, '');
  }

  private normalizeStoragePathInput(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const extractedPath = this.extractStoragePath(trimmed);
    if (extractedPath) {
      return extractedPath;
    }

    if (this.isAbsoluteUrl(trimmed)) {
      throw new BadRequestException(
        'Only storage path is allowed for image/icon fields',
      );
    }

    return trimmed.replace(/^\/+/, '');
  }

  private getFileExtensionFromMimeType(mimeType: string): string {
    const normalizedMimeType = mimeType.toLowerCase();
    if (normalizedMimeType === 'image/jpeg') return 'jpg';
    if (normalizedMimeType === 'image/png') return 'png';
    if (normalizedMimeType === 'image/webp') return 'webp';
    if (normalizedMimeType === 'image/gif') return 'gif';
    if (
      normalizedMimeType === 'image/svg+xml' ||
      normalizedMimeType === 'application/svg+xml'
    ) {
      return 'svg';
    }
    return 'jpg';
  }

  private isAbsoluteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private isSupabaseObjectNotFoundResponse(
    status: number,
    responseBody: string,
  ): boolean {
    if (status === 404) {
      return true;
    }

    if (!responseBody) {
      return false;
    }

    try {
      const parsed = JSON.parse(responseBody) as {
        statusCode?: string | number;
        error?: string;
        message?: string;
      };

      const statusCode =
        typeof parsed.statusCode === 'string'
          ? Number.parseInt(parsed.statusCode, 10)
          : parsed.statusCode;
      const error = parsed.error?.toLowerCase();
      const message = parsed.message?.toLowerCase();

      return (
        statusCode === 404 ||
        error === 'not_found' ||
        message === 'object not found'
      );
    } catch {
      return false;
    }
  }
}
