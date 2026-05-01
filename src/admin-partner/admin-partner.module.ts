import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminPartnerController } from './admin-partner.controller';
import { AdminPartnerService } from './admin-partner.service';

@Module({
  controllers: [AdminPartnerController],
  providers: [AdminPartnerService, JwtAuthGuard],
})
export class AdminPartnerModule {}
