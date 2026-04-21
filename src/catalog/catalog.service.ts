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
    this.supabaseUrl =
      this.configService.get<string>('SUPABASE_URL') ??
      'https://znikkgrdbzagvjllimvo.supabase.co';
    this.supabaseBucket =
      this.configService.get<string>('SUPABASE_STORAGE_BUCKET') ?? 'imgs';
  }

  async getCatalog(): Promise<CatalogResponse> {
    const [popularServices, otherServices] = await Promise.all([
      this.prisma.service.findMany({
        where: { isPopular: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.service.findMany({
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

    if (this.isAbsoluteUrl(value)) {
      return value;
    }

    const trimmedBaseUrl = this.supabaseUrl.replace(/\/+$/, '');
    const normalizedPath = value.replace(/^\/+/, '');
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
}
