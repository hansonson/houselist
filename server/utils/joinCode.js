// Join-code generation: random, readable (no ambiguous 0/O/1/I/l), collision-checked by caller.
const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // excludes 0,O,1,I,L for readability
const CODE_LENGTH = 8;

function generateJoinCode() {
  let code = '';
  const bytes = crypto.randomBytes(CODE_LENGTH);
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

module.exports = { generateJoinCode };
