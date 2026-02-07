import { getConfig } from '../config.js';
import { cubeError } from '../errors.js';
import { generateCubeJwt } from '../utils/jwt.js';
import { getLogger } from '../utils/logger.js';
import type {
  CubeMetaResponse,
  CubeLoadResponse,
  CubeQueryPayload,
  CubeSqlResponse,
  CubeErrorResponse,
} from './types.js';

/**
 * Configuration for creating a CubeClient instance
 */
export interface CubeClientConfig {
  baseUrl?: string;
  jwtSecret?: string;
  jwtExpiresIn?: string;
  databaseId?: string; // For multi-tenant JWT payload
}

export class CubeClient {
  private baseUrl: string;
  private jwtSecret: string;
  private jwtExpiresIn: string;
  private databaseId?: string;
  private logger = getLogger().child({ component: 'CubeClient' });

  constructor(config?: CubeClientConfig) {
    const globalConfig = getConfig();
    this.baseUrl = config?.baseUrl ?? globalConfig.CUBE_API_URL;
    this.jwtSecret = config?.jwtSecret ?? globalConfig.CUBE_JWT_SECRET;
    this.jwtExpiresIn = config?.jwtExpiresIn ?? globalConfig.CUBE_JWT_EXPIRES_IN;
    this.databaseId = config?.databaseId;

    if (this.databaseId) {
      this.logger = this.logger.child({ databaseId: this.databaseId });
    }
  }

  private getAuthHeaders(): Record<string, string> {
    // Include databaseId in JWT payload for Cube routing
    const payload = this.databaseId ? { databaseId: this.databaseId } : {};
    const token = generateCubeJwt(payload, this.jwtSecret, this.jwtExpiresIn);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    this.logger.debug({ url, method: options.method ?? 'GET' }, 'Cube API request');

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
    });

    const body = await response.json();

    if (!response.ok) {
      const errorBody = body as CubeErrorResponse;
      this.logger.error({ status: response.status, error: errorBody }, 'Cube API error');
      throw cubeError(errorBody.error ?? `HTTP ${response.status}`, errorBody);
    }

    return body as T;
  }

  async getMeta(): Promise<CubeMetaResponse> {
    this.logger.debug('Fetching Cube metadata');
    return this.request<CubeMetaResponse>('/meta');
  }

  async load(query: CubeQueryPayload): Promise<CubeLoadResponse> {
    this.logger.debug({ query }, 'Executing Cube query');
    const params = new URLSearchParams({ query: JSON.stringify(query) });
    return this.request<CubeLoadResponse>(`/load?${params.toString()}`);
  }

  async getSql(query: CubeQueryPayload): Promise<CubeSqlResponse> {
    this.logger.debug({ query }, 'Getting SQL for query');
    const params = new URLSearchParams({ query: JSON.stringify(query) });
    return this.request<CubeSqlResponse>(`/sql?${params.toString()}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getMeta();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a new CubeClient instance with specific configuration
 */
export function createCubeClient(config?: CubeClientConfig): CubeClient {
  return new CubeClient(config);
}
