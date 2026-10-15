import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    isExternal?: boolean;
  };
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
      role: string;
      isExternal?: boolean;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
  }
};

/** Rejects external (password) users — for staff-only features like creating initiatives and AI generation. */
export const staffOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user?.isExternal) {
    res.status(403).json({ error: 'This feature is not available to external users' });
    return;
  }
  next();
};
