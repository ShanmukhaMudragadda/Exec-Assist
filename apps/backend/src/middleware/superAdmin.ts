import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export function isSuperAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'superadmin';
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }
  next();
}
