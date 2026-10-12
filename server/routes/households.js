const express = require('express');
const db = require('../db');
const { generateJoinCode } = require('../utils/joinCode');
const {
  requireHouseholdMember,
  requireHouseholdAdmin,
  ensureHouseholdHasAdmin,
} = require('../middleware/household');

const router = express.Router();

function uniqueJoinCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateJoinCode();
    const clash = db.prepare('SELECT id FROM households WHERE join_code = ?').get(code);
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique join code');
}

// All households the current user belongs to, with their role in each.
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT h.id, h.name, hm.is_admin
       FROM household_members hm
       JOIN households h ON h.id = hm.household_id
       WHERE hm.user_id = ?
       ORDER BY hm.joined_at ASC`
    )
    .all(req.session.user.id);
  res.json({ households: rows.map((r) => ({ id: r.id, name: r.name, isAdmin: !!r.is_admin })) });
});

// Create a household. Any logged-in user; creator becomes its first admin.
router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Household name is required' });
  }
  const joinCode = uniqueJoinCode();
  const result = db.prepare('INSERT INTO households (name, join_code) VALUES (?, ?)').run(name, joinCode);
  const householdId = Number(result.lastInsertRowid);
  db.prepare(
    'INSERT INTO household_members (household_id, user_id, is_admin) VALUES (?, ?, 1)'
  ).run(householdId, req.session.user.id);
  res.status(201).json({ household: { id: householdId, name, joinCode, isAdmin: true } });
});

// Self-service join via code. No lookup of other users; nobody is added without entering the code.
router.post('/join', (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'Join code is required' });
  }
  const household = db.prepare('SELECT * FROM households WHERE join_code = ?').get(code);
  if (!household) {
    return res.status(404).json({ error: 'No household found for that join code' });
  }
  const existing = db
    .prepare('SELECT id FROM household_members WHERE household_id = ? AND user_id = ?')
    .get(household.id, req.session.user.id);
  if (existing) {
    return res.status(409).json({ error: 'You are already a member of this household' });
  }
  db.prepare(
    'INSERT INTO household_members (household_id, user_id, is_admin) VALUES (?, ?, 0)'
  ).run(household.id, req.session.user.id);
  res.status(201).json({ household: { id: household.id, name: household.name, isAdmin: false } });
});

router.get('/:householdId', requireHouseholdMember, (req, res) => {
  const household = db.prepare('SELECT id, name, join_code FROM households WHERE id = ?').get(req.householdId);
  const payload = { id: household.id, name: household.name, isAdmin: !!req.membership.is_admin };
  if (req.membership.is_admin) {
    payload.joinCode = household.join_code;
  }
  res.json({ household: payload });
});

// Admin-only: delete the household entirely (cascades to memberships, lists, items).
router.delete('/:householdId', requireHouseholdMember, requireHouseholdAdmin, (req, res) => {
  db.prepare('DELETE FROM households WHERE id = ?').run(req.householdId);
  res.json({ ok: true });
});

router.get('/:householdId/members', requireHouseholdMember, (req, res) => {
  const members = db
    .prepare(
      `SELECT u.id, u.name, u.email, hm.is_admin, hm.joined_at
       FROM household_members hm
       JOIN users u ON u.id = hm.user_id
       WHERE hm.household_id = ?
       ORDER BY hm.joined_at ASC`
    )
    .all(req.householdId);
  res.json({
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      isAdmin: !!m.is_admin,
      joinedAt: m.joined_at,
    })),
  });
});

// Admin-only: view the current join code.
router.get('/:householdId/join-code', requireHouseholdMember, requireHouseholdAdmin, (req, res) => {
  const household = db.prepare('SELECT join_code FROM households WHERE id = ?').get(req.householdId);
  res.json({ joinCode: household.join_code });
});

// Admin-only: invalidate the old code, issue a new one.
router.post(
  '/:householdId/join-code/regenerate',
  requireHouseholdMember,
  requireHouseholdAdmin,
  (req, res) => {
    const newCode = uniqueJoinCode();
    db.prepare('UPDATE households SET join_code = ? WHERE id = ?').run(newCode, req.householdId);
    res.json({ joinCode: newCode });
  }
);

// Leave (self) or remove (admin, any target including another admin).
router.delete('/:householdId/members/:userId', requireHouseholdMember, (req, res) => {
  const targetUserId = Number(req.params.userId);
  const isSelf = targetUserId === req.session.user.id;
  if (!isSelf && !req.membership.is_admin) {
    return res.status(403).json({ error: 'Admin rights required to remove another member' });
  }
  const target = db
    .prepare('SELECT * FROM household_members WHERE household_id = ? AND user_id = ?')
    .get(req.householdId, targetUserId);
  if (!target) {
    return res.status(404).json({ error: 'That user is not a member of this household' });
  }
  db.prepare('DELETE FROM household_members WHERE id = ?').run(target.id);
  const outcome = ensureHouseholdHasAdmin(req.householdId);
  res.json({ ok: true, ...outcome });
});

// Admin-only: promote a regular member to admin.
router.post(
  '/:householdId/members/:userId/promote',
  requireHouseholdMember,
  requireHouseholdAdmin,
  (req, res) => {
    const targetUserId = Number(req.params.userId);
    const target = db
      .prepare('SELECT * FROM household_members WHERE household_id = ? AND user_id = ?')
      .get(req.householdId, targetUserId);
    if (!target) {
      return res.status(404).json({ error: 'That user is not a member of this household' });
    }
    db.prepare('UPDATE household_members SET is_admin = 1 WHERE id = ?').run(target.id);
    res.json({ ok: true });
  }
);

module.exports = router;
