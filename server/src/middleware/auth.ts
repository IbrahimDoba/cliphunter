import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthenticatedUser, JWTPayload } from '../shared';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  console.log('[AUTH]', req.method, req.path, '- Authorization:', authHeader ? 'present' : 'missing');

  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[AUTH] Unauthorized - no Bearer token');
    return res.status(401).json({
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' }
    });
  }

  const token = authHeader.slice(7);
  console.log('[AUTH] Token length:', token.length);

  try {
    const payload = jwt.verify(
      token,
      process.env.NEXTAUTH_SECRET!
    ) as JWTPayload;

    console.log('[AUTH] Token verified - User ID:', payload.sub);

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    };
    next();
  } catch (error: any) {
    console.log('[AUTH] Token verification failed:', error.message);
    return res.status(401).json({
      error: { message: 'Invalid token', code: 'INVALID_TOKEN' }
    });
  }
};

// Optional auth - allows unauthenticated requests
export const optionalAuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = jwt.verify(
        token,
        process.env.NEXTAUTH_SECRET!
      ) as JWTPayload;

      req.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      };
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }
  next();
};
