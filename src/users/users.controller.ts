import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { SaveFcmTokenDto } from './dto/save-fcm-token.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('fcm-token')
  async saveFcmToken(
    @Req() request: AuthenticatedRequest,
    @Body() body: SaveFcmTokenDto,
  ) {
    const userId = request.auth.payload.userId;
    await this.usersService.saveFcmToken(userId, body.fcmToken);

    return {
      message: 'FCM token saved successfully',
    };
  }
}
