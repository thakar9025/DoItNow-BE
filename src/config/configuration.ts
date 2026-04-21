// src/config/configuration.ts

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10) || 3000,
  database: {
    // In many networks, outbound 5432/6543 may be blocked. Make this switchable
    // without code changes:
    // - DB_PREFER_DIRECT_URL=true  -> uses DIRECT_URL (usually :5432)
    // - DB_PREFER_DIRECT_URL=false -> uses DATABASE_URL (often pooler :6543)
    url: (() => {
      const nodeEnv = process.env.NODE_ENV ?? 'development';
      const preferDirect =
        (process.env.DB_PREFER_DIRECT_URL ?? 'true').toLowerCase() !== 'false';

      if (nodeEnv === 'production') return process.env.DATABASE_URL;
      return preferDirect
        ? process.env.DIRECT_URL ?? process.env.DATABASE_URL
        : process.env.DATABASE_URL ?? process.env.DIRECT_URL;
    })(),
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    // Backward-compatible key.
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    accessTokenExpiresIn:
      process.env.JWT_ACCESS_TOKEN_EXPIRES_IN ??
      process.env.JWT_EXPIRES_IN ??
      '15m',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN ?? '30d',
    issuer: process.env.JWT_ISSUER ?? 'homehelp-api',
    audience: process.env.JWT_AUDIENCE ?? 'homehelp-client',
  },
  google: {
    // Keep legacy key for backward compatibility with existing consumers.
    clientId: process.env.GOOGLE_CLIENT_ID,
    webClientId:
      process.env.GOOGLE_WEB_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID,
    androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
    adminClientId: process.env.GOOGLE_ADMIN_CLIENT_ID,
    adminWebClientId:
      process.env.GOOGLE_ADMIN_WEB_CLIENT_ID ??
      process.env.GOOGLE_ADMIN_CLIENT_ID,
    adminAndroidClientId: process.env.GOOGLE_ADMIN_ANDROID_CLIENT_ID,
  },
});
