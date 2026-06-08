import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { SupportService } from './support.service';

@UseGuards(AccessTokenGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  getSupportContent() {
    return this.supportService.getSupportContent();
  }
}
