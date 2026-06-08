import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Service as ServiceRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CatalogAddonItem {
  id: string;
  label: string;
  description: string | null;
  price: number;
  currency: string;
}

export interface CatalogAddonGroup {
  id: string;
  title: string;
  helpText: string | null;
  selectionType: 'SINGLE' | 'MULTI';
  minSelection: number;
  maxSelection: number | null;
  isRequired: boolean;
  addons: CatalogAddonItem[];
}

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
  addonGroups: CatalogAddonGroup[];
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

    const serviceIds = Array.from(
      new Set([...popularServices, ...otherServices].map((service) => service.id)),
    );
    const addonGroupsByServiceId = await this.loadAddonGroupsByServiceIds(serviceIds);

    return {
      popular: popularServices.map((service) =>
        this.mapServiceToCatalogItem(service, addonGroupsByServiceId.get(service.id) ?? []),
      ),
      others: otherServices.map((service) =>
        this.mapServiceToCatalogItem(service, addonGroupsByServiceId.get(service.id) ?? []),
      ),
    };
  }

  private async loadAddonGroupsByServiceIds(
    serviceIds: string[],
  ): Promise<Map<string, CatalogAddonGroup[]>> {
    if (serviceIds.length === 0) {
      return new Map();
    }

    const groups = await this.prisma.serviceAddonGroup.findMany({
      where: {
        serviceId: { in: serviceIds },
        isActive: true,
      },
      include: {
        addons: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const grouped = new Map<string, CatalogAddonGroup[]>();

    for (const group of groups) {
      const mappedGroup: CatalogAddonGroup = {
        id: group.id,
        title: group.title,
        helpText: group.helpText,
        selectionType: group.selectionType,
        minSelection: group.minSelection,
        maxSelection: group.maxSelection,
        isRequired: group.isRequired,
        addons: group.addons.map((addon) => ({
          id: addon.id,
          label: addon.label,
          description: addon.description,
          price: addon.price,
          currency: addon.currency,
        })),
      };

      const existing = grouped.get(group.serviceId) ?? [];
      existing.push(mappedGroup);
      grouped.set(group.serviceId, existing);
    }

    return grouped;
  }

  private mapServiceToCatalogItem(
    service: ServiceRecord,
    addonGroups: CatalogAddonGroup[],
  ): CatalogItem {
    const hasAddons = addonGroups.some((group) => group.addons.length > 0);
    const cheapestAddonTotal = addonGroups.reduce((sum, group) => {
      if (!group.isRequired && group.minSelection === 0) {
        return sum;
      }

      const cheapestInGroup = group.addons
        .map((addon) => addon.price)
        .sort((left, right) => left - right)
        .slice(0, Math.max(group.minSelection, group.isRequired ? 1 : 0))
        .reduce((groupSum, price) => groupSum + price, 0);

      return sum + cheapestInGroup;
    }, 0);

    const displayFromPrice = service.startingPrice + cheapestAddonTotal;

    return {
      id: service.id,
      slug: service.slug,
      title: service.title,
      subtitle: service.subtitle,
      description: service.description,
      startingPrice: service.startingPrice,
      currency: service.currency,
      priceText: hasAddons ? `From ₹${displayFromPrice}` : `From ₹${service.startingPrice}`,
      imageUrl: this.buildPublicStorageUrl(service.imageUrl, 'services/imgs'),
      iconUrl: this.buildPublicStorageUrl(service.iconUrl, 'services/icons'),
      displayType: service.displayType,
      colorClass: service.colorClass,
      tag: service.tag,
      isPopular: service.isPopular,
      addonGroups,
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
