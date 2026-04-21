type NodeEnv = 'development' | 'test' | 'production';

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

function asInt(value: unknown): number | undefined {
  const stringValue = asString(value);
  if (!stringValue) return undefined;
  const parsed = Number.parseInt(stringValue, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export function validateEnv(config: Record<string, unknown>) {
  const nodeEnv = (asString(config.NODE_ENV) ?? 'development') as NodeEnv;
  const port = asInt(config.PORT) ?? 3000;

  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV: "${String(config.NODE_ENV)}" (expected development|test|production)`,
    );
  }

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: "${String(config.PORT)}"`);
  }

  const databaseUrl = asString(config.DATABASE_URL);
  const jwtSecret = asString(config.JWT_SECRET);
  const jwtAccessTokenExpiresIn =
    asString(config.JWT_ACCESS_TOKEN_EXPIRES_IN) ??
    asString(config.JWT_EXPIRES_IN) ??
    '15m';
  const jwtRefreshTokenExpiresIn =
    asString(config.JWT_REFRESH_TOKEN_EXPIRES_IN) ?? '30d';
  const jwtIssuer = asString(config.JWT_ISSUER) ?? 'homehelp-api';
  const jwtAudience = asString(config.JWT_AUDIENCE) ?? 'homehelp-client';
  const googleClientId = asString(config.GOOGLE_CLIENT_ID);
  const googleWebClientId = asString(config.GOOGLE_WEB_CLIENT_ID);
  const googleAndroidClientId = asString(config.GOOGLE_ANDROID_CLIENT_ID);
  const googleAdminClientId = asString(config.GOOGLE_ADMIN_CLIENT_ID);
  const googleAdminWebClientId = asString(config.GOOGLE_ADMIN_WEB_CLIENT_ID);
  const googleAdminAndroidClientId = asString(
    config.GOOGLE_ADMIN_ANDROID_CLIENT_ID,
  );

  if (nodeEnv === 'production') {
    if (!databaseUrl) throw new Error('Missing DATABASE_URL in production');
    if (!jwtSecret) throw new Error('Missing JWT_SECRET in production');
    if (
      !googleClientId &&
      !googleWebClientId &&
      !googleAndroidClientId &&
      !googleAdminClientId &&
      !googleAdminWebClientId &&
      !googleAdminAndroidClientId
    ) {
      throw new Error(
        'Missing Google OAuth client IDs in production (set user and/or admin Google OAuth client IDs)',
      );
    }
    if (jwtSecret.length < 32) {
      throw new Error(
        'JWT_SECRET must be at least 32 characters in production',
      );
    }
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: port,
    JWT_EXPIRES_IN: jwtAccessTokenExpiresIn,
    JWT_ACCESS_TOKEN_EXPIRES_IN: jwtAccessTokenExpiresIn,
    JWT_REFRESH_TOKEN_EXPIRES_IN: jwtRefreshTokenExpiresIn,
    JWT_ISSUER: jwtIssuer,
    JWT_AUDIENCE: jwtAudience,
  };
}
