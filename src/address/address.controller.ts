import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@UseGuards(AccessTokenGuard)
@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post()
  createAddress(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateAddressDto,
  ) {
    const userId = request.auth.payload.userId;
    return this.addressService.createAddress(userId, body);
  }

  @Get('my')
  getMyAddresses(@Req() request: AuthenticatedRequest) {
    const userId = request.auth.payload.userId;
    return this.addressService.getMyAddresses(userId);
  }

  @Patch(':addressId')
  updateAddress(
    @Req() request: AuthenticatedRequest,
    @Param('addressId') addressId: string,
    @Body() body: UpdateAddressDto,
  ) {
    const userId = request.auth.payload.userId;
    return this.addressService.updateAddress(userId, addressId, body);
  }

  @Delete(':addressId')
  deleteAddress(
    @Req() request: AuthenticatedRequest,
    @Param('addressId') addressId: string,
  ) {
    const userId = request.auth.payload.userId;
    return this.addressService.deleteAddress(userId, addressId);
  }
}
