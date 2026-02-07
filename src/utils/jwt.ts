import jwt from 'jsonwebtoken';
import { getConfig } from '../config.js';

export interface CubeJwtPayload {
  iat?: number;
  exp?: number;
  databaseId?: string;
  [key: string]: unknown;
}

/**
 * Generate a JWT token for Cube API authentication
 * @param payload - Custom payload to include in the token
 * @param secret - JWT secret (defaults to config)
 * @param expiresIn - Expiration time (defaults to config)
 */
export function generateCubeJwt(
  payload: CubeJwtPayload = {},
  secret?: string,
  expiresIn?: string
): string {
  const config = getConfig();
  const jwtSecret = secret ?? config.CUBE_JWT_SECRET;
  const jwtExpiresIn = expiresIn ?? config.CUBE_JWT_EXPIRES_IN;

  return jwt.sign(payload, jwtSecret, {
    expiresIn: jwtExpiresIn as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/**
 * Generate a JWT token for a specific database
 * Includes databaseId in payload for Cube multi-tenant routing
 */
export function generateDatabaseJwt(
  databaseId: string,
  secret: string,
  expiresIn?: string
): string {
  return generateCubeJwt({ databaseId }, secret, expiresIn);
}

/**
 * Verify and decode a JWT token
 */
export function verifyCubeJwt(token: string, secret?: string): CubeJwtPayload {
  const config = getConfig();
  const jwtSecret = secret ?? config.CUBE_JWT_SECRET;
  return jwt.verify(token, jwtSecret) as CubeJwtPayload;
}
