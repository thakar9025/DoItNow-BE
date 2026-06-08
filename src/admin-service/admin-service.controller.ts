import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AdminServiceService } from './admin-service.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { ReplaceServiceAddonsDto } from './dto/service-addon.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

type UploadedImageFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

class AllowedImageMimeTypeValidator extends FileValidator<{
  allowedMimeTypes: string[];
}> {
  isValid(file?: UploadedImageFile): boolean {
    if (!file?.mimetype) return false;
    const normalizedMimeType = file.mimetype.toLowerCase().split(';')[0].trim();
    return this.validationOptions.allowedMimeTypes.includes(normalizedMimeType);
  }

  buildErrorMessage(): string {
    return `Validation failed (allowed file types: ${this.validationOptions.allowedMimeTypes.join(', ')})`;
  }
}

const SERVICE_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/svg+xml',
];

@UseGuards(JwtAuthGuard)
@Controller('admin/services')
export class AdminServiceController {
  constructor(private readonly adminServiceService: AdminServiceService) {}

  @Post()
  createService(@Req() request: AuthenticatedRequest, @Body() body: CreateServiceDto) {
    const userId = request.auth.payload.userId;
    return this.adminServiceService.createService(userId, body);
  }

  @Patch(':id')
  updateService(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateServiceDto,
  ) {
    const userId = request.auth.payload.userId;
    return this.adminServiceService.updateService(userId, id, body);
  }

  @Delete(':id')
  deleteService(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const userId = request.auth.payload.userId;
    return this.adminServiceService.deleteService(userId, id);
  }

  @Get()
  listServices(@Req() request: AuthenticatedRequest) {
    const userId = request.auth.payload.userId;
    return this.adminServiceService.listServices(userId);
  }

  @Put(':id/addons')
  replaceServiceAddons(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ReplaceServiceAddonsDto,
  ) {
    const userId = request.auth.payload.userId;
    return this.adminServiceService.replaceServiceAddons(
      userId,
      id,
      body.addonGroups ?? [],
    );
  }

  @Post(':id/upload-image')
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new AllowedImageMimeTypeValidator({
            allowedMimeTypes: SERVICE_UPLOAD_MIME_TYPES,
          }),
        ],
      }),
    )
    file: UploadedImageFile,
  ) {
    const userId = request.auth.payload.userId;
    return this.adminServiceService.uploadServiceImage(userId, id, file);
  }

  @Post(':id/upload-icon')
  @UseInterceptors(FileInterceptor('file'))
  uploadIcon(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new AllowedImageMimeTypeValidator({
            allowedMimeTypes: SERVICE_UPLOAD_MIME_TYPES,
          }),
        ],
      }),
    )
    file: UploadedImageFile,
  ) {
    const userId = request.auth.payload.userId;
    return this.adminServiceService.uploadServiceIcon(userId, id, file);
  }

  @Delete(':id/image')
  @HttpCode(HttpStatus.OK)
  deleteImage(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const userId = request.auth.payload.userId;
    return this.adminServiceService.deleteServiceImage(userId, id);
  }

  @Delete(':id/icon')
  @HttpCode(HttpStatus.OK)
  deleteIcon(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const userId = request.auth.payload.userId;
    return this.adminServiceService.deleteServiceIcon(userId, id);
  }
}
