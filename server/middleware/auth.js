// Session-based auth guard: requires server/index.js to configure express-session first.
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

module.exports = { requireAuth };
