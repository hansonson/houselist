// HTTP layer for households and membership: maps requests to householdService, nothing more.
const express = require('express');
const householdService = require('../services/householdService');
const { requireHouseholdMember, requireHouseholdAdmin } = require('../middleware/household');

const router = express.Router();

// All households the current user belongs to, with their role in each.
router.get('/', (req, res) => {
  res.json({ households: householdService.listForUser(req.session.user.id) });
});

router.post('/', (req, res) => {
  const household = householdService.create(req.session.user.id, req.body.name);
  res.status(201).json({ household });
});

router.post('/join', (req, res) => {
  const household = householdService.join(req.session.user.id, req.body.code);
  res.status(201).json({ household });
});

router.get('/:householdId', requireHouseholdMember, (req, res) => {
  res.json({ household: householdService.getForMember(req.householdId, req.membership) });
});

router.delete('/:householdId', requireHouseholdMember, requireHouseholdAdmin, (req, res) => {
  householdService.deleteHousehold(req.householdId);
  res.json({ ok: true });
});

router.get('/:householdId/members', requireHouseholdMember, (req, res) => {
  res.json({ members: householdService.listMembers(req.householdId) });
});

router.get('/:householdId/join-code', requireHouseholdMember, requireHouseholdAdmin, (req, res) => {
  res.json({ joinCode: householdService.getJoinCode(req.householdId) });
});

router.post(
  '/:householdId/join-code/regenerate',
  requireHouseholdMember,
  requireHouseholdAdmin,
  (req, res) => {
    res.json({ joinCode: householdService.regenerateJoinCode(req.householdId) });
  }
);

// Leave (own user id) or remove another member; the service decides who may do which.
router.delete('/:householdId/members/:userId', requireHouseholdMember, (req, res) => {
  const outcome = householdService.removeMember(
    req.householdId,
    req.membership,
    Number(req.params.userId)
  );
  res.json({ ok: true, ...outcome });
});

router.post(
  '/:householdId/members/:userId/promote',
  requireHouseholdMember,
  requireHouseholdAdmin,
  (req, res) => {
    householdService.promoteMember(req.householdId, Number(req.params.userId));
    res.json({ ok: true });
  }
);

module.exports = router;
