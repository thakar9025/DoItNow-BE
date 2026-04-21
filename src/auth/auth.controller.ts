import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { AuthenticatedRequest } from './types/authenticated-request';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  async googleLogin(@Body() body: GoogleLoginDto) {
    return this.authService.loginWithGoogle(body.token);
  }

  @Post('refresh')
  async refreshToken(@Body() body: RefreshTokenDto) {
    return this.authService.refreshAccessToken(body.refreshToken);
  }

  @UseGuards(AccessTokenGuard)
  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Body() body: LogoutDto,
  ): Promise<{ success: true }> {
    await this.authService.logout(request.auth.payload, body.refreshToken);
    return { success: true };
  }

  @UseGuards(AccessTokenGuard)
  @Post('logout-all')
  async logoutAll(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ success: true }> {
    await this.authService.logoutAll(request.auth.payload);
    return { success: true };
  }

  @UseGuards(AccessTokenGuard)
  @Get('me')
  async me(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(request.auth.payload.sub);
  }
}
