const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate JWT tokens
 * Adds user to request object if authenticated
 */
exports.authenticateJWT = async (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;

  // Check if no auth header or not Bearer token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Allow unauthenticated access to public routes
    if (isPublicRoute(req.path)) {
      return next();
    }
    
    req.user = null;
    return next();
  }

  // Extract token
  const token = authHeader.split(' ')[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user by ID
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      req.user = null;
      return next();
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    logger.error('JWT Authentication error:', error);
    req.user = null;
    next();
  }
};

/**
 * Middleware to require authentication
 * Returns 401 if not authenticated
 */
exports.requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }
  next();
};

/**
 * Middleware to require admin role
 * Returns 403 if not admin
 */
exports.requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }
  next();
};

/**
 * Check if route is public (doesn't require authentication)
 */
function isPublicRoute(path) {
  const publicRoutes = [
    '/api/users/login',
    '/api/users/register',
    '/api/models',  // GET models is public
    '/health',
    '/api/docs',
  ];

  // Check if path starts with any public route
  return publicRoutes.some(route => path.startsWith(route));
}
