import { Module } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, AccessTokenGuard],
})
export class CatalogModule {}
