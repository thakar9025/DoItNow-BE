import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CatalogResponse } from './catalog.service';
import { CatalogService } from './catalog.service';

@UseGuards(AccessTokenGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  getCatalog(): Promise<CatalogResponse> {
    return this.catalogService.getCatalog();
  }
}
