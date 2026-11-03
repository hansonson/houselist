// Data access for users. All SQL for the users table lives here; no business rules.
const db = require('../db');

function toUser(row) {
  return row
    ? { id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash }
    : null;
}

function findByEmail(email) {
  return toUser(db.prepare('SELECT * FROM users WHERE email = ?').get(email));
}

// Returns the new user's id, or null if the email is already taken (UNIQUE constraint).
function create(name, email, passwordHash) {
  try {
    const result = db
      .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name, email, passwordHash);
    return Number(result.lastInsertRowid);
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      return null;
    }
    throw err;
  }
}

module.exports = { findByEmail, create };
