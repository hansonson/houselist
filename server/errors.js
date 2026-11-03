// Domain errors thrown by services and guards. They carry no HTTP knowledge;
// middleware/errorHandler.js is the single place that maps each type to a status code.
class AppError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

class ValidationError extends AppError {}
class AuthenticationError extends AppError {}
class ForbiddenError extends AppError {}
class NotFoundError extends AppError {}
class ConflictError extends AppError {}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
};
