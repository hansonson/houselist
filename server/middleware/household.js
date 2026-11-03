// HTTP guards for household-scoped routes. The membership lookup itself is delegated to the service layer.
const householdService = require('../services/householdService');
const { ValidationError, ForbiddenError } = require('../errors');

// Requires req.params.householdId; attaches req.householdId and req.membership if the user belongs to it.
function requireHouseholdMember(req, res, next) {
  const householdId = Number(req.params.householdId);
  if (!Number.isInteger(householdId)) {
    return next(new ValidationError('Invalid household id'));
  }
  const membership = householdService.getMembership(householdId, req.session.user.id);
  if (!membership) {
    return next(new ForbiddenError('Not a member of this household'));
  }
  req.householdId = householdId;
  req.membership = membership;
  next();
}

// Must run after requireHouseholdMember.
function requireHouseholdAdmin(req, res, next) {
  if (!req.membership || !req.membership.isAdmin) {
    return next(new ForbiddenError('Admin rights required'));
  }
  next();
}

module.exports = { requireHouseholdMember, requireHouseholdAdmin };
