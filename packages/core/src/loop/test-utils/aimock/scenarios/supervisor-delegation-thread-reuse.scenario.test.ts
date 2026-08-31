import type { ChatCompletionRequest, LLMock } from '@copilotkit/aimock';
import { it, expect } from 'vitest';
import { Agent } from '../../../../agent';
import type { DelegationCompleteContext, DelegationStartContext } from '../../../../agent';
import { createOpenAI } from '@ai-sdk/openai-v5';
import { MockMemory } from '../../../../memory/mock';
import { runLoopScenario, useLoopScenarioAimock, describeForAllEngines } from '../aimock-scenario';
import type { EngineVariant } from '../types';
import { SCENARIO_MODEL_ID } from '../types';

/**
 * Opt-in reuse of a sub-agent thread across delegations (#21944).
 *
 * A supervisor delegates to a worker twice with the same memory instance.
 * By default every delegation mints a fresh sub-agent thread and forces
 * `lastMessages: false` off, so the worker cannot see what it said in the
 * first delegation. Returning `modifiedSubAgentThreadId` from
 * `onDelegationStart` opts into reusing the thread from delegation 1, so
 * thread-scoped history loads and the worker sees its own prior turn.
 * Empty thread IDs are ignored (kept fresh), and `modifiedMemoryOptions`
 * can still force `lastMessages: false` on a reused thread.
 */
const toolNames = (req: ChatCompletionRequest) => (req.tools ?? []).map(t => t.function?.name);
const isSupervisor = (req: ChatCompletionRequest) => toolNames(req).includes('agent-worker');
const isWorker = (req: ChatCompletionRequest) => !isSupervisor(req);

const FIRST_REPLY = 'Found prior turn ALPHA-7-TOKEN';
const THREAD_ID = 'supervisor-thread';
const RESOURCE_ID = 'test-user';

function makeWorker(mock: LLMock) {
  const openai = createOpenAI({ apiKey: 'aimock-test-key', baseURL: `${mock.url.replace(/\/+$/, '')}/v1` });
  return new Agent({
    id: 'worker',
    name: 'worker',
    description: 'Does delegated work',
    instructions: 'You do delegated work.',
    model: openai(SCENARIO_MODEL_ID),
  });
}

function delegationFixtures() {
  return (llm: LLMock) => {
    llm.on(
      { endpoint: 'chat', predicate: req => isSupervisor(req) && req.messages.at(-1)?.role !== 'tool' },
      { toolCalls: [{ id: 'call_worker', name: 'agent-worker', arguments: { prompt: 'do the task' } }] },
    );
    llm.on(
      { endpoint: 'chat', predicate: req => isWorker(req) && req.messages.at(-1)?.role !== 'tool' },
      { content: FIRST_REPLY },
    );
    llm.on(
      { endpoint: 'chat', predicate: req => isSupervisor(req) && req.messages.at(-1)?.role === 'tool' },
      { content: 'Done.' },
    );
  };
}

/**
 * Run two supervisor delegations sharing one memory instance. All delegated
 * prompts and the reused thread id are captured so assertions can check what
 * the worker model actually received on the second delegation.
 */
async function runTwoDelegations(
  engine: EngineVariant,
  mock: LLMock,
  args: { reuseThread?: boolean; emptyThreadId?: boolean; forceLastMessagesOff?: boolean },
) {
  const memory = new MockMemory();
  const threadIds: string[] = [];
  let storedSubAgentThreadId: string | undefined;

  const delegation = {
    onDelegationStart: async (ctx: DelegationStartContext) => {
      if (ctx.primitiveId !== 'worker') return;
      if (args.emptyThreadId) {
        return { modifiedSubAgentThreadId: '' };
      }
      if (args.reuseThread && storedSubAgentThreadId) {
        return {
          modifiedSubAgentThreadId: storedSubAgentThreadId,
          ...(args.forceLastMessagesOff ? { modifiedMemoryOptions: { lastMessages: false as const } } : {}),
        };
      }
    },
    onDelegationComplete: (ctx: DelegationCompleteContext) => {
      if (ctx.primitiveId !== 'worker') return;
      const id = ctx.result?.subAgentThreadId;
      if (id) {
        threadIds.push(id);
        storedSubAgentThreadId = id;
      }
    },
  };

  const call = (prompt: string) =>
    runLoopScenario({
      engine,
      llm: mock,
      prompt,
      agents: { worker: makeWorker(mock) },
      memory,
      threadId: THREAD_ID,
      resourceId: RESOURCE_ID,
      maxSteps: 5,
      errorProcessors: [],
      delegation,
      fixtures: delegationFixtures(),
    });

  await call('Find the prior record');

  // Drop the first delegation's journal and fixtures so the assertions only
  // see the second delegation's requests.
  mock.clearRequests();
  mock.clearFixtures();
  mock.resetMatchCounts();

  const { requests } = await call('Continue from last time');

  const workerRequests = requests.filter(r => isWorker(r.body as ChatCompletionRequest));
  expect(workerRequests).toHaveLength(1);
  return { threadIds, secondWorkerRequest: workerRequests[0]! };
}

describeForAllEngines('AIMock loop scenario: supervisor delegation thread reuse', engine => {
  const getMock = useLoopScenarioAimock();

  it('mints a fresh sub-agent thread per delegation by default, so the specialist cannot see its own prior turns', async () => {
    const { threadIds, secondWorkerRequest } = await runTwoDelegations(engine, getMock(), {});

    expect(threadIds).toHaveLength(2);
    expect(threadIds[0]).toBeDefined();
    expect(threadIds[1]).not.toBe(threadIds[0]);
    expect(JSON.stringify(secondWorkerRequest.body)).not.toContain(FIRST_REPLY);
  });

  it('reuses the sub-agent thread and loads prior turns when onDelegationStart returns modifiedSubAgentThreadId', async () => {
    const { threadIds, secondWorkerRequest } = await runTwoDelegations(engine, getMock(), { reuseThread: true });

    expect(threadIds).toHaveLength(2);
    expect(threadIds[1]).toBe(threadIds[0]);
    // The reused thread's message history (delegation 1's user prompt and the
    // worker's FIRST_REPLY) is loaded into the second delegated request.
    expect(JSON.stringify(secondWorkerRequest.body)).toContain(FIRST_REPLY);
  });

  it('keeps a fresh thread when modifiedSubAgentThreadId is an empty string', async () => {
    const { threadIds, secondWorkerRequest } = await runTwoDelegations(engine, getMock(), { emptyThreadId: true });

    expect(threadIds).toHaveLength(2);
    expect(threadIds[1]).not.toBe(threadIds[0]);
    expect(JSON.stringify(secondWorkerRequest.body)).not.toContain(FIRST_REPLY);
  });

  it('lets modifiedMemoryOptions keep lastMessages disabled on a reused thread', async () => {
    const { threadIds, secondWorkerRequest } = await runTwoDelegations(engine, getMock(), {
      reuseThread: true,
      forceLastMessagesOff: true,
    });

    expect(threadIds).toHaveLength(2);
    expect(threadIds[1]).toBe(threadIds[0]);
    // The thread is reused, but the override wins over the reuse default.
    expect(JSON.stringify(secondWorkerRequest.body)).not.toContain(FIRST_REPLY);
  });
});
