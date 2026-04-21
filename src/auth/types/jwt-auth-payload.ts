export type JwtAuthPayload = {
  sub: string;
  userId: string;
  jti: string;
  typ: 'access' | 'refresh';
  sid?: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string | string[];
};
