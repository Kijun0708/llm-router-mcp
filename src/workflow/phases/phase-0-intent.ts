// src/workflow/phases/phase-0-intent.ts

/**
 * Phase 0: Intent Classification
 *
 * Analyzes the incoming request to determine:
 * - Intent type (conceptual, implementation, debugging, etc.)
 * - Complexity level (trivial to epic)
 * - Suggested experts for the task
 *
 * This phase uses pattern matching and heuristics for fast classification.
 * For ambiguous cases, it may consult the strategist expert.
 */

import {
  PhaseHandler,
  PhaseResult,
  WorkflowContext,
  IntentType,
  ComplexityLevel
} from '../types.js';

/**
 * Keywords and patterns for intent classification.
 */
const INTENT_PATTERNS: Record<IntentType, RegExp[]> = {
  conceptual: [
    /what\s+is/i,
    /explain/i,
    /how\s+does/i,
    /why\s+does/i,
    /difference\s+between/i,
    /concept/i,
    /theory/i,
    /understand/i
  ],
  implementation: [
    /implement/i,
    /create/i,
    /build/i,
    /add\s+(a\s+)?feature/i,
    /write\s+(a\s+)?code/i,
    /develop/i,
    /make\s+(a\s+)?new/i,
    /set\s*up/i
  ],
  debugging: [
    /fix/i,
    /bug/i,
    /error/i,
    /not\s+working/i,
    /broken/i,
    /crash/i,
    /fail/i,
    /issue/i,
    /problem/i,
    /debug/i
  ],
  refactoring: [
    /refactor/i,
    /restructure/i,
    /reorganize/i,
    /improve/i,
    /optimize/i,
    /clean\s*up/i,
    /modernize/i,
    /migrate/i
  ],
  research: [
    /find/i,
    /search/i,
    /look\s+for/i,
    /where\s+is/i,
    /locate/i,
    /explore/i,
    /discover/i,
    /investigate/i
  ],
  review: [
    /review/i,
    /audit/i,
    /check/i,
    /analyze/i,
    /evaluate/i,
    /assess/i,
    /security/i,
    /vulnerability/i
  ],
  documentation: [
    /document/i,
    /readme/i,
    /write\s+docs/i,
    /api\s+docs/i,
    /comment/i,
    /jsdoc/i,
    /explain\s+code/i
  ]
};

/**
 * Complexity indicators.
 */
const COMPLEXITY_INDICATORS = {
  trivial: {
    keywords: [/simple/i, /quick/i, /easy/i, /small/i, /minor/i, /typo/i],
    maxWords: 20
  },
  simple: {
    keywords: [/single/i, /one\s+file/i, /basic/i],
    maxWords: 50
  },
  moderate: {
    keywords: [/several/i, /multiple/i, /few\s+files/i],
    maxWords: 100
  },
  complex: {
    keywords: [/many/i, /entire/i, /system/i, /architecture/i, /redesign/i],
    maxWords: 200
  },
  epic: {
    keywords: [/rewrite/i, /overhaul/i, /complete/i, /full/i, /massive/i],
    maxWords: Infinity
  }
};

/**
 * Expert recommendations by intent type.
 */
const EXPERT_RECOMMENDATIONS: Record<IntentType, string[]> = {
  conceptual: ['strategist', 'momus'],
  implementation: ['strategist', 'frontend', 'momus'],
  debugging: ['strategist', 'codereview'],
  refactoring: ['strategist', 'codereview'],
  research: ['strategist', 'momus'],
  review: ['codereview', 'strategist'],
  documentation: ['strategist', 'momus']
};

/**
 * Classifies the intent of a request.
 */
function classifyIntent(request: string): IntentType {
  const scores: Record<IntentType, number> = {
    conceptual: 0,
    implementation: 0,
    debugging: 0,
    refactoring: 0,
    research: 0,
    review: 0,
    documentation: 0
  };

  // Score based on pattern matches
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(request)) {
        scores[intent as IntentType] += 1;
      }
    }
  }

  // Find highest scoring intent
  let maxScore = 0;
  let bestIntent: IntentType = 'implementation';  // Default

  for (const [intent, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestIntent = intent as IntentType;
    }
  }

  return bestIntent;
}

/**
 * Assesses the complexity of a request.
 */
function assessComplexity(request: string): ComplexityLevel {
  const wordCount = request.split(/\s+/).length;

  // Check for explicit complexity keywords
  for (const [level, indicators] of Object.entries(COMPLEXITY_INDICATORS)) {
    for (const keyword of indicators.keywords) {
      if (keyword.test(request)) {
        return level as ComplexityLevel;
      }
    }
  }

  // Estimate by word count and content
  if (wordCount <= 20) return 'trivial';
  if (wordCount <= 50) return 'simple';
  if (wordCount <= 100) return 'moderate';
  if (wordCount <= 200) return 'complex';
  return 'epic';
}

/**
 * Phase 0 handler: Intent Classification
 */
export const phase0Intent: PhaseHandler = {
  phaseId: 'intent',

  async execute(context: WorkflowContext): Promise<PhaseResult> {
    const request = context.originalRequest;

    try {
      // Classify intent
      const intent = classifyIntent(request);
      context.intent = intent;

      // Assess complexity
      const complexity = assessComplexity(request);
      context.complexity = complexity;

      // Get recommended experts
      const recommendedExperts = EXPERT_RECOMMENDATIONS[intent] || ['strategist'];

      // Build output summary
      const output = buildIntentSummary(request, intent, complexity, recommendedExperts);

      return {
        phaseId: 'intent',
        success: true,
        output,
        nextPhase: 'assessment',
        metadata: {
          intent,
          complexity,
          recommendedExperts,
          wordCount: request.split(/\s+/).length
        }
      };
    } catch (error) {
      return {
        phaseId: 'intent',
        success: false,
        output: `Intent classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        nextPhase: undefined
      };
    }
  }
};

/**
 * Builds a summary of the intent classification.
 */
function buildIntentSummary(
  request: string,
  intent: IntentType,
  complexity: ComplexityLevel,
  recommendedExperts: string[]
): string {
  const intentDescriptions: Record<IntentType, string> = {
    conceptual: 'Conceptual question requiring explanation',
    implementation: 'Implementation task requiring code writing',
    debugging: 'Debugging task requiring error resolution',
    refactoring: 'Refactoring task requiring code improvement',
    research: 'Research task requiring exploration',
    review: 'Review task requiring analysis',
    documentation: 'Documentation task requiring writing'
  };

  const complexityDescriptions: Record<ComplexityLevel, string> = {
    trivial: 'Very simple, can be done quickly',
    simple: 'Straightforward, single focus area',
    moderate: 'Multiple components involved',
    complex: 'Significant scope, careful planning needed',
    epic: 'Large-scale change, may need breakdown'
  };

  return `## Phase 0: Intent Classification

**Request**: ${request.substring(0, 200)}${request.length > 200 ? '...' : ''}

**Classification**:
- Intent: **${intent}** - ${intentDescriptions[intent]}
- Complexity: **${complexity}** - ${complexityDescriptions[complexity]}

**Recommended Experts**: ${recommendedExperts.join(', ')}

**Next Phase**: Assessment`;
}

export default phase0Intent;
