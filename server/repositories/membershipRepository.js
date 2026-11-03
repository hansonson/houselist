// Data access for household memberships (the household_members pivot table); no business rules.
const db = require('../db');

function toMembership(row) {
  return row
    ? {
        id: row.id,
        householdId: row.household_id,
        userId: row.user_id,
        isAdmin: !!row.is_admin,
        joinedAt: row.joined_at,
      }
    : null;
}

function find(householdId, userId) {
  return toMembership(
    db
      .prepare('SELECT * FROM household_members WHERE household_id = ? AND user_id = ?')
      .get(householdId, userId)
  );
}

// Oldest membership first: the order admin succession relies on.
function findAllByHousehold(householdId) {
  return db
    .prepare('SELECT * FROM household_members WHERE household_id = ? ORDER BY joined_at ASC')
    .all(householdId)
    .map(toMembership);
}

// Memberships joined with each member's user details, oldest membership first.
function findAllWithUsers(householdId) {
  return db
    .prepare(
      `SELECT u.id AS user_id, u.name, u.email, hm.is_admin, hm.joined_at
       FROM household_members hm
       JOIN users u ON u.id = hm.user_id
       WHERE hm.household_id = ?
       ORDER BY hm.joined_at ASC`
    )
    .all(householdId)
    .map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      isAdmin: !!row.is_admin,
      joinedAt: row.joined_at,
    }));
}

function add(householdId, userId, isAdmin) {
  db.prepare(
    'INSERT INTO household_members (household_id, user_id, is_admin) VALUES (?, ?, ?)'
  ).run(householdId, userId, isAdmin ? 1 : 0);
}

function makeAdmin(membershipId) {
  db.prepare('UPDATE household_members SET is_admin = 1 WHERE id = ?').run(membershipId);
}

function remove(membershipId) {
  db.prepare('DELETE FROM household_members WHERE id = ?').run(membershipId);
}

module.exports = { find, findAllByHousehold, findAllWithUsers, add, makeAdmin, remove };
