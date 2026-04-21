import { Request } from 'express';
import { JwtAuthPayload } from './jwt-auth-payload';

export type AuthenticatedRequest = Request & {
  auth: {
    token: string;
    payload: JwtAuthPayload;
  };
};
