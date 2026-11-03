// Business logic for registration and login: input rules, password hashing, credential checks.
// Knows nothing about HTTP or sessions; returns the public user object or throws a domain error.
const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const { ValidationError, AuthenticationError, ConflictError } = require('../errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 10;
const EMAIL_TAKEN = 'An account with this email already exists';

// Emails are stored trimmed and lowercased, so matching is case-insensitive.
function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

async function register(name, email, password) {
  const cleanName = (name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = password || '';

  if (!cleanName || !cleanEmail || !cleanPassword) {
    throw new ValidationError('Name, email and password are all required');
  }
  if (!EMAIL_RE.test(cleanEmail)) {
    throw new ValidationError('Please enter a valid email address');
  }
  if (cleanPassword.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (userRepository.findByEmail(cleanEmail)) {
    throw new ConflictError(EMAIL_TAKEN);
  }

  const passwordHash = await bcrypt.hash(cleanPassword, BCRYPT_ROUNDS);
  const id = userRepository.create(cleanName, cleanEmail, passwordHash);
  // A concurrent registration with the same email can still slip past the check above.
  if (id === null) {
    throw new ConflictError(EMAIL_TAKEN);
  }
  return { id, name: cleanName, email: cleanEmail };
}

async function login(email, password) {
  const user = userRepository.findByEmail(normalizeEmail(email));
  // Same error for an unknown email and a wrong password, so it doesn't reveal which emails exist.
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    throw new AuthenticationError('Invalid email or password');
  }
  return { id: user.id, name: user.name, email: user.email };
}

module.exports = { register, login };
