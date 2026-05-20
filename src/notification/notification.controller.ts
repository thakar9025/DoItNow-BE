import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationService } from './notification.service';

@UseGuards(AccessTokenGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  listNotifications(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListNotificationsDto,
  ) {
    const userId = request.auth.payload.userId;
    return this.notificationService.listUserNotifications(
      userId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Patch(':id/read')
  markAsRead(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const userId = request.auth.payload.userId;
    return this.notificationService.markAsRead(userId, id);
  }

  @Patch('read-all')
  markAllAsRead(@Req() request: AuthenticatedRequest) {
    const userId = request.auth.payload.userId;
    return this.notificationService.markAllAsRead(userId);
  }
}
