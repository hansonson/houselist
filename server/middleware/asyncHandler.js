// Express 4 doesn't pass rejected promises from async handlers to the error middleware;
// wrapping an async handler with this forwards them, so it behaves like a sync handler.
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
