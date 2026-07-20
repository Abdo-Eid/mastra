/**
 * Store-level tests for the server-internal automation write path:
 * `moveWorkItemStagesAsAutomation` stamps the canonical automation actor into
 * stage history, and metrics attribute the move to automation.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetRuntimeConfigForTests } from '../runtime-config';
import { AUTOMATION_ACTOR } from '../storage/domains/work-items/base';
import { seedFactoryStorageForTests } from '../storage/test-utils';
import { computeFactoryMetrics } from './metrics';
import { moveWorkItemStagesAsAutomation, upsertWorkItem } from './store';

const input = {
  source: 'github-issue' as const,
  sourceKey: 'github-issue:7',
  title: 'Automate me',
  url: null,
  stages: ['intake'],
  sessions: {},
  metadata: {},
};

describe('moveWorkItemStagesAsAutomation', () => {
  beforeEach(async () => {
    await seedFactoryStorageForTests();
  });

  afterEach(() => {
    __resetRuntimeConfigForTests();
  });

  it('stamps the automation actor on entered and exited history entries', async () => {
    const created = await upsertWorkItem({ orgId: 'org1', userId: 'user_1', githubProjectId: 'p1', input });

    const moved = await moveWorkItemStagesAsAutomation('org1', created.item.id, ['triage']);

    expect(moved).not.toBeNull();
    expect(moved!.item.stages).toEqual(['triage']);
    expect(moved!.previous.stages).toEqual(['intake']);
    const history = moved!.item.stageHistory;
    const closed = history.find(entry => entry.stage === 'intake')!;
    const opened = history.find(entry => entry.stage === 'triage')!;
    expect(closed.by).toBe('user_1'); // human created it
    expect(closed.exitedBy).toBe(AUTOMATION_ACTOR);
    expect(opened.by).toBe(AUTOMATION_ACTOR);
    expect(opened.exitedAt).toBeUndefined();

    // Metrics split human vs total accordingly: intake entered by a human,
    // triage entered by automation → 1 human of 2 total.
    const metrics = computeFactoryMetrics([moved!.item], { days: 30, now: new Date() });
    expect(metrics.transitions).toEqual({ human: 1, total: 2 });
  });

  it('returns null for items outside the org', async () => {
    const created = await upsertWorkItem({ orgId: 'org1', userId: 'user_1', githubProjectId: 'p1', input });

    expect(await moveWorkItemStagesAsAutomation('org2', created.item.id, ['triage'])).toBeNull();
  });
});
