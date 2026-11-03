// HTTP layer for authentication: maps requests to authService and manages the session cookie.
const express = require('express');
const authService = require('../services/authService');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    req.session.user = await authService.register(name, email, password);
    res.status(201).json({ user: req.session.user });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    req.session.user = await authService.login(email, password);
    res.json({ user: req.session.user });
  })
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

module.exports = router;
