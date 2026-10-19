import { AppError } from '../utils/app-error.js';

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return next(new AppError(403, 'You do not have permission for this action.', 'FORBIDDEN'));
  }
  next();
};
