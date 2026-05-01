import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AdminPartnerService } from './admin-partner.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { ListPartnersDto } from './dto/list-partners.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin/partners')
export class AdminPartnerController {
  constructor(private readonly adminPartnerService: AdminPartnerService) {}

  @Post()
  createPartner(@Req() request: AuthenticatedRequest, @Body() body: CreatePartnerDto) {
    const userId = request.auth.payload.userId;
    return this.adminPartnerService.createPartner(userId, body);
  }

  @Get('all')
  listAllPartners(@Req() request: AuthenticatedRequest, @Query() query: ListPartnersDto) {
    const userId = request.auth.payload.userId;
    return this.adminPartnerService.listPartners(userId, {
      ...query,
      onlyActive: false,
    });
  }

  @Get('search')
  searchPartners(@Req() request: AuthenticatedRequest, @Query() query: ListPartnersDto) {
    const userId = request.auth.payload.userId;
    return this.adminPartnerService.searchPartners(userId, query);
  }

  @Get()
  listPartners(@Req() request: AuthenticatedRequest, @Query() query: ListPartnersDto) {
    const userId = request.auth.payload.userId;
    return this.adminPartnerService.listPartners(userId, query);
  }

  @Get(':id')
  getPartner(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const userId = request.auth.payload.userId;
    return this.adminPartnerService.getPartner(userId, id);
  }

  @Patch(':id')
  updatePartner(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdatePartnerDto,
  ) {
    const userId = request.auth.payload.userId;
    return this.adminPartnerService.updatePartner(userId, id, body);
  }

  @Delete(':id')
  deletePartner(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const userId = request.auth.payload.userId;
    return this.adminPartnerService.deletePartner(userId, id);
  }
}
