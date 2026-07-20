/**
 * Work-items domain over a real backend (libsql `:memory:`): sourceKey
 * dedup scoping and the atomic update path.
 */

import { LibSQLFactoryStorage } from '@mastra/libsql';
import { describe, expect, it } from 'vitest';

import { applyStageTransition, isAutomationActor, WorkItemsStorage } from './base';
import type { WorkItemStageEntry } from './base';

const input = {
  source: 'github-issue' as const,
  sourceKey: 'github-issue:42',
  title: 'Fix login',
  url: null,
  stages: ['intake'],
  sessions: {},
  metadata: {},
};

async function makeStorage(): Promise<WorkItemsStorage> {
  const backend = new LibSQLFactoryStorage({ id: 'work-items-test', url: ':memory:' });
  const domain = backend.registerDomain(new WorkItemsStorage());
  await backend.init();
  return domain;
}

describe('WorkItemsStorage', () => {
  it('deduplicates source keys within an org, not across orgs', async () => {
    const storage = await makeStorage();

    const first = await storage.upsert({ orgId: 'org1', userId: 'user1', githubProjectId: 'project1', input });
    const otherOrg = await storage.upsert({ orgId: 'org2', userId: 'user2', githubProjectId: 'project1', input });
    const reused = await storage.upsert({
      orgId: 'org1',
      userId: 'user3',
      githubProjectId: 'project1',
      input: { ...input, title: 'Updated title' },
    });

    expect(first.created).toBe(true);
    expect(otherOrg.created).toBe(true);
    expect(otherOrg.item.id).not.toBe(first.item.id);
    expect(reused.created).toBe(false);
    expect(reused.item.id).toBe(first.item.id);
  });

  it('lists newest-first within the org/project scope and updates atomically', async () => {
    const storage = await makeStorage();

    const a = await storage.upsert({ orgId: 'org1', userId: 'u', githubProjectId: 'p1', input });
    await storage.upsert({
      orgId: 'org1',
      userId: 'u',
      githubProjectId: 'p1',
      input: { ...input, sourceKey: 'github-issue:43', title: 'Second' },
    });

    const listed = await storage.list('org1', 'p1');
    expect(listed).toHaveLength(2);
    expect(await storage.list('org2', 'p1')).toHaveLength(0);

    const updated = await storage.update('org1', a.item.id, 'mover', { stages: ['build'] });
    expect(updated?.item.stages).toEqual(['build']);
    expect(updated?.previous.stages).toEqual(['intake']);

    const deleted = await storage.delete('org1', a.item.id);
    expect(deleted?.id).toBe(a.item.id);
    expect(await storage.delete('org1', a.item.id)).toBeNull();
  });

  it('stamps the actor in both `by` and `exitedBy` when a stage move closes an entry', async () => {
    const storage = await makeStorage();
    const created = await storage.upsert({ orgId: 'org1', userId: 'creator', githubProjectId: 'p1', input });

    const updated = await storage.update('org1', created.item.id, 'mover', { stages: ['triage'] });

    const history = updated!.item.stageHistory;
    const closed = history.find(entry => entry.stage === 'intake')!;
    const opened = history.find(entry => entry.stage === 'triage')!;
    expect(closed.exitedAt).toBeDefined();
    expect(closed.exitedBy).toBe('mover');
    expect(closed.by).toBe('creator');
    expect(opened.by).toBe('mover');
    expect(opened.exitedAt).toBeUndefined();
    expect(opened.exitedBy).toBeUndefined();
  });
});

describe('applyStageTransition', () => {
  it('stamps exitedBy alongside exitedAt when closing an exited stage', () => {
    const history: WorkItemStageEntry[] = [{ stage: 'intake', enteredAt: '2026-07-01T00:00:00.000Z', by: 'user_1' }];

    const next = applyStageTransition(history, ['intake'], ['triage'], 'user_2', new Date('2026-07-02T00:00:00.000Z'));

    expect(next[0]).toEqual({
      stage: 'intake',
      enteredAt: '2026-07-01T00:00:00.000Z',
      by: 'user_1',
      exitedAt: '2026-07-02T00:00:00.000Z',
      exitedBy: 'user_2',
    });
    expect(next[1]).toEqual({ stage: 'triage', enteredAt: '2026-07-02T00:00:00.000Z', by: 'user_2' });
  });

  it('leaves entries closed before exit stamping existed (no exitedBy) untouched', () => {
    const legacy: WorkItemStageEntry[] = [
      { stage: 'intake', enteredAt: '2026-06-01T00:00:00.000Z', exitedAt: '2026-06-02T00:00:00.000Z', by: 'user_1' },
      { stage: 'triage', enteredAt: '2026-06-02T00:00:00.000Z', by: 'user_1' },
    ];

    const next = applyStageTransition(legacy, ['triage'], ['planning'], 'user_2', new Date('2026-07-01T00:00:00.000Z'));

    expect(next[0]).toEqual(legacy[0]); // no retroactive exitedBy
    expect(next[0]!.exitedBy).toBeUndefined();
    expect(next[1]!.exitedBy).toBe('user_2');
  });
});

describe('isAutomationActor', () => {
  it.each([
    ['factory', true],
    ['system', true],
    ['automation', true],
    ['user_wos_123', false],
    ['agent:thread-1', false],
    ['', false],
    [undefined, false],
  ] as const)('isAutomationActor(%j) → %s', (actor, expected) => {
    expect(isAutomationActor(actor)).toBe(expected);
  });
});
