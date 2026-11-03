const { AuthenticationError } = require('../errors');

// Session-based auth guard: requires server/index.js to configure express-session first.
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return next(new AuthenticationError('Not logged in'));
  }
  next();
}

module.exports = { requireAuth };
