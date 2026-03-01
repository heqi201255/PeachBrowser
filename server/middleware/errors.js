class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code
    });
  }
  
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Resource not found',
    code: 'NOT_FOUND'
  });
}

module.exports = {
  AppError,
  asyncHandler,
  errorHandler,
  notFoundHandler
};