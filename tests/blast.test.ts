/**
 * The crew email (asked for Nov 22). It is the one tool that can annoy everyone
 * at once, so these tests pin the parts that make it safe: who is never a
 * recipient, that a dry run genuinely sends nothing, and that every send is
 * logged.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const blast = readFileSync(join(root, 'server/blast.ts'), 'utf8');
const mcp = readFileSync(join(root, 'server/mcp.ts'), 'utf8');
const rules = readFileSync(join(root, 'src/lib/server.ts'), 'utf8');

describe('the crew email', () => {
  it('is never addressed to staff, agents or preview accounts', () => {
    assert.match(blast, /isEmailable\(m\)/, 'the app already drops staff and preview accounts here');
    assert.match(blast, /m\.memberType === 'AI Agent'\) return false/, 'an AI agent account is not a person');
    assert.match(blast, /if \(isStaff\(m\)\) return false/, 'staff are left out even when they are maintainers, which isEmailable alone would keep');
    assert.match(rules, /!m\.isPreviewAccount/, 'preview accounts have no real inbox, and isEmailable is where that is decided');
  });

  it('honours a list of names to leave out', () => {
    assert.match(blast, /exclude = \[\]/);
    assert.match(blast, /name\.includes\(w\) \|\| email\.includes\(w\)/, 'matches a name or an address, case-insensitively');
    assert.match(mcp, /args\.exclude/);
  });

  it('sends nothing at all on a dry run', () => {
    const dry = blast.indexOf('if (input.dryRun)');
    const send = blast.indexOf('await Email.send');
    assert.ok(dry > 0 && send > 0);
    assert.ok(dry < send, 'the dry run has to return before the first send, not filter it afterwards');
    assert.match(blast, /dryRun: true, count: recipients\.length, names/);
  });

  it('caps how many people one call can reach', () => {
    assert.match(blast, /export const MAX_BLAST = 400/);
    assert.match(blast, /\.slice\(0, MAX_BLAST\)/);
  });

  it('writes every send to the email log under one batch', () => {
    assert.match(blast, /purpose: 'Crew email'/);
    assert.match(blast, /const batchId = crypto\.randomUUID\(\)/);
    assert.match(blast, /zite\.emailLog\.bulkCreate/, 'so the admin email log can answer "what did that blast actually send"');
    assert.match(blast, /sentBy: 'gorkie'/);
  });

  it('fills in the first name and needs a subject and a body', () => {
    assert.match(blast, /body\.replace\(\/\\\{name\\\}\/g, first\)/);
    assert.match(blast, /A subject is needed\./);
    assert.match(blast, /A body is needed\./);
  });

  it('is reachable from the MCP as email_crew, and says to dry run first', () => {
    assert.match(mcp, /name: 'email_crew'/);
    assert.match(mcp, /import \{ sendBlast \} from '\.\/blast\.js'/);
    assert.match(mcp, /dryRun: !!args\.dryRun/);
    assert.match(mcp, /dryRun: \{\s*type: 'boolean'/, 'the schema has to offer the preview');
  });
});
