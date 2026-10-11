const { ZodError } = require('zod');
const { AppError } = require('./errors');

function parseBody(schema, body) {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError('VALIDATION_ERROR', 'Request validation failed.', 400, error.issues);
    }
    throw error;
  }
}

module.exports = { parseBody };
