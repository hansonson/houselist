const {
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../errors');

const STATUS_BY_ERROR_TYPE = [
  [ValidationError, 400],
  [AuthenticationError, 401],
  [ForbiddenError, 403],
  [NotFoundError, 404],
  [ConflictError, 409],
];

// Central error handler: the only place errors become HTTP responses. Always JSON (never
// Express's default HTML page), and unexpected errors never leak details to the client.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  for (const [ErrorType, status] of STATUS_BY_ERROR_TYPE) {
    if (err instanceof ErrorType) {
      return res.status(status).json({ error: err.message });
    }
  }
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Something went wrong' });
}

module.exports = { errorHandler };
