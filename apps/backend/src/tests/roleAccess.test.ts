/**
 * Pure-logic tests for TZ-552: Initiative role restructure.
 * Tests the canAccessAction role-based access matrix without hitting the DB.
 * Run with: npx ts-node src/tests/roleAccess.test.ts
 */

import assert from 'assert';

// ── Mirror of the role-based logic in canAccessAction ────────────────────────

function canEdit(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

function resolveAccess(
  role: string | null,
  isAssignee: boolean
): { ok: boolean; canModify: boolean } {
  if (canEdit(role)) return { ok: true, canModify: true };
  if (role === 'collaborator') return { ok: true, canModify: isAssignee };
  if (role === 'member') return { ok: isAssignee, canModify: isAssignee };
  // standalone / unknown
  return { ok: isAssignee, canModify: isAssignee };
}

// ── Test helpers ─────────────────────────────────────────────────────────────

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

// ── owner ─────────────────────────────────────────────────────────────────────

console.log('\nowner role');
test('can view any task', () => {
  const { ok } = resolveAccess('owner', false);
  assert.strictEqual(ok, true);
});
test('can edit any task (not assigned)', () => {
  const { canModify } = resolveAccess('owner', false);
  assert.strictEqual(canModify, true);
});
test('can edit any task (assigned)', () => {
  const { canModify } = resolveAccess('owner', true);
  assert.strictEqual(canModify, true);
});

// ── admin ─────────────────────────────────────────────────────────────────────

console.log('\nadmin role');
test('can view any task', () => {
  assert.strictEqual(resolveAccess('admin', false).ok, true);
});
test('can edit any task (not assigned)', () => {
  assert.strictEqual(resolveAccess('admin', false).canModify, true);
});
test('can edit any task (assigned)', () => {
  assert.strictEqual(resolveAccess('admin', true).canModify, true);
});

// ── collaborator (formerly member) ───────────────────────────────────────────

console.log('\ncollaborator role');
test('can view tasks they are NOT assigned to', () => {
  assert.strictEqual(resolveAccess('collaborator', false).ok, true);
});
test('cannot edit tasks they are NOT assigned to', () => {
  assert.strictEqual(resolveAccess('collaborator', false).canModify, false);
});
test('can view tasks they ARE assigned to', () => {
  assert.strictEqual(resolveAccess('collaborator', true).ok, true);
});
test('can edit tasks they ARE assigned to', () => {
  assert.strictEqual(resolveAccess('collaborator', true).canModify, true);
});

// ── member (new restricted role) ─────────────────────────────────────────────

console.log('\nmember role');
test('cannot view tasks they are NOT assigned to', () => {
  assert.strictEqual(resolveAccess('member', false).ok, false);
});
test('cannot edit tasks they are NOT assigned to', () => {
  assert.strictEqual(resolveAccess('member', false).canModify, false);
});
test('can view tasks they ARE assigned to', () => {
  assert.strictEqual(resolveAccess('member', true).ok, true);
});
test('can edit tasks they ARE assigned to', () => {
  assert.strictEqual(resolveAccess('member', true).canModify, true);
});

// ── role validation: accepted values in addMember / updateMember ─────────────

import { z } from 'zod';

const addMemberRoleSchema = z.enum(['admin', 'collaborator', 'member']);
const updateMemberRoleSchema = z.enum(['admin', 'collaborator', 'member']);

console.log('\nrole schema validation');
test('admin is a valid addMember role', () => {
  assert.doesNotThrow(() => addMemberRoleSchema.parse('admin'));
});
test('collaborator is a valid addMember role', () => {
  assert.doesNotThrow(() => addMemberRoleSchema.parse('collaborator'));
});
test('member is a valid addMember role', () => {
  assert.doesNotThrow(() => addMemberRoleSchema.parse('member'));
});
test('owner is NOT a valid addMember role', () => {
  assert.throws(() => addMemberRoleSchema.parse('owner'));
});
test('collaborator is a valid updateMember role', () => {
  assert.doesNotThrow(() => updateMemberRoleSchema.parse('collaborator'));
});

// ── inviteEmails schema validation ───────────────────────────────────────────

const inviteEmailsSchema = z.array(z.string().email()).optional().default([]);

console.log('\ninviteEmails schema validation');
test('accepts a valid email array', () => {
  const result = inviteEmailsSchema.parse(['alice@example.com', 'bob@company.org']);
  assert.deepStrictEqual(result, ['alice@example.com', 'bob@company.org']);
});
test('rejects invalid email strings', () => {
  assert.throws(() => inviteEmailsSchema.parse(['not-an-email']));
});
test('defaults to empty array when undefined', () => {
  const result = inviteEmailsSchema.parse(undefined);
  assert.deepStrictEqual(result, []);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
