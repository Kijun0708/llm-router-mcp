// src/workflow/phases/phase-2b-implementation.ts

/**
 * Phase 2B: Implementation
 *
 * Delegates the actual task to the appropriate expert based on:
 * - Intent classification from Phase 0
 * - Context gathered from Phase 1 & 2A
 * - Expert capabilities and availability
 *
 * Uses the 7-section delegation prompt structure for clear task handoff.
 */

import {
  PhaseHandler,
  PhaseResult,
  WorkflowContext,
  IntentType,
  ComplexityLevel,
  ExpertSelectionCriteria
} from '../types.js';
import { experts } from '../../experts/index.js';
import { callExpertWithFallback } from '../../services/expert-router.js';
import { logger } from '../../utils/logger.js';
import { buildDelegationPrompt, DelegationPrompt } from '../../prompts/base/delegation-template.js';
import { EXPERT_TOOL_RESTRICTIONS } from '../../prompts/base/tool-restrictions.js';

/**
 * Expert selection matrix based on intent and complexity.
 */
const EXPERT_SELECTION_MATRIX: Record<IntentType, Record<ComplexityLevel, string[]>> = {
  conceptual: {
    trivial: ['momus'],
    simple: ['strategist'],
    moderate: ['strategist', 'momus'],
    complex: ['strategist', 'momus'],
    epic: ['strategist']
  },
  implementation: {
    trivial: ['momus', 'strategist'],
    simple: ['frontend', 'strategist'],
    moderate: ['strategist', 'frontend'],
    complex: ['strategist'],
    epic: ['strategist']
  },
  debugging: {
    trivial: ['momus'],
    simple: ['codereview'],
    moderate: ['codereview', 'strategist'],
    complex: ['strategist', 'codereview'],
    epic: ['strategist']
  },
  refactoring: {
    trivial: ['codereview'],
    simple: ['codereview'],
    moderate: ['strategist', 'codereview'],
    complex: ['strategist'],
    epic: ['strategist']
  },
  research: {
    trivial: ['momus'],
    simple: ['momus', 'strategist'],
    moderate: ['strategist'],
    complex: ['strategist', 'momus'],
    epic: ['strategist', 'momus']
  },
  review: {
    trivial: ['codereview'],
    simple: ['codereview'],
    moderate: ['codereview', 'strategist'],
    complex: ['strategist', 'codereview'],
    epic: ['strategist']
  },
  documentation: {
    trivial: ['strategist'],
    simple: ['strategist'],
    moderate: ['strategist', 'momus'],
    complex: ['strategist', 'momus'],
    epic: ['strategist', 'momus']
  }
};

/**
 * Selects the best expert for the task.
 */
function selectExpert(criteria: ExpertSelectionCriteria): string {
  const { intent, complexity, preferredExperts, excludedExperts } = criteria;

  // Get candidates from matrix
  let candidates = EXPERT_SELECTION_MATRIX[intent]?.[complexity] || ['strategist'];

  // Apply preferences
  if (preferredExperts && preferredExperts.length > 0) {
    const preferred = candidates.filter(e => preferredExperts.includes(e));
    if (preferred.length > 0) {
      candidates = preferred;
    }
  }

  // Apply exclusions
  if (excludedExperts && excludedExperts.length > 0) {
    candidates = candidates.filter(e => !excludedExperts.includes(e));
  }

  // Return first available candidate
  return candidates[0] || 'strategist';
}

/**
 * Builds the delegation prompt for the expert.
 */
function buildImplementationPrompt(context: WorkflowContext): DelegationPrompt {
  const {
    originalRequest,
    intent,
    complexity,
    relevantFiles,
    codebaseContext,
    explorationResults,
    implementationAttempts
  } = context;

  // Build context section
  let contextSection = `**Original Request**: ${originalRequest}\n\n`;

  if (relevantFiles && relevantFiles.length > 0) {
    contextSection += `**Relevant Files**:\n${relevantFiles.map(f => `- ${f}`).join('\n')}\n\n`;
  }

  if (codebaseContext) {
    contextSection += `**Codebase Context**:\n${codebaseContext.substring(0, 1000)}\n\n`;
  }

  if (explorationResults && explorationResults.length > 0) {
    contextSection += `**Exploration Results**:\n${explorationResults.slice(0, 3).map(r => r.substring(0, 300)).join('\n---\n')}\n\n`;
  }

  if (implementationAttempts > 0) {
    contextSection += `**Note**: This is attempt ${implementationAttempts + 1}. Previous attempt(s) encountered issues.\n`;
  }

  // Determine tool restrictions based on intent
  const toolRestrictions = intent === 'conceptual' || intent === 'research'
    ? EXPERT_TOOL_RESTRICTIONS.strategist  // READ_ONLY
    : EXPERT_TOOL_RESTRICTIONS.frontend;   // FULL_TOOLS (for implementation)

  return {
    task: originalRequest,
    expectedOutcome: getExpectedOutcome(intent!, complexity!),
    context: contextSection,
    constraints: getConstraints(intent!, complexity!),
    tools: toolRestrictions,
    responseFormat: getResponseFormat(intent!),
    exitConditions: getExitConditions(intent!)
  };
}

/**
 * Gets expected outcome description based on intent.
 */
function getExpectedOutcome(intent: IntentType, complexity: ComplexityLevel): string {
  const outcomes: Record<IntentType, string> = {
    conceptual: 'A clear, comprehensive explanation with examples where helpful.',
    implementation: 'Working code that implements the requested feature with proper error handling.',
    debugging: 'Identified root cause and fix with explanation of what went wrong.',
    refactoring: 'Improved code structure maintaining existing behavior with clear rationale.',
    research: 'Comprehensive findings with references to relevant code and documentation.',
    review: 'Detailed review with categorized findings (critical, high, medium, low).',
    documentation: 'Clear, well-structured documentation following project conventions.'
  };

  const complexityNote = complexity === 'complex' || complexity === 'epic'
    ? ' Break down into steps if needed.'
    : '';

  return outcomes[intent] + complexityNote;
}

/**
 * Gets constraints based on intent and complexity.
 */
function getConstraints(intent: IntentType, complexity: ComplexityLevel): string[] {
  const baseConstraints = [
    'Follow existing code patterns and conventions',
    'Maintain backwards compatibility unless explicitly changing API'
  ];

  const intentConstraints: Record<IntentType, string[]> = {
    conceptual: ['Focus on accuracy over completeness', 'Cite sources when possible'],
    implementation: ['Write testable code', 'Handle edge cases', 'Add appropriate error handling'],
    debugging: ['Preserve existing functionality', 'Add regression prevention'],
    refactoring: ['No behavior changes', 'Maintain test coverage', 'Incremental changes preferred'],
    research: ['Verify information accuracy', 'Include code references'],
    review: ['Be objective and constructive', 'Prioritize security issues'],
    documentation: ['Match existing doc style', 'Include usage examples']
  };

  return [...baseConstraints, ...intentConstraints[intent]];
}

/**
 * Gets response format based on intent.
 */
function getResponseFormat(intent: IntentType): string {
  const formats: Record<IntentType, string> = {
    conceptual: `## Summary
Brief answer

## Explanation
Detailed explanation

## Examples
Code examples if helpful`,

    implementation: `## Approach
Brief description of implementation approach

## Changes
List of files and changes

## Code
Actual implementation

## Testing
How to verify the changes`,

    debugging: `## Root Cause
What caused the issue

## Fix
The solution

## Prevention
How to prevent similar issues`,

    refactoring: `## Current State
What exists now

## Changes
What will change

## Rationale
Why these changes improve the code`,

    research: `## Findings
Main discoveries

## Evidence
Code references and documentation

## Recommendations
Suggested next steps`,

    review: `## Summary
Overall assessment

## Critical Issues
Must fix

## Improvements
Should consider

## Minor Notes
Nice to have`,

    documentation: `## Overview
What this documents

## Content
The documentation

## Examples
Usage examples`
  };

  return formats[intent];
}

/**
 * Gets exit conditions based on intent.
 */
function getExitConditions(intent: IntentType): string[] {
  const conditions: Record<IntentType, string[]> = {
    conceptual: ['Question is fully answered', 'All relevant aspects covered'],
    implementation: ['Code compiles/runs', 'Feature works as requested', 'Edge cases handled'],
    debugging: ['Bug is fixed', 'Root cause identified', 'No regressions introduced'],
    refactoring: ['Code improved', 'Tests still pass', 'No behavior changes'],
    research: ['Information gathered', 'Sources verified', 'Findings documented'],
    review: ['All code reviewed', 'Issues categorized', 'Recommendations provided'],
    documentation: ['Documentation complete', 'Examples included', 'Formatting correct']
  };

  return conditions[intent];
}

/**
 * Phase 2B handler: Implementation
 */
export const phase2bImplementation: PhaseHandler = {
  phaseId: 'implementation',

  async execute(context: WorkflowContext): Promise<PhaseResult> {
    const { intent, complexity, lastExpertUsed } = context;

    if (!intent || !complexity) {
      return {
        phaseId: 'implementation',
        success: false,
        output: 'Intent or complexity not classified. Run earlier phases first.',
        nextPhase: 'intent'
      };
    }

    try {
      // Select expert
      const expertId = selectExpert({
        intent,
        complexity,
        excludedExperts: lastExpertUsed ? [lastExpertUsed] : undefined
      });

      const expert = experts[expertId];
      if (!expert) {
        throw new Error(`Expert not found: ${expertId}`);
      }

      logger.info({ expertId, intent, complexity }, 'Selected expert for implementation');

      // Build delegation prompt
      const delegationPrompt = buildImplementationPrompt(context);
      const fullPrompt = buildDelegationPrompt(delegationPrompt);

      // Call expert via router (handles fallbacks)
      const response = await callExpertWithFallback(
        expertId,
        fullPrompt,
        context.codebaseContext,  // context
        true,  // skipCache
        undefined,  // imagePath
        true  // applyPreamble - orchestrate 모드에서 Worker 제약 적용
      );

      // Track which expert was used
      context.lastExpertUsed = response.actualExpert;
      context.implementationAttempts += 1;

      // Store implementation output for verification phase (Sisyphus mode)
      context.lastImplementationOutput = response.response;

      // Sisyphus Mode: ALWAYS route to verification phase
      // Let the verification phase determine actual success/failure
      // This follows oh-my-opencode's "SUBAGENTS LIE - VERIFY EVERYTHING YOURSELF" principle

      // Only check for critical failures (API errors, rate limits, etc.)
      const isCriticalFailure =
        response.response.toLowerCase().includes('rate limit') ||
        response.response.toLowerCase().includes('api error') ||
        response.response.toLowerCase().includes('connection refused') ||
        response.response.length < 50;  // Very short response indicates potential issue

      if (isCriticalFailure) {
        context.lastError = 'Critical failure in implementation (API/connection issue)';
        return {
          phaseId: 'implementation',
          success: false,
          output: response.response,
          nextPhase: 'recovery',
          metadata: {
            expertUsed: response.actualExpert,
            attemptNumber: context.implementationAttempts,
            criticalFailure: true
          }
        };
      }

      // Normal case: Route to verification for quality check
      return {
        phaseId: 'implementation',
        success: true,
        output: buildImplementationOutput(response.response, response.actualExpert, context),
        nextPhase: 'verification',
        metadata: {
          expertUsed: response.actualExpert,
          fellBack: response.fellBack,
          attemptNumber: context.implementationAttempts
        }
      };
    } catch (error) {
      logger.error({ error }, 'Implementation phase failed');
      context.lastError = error instanceof Error ? error.message : 'Unknown error';

      return {
        phaseId: 'implementation',
        success: false,
        output: `Implementation failed: ${context.lastError}`,
        nextPhase: 'recovery'
      };
    }
  }
};

/**
 * Builds the implementation output summary.
 */
function buildImplementationOutput(
  response: string,
  expertUsed: string,
  context: WorkflowContext
): string {
  return `## Phase 2B: Implementation Complete

**Expert Used**: ${expertUsed}
**Attempt**: ${context.implementationAttempts}
**Intent**: ${context.intent}
**Complexity**: ${context.complexity}

### Expert Response
${response}

**Next Phase**: Verification (Sisyphus Mode)`;
}

export default phase2bImplementation;
