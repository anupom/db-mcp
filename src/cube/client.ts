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

export class CubeClient {
  private baseUrl: string;
  private logger = getLogger().child({ component: 'CubeClient' });

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? getConfig().CUBE_API_URL;
  }

  private getAuthHeaders(): Record<string, string> {
    const token = generateCubeJwt();
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

let defaultClient: CubeClient | null = null;

export function getCubeClient(): CubeClient {
  if (!defaultClient) {
    defaultClient = new CubeClient();
  }
  return defaultClient;
}
