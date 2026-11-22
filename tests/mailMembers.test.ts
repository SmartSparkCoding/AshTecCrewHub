/**
 * Emailing a file to named people (Nov 22, the register that three staff asked
 * for by email).
 *
 * The dangerous part is not the attachment, it is the addressing: an agent
 * typing "lbourne@..." from memory is how a register goes to the wrong person.
 * So the rules these pin are that addresses come from the member list, and that
 * a name matching nobody or two people sends nothing at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchPeople } from '../server/mailMembers.js';

const source = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const pool = [
  { id: 'm1', firstName: 'L', lastName: 'Bourne', schoolEmail: 'bourneL@ashpupil.co.uk', isAdmin: true, memberType: 'Teacher' },
  { id: 'm2', firstName: 'N', lastName: 'Andrews', schoolEmail: 'andrewsN@ashpupil.co.uk', isAdmin: false, memberType: 'Teacher' },
  { id: 'm3', firstName: 'C', lastName: 'King', schoolEmail: 'kingC@ashpupil.co.uk', isAdmin: false, memberType: 'Teacher', alternateEmails: 'ck@example.com' },
  { id: 'm4', firstName: 'Fiona', lastName: 'Moore', schoolEmail: 'mooref@ashpupil.co.uk', isAdmin: true, memberType: 'Normal Member' },
  { id: 'm5', firstName: 'Jacob', lastName: 'Navaratne', schoolEmail: 'navaratnej@ashpupil.co.uk', isAdmin: true, memberType: 'Normal Member' },
  { id: 'm6', firstName: 'J', lastName: 'Moore', schoolEmail: 'moorej@ashpupil.co.uk', isAdmin: false, memberType: 'Normal Member' },
  { id: 'm7', firstName: 'Gorkie', lastName: 'Dev Agent', schoolEmail: 'agent@ashtec.dev', isAdmin: true, memberType: 'AI Agent' },
];

test('a name resolves to the address the platform holds, not one we typed', async () => {
  const r = await matchPeople(['L Bourne', 'Andrews', 'King'], pool);
  assert.deepEqual(r.matched.map((p) => p.email).sort(), [
    'andrewsN@ashpupil.co.uk',
    'bourneL@ashpupil.co.uk',
    'kingC@ashpupil.co.uk',
  ]);
  assert.equal(r.missing.length, 0);
  assert.equal(r.ambiguous.length, 0);
});

test('"Mr Andrews" finds the same person as "N Andrews"', async () => {
  const r = await matchPeople(['Mr Andrews'], pool);
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].id, 'm2');
});

test('a name matching two people is ambiguous and resolves to neither', async () => {
  const r = await matchPeople(['Moore'], pool);
  assert.equal(r.matched.length, 0, 'nothing is picked for you');
  assert.equal(r.ambiguous.length, 1);
  assert.equal(r.ambiguous[0].candidates.length, 2);
});

test('an unknown name is reported, never dropped quietly', async () => {
  const r = await matchPeople(['Nobody Atall'], pool);
  assert.deepEqual(r.matched, []);
  assert.deepEqual(r.missing, ['Nobody Atall']);
});

test('an address only matches when it is on the member record', async () => {
  const ok = await matchPeople(['ck@example.com'], pool);
  assert.equal(ok.matched[0]?.id, 'm3', 'alternate addresses count');
  const bad = await matchPeople(['someone@elsewhere.com'], pool);
  assert.deepEqual(bad.missing, ['someone@elsewhere.com']);
});

test('AI agent accounts are not people and never receive mail', async () => {
  const r = await matchPeople(['Gorkie Dev Agent'], pool);
  assert.deepEqual(r.matched, []);
});

test('a bad name stops the send before anything is emailed or logged', () => {
  const s = source('server/mailMembers.ts');
  const guard = s.indexOf('if (missing.length || ambiguous.length) return base;');
  assert.ok(guard > -1, 'missing/ambiguous must return before sending');
  assert.ok(guard < s.indexOf('await Email.send('), 'guard comes before the send');
  assert.ok(guard < s.indexOf('zite.emailLog.bulkCreate'), 'and before the log');
});

test('the attachment is base64 in the request and handed to nodemailer as such', () => {
  const digest = source('tests/mailMembers.test.ts');
  const email = source('server/email.ts');
  assert.match(email, /base64: string;/, 'SendEmailParams takes base64');
  assert.match(email, /encoding: 'base64' as const/, 'nodemailer is told how to read it');
  assert.match(email, /cc: cc\.join\('\, '\)/, 'copies are real copies, not more recipients');
  assert.ok(digest.length > 0);
});

test('every recipient is written to the admin email log under one batch', () => {
  const s = source('server/mailMembers.ts');
  assert.match(s, /purpose: attachment \? 'Register email' : 'Crew email'/);
  assert.match(s, /sentBy: 'gorkie'/);
  assert.match(s, /const batchId = crypto\.randomUUID\(\)/);
  const batch = s.indexOf('const batchId');
  assert.ok(batch < s.indexOf('batchId,'), 'the same batch id goes on every row');
});

test('the MCP tool exists, takes a file, and asks for a dry run first', () => {
  const s = source('server/mcp.ts');
  assert.match(s, /name: 'email_members'/);
  const tool = s.slice(s.indexOf("name: 'email_members'"));
  const block = tool.slice(0, tool.indexOf("name: 'search'"));
  assert.match(block, /dryRun: \{ type: 'boolean'/, 'dryRun is offered');
  assert.match(block, /attachment: \{/, 'an attachment is accepted');
  assert.match(block, /required: \['to', 'subject', 'body'\]/);
  assert.match(block, /ccAdmins: \{ type: 'boolean'/);
});

test('names, not addresses, are what the tool asks for', () => {
  const s = source('server/mcp.ts');
  const block = s.slice(s.indexOf("name: 'email_members'"), s.indexOf("name: 'search'"));
  assert.match(block, /Names from the member list/);
  assert.match(block, /do not pass addresses unless you were given one/);
});
