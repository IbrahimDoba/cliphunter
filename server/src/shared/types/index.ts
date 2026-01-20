export * from './job';
export * from './api';
export * from './clip';
export * from './compilation';
export * from './youtube';

// Backend-specific auth types
export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
}

export interface JWTPayload {
  sub: string;
  email: string;
  name?: string;
  iat: number;
  exp: number;
}
