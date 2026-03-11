/**
 * Debate Moderator Expert Prompt
 *
 * Neutral moderator for multi-model panel workflows.
 *
 * Key characteristics:
 * - Persona assignment for blank participants when needed
 * - Neutral agenda framing
 * - Mid-round synthesis
 * - Final summary and recommendation
 */

import { ExpertPromptMetadata } from '../metadata/expert-metadata.js';

/**
 * Main system prompt for the Debate Moderator expert.
 */
export const DEBATE_MODERATOR_SYSTEM_PROMPT = `
You are a neutral debate moderator for a multi-model panel workflow.

=== ROLE ===
When given an agenda and participant responses, you:
1. Assign distinct personas to blank participants when requested
2. Frame the agenda neutrally
3. Synthesize round responses without taking sides
4. Highlight common ground, disagreements, and open questions
5. Produce a final recommendation after the final round

=== MODERATION PRINCIPLES ===
- Do not role-play as a participant
- Do not invent participant claims that were not stated
- Preserve disagreements instead of flattening them away
- Separate facts, interpretations, risks, and recommendations clearly
- Prefer concise, decision-useful summaries over theatrical debate language

=== OUTPUT STYLE ===
- Match the user's language
- Be concrete and structured
- Use neutral wording in midpoint summaries
- In the final summary, clearly state the moderator's conclusion and remaining uncertainty
`;

/**
 * Metadata for the Debate Moderator expert.
 */
export const DEBATE_MODERATOR_METADATA: ExpertPromptMetadata = {
  id: 'debate_moderator',
  name: 'Debate Moderator',
  description: 'Moderates multi-model panel discussions by synthesizing round outputs into neutral briefs and a final summary.',
  category: 'advisor',
  cost: 'low',
  typicalLatency: '10-20 seconds',

  useWhen: [
    'Moderating panel discussions',
    'Synthesizing multi-model responses',
    'Assigning personas to blank debate participants',
    'Producing neutral midpoint briefs',
    'Summarizing competing recommendations',
  ],

  avoidWhen: [
    'Direct technical implementation',
    'Single-expert analysis',
  ],

  triggers: [
    { domain: 'Moderation', trigger: 'moderate, moderator, panel, 중재' },
    { domain: 'Synthesis', trigger: 'synthesize, summarize, 정리' },
    { domain: 'Multi-view', trigger: 'multiple perspectives, viewpoints, 관점' },
  ],

  responseFormat: 'Persona assignment JSON or neutral brief/final summary in the user language',

  toolRestriction: 'read-only',
};

/**
 * Builds a debate moderator prompt.
 *
 * @returns System prompt for 4-participant debate (GPT 2 + Gemini 2)
 */
export function buildDebateModeratorPrompt(): string {
  return DEBATE_MODERATOR_SYSTEM_PROMPT;
}
