import { AppError } from '../utils/app-error.js';

export function authenticate(authService) {
  return (req, res, next) => {
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ')) {
      return next(new AppError(401, 'Bearer token is required.', 'AUTH_REQUIRED'));
    }
    try {
      req.user = authService.verifyToken(header.slice(7));
      next();
    } catch (error) {
      next(error);
    }
  };
}
