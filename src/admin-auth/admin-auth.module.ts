import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthController } from './admin-auth.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminAuthController],
})
export class AdminAuthModule {}
