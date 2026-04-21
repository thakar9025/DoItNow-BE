import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

type AddressLocationResponse = {
  lat: number | null;
  lng: number | null;
};

type AddressItemResponse = {
  id: string;
  label: string;
  addressType: string | null;
  displayName: string | null;
  phone: string | null;
  shortAddress: string;
  fullAddress: string;
  location: AddressLocationResponse;
  isDefault: boolean;
};

type AddressesResponse = {
  message: string;
  data: AddressItemResponse[];
};

@Injectable()
export class AddressService {
  private static readonly MAX_ADDRESSES_PER_USER = 5;

  constructor(private readonly prisma: PrismaService) {}

  async createAddress(
    userId: string,
    body: CreateAddressDto,
  ): Promise<AddressesResponse> {
    const existingAddressCount = await this.prisma.address.count({
      where: { userId },
    });

    if (existingAddressCount >= AddressService.MAX_ADDRESSES_PER_USER) {
      throw new BadRequestException(
        'Maximum address limit exceeded. Delete some saved address to add new address.',
      );
    }

    const contactName = body.contactName ?? body.displayName ?? null;
    const fullAddress = this.buildFullAddressFromInput(body);

    if (body.isDefault === true) {
      await this.prisma.$transaction([
        this.prisma.address.updateMany({
          where: { userId },
          data: { isDefault: false },
        }),
        this.prisma.address.create({
          data: {
            userId,
            label: body.label,
            fullAddress,
            addressType: body.addressType ?? null,
            contactName,
            phone: body.phone,
            houseNumber: body.houseNumber ?? null,
            building: body.building ?? null,
            landmark: body.landmark ?? null,
            area: body.area ?? null,
            city: body.city,
            state: body.state,
            pincode: body.pincode,
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            isDefault: true,
          },
        }),
      ]);
    } else {
      await this.prisma.address.create({
        data: {
          userId,
          label: body.label,
          fullAddress,
          addressType: body.addressType ?? null,
          contactName,
          phone: body.phone,
          houseNumber: body.houseNumber ?? null,
          building: body.building ?? null,
          landmark: body.landmark ?? null,
          area: body.area ?? null,
          city: body.city,
          state: body.state,
          pincode: body.pincode,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          isDefault: body.isDefault ?? false,
        },
      });
    }

    const addresses = await this.fetchUserAddresses(userId);

    return {
      message: 'Address saved successfully',
      data: addresses.map((address) => this.mapAddress(address)),
    };
  }

  async getMyAddresses(userId: string): Promise<AddressesResponse> {
    return {
      message: 'Addresses fetched successfully',
      data: (await this.fetchUserAddresses(userId)).map((address) =>
        this.mapAddress(address),
      ),
    };
  }

  async updateAddress(
    userId: string,
    addressId: string,
    body: UpdateAddressDto,
  ): Promise<AddressesResponse> {
    const existingAddress = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!existingAddress) {
      throw new NotFoundException('Address not found');
    }

    const contactName =
      body.contactName ?? body.displayName ?? existingAddress.contactName;

    const mergedForFullAddress = {
      houseNumber:
        body.houseNumber !== undefined
          ? body.houseNumber
          : existingAddress.houseNumber ?? undefined,
      building:
        body.building !== undefined
          ? body.building
          : existingAddress.building ?? undefined,
      landmark:
        body.landmark !== undefined
          ? body.landmark
          : existingAddress.landmark ?? undefined,
      area: body.area !== undefined ? body.area : existingAddress.area ?? undefined,
      city: body.city !== undefined ? body.city : existingAddress.city ?? undefined,
      state:
        body.state !== undefined ? body.state : existingAddress.state ?? undefined,
      pincode:
        body.pincode !== undefined
          ? body.pincode
          : existingAddress.pincode ?? undefined,
    };

    const fullAddress = this.buildFullAddressFromInput(mergedForFullAddress);

    const updateData: Prisma.AddressUpdateInput = {
      label: body.label ?? existingAddress.label,
      addressType:
        body.addressType !== undefined
          ? body.addressType
          : existingAddress.addressType,
      contactName,
      phone: body.phone !== undefined ? body.phone : existingAddress.phone,
      houseNumber:
        body.houseNumber !== undefined
          ? body.houseNumber
          : existingAddress.houseNumber,
      building:
        body.building !== undefined ? body.building : existingAddress.building,
      landmark:
        body.landmark !== undefined ? body.landmark : existingAddress.landmark,
      area: body.area !== undefined ? body.area : existingAddress.area,
      city: body.city !== undefined ? body.city : existingAddress.city,
      state: body.state !== undefined ? body.state : existingAddress.state,
      pincode: body.pincode !== undefined ? body.pincode : existingAddress.pincode,
      latitude:
        body.latitude !== undefined ? body.latitude : existingAddress.latitude,
      longitude:
        body.longitude !== undefined ? body.longitude : existingAddress.longitude,
      fullAddress,
      isDefault:
        body.isDefault !== undefined ? body.isDefault : existingAddress.isDefault,
    };

    if (body.isDefault === true) {
      await this.prisma.$transaction([
        this.prisma.address.updateMany({
          where: { userId },
          data: { isDefault: false },
        }),
        this.prisma.address.update({
          where: { id: addressId },
          data: { ...updateData, isDefault: true },
        }),
      ]);
    } else {
      await this.prisma.address.update({
        where: { id: addressId },
        data: updateData,
      });
    }

    return {
      message: 'Address updated successfully',
      data: (await this.fetchUserAddresses(userId)).map((address) =>
        this.mapAddress(address),
      ),
    };
  }

  async deleteAddress(userId: string, addressId: string): Promise<AddressesResponse> {
    const existingAddress = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
      select: { id: true },
    });

    if (!existingAddress) {
      throw new NotFoundException('Address not found');
    }

    try {
      await this.prisma.address.delete({
        where: { id: addressId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException(
          'This address cannot be deleted because it is linked to existing bookings.',
        );
      }

      throw error;
    }

    return {
      message: 'Address deleted successfully',
      data: (await this.fetchUserAddresses(userId)).map((address) =>
        this.mapAddress(address),
      ),
    };
  }

  private async fetchUserAddresses(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private mapAddress(address: Address): AddressItemResponse {
    return {
      id: address.id,
      label: address.label,
      addressType: address.addressType,
      displayName: address.contactName,
      phone: address.phone,
      shortAddress: this.buildShortAddress(address),
      fullAddress: this.buildFullAddress(address),
      location: {
        lat: address.latitude,
        lng: address.longitude,
      },
      isDefault: address.isDefault,
    };
  }

  private buildFullAddress(address: Address): string {
    const baseAddress = [
      address.houseNumber,
      address.building,
      address.landmark,
      address.area,
      address.city,
      address.state,
    ]
      .filter((value): value is string => Boolean(value))
      .join(', ');

    if (address.pincode) {
      return baseAddress ? `${baseAddress} - ${address.pincode}` : address.pincode;
    }

    return baseAddress;
  }

  private buildShortAddress(address: Address): string {
    return [address.building, address.area]
      .filter((value): value is string => Boolean(value))
      .join(', ');
  }

  private buildFullAddressFromInput(
    body:
      | CreateAddressDto
      | {
          houseNumber?: string;
          building?: string;
          landmark?: string;
          area?: string;
          city?: string;
          state?: string;
          pincode?: string;
        },
  ): string {
    const baseAddress = [
      body.houseNumber,
      body.building,
      body.landmark,
      body.area,
      body.city,
      body.state,
    ]
      .filter((value): value is string => Boolean(value))
      .join(', ');

    if (body.pincode) {
      return baseAddress ? `${baseAddress} - ${body.pincode}` : body.pincode;
    }

    return baseAddress;
  }
}
