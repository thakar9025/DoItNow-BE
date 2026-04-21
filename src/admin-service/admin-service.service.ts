import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DisplayType, Prisma, Service as ServiceRecord, user_role } from '@prisma/client';
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
  createdAt: string;
  updatedAt: string;
};

type ApiResponse<T> = {
  message: string;
  data: T;
};

@Injectable()
export class AdminServiceService {
  private static readonly SUPABASE_BUCKET = 'imgs';
  private static readonly SERVICE_IMAGE_FOLDER = 'services/imgs';
  private static readonly SERVICE_ICON_FOLDER = 'services/icons';

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
    const objectPath = `${AdminServiceService.SERVICE_IMAGE_FOLDER}/${serviceId}-${timestamp}.jpg`;
    const imageUrl = await this.uploadFile(file, objectPath);

    await this.prisma.service.update({
      where: { id: serviceId },
      data: { imageUrl },
      select: { id: true },
    });

    return {
      message: 'Image uploaded successfully',
      data: { imageUrl },
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
    const objectPath = `${AdminServiceService.SERVICE_ICON_FOLDER}/${serviceId}-${timestamp}.jpg`;
    const iconUrl = await this.uploadFile(file, objectPath);

    await this.prisma.service.update({
      where: { id: serviceId },
      data: { iconUrl },
      select: { id: true },
    });

    return {
      message: 'Icon uploaded successfully',
      data: { iconUrl },
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
        imageUrl: body.imageUrl ?? null,
        iconUrl: body.iconUrl ?? null,
        displayType: body.displayType
          ? (body.displayType as DisplayType)
          : DisplayType.ICON,
        colorClass: body.colorClass ?? null,
        tag: body.tag ?? null,
        isPopular: body.isPopular ?? false,
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
      imageUrl: body.imageUrl === undefined ? undefined : body.imageUrl ?? null,
      iconUrl: body.iconUrl === undefined ? undefined : body.iconUrl ?? null,
      displayType: body.displayType
        ? (body.displayType as DisplayType)
        : undefined,
      colorClass:
        body.colorClass === undefined ? undefined : body.colorClass ?? null,
      tag: body.tag === undefined ? undefined : body.tag ?? null,
      isPopular: body.isPopular,
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
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Service not found');
    }

    const deleted = await this.prisma.service.delete({
      where: { id },
      select: { id: true },
    });

    return {
      message: 'Service deleted successfully',
      data: { id: deleted.id },
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
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    };
  }

  private normalizeStorageUrl(value: string | null): string | null {
    if (!value) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }

    const trimmed = value.replace(/^\/+/, '');
    const path = trimmed.startsWith('services/') ? trimmed : null;
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

    const uploadUrl = `${supabaseUrl}/storage/v1/object/${AdminServiceService.SUPABASE_BUCKET}/${encodedPath}`;

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

    return this.buildPublicStorageUrl(normalizedPath);
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

    const deleteUrl = `${supabaseUrl}/storage/v1/object/${AdminServiceService.SUPABASE_BUCKET}/${encodedPath}`;

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new InternalServerErrorException('Unable to delete file');
    }
  }

  private getSupabaseUrl(): string {
    const supabaseUrl =
      this.configService.get<string>('SUPABASE_URL') ??
      process.env.SUPABASE_URL ??
      'https://znikkgrdbzagvjllimvo.supabase.co';

    return supabaseUrl.replace(/\/+$/, '');
  }

  private getSupabaseServiceRoleKey(): string {
    const key =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      throw new InternalServerErrorException(
        'SUPABASE_SERVICE_ROLE_KEY is not set',
      );
    }
    return key;
  }

  private buildPublicStorageUrl(objectPath: string): string {
    const supabaseUrl = this.getSupabaseUrl();
    const bucket = AdminServiceService.SUPABASE_BUCKET;
    const encodedPath = objectPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;
  }

  private extractStoragePath(fileUrl: string): string | null {
    const supabaseUrl = this.getSupabaseUrl();

    if (!fileUrl.startsWith('http')) {
      const trimmed = fileUrl.replace(/^\/+/, '');
      if (trimmed.startsWith('services/')) {
        return trimmed;
      }
      return null;
    }

    const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${AdminServiceService.SUPABASE_BUCKET}/`;
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
}
