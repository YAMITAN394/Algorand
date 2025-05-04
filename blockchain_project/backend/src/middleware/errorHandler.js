const logger = require('../utils/logger');

/**
 * Global error handler middleware
 * Formats and logs errors, then sends appropriate response
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error(`${err.name}: ${err.message}`, { 
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Server Error';
  let errors = err.errors || null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    // Mongoose validation error
    statusCode = 400;
    message = 'Validation Error';
    errors = formatValidationErrors(err);
  } else if (err.name === 'CastError') {
    // Mongoose cast error (e.g., invalid ObjectId)
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (err.name === 'JsonWebTokenError') {
    // JWT error
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    // JWT expired
    statusCode = 401;
    message = 'Token expired';
  } else if (err.code === 11000) {
    // MongoDB duplicate key error
    statusCode = 400;
    message = 'Duplicate field value entered';
    errors = formatDuplicateKeyError(err);
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    message,
    errors,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

/**
 * Format Mongoose validation errors
 */
const formatValidationErrors = (err) => {
  const errors = {};
  
  Object.keys(err.errors).forEach(key => {
    errors[key] = err.errors[key].message;
  });
  
  return errors;
};

/**
 * Format MongoDB duplicate key errors
 */
const formatDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return { [field]: `${field} already exists` };
};

module.exports = errorHandler;
