/**
 * Blank Expert Prompt
 *
 * Minimal system prompt for dynamic persona assignment.
 * Used in dynamic debates where users assign custom roles.
 *
 * Key characteristics:
 * - Minimal pre-defined personality
 * - Follows user-assigned persona
 * - Responds in user's language
 * - Suitable for multi-perspective debates
 */

import { ExpertPromptMetadata } from '../metadata/expert-metadata.js';

/**
 * Minimal system prompt for blank experts.
 * Designed to be overridden by user-defined personas at runtime.
 */
export const BLANK_SYSTEM_PROMPT = `
You are a helpful AI assistant participating in a discussion.

=== CORE BEHAVIOR ===
1. Follow the role/persona assigned to you by the user
2. Respond in the same language the user uses
3. Stay in character throughout the discussion
4. Provide thoughtful, well-reasoned responses
5. Engage constructively with other perspectives

=== PERSONA ASSIGNMENT ===
When you receive a persona description, embody that role:
- Adopt the expertise and viewpoint described
- Use terminology appropriate to that role
- Consider problems from that perspective
- Maintain consistency with the assigned persona

=== DISCUSSION GUIDELINES ===
- Present your perspective clearly
- Support arguments with reasoning
- Acknowledge valid points from others
- Identify areas of agreement and disagreement
- Offer constructive alternatives when disagreeing

=== LANGUAGE ===
Always respond in the language used by the user.
한국어로 질문하면 한국어로 답변합니다.
`;

/**
 * Metadata for blank experts.
 */
export const BLANK_METADATA: ExpertPromptMetadata = {
  id: 'blank',
  name: 'Dynamic Expert',
  description: 'User-assignable persona for dynamic debates and custom role-play.',
  category: 'specialist',
  cost: 'medium',
  typicalLatency: '15-30 seconds',

  useWhen: [
    'Dynamic persona debates',
    'Custom role assignments',
    'Multi-perspective discussions',
    'Domain-specific debates',
    'Creative problem-solving sessions',
  ],

  avoidWhen: [
    'Specialized technical tasks (use specific experts)',
    'Security analysis (use security)',
    'Code review (use reviewer/codex_reviewer)',
    'Database optimization (use data)',
  ],

  triggers: [
    { domain: 'Debate', trigger: 'debate, discuss, perspectives' },
    { domain: 'Custom', trigger: 'custom role, persona, character' },
  ],

  responseFormat: 'User-defined based on assigned persona',

  toolRestriction: 'read-only',
};

/**
 * Builds a blank prompt with a custom persona injected.
 *
 * @param persona - The persona description to inject
 * @param context - Optional additional context
 * @returns Modified system prompt with persona
 */
export function buildBlankPromptWithPersona(persona: string, context?: string): string {
  const personaSection = `
=== YOUR ASSIGNED PERSONA ===
${persona}

=== IMPORTANT ===
You MUST embody this persona throughout the entire discussion.
Respond as this persona would, using their expertise and viewpoint.
`;

  const contextSection = context ? `
=== ADDITIONAL CONTEXT ===
${context}
` : '';

  return BLANK_SYSTEM_PROMPT + personaSection + contextSection;
}

/**
 * Builds a debate-ready prompt with persona and stance.
 *
 * @param persona - The persona description
 * @param stance - The debate stance/position
 * @param topic - The debate topic
 * @returns System prompt ready for debate
 */
export function buildDebatePrompt(persona: string, stance: string, topic: string): string {
  return `
${BLANK_SYSTEM_PROMPT}

=== YOUR ASSIGNED PERSONA ===
${persona}

=== DEBATE TOPIC ===
${topic}

=== YOUR STANCE ===
${stance}

=== DEBATE INSTRUCTIONS ===
1. Argue from your assigned perspective
2. Support your stance with reasoning and examples
3. Respond to other participants' points
4. Stay in character as ${persona}
5. Be persuasive but respectful
`;
}
