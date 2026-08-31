import { describe, it } from 'vitest';
import { Agent } from '../agent';
import type { IMastraLogger } from '../logger';
import { Mastra } from '../mastra';
import type { IMastraCompositeStore } from '../storage';
import type { StorageMastraRef } from '../storage/base';
import type { IMastraMemory } from './memory';
import { MockMemory } from './mock';
import type { SharedMemoryConfig } from './types';

/**
 * Regression tests for https://github.com/mastra-ai/mastra/issues/20202
 *
 * `@mastra/memory` and store packages bundle their own copy of the
 * `MastraMemory`/`MastraCompositeStore`/`MastraBase` declarations. With
 * nominal brands (`#private`, `protected`) those copies were mutually
 * unassignable, so `new Agent({ memory })` and `new Memory({ storage })`
 * failed to compile in userland. Positions that accept user-supplied
 * memory/storage must be typed against the structural interfaces.
 */
describe('IMastraMemory structural boundary (#20202)', () => {
  it('MastraMemory instances are assignable to IMastraMemory', () => {
    const memory = new MockMemory();

    const _iface: IMastraMemory = memory;
    new Agent({
      id: 'typed-memory-agent',
      name: 'typed-memory-agent',
      instructions: 'You are helpful.',
      model: 'openai/gpt-4o',
      memory,
    });
    new Mastra({
      memory: { chat: memory },
    });
    void _iface;
  });

  it('a bundled duplicate copy of the memory class stays assignable to IMastraMemory', () => {
    class BundledCopyStore {
      #rawConfig?: Record<string, unknown>;
      id = 'bundled-store';
      name?: string;
      stores?: IMastraCompositeStore['stores'];
      disableInit = true;

      getStore<K extends keyof NonNullable<IMastraCompositeStore['stores']>>(storeName: K) {
        return Promise.resolve(this.stores?.[storeName]);
      }
      prune() {
        return Promise.resolve([]);
      }
      init() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
      __registerMastra(_mastra: StorageMastraRef, _seen?: Set<unknown>) {}
      __setLogger(_logger: IMastraLogger) {}
      __setRawConfig(rawConfig: Record<string, unknown>) {
        this.#rawConfig = rawConfig;
      }
      toRawConfig() {
        return this.#rawConfig;
      }
    }

    class BundledCopyMemory implements IMastraMemory {
      #mastra?: unknown;
      #rawConfig?: Record<string, unknown>;
      readonly id = 'bundled-memory';
      private store = new BundledCopyStore();

      get hasOwnStorage() {
        return true;
      }
      get storage() {
        return this.store;
      }
      setStorage(_storage: IMastraCompositeStore) {}
      setVector(_vector: Parameters<IMastraMemory['setVector']>[0]) {}
      setEmbedder(
        _embedder: Parameters<IMastraMemory['setEmbedder']>[0],
        _embedderOptions?: Parameters<IMastraMemory['setEmbedder']>[1],
      ) {}
      __registerMastra(_mastra: Parameters<IMastraMemory['__registerMastra']>[0]) {
        this.#mastra = _mastra;
      }
      __setLogger(_logger: IMastraLogger) {}
      getSystemMessage() {
        return Promise.resolve(null);
      }
      listTools() {
        return {};
      }
      getMergedThreadConfig(config?: Parameters<IMastraMemory['getMergedThreadConfig']>[0]) {
        return config ?? {};
      }
      estimateTokens(text: string) {
        return text.length;
      }
      getThreadById() {
        return Promise.resolve(null);
      }
      listThreads() {
        return Promise.resolve({ threads: [], total: 0, page: 0, perPage: 100, hasMore: false });
      }
      saveThread({ thread }: Parameters<IMastraMemory['saveThread']>[0]) {
        return Promise.resolve(thread);
      }
      saveMessages({ messages }: Parameters<IMastraMemory['saveMessages']>[0]) {
        return Promise.resolve({ messages });
      }
      recall() {
        return Promise.resolve({ messages: [], total: 0, page: 0, perPage: 0, hasMore: false });
      }
      createThread({ resourceId, threadId, title, metadata }: Parameters<IMastraMemory['createThread']>[0]) {
        return Promise.resolve({
          id: threadId ?? 'thread',
          resourceId,
          title: title ?? '',
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata,
        });
      }
      updateThread({ id, title, metadata }: Parameters<IMastraMemory['updateThread']>[0]) {
        return Promise.resolve({
          id,
          resourceId: 'resource',
          title: title ?? '',
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata,
        });
      }
      deleteThread() {
        return Promise.resolve();
      }
      settled() {
        return Promise.resolve();
      }
      addMessage() {
        return Promise.reject(new Error('deprecated'));
      }
      generateId() {
        return 'id';
      }
      getWorkingMemory() {
        return Promise.resolve(null);
      }
      getWorkingMemoryTemplate() {
        return Promise.resolve(null);
      }
      updateWorkingMemory() {
        return Promise.resolve();
      }
      __experimental_updateWorkingMemoryVNext() {
        return Promise.resolve({ success: true, reason: 'ok' });
      }
      getInputProcessors() {
        return Promise.resolve([]);
      }
      getOutputProcessors() {
        return Promise.resolve([]);
      }
      deleteMessages() {
        return Promise.resolve();
      }
      cloneThread() {
        return Promise.resolve({
          thread: { id: 'clone', resourceId: 'resource', createdAt: new Date(), updatedAt: new Date() },
          clonedMessages: [],
        });
      }
      getConfig() {
        return {};
      }
    }

    const store = new BundledCopyStore();
    const memory = new BundledCopyMemory();

    const _storeIface: IMastraCompositeStore = store;
    const _memoryIface: IMastraMemory = memory;
    const _sharedConfig: SharedMemoryConfig = { storage: store };

    new Mastra({ storage: store, memory: { chat: memory } });
    new Agent({
      id: 'bundled-memory-agent',
      name: 'bundled-memory-agent',
      instructions: 'You are helpful.',
      model: 'openai/gpt-4o',
      memory,
    });

    void _storeIface;
    void _memoryIface;
    void _sharedConfig;
  });
});
