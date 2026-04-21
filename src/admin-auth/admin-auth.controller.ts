import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { GoogleLoginDto } from '../auth/dto/google-login.dto';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  async googleLogin(@Body() body: GoogleLoginDto) {
    return this.authService.loginAdminWithGoogle(body.token);
  }
}
