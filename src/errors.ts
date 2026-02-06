export type ErrorCode =
  | 'UNKNOWN_MEMBER'
  | 'MEMBER_NOT_EXPOSED'
  | 'QUERY_KEY_NOT_ALLOWED'
  | 'MISSING_LIMIT'
  | 'LIMIT_TOO_HIGH'
  | 'PII_MEMBER_BLOCKED'
  | 'GROUP_BY_NOT_ALLOWED'
  | 'INVALID_TIME_DIMENSION'
  | 'MISSING_TIME_DIMENSION'
  | 'CUBE_ERROR'
  | 'CONFIG_ERROR'
  | 'CATALOG_ERROR';

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  suggestions?: string[];
  member?: string;
  key?: string;
  limit?: number;
}

export class DbMcpError extends Error {
  readonly code: ErrorCode;
  readonly suggestions?: string[];
  readonly details: Record<string, unknown>;

  constructor(details: ErrorDetails & Record<string, unknown>) {
    const { code, message, suggestions, ...rest } = details;
    super(message);
    this.name = 'DbMcpError';
    this.code = code;
    this.suggestions = suggestions;
    this.details = rest;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.suggestions?.length && { suggestions: this.suggestions }),
        ...this.details,
      },
    };
  }
}

export function unknownMemberError(member: string, suggestions: string[] = []): DbMcpError {
  return new DbMcpError({
    code: 'UNKNOWN_MEMBER',
    message: `Unknown member: ${member}`,
    member,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  });
}

export function memberNotExposedError(member: string): DbMcpError {
  return new DbMcpError({
    code: 'MEMBER_NOT_EXPOSED',
    message: `Member is not exposed for querying: ${member}`,
    member,
  });
}

export function queryKeyNotAllowedError(key: string, allowedKeys: string[]): DbMcpError {
  return new DbMcpError({
    code: 'QUERY_KEY_NOT_ALLOWED',
    message: `Query key not allowed: ${key}`,
    key,
    suggestions: [`Allowed keys: ${allowedKeys.join(', ')}`],
  });
}

export function missingLimitError(): DbMcpError {
  return new DbMcpError({
    code: 'MISSING_LIMIT',
    message: 'Query must include a limit',
    suggestions: ['Add a limit to your query, e.g., "limit": 100'],
  });
}

export function limitTooHighError(limit: number, maxLimit: number): DbMcpError {
  return new DbMcpError({
    code: 'LIMIT_TOO_HIGH',
    message: `Limit ${limit} exceeds maximum allowed limit of ${maxLimit}`,
    limit,
    maxLimit,
    suggestions: [`Use a limit of ${maxLimit} or less`],
  });
}

export function piiMemberBlockedError(member: string): DbMcpError {
  return new DbMcpError({
    code: 'PII_MEMBER_BLOCKED',
    message: `PII member blocked: ${member}`,
    member,
    suggestions: ['This member contains personally identifiable information and cannot be queried'],
  });
}

export function groupByNotAllowedError(measure: string, dimension: string): DbMcpError {
  return new DbMcpError({
    code: 'GROUP_BY_NOT_ALLOWED',
    message: `Dimension ${dimension} cannot be used with measure ${measure}`,
    measure,
    dimension,
  });
}

export function invalidTimeDimensionError(member: string): DbMcpError {
  return new DbMcpError({
    code: 'INVALID_TIME_DIMENSION',
    message: `Invalid time dimension: ${member}`,
    member,
    suggestions: ['Time dimensions must be of type "time"'],
  });
}

export function missingTimeDimensionError(measure: string): DbMcpError {
  return new DbMcpError({
    code: 'MISSING_TIME_DIMENSION',
    message: `Measure ${measure} requires a time dimension`,
    measure,
    suggestions: ['Add a timeDimensions entry to your query'],
  });
}

export function cubeError(message: string, cubeResponse?: unknown): DbMcpError {
  return new DbMcpError({
    code: 'CUBE_ERROR',
    message: `Cube API error: ${message}`,
    cubeResponse,
  });
}

export function configError(message: string): DbMcpError {
  return new DbMcpError({
    code: 'CONFIG_ERROR',
    message,
  });
}

export function catalogError(message: string): DbMcpError {
  return new DbMcpError({
    code: 'CATALOG_ERROR',
    message,
  });
}
