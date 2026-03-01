function validateRequired(fields) {
  return (req, res, next) => {
    const missing = [];
    
    for (const field of fields) {
      const value = req.body[field];
      if (value === undefined || value === null || value === '') {
        missing.push(field);
      }
    }
    
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
        code: 'VALIDATION_ERROR'
      });
    }
    
    next();
  };
}

function validateStringLength(field, min, max) {
  return (req, res, next) => {
    const value = req.body[field];
    
    if (typeof value !== 'string') {
      return res.status(400).json({
        error: `${field} must be a string`,
        code: 'VALIDATION_ERROR'
      });
    }
    
    if (min && value.length < min) {
      return res.status(400).json({
        error: `${field} must be at least ${min} characters`,
        code: 'VALIDATION_ERROR'
      });
    }
    
    if (max && value.length > max) {
      return res.status(400).json({
        error: `${field} must be at most ${max} characters`,
        code: 'VALIDATION_ERROR'
      });
    }
    
    next();
  };
}

function validateRange(field, min, max) {
  return (req, res, next) => {
    const value = req.body[field];
    
    if (typeof value !== 'number') {
      return res.status(400).json({
        error: `${field} must be a number`,
        code: 'VALIDATION_ERROR'
      });
    }
    
    if (min !== undefined && value < min) {
      return res.status(400).json({
        error: `${field} must be at least ${min}`,
        code: 'VALIDATION_ERROR'
      });
    }
    
    if (max !== undefined && value > max) {
      return res.status(400).json({
        error: `${field} must be at most ${max}`,
        code: 'VALIDATION_ERROR'
      });
    }
    
    next();
  };
}

module.exports = {
  validateRequired,
  validateStringLength,
  validateRange
};