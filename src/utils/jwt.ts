import jwt from 'jsonwebtoken';
import { getConfig } from '../config.js';

export interface CubeJwtPayload {
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export function generateCubeJwt(payload: CubeJwtPayload = {}): string {
  const config = getConfig();

  return jwt.sign(payload, config.CUBE_JWT_SECRET, {
    expiresIn: config.CUBE_JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

export function verifyCubeJwt(token: string): CubeJwtPayload {
  const config = getConfig();
  return jwt.verify(token, config.CUBE_JWT_SECRET) as CubeJwtPayload;
}
