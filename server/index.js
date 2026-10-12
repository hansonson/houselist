const path = require('node:path');
const express = require('express');
const session = require('express-session');

const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const householdRoutes = require('./routes/households');
const { listsRouter, itemsRouter } = require('./routes/lists');

const app = express();

app.use(express.json());
app.use(
  session({
    // Local-only app (see README): plain HTTP is fine here, so no `cookie.secure`.
    secret: process.env.SESSION_SECRET || 'houselist-dev-secret-change-if-deployed',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/households', requireAuth, householdRoutes);
app.use('/api/households/:householdId/lists', requireAuth, listsRouter);
app.use('/api/households/:householdId/items', requireAuth, itemsRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

// Centralized error handler: keeps API responses as JSON instead of Express's default
// HTML error page, and avoids leaking stack traces to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 3000;

// Only auto-start the listener when run directly (`npm start`), not when required by tests,
// so test files can control their own port/lifecycle.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`HouseList running at http://localhost:${PORT}`);
  });
}

module.exports = app;
