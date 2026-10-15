/**
 * Pure-logic tests for external (password) sign-in eligibility.
 * Run with: npx ts-node src/tests/externalAuth.test.ts
 */

import assert from 'assert';

process.env.STAFF_EMAIL_DOMAINS = 'forsysinc.com, forsys.com';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isStaffEmail, canUsePassword, hashToken, normalizeEmail } = require('../services/externalAuthService');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

const external = { email: 'pat@client.com', isExternal: true, googleId: null, role: 'user' };

console.log('\nisStaffEmail');
test('staff domain is staff', () => assert.strictEqual(isStaffEmail('a@forsysinc.com'), true));
test('second configured domain is staff', () => assert.strictEqual(isStaffEmail('a@forsys.com'), true));
test('case and whitespace are ignored', () => assert.strictEqual(isStaffEmail('  A@ForsysInc.COM '), true));
test('other domain is not staff', () => assert.strictEqual(isStaffEmail('a@client.com'), false));
test('look-alike subdomain is not staff', () => assert.strictEqual(isStaffEmail('a@evil.forsysinc.com'), false));
test('look-alike suffix is not staff', () => assert.strictEqual(isStaffEmail('a@notforsysinc.com'), false));

console.log('\ncanUsePassword');
test('external user can use password', () => assert.strictEqual(canUsePassword(external), true));
test('not flagged external -> no', () => assert.strictEqual(canUsePassword({ ...external, isExternal: false }), false));
test('has signed in with Google -> no', () => assert.strictEqual(canUsePassword({ ...external, googleId: 'g-1' }), false));
test('superadmin -> no', () => assert.strictEqual(canUsePassword({ ...external, role: 'superadmin' }), false));
test('staff email even if flagged external -> no', () => assert.strictEqual(canUsePassword({ ...external, email: 'x@forsysinc.com' }), false));

console.log('\nhelpers');
test('normalizeEmail lowercases and trims', () => assert.strictEqual(normalizeEmail(' Pat@Client.COM '), 'pat@client.com'));
test('hashToken is stable sha256 hex', () => {
  assert.strictEqual(hashToken('abc'), hashToken('abc'));
  assert.match(hashToken('abc'), /^[a-f0-9]{64}$/);
  assert.notStrictEqual(hashToken('abc'), hashToken('abd'));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
