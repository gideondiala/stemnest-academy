/**
 * Passwords that were published (in this public repo's history, old docs or
 * seed files). They can never be set again, and accounts still using one
 * are asked to reset it.
 */
const EXPOSED = new Set(['admin123', 'founder2024!', 'stemnest2024!', 'password', 'password123', 'stemnest', 'stemnest123']);

function isExposedPassword(pw) {
  return EXPOSED.has(String(pw || '').trim().toLowerCase());
}

const EXPOSED_MESSAGE = 'This password is not safe to use (it has been published). Please choose a different one.';

module.exports = { isExposedPassword, EXPOSED_MESSAGE };
