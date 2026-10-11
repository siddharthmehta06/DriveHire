const { AppError } = require('../lib/errors');
const jwt = require('jsonwebtoken');

function attachUser(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    const payload = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (error) {
    return next(new AppError('UNAUTHENTICATED', 'Your session is invalid or expired. Please sign in again.', 401));
  }

}

function requireAuth(req, res, next) {
  if (!req.user || !req.user.id) {
    return next(new AppError('UNAUTHENTICATED', 'Authentication required.', 401));
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const allowed = new Set(roles.map((role) => String(role).toUpperCase()));
    if (!req.user || !allowed.has(String(req.user.role || '').toUpperCase())) {
      return next(new AppError('FORBIDDEN', 'Access denied.', 403));
    }
    return next();
  };
}

module.exports = { attachUser, requireAuth, requireRole };
