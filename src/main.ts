import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { initializeFirebase } from './config/firebase.config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedExactOrigins = new Set<string>([
    'http://localhost',
    'https://localhost',
    'http://localhost:8100',
    'https://localhost:8100',
    'http://localhost:8101',
    'https://localhost:8101',
    'http://127.0.0.1',
    'https://127.0.0.1',
    'http://127.0.0.1:8100',
    'https://127.0.0.1:8100',
    'http://127.0.0.1:8101',
    'https://127.0.0.1:8101',
    // Capacitor/Ionic app WebView origins
    'capacitor://localhost',
    'ionic://localhost',
    // Production web domains
    'https://justdoitnow.in',
    'https://www.justdoitnow.in',
    'https://doitnow.in',
    'https://www.doitnow.in',
  ]);

  const extraOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const origin of extraOrigins) {
    allowedExactOrigins.add(origin);
  }

  const allowedOriginPatterns = [
    /^http:\/\/localhost(?::\d+)?$/i,
    /^https:\/\/localhost(?::\d+)?$/i,
    /^http:\/\/127\.0\.0\.1(?::\d+)?$/i,
    /^https:\/\/127\.0\.0\.1(?::\d+)?$/i,
    /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/i,
    /^https:\/\/[a-z0-9-]+\.ngrok\.io$/i,
    // Vercel preview + production deployments
    /^https:\/\/[a-z0-9-]+(?:-[a-z0-9]+)*\.vercel\.app$/i,
  ];

  // ✅ CORS CONFIG (IMPORTANT)
  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser or same-origin requests with no Origin header.
      if (!origin) return callback(null, true);

      if (allowedExactOrigins.has(origin)) {
        return callback(null, true);
      }

      if (allowedOriginPatterns.some((pattern) => pattern.test(origin))) {
        return callback(null, true);
      }

      return callback(new Error(`Origin "${origin}" is not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'ngrok-skip-browser-warning',
    ],
    optionsSuccessStatus: 204,
    credentials: true,
  });

  // ✅ VALIDATION PIPE
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3000;

  // ✅ INITIALIZE FIREBASE
  initializeFirebase();

  // ✅ IMPORTANT FOR MOBILE ACCESS
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Backend running on http://localhost:${port}`);
}

void bootstrap();
