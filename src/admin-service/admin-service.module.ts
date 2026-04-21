import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminServiceController } from './admin-service.controller';
import { AdminServiceService } from './admin-service.service';

@Module({
  controllers: [AdminServiceController],
  providers: [AdminServiceService, JwtAuthGuard],
})
export class AdminServiceModule {}
