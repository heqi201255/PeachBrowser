const { AppError } = require('./errors');

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

/**
 * Validate that a value is a positive integer
 * @param {any} value - Value to validate
 * @param {string} paramName - Parameter name for error message
 * @returns {number} - Parsed integer
 * @throws {AppError} - If validation fails
 */
function validatePositiveInteger(value, paramName) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new AppError(`Invalid ${paramName}: must be a positive integer`, 400, 'VALIDATION_ERROR');
  }
  return parsed;
}

/**
 * Validate that a string is not empty
 * @param {string} value - Value to validate
 * @param {string} paramName - Parameter name for error message
 * @param {number} minLength - Minimum length (optional)
 * @returns {string} - Validated string
 * @throws {AppError} - If validation fails
 */
function validateNonEmptyString(value, paramName, minLength = 1) {
  if (typeof value !== 'string' || value.trim().length < minLength) {
    throw new AppError(
      `Invalid ${paramName}: must be at least ${minLength} characters`, 
      400, 
      'VALIDATION_ERROR'
    );
  }
  
  return value.trim();
}

/**
 * Validate that a value is in a list of allowed values
 * @param {any} value - Value to validate
 * @param {Array} allowedValues - List of allowed values
 * @param {string} paramName - Parameter name for error message
 * @returns {any} - Validated value
 * @throws {AppError} - If validation fails
 */
function validateEnum(value, allowedValues, paramName) {
  if (!allowedValues.includes(value)) {
    throw new AppError(
      `Invalid ${paramName}: must be one of ${allowedValues.join(', ')}`, 
      400, 
      'VALIDATION_ERROR'
    );
  }
  return value;
}

module.exports = {
  validateRequired,
  validateStringLength,
  validateRange,
  validatePositiveInteger,
  validateNonEmptyString,
  validateEnum
};