// Business logic for households and membership: join codes, who may do what, and the
// "a household always keeps an admin" rule. No HTTP, no SQL; throws domain errors.
const householdRepository = require('../repositories/householdRepository');
const membershipRepository = require('../repositories/membershipRepository');
const { generateJoinCode } = require('../utils/joinCode');
const { ValidationError, ForbiddenError, NotFoundError, ConflictError } = require('../errors');

const MAX_JOIN_CODE_ATTEMPTS = 10;
const NOT_A_MEMBER = 'That user is not a member of this household';

// Join codes must be unique across households; retry on the (very unlikely) collision.
function generateUniqueJoinCode() {
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
    const code = generateJoinCode();
    if (!householdRepository.findByJoinCode(code)) {
      return code;
    }
  }
  throw new Error('Could not generate a unique join code');
}

function getMembership(householdId, userId) {
  return membershipRepository.find(householdId, userId);
}

function listForUser(userId) {
  return householdRepository.findAllForUser(userId);
}

// The creator becomes the household's first admin.
function create(userId, name) {
  const cleanName = (name || '').trim();
  if (!cleanName) {
    throw new ValidationError('Household name is required');
  }
  const joinCode = generateUniqueJoinCode();
  const id = householdRepository.create(cleanName, joinCode);
  membershipRepository.add(id, userId, true);
  return { id, name: cleanName, joinCode, isAdmin: true };
}

// Self-service join: nobody is added to a household without entering its code.
function join(userId, code) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    throw new ValidationError('Join code is required');
  }
  const household = householdRepository.findByJoinCode(cleanCode);
  if (!household) {
    throw new NotFoundError('No household found for that join code');
  }
  if (membershipRepository.find(household.id, userId)) {
    throw new ConflictError('You are already a member of this household');
  }
  membershipRepository.add(household.id, userId, false);
  return { id: household.id, name: household.name, isAdmin: false };
}

// Only admins get to see the join code.
function getForMember(householdId, membership) {
  const household = householdRepository.findById(householdId);
  const result = { id: household.id, name: household.name, isAdmin: membership.isAdmin };
  if (membership.isAdmin) {
    result.joinCode = household.joinCode;
  }
  return result;
}

function deleteHousehold(householdId) {
  householdRepository.remove(householdId);
}

function listMembers(householdId) {
  return membershipRepository.findAllWithUsers(householdId).map((member) => ({
    id: member.userId,
    name: member.name,
    email: member.email,
    isAdmin: member.isAdmin,
    joinedAt: member.joinedAt,
  }));
}

function getJoinCode(householdId) {
  return householdRepository.findById(householdId).joinCode;
}

// The old code stops working immediately.
function regenerateJoinCode(householdId) {
  const joinCode = generateUniqueJoinCode();
  householdRepository.updateJoinCode(householdId, joinCode);
  return joinCode;
}

// Leave (target is yourself) or remove another member (admins only, any target incl. another admin).
function removeMember(householdId, actingMembership, targetUserId) {
  const isSelf = targetUserId === actingMembership.userId;
  if (!isSelf && !actingMembership.isAdmin) {
    throw new ForbiddenError('Admin rights required to remove another member');
  }
  const target = membershipRepository.find(householdId, targetUserId);
  if (!target) {
    throw new NotFoundError(NOT_A_MEMBER);
  }
  membershipRepository.remove(target.id);
  return ensureHouseholdHasAdmin(householdId);
}

function promoteMember(householdId, targetUserId) {
  const target = membershipRepository.find(householdId, targetUserId);
  if (!target) {
    throw new NotFoundError(NOT_A_MEMBER);
  }
  membershipRepository.makeAdmin(target.id);
}

// Invariant: a household with at least one member always has at least one admin. After a member
// leaves: promote the longest-tenured member if no admin is left; delete the household if it's empty.
function ensureHouseholdHasAdmin(householdId) {
  const remaining = membershipRepository.findAllByHousehold(householdId);
  if (remaining.length === 0) {
    householdRepository.remove(householdId);
    return { deleted: true };
  }
  if (!remaining.some((member) => member.isAdmin)) {
    const successor = remaining[0];
    membershipRepository.makeAdmin(successor.id);
    return { promotedUserId: successor.userId };
  }
  return {};
}

module.exports = {
  getMembership,
  listForUser,
  create,
  join,
  getForMember,
  deleteHousehold,
  listMembers,
  getJoinCode,
  regenerateJoinCode,
  removeMember,
  promoteMember,
};
