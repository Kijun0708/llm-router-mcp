// src/workflow/phases/phase-2a-exploration.ts

/**
 * Phase 2A: Exploration
 *
 * Performs deeper exploration when the assessment phase identifies
 * multiple areas that need investigation. This phase can run
 * multiple exploration queries in parallel for efficiency.
 *
 * Key responsibilities:
 * - Deep dive into identified files
 * - Cross-reference dependencies
 * - Gather comprehensive context for implementation
 */

import {
  PhaseHandler,
  PhaseResult,
  WorkflowContext
} from '../types.js';
import { experts } from '../../experts/index.js';
import { callExpert } from '../../services/cliproxy-client.js';
import { logger } from '../../utils/logger.js';

/**
 * Exploration query types.
 */
type ExplorationQueryType =
  | 'file_content'      // Read specific file contents
  | 'pattern_search'    // Search for code patterns
  | 'dependency_trace'  // Trace imports/exports
  | 'usage_search';     // Find where something is used

/**
 * Exploration query definition.
 */
interface ExplorationQuery {
  type: ExplorationQueryType;
  query: string;
  priority: number;  // Higher = more important
}

/**
 * Generates exploration queries based on context.
 */
function generateExplorationQueries(context: WorkflowContext): ExplorationQuery[] {
  const queries: ExplorationQuery[] = [];
  const { relevantFiles, originalRequest, intent } = context;

  // Query for each relevant file (limited)
  const topFiles = (relevantFiles || []).slice(0, 5);
  for (const file of topFiles) {
    queries.push({
      type: 'file_content',
      query: `Read and summarize the contents of ${file}. Focus on:
- Main exports and their purposes
- Key functions and their signatures
- Dependencies and imports
- Relevant patterns for: ${originalRequest.substring(0, 100)}`,
      priority: 3
    });
  }

  // Pattern search based on intent
  if (intent === 'debugging' || intent === 'implementation') {
    queries.push({
      type: 'pattern_search',
      query: `Search for error handling patterns, try/catch blocks, and validation logic related to: ${originalRequest.substring(0, 100)}`,
      priority: 2
    });
  }

  if (intent === 'refactoring') {
    queries.push({
      type: 'dependency_trace',
      query: `Trace the import/export dependencies for the files mentioned. Identify which modules depend on them and what the refactoring impact would be.`,
      priority: 2
    });
  }

  // Usage search for understanding scope
  queries.push({
    type: 'usage_search',
    query: `Find all usages and references related to the main components identified in: ${originalRequest.substring(0, 100)}`,
    priority: 1
  });

  // Sort by priority (highest first)
  return queries.sort((a, b) => b.priority - a.priority);
}

/**
 * Executes exploration queries (can be parallel or sequential).
 */
async function executeExplorationQueries(
  queries: ExplorationQuery[],
  parallel: boolean
): Promise<string[]> {
  const momus = experts.momus;
  const results: string[] = [];

  if (parallel && queries.length > 1) {
    // Execute in parallel (limited concurrency)
    const maxParallel = 3;
    const batches: ExplorationQuery[][] = [];

    for (let i = 0; i < queries.length; i += maxParallel) {
      batches.push(queries.slice(i, i + maxParallel));
    }

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(q => callExpert(momus, q.query, { skipCache: true }))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value.response);
        } else {
          logger.warn({ error: result.reason }, 'Exploration query failed');
          results.push(`[Query failed: ${result.reason}]`);
        }
      }
    }
  } else {
    // Execute sequentially
    for (const query of queries) {
      try {
        const response = await callExpert(momus, query.query, { skipCache: true });
        results.push(response.response);
      } catch (error) {
        logger.warn({ error, query: query.type }, 'Exploration query failed');
        results.push(`[Query failed: ${error instanceof Error ? error.message : 'Unknown error'}]`);
      }
    }
  }

  return results;
}

/**
 * Synthesizes exploration results into actionable context.
 */
function synthesizeResults(
  queries: ExplorationQuery[],
  results: string[]
): string {
  let synthesis = '## Exploration Results\n\n';

  for (let i = 0; i < queries.length && i < results.length; i++) {
    const query = queries[i];
    const result = results[i];

    synthesis += `### ${query.type.replace('_', ' ').toUpperCase()}\n`;
    synthesis += `${result.substring(0, 500)}${result.length > 500 ? '...' : ''}\n\n`;
  }

  return synthesis;
}

/**
 * Phase 2A handler: Exploration
 */
export const phase2aExploration: PhaseHandler = {
  phaseId: 'exploration',

  async execute(context: WorkflowContext): Promise<PhaseResult> {
    try {
      // Generate exploration queries
      const queries = generateExplorationQueries(context);
      logger.info({ queryCount: queries.length }, 'Generated exploration queries');

      if (queries.length === 0) {
        return {
          phaseId: 'exploration',
          success: true,
          output: 'No exploration needed. Proceeding to implementation.',
          nextPhase: 'implementation'
        };
      }

      // Execute queries
      const results = await executeExplorationQueries(queries, true);

      // Synthesize results
      const synthesis = synthesizeResults(queries, results);
      context.explorationResults = results;

      return {
        phaseId: 'exploration',
        success: true,
        output: buildExplorationOutput(queries, results, synthesis),
        nextPhase: 'implementation',
        metadata: {
          queriesExecuted: queries.length,
          resultsGathered: results.length
        }
      };
    } catch (error) {
      logger.error({ error }, 'Exploration phase failed');

      return {
        phaseId: 'exploration',
        success: false,
        output: `Exploration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        nextPhase: 'implementation'  // Still try implementation with available context
      };
    }
  }
};

/**
 * Builds the exploration output summary.
 */
function buildExplorationOutput(
  queries: ExplorationQuery[],
  results: string[],
  synthesis: string
): string {
  const successCount = results.filter(r => !r.startsWith('[Query failed')).length;

  return `## Phase 2A: Exploration Complete

**Queries Executed**: ${queries.length}
**Successful**: ${successCount}

### Query Types
${queries.map(q => `- ${q.type} (priority: ${q.priority})`).join('\n')}

${synthesis}

**Next Phase**: Implementation`;
}

export default phase2aExploration;
