const db = require('../db');

// Requires req.params.householdId; attaches req.membership if the user belongs to it.
function requireHouseholdMember(req, res, next) {
  const householdId = Number(req.params.householdId);
  if (!Number.isInteger(householdId)) {
    return res.status(400).json({ error: 'Invalid household id' });
  }
  const membership = db
    .prepare('SELECT * FROM household_members WHERE household_id = ? AND user_id = ?')
    .get(householdId, req.session.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Not a member of this household' });
  }
  req.householdId = householdId;
  req.membership = membership;
  next();
}

// Must run after requireHouseholdMember.
function requireHouseholdAdmin(req, res, next) {
  if (!req.membership || !req.membership.is_admin) {
    return res.status(403).json({ error: 'Admin rights required' });
  }
  next();
}

// Invariant: a household with >=1 member always has >=1 admin. Call this after deleting
// a household_members row (leave or remove) in case the departing member was the last admin.
function ensureHouseholdHasAdmin(householdId) {
  const remaining = db
    .prepare('SELECT * FROM household_members WHERE household_id = ? ORDER BY joined_at ASC')
    .all(householdId);

  if (remaining.length === 0) {
    // No members left at all -> cascades to lists/items too.
    db.prepare('DELETE FROM households WHERE id = ?').run(householdId);
    return { deleted: true };
  }

  const hasAdmin = remaining.some((m) => m.is_admin);
  if (!hasAdmin) {
    const successor = remaining[0]; // longest-tenured remaining member
    db.prepare('UPDATE household_members SET is_admin = 1 WHERE id = ?').run(successor.id);
    return { promotedUserId: successor.user_id };
  }

  return {};
}

module.exports = { requireHouseholdMember, requireHouseholdAdmin, ensureHouseholdHasAdmin };
