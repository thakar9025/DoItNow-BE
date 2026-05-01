import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { AdminBookingModule } from './admin-booking/admin-booking.module';
import { AdminPartnerModule } from './admin-partner/admin-partner.module';
import { AdminServiceModule } from './admin-service/admin-service.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AddressModule } from './address/address.module';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './booking/booking.module';
import { CatalogModule } from './catalog/catalog.module';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    AddressModule,
    AuthModule,
    AdminAuthModule,
    AdminBookingModule,
    AdminPartnerModule,
    AdminServiceModule,
    BookingModule,
    CatalogModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
