#!/usr/bin/env tsx
/**
 * Agent Scaffolding CLI
 *
 * Creates a new agent with the standard file structure:
 *   types.ts, index.ts, __tests__/{name}.test.ts
 *
 * Usage:
 *   pnpm tsx scripts/scaffold-agent.ts --stage 10 --id 1 --name "loyalty-program" --package agents-loyalty
 *
 * If --package is omitted, defaults to the appropriate existing package based on stage.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface Args {
  stage: number;
  id: number;
  name: string;
  pkg?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--') && i + 1 < argv.length) {
      args[arg.slice(2)] = argv[i + 1]!;
      i++;
    }
  }

  if (!args['stage'] || !args['id'] || !args['name']) {
    console.error('Usage: scaffold-agent --stage <n> --id <n> --name <kebab-name> [--package <pkg>]');
    process.exit(1);
  }

  return {
    stage: parseInt(args['stage'], 10),
    id: parseInt(args['id'], 10),
    name: args['name'],
    pkg: args['package'],
  };
}

const STAGE_TO_PACKAGE: Record<number, string> = {
  0: 'agents/reference',
  1: 'agents/search',
  2: 'agents/pricing',
  3: 'agents/booking',
  4: 'agents/ticketing',
  5: 'agents/exchange',
  6: 'agents/settlement',
  7: 'agents/reconciliation',
  20: 'agents/lodging',
};

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const agentId = `${args.stage}.${args.id}`;
  const className = toPascalCase(args.name) + 'Agent';
  const pkgDir = args.pkg ?? STAGE_TO_PACKAGE[args.stage];

  if (!pkgDir) {
    console.error(
      `No default package for stage ${args.stage}. Use --package to specify.`,
    );
    process.exit(1);
  }

  const baseDir = path.join('packages', pkgDir, 'src', args.name);
  const testDir = path.join(baseDir, '__tests__');

  if (fs.existsSync(baseDir)) {
    console.error(`Directory already exists: ${baseDir}`);
    process.exit(1);
  }

  fs.mkdirSync(testDir, { recursive: true });

  // types.ts
  fs.writeFileSync(
    path.join(baseDir, 'types.ts'),
    `/**
 * ${className} — Agent ${agentId} Types
 */

export interface ${toPascalCase(args.name)}Input {
  // TODO: Define input fields
}

export interface ${toPascalCase(args.name)}Output {
  // TODO: Define output fields
}
`,
  );

  // index.ts
  fs.writeFileSync(
    path.join(baseDir, 'index.ts'),
    `/**
 * ${className} — Agent ${agentId}
 */

import type { Agent, AgentInput, AgentOutput, AgentHealthStatus } from '@otaip/core';
import { AgentNotInitializedError } from '@otaip/core';
import type { ${toPascalCase(args.name)}Input, ${toPascalCase(args.name)}Output } from './types.js';

export class ${className} implements Agent<${toPascalCase(args.name)}Input, ${toPascalCase(args.name)}Output> {
  readonly id = '${agentId}';
  readonly name = '${args.name.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}';
  readonly version = '0.1.0';

  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async execute(
    input: AgentInput<${toPascalCase(args.name)}Input>,
  ): Promise<AgentOutput<${toPascalCase(args.name)}Output>> {
    if (!this.initialized) throw new AgentNotInitializedError(this.id);

    // TODO: Implement agent logic
    throw new Error('${className} is not yet implemented.');
  }

  async health(): Promise<AgentHealthStatus> {
    if (!this.initialized) return { status: 'unhealthy', details: 'Not initialized.' };
    return { status: 'healthy' };
  }

  destroy(): void {
    this.initialized = false;
  }
}

export type { ${toPascalCase(args.name)}Input, ${toPascalCase(args.name)}Output } from './types.js';
`,
  );

  // test file
  fs.writeFileSync(
    path.join(testDir, `${args.name}.test.ts`),
    `import { describe, it, expect, beforeAll } from 'vitest';
import { ${className} } from '../index.js';

describe('${className}', () => {
  let agent: ${className};

  beforeAll(async () => {
    agent = new ${className}();
    await agent.initialize();
  });

  it('has correct id and name', () => {
    expect(agent.id).toBe('${agentId}');
  });

  it('reports healthy after initialization', async () => {
    const health = await agent.health();
    expect(health.status).toBe('healthy');
  });

  it('throws when not initialized', async () => {
    const uninit = new ${className}();
    await expect(uninit.execute({ data: {} as never })).rejects.toThrow('not been initialized');
  });

  // TODO: Add domain-specific tests
});
`,
  );

  console.log(`Scaffolded agent ${agentId} (${className}) at ${baseDir}/`);
  console.log('  types.ts');
  console.log('  index.ts');
  console.log(`  __tests__/${args.name}.test.ts`);
  console.log('');
  console.log(`Next: export ${className} from packages/${pkgDir}/src/index.ts`);
}

main();
