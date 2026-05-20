import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Service as ServiceRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CatalogItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  startingPrice: number;
  currency: string;
  priceText: string;
  imageUrl: string | null;
  iconUrl: string | null;
  displayType: string | null;
  colorClass: string | null;
  tag: string | null;
  isPopular: boolean;
}

export interface CatalogResponse {
  popular: CatalogItem[];
  others: CatalogItem[];
}

@Injectable()
export class CatalogService {
  private readonly supabaseUrl: string;
  private readonly supabaseBucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const rawSupabaseUrl =
      this.configService.get<string>('SUPABASE_URL') ??
      'https://znikkgrdbzagvjllimvo.supabase.co';
    this.supabaseUrl = rawSupabaseUrl.trim().replace(/,+$/, '').replace(/\/+$/, '');
    const rawBucket =
      this.configService.get<string>('SUPABASE_STORAGE_BUCKET') ??
      process.env.SUPABASE_STORAGE_BUCKET ??
      'imgs';
    this.supabaseBucket = rawBucket
      .trim()
      .replace(/,+$/, '')
      .replace(/^\/+|\/+$/g, '');
  }

  async getCatalog(): Promise<CatalogResponse> {
    const [popularServices, otherServices] = await Promise.all([
      this.prisma.service.findMany({
        where: { isPopular: true, isActive: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.service.findMany({
        where: { isActive: true },
        orderBy: { title: 'asc' },
      }),
    ]);

    return {
      popular: popularServices.map((service) =>
        this.mapServiceToCatalogItem(service),
      ),
      others: otherServices.map((service) =>
        this.mapServiceToCatalogItem(service),
      ),
    };
  }

  private mapServiceToCatalogItem(service: ServiceRecord): CatalogItem {
    return {
      id: service.id,
      slug: service.slug,
      title: service.title,
      subtitle: service.subtitle,
      description: service.description,
      startingPrice: service.startingPrice,
      currency: service.currency,
      priceText: `From ₹${service.startingPrice}`,
      imageUrl: this.buildPublicStorageUrl(service.imageUrl, 'services/imgs'),
      iconUrl: this.buildPublicStorageUrl(service.iconUrl, 'services/icons'),
      displayType: service.displayType,
      colorClass: service.colorClass,
      tag: service.tag,
      isPopular: service.isPopular,
    };
  }

  private buildPublicStorageUrl(
    value: string | null,
    defaultFolder: 'services/imgs' | 'services/icons',
  ): string | null {
    if (!value) {
      return null;
    }

    const trimmedValue = value.trim();
    const extractedPath = this.extractStoragePath(value);
    if (!extractedPath && this.isAbsoluteUrl(trimmedValue)) {
      // Preserve external/legacy absolute URLs instead of rebuilding with current bucket config.
      return trimmedValue;
    }

    const normalizedPath = extractedPath ?? trimmedValue.replace(/^\/+/, '');
    const trimmedBaseUrl = this.supabaseUrl.replace(/\/+$/, '');
    const storagePath = normalizedPath.startsWith('services/')
      ? normalizedPath
      : `${defaultFolder}/${normalizedPath}`;
    const encodedPath = storagePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${trimmedBaseUrl}/storage/v1/object/public/${this.supabaseBucket}/${encodedPath}`;
  }

  private isAbsoluteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private extractStoragePath(value: string): string | null {
    if (!this.isAbsoluteUrl(value)) {
      return null;
    }

    const publicPrefix = `${this.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${this.supabaseBucket}/`;
    if (!value.startsWith(publicPrefix)) {
      return null;
    }

    const encodedPath = value.slice(publicPrefix.length);
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  }
}
