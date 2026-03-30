/**
 * Tool Restrictions for Expert Delegation
 *
 * Defines what tools each expert type can and cannot use.
 * Based on oh-my-opencode's Oracle (read-only) pattern.
 */

/**
 * Tool restriction configuration for an expert.
 */
export interface ToolRestriction {
  /** Tools the expert is allowed to use */
  allowed: string[];

  /** Tools the expert must NOT use */
  forbidden: string[];

  /** Human-readable explanation of why these restrictions apply */
  rationale: string;
}

/**
 * READ-ONLY tools for advisory/consultation experts (like Oracle).
 * Cannot modify files or system state.
 */
export const READ_ONLY_TOOLS: ToolRestriction = {
  allowed: [
    'Read',
    'Glob',
    'Grep',
    'Bash (read-only commands only: ls, cat, grep, find, git log, git diff)',
    'WebFetch',
    'WebSearch',
    'get_library_docs',
    'search_libraries',
  ],
  forbidden: [
    'Write',
    'Edit',
    'MultiEdit',
    'NotebookEdit',
    'Task',
    'TodoWrite',
    'Bash (write commands: rm, mv, cp, mkdir, touch, echo >, git commit, git push)',
  ],
  rationale:
    'Read-only access for analysis and advisory tasks. The expert can explore and analyze the codebase but cannot make any modifications. This ensures safe consultation without side effects.',
};

/**
 * FULL ACCESS tools for implementation experts.
 * Can read and write files, execute commands.
 */
export const FULL_TOOLS: ToolRestriction = {
  allowed: [
    'Read',
    'Write',
    'Edit',
    'MultiEdit',
    'Glob',
    'Grep',
    'Bash',
    'WebFetch',
    'WebSearch',
    'get_library_docs',
    'search_libraries',
  ],
  forbidden: [],
  rationale:
    'Full access for implementation tasks. The expert can read, write, and modify files as needed to complete the assigned task.',
};

/**
 * EXPLORATION-ONLY tools for quick codebase searches.
 * Focused on finding files and patterns, no external calls.
 */
export const EXPLORATION_TOOLS: ToolRestriction = {
  allowed: [
    'Read',
    'Glob',
    'Grep',
    'Bash (read-only: ls, find, git log)',
  ],
  forbidden: [
    'Write',
    'Edit',
    'MultiEdit',
    'Task',
    'TodoWrite',
    'WebFetch',
    'WebSearch',
    'get_library_docs',
    'search_libraries',
  ],
  rationale:
    'Internal codebase exploration only. Fast, focused searches without external API calls or file modifications. Optimized for speed.',
};

/**
 * RESEARCH tools for external documentation and reference lookup.
 * Can access web and documentation APIs but not modify local files.
 */
export const RESEARCH_TOOLS: ToolRestriction = {
  allowed: [
    'Read',
    'Glob',
    'Grep',
    'Bash (read-only)',
    'WebFetch',
    'WebSearch',
    'get_library_docs',
    'search_libraries',
  ],
  forbidden: [
    'Write',
    'Edit',
    'MultiEdit',
    'Task',
    'TodoWrite',
  ],
  rationale:
    'Research and documentation lookup. Can access external documentation, web resources, and analyze the codebase, but cannot modify files.',
};

/**
 * DOCUMENTATION tools for technical writing.
 * Can write documentation files but limited to specific file types.
 */
export const DOCUMENTATION_TOOLS: ToolRestriction = {
  allowed: [
    'Read',
    'Write (*.md, *.txt, *.rst only)',
    'Edit (*.md, *.txt, *.rst only)',
    'Glob',
    'Grep',
    'Bash (read-only)',
    'WebFetch',
    'get_library_docs',
  ],
  forbidden: [
    'Write (code files)',
    'Edit (code files)',
    'MultiEdit',
    'Task',
  ],
  rationale:
    'Technical documentation writing. Can create and edit documentation files (markdown, text, rst) but not source code files.',
};

/**
 * Maps expert IDs to their default tool restrictions.
 */
export const EXPERT_TOOL_RESTRICTIONS: Record<string, ToolRestriction> = {
  strategist: READ_ONLY_TOOLS,
  codereview: READ_ONLY_TOOLS,
  frontend: FULL_TOOLS,
};

/**
 * Gets the appropriate tool restriction for an expert.
 *
 * @param expertId - The expert identifier
 * @returns The tool restriction for the expert, or FULL_TOOLS if not found
 */
export function getToolRestriction(expertId: string): ToolRestriction {
  return EXPERT_TOOL_RESTRICTIONS[expertId] ?? FULL_TOOLS;
}

/**
 * Creates a custom tool restriction.
 *
 * @param allowed - List of allowed tools
 * @param forbidden - List of forbidden tools
 * @param rationale - Explanation for the restriction
 */
export function createToolRestriction(
  allowed: string[],
  forbidden: string[],
  rationale: string
): ToolRestriction {
  return { allowed, forbidden, rationale };
}

/**
 * Merges two tool restrictions, taking the more restrictive option.
 * Forbidden lists are combined; allowed lists use intersection.
 */
export function mergeRestrictions(
  a: ToolRestriction,
  b: ToolRestriction
): ToolRestriction {
  const allowedSet = new Set(a.allowed.filter(tool => b.allowed.includes(tool)));
  const forbiddenSet = new Set([...a.forbidden, ...b.forbidden]);

  return {
    allowed: Array.from(allowedSet),
    forbidden: Array.from(forbiddenSet),
    rationale: `Combined restrictions: ${a.rationale} AND ${b.rationale}`,
  };
}
