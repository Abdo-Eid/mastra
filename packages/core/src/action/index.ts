import type { Agent } from '../agent';
import type { IMastraLogger } from '../logger';
import type { Mastra } from '../mastra';
import type { IMastraMemory } from '../memory';
import type { IMastraCompositeStore } from '../storage';
import type { MastraTTS } from '../tts';
import type { MastraVector } from '../vector';

export type MastraPrimitives = {
  logger?: IMastraLogger;
  storage?: IMastraCompositeStore;
  agents?: Record<string, Agent>;
  tts?: Record<string, MastraTTS>;
  vectors?: Record<string, MastraVector>;
  memory?: IMastraMemory;
};

export type MastraUnion = {
  [K in keyof Mastra]: Mastra[K];
} & MastraPrimitives;
