// src/workflow/phases/phase-2d-verification.ts

/**
 * Phase 2D: Verification (Sisyphus Mode)
 *
 * Verifies implementation results before marking as complete.
 * Key principle from oh-my-opencode: "SUBAGENTS LIE - VERIFY EVERYTHING YOURSELF"
 *
 * Verification checks:
 * 1. Code compiles / type-checks (if applicable)
 * 2. Tests pass (if applicable)
 * 3. Implementation meets requirements
 * 4. No regressions introduced
 *
 * On failure: Routes to recovery phase for retry (up to maxAttempts)
 * On success: Routes to completion phase
 */

import {
  PhaseHandler,
  PhaseResult,
  WorkflowContext,
  IntentType
} from '../types.js';
import { callExpertWithFallback } from '../../services/expert-router.js';
import { logger } from '../../utils/logger.js';

/**
 * Verification criteria per intent type.
 */
const VERIFICATION_CRITERIA: Record<IntentType, string[]> = {
  conceptual: [
    'Answer addresses the question directly',
    'Explanation is accurate and complete',
    'Examples are relevant and correct'
  ],
  implementation: [
    'Code compiles without errors',
    'Implementation matches requirements',
    'Edge cases are handled',
    'No breaking changes introduced'
  ],
  debugging: [
    'Root cause is correctly identified',
    'Fix addresses the root cause',
    'No regressions introduced',
    'Fix is minimal and targeted'
  ],
  refactoring: [
    'Behavior is unchanged',
    'Code quality improved',
    'Tests still pass',
    'Changes are incremental'
  ],
  research: [
    'Information is accurate',
    'Sources are verified',
    'Findings are comprehensive',
    'Recommendations are actionable'
  ],
  review: [
    'All code sections reviewed',
    'Issues are correctly categorized',
    'Recommendations are specific',
    'Security concerns addressed'
  ],
  documentation: [
    'Documentation is accurate',
    'Examples are working',
    'Format matches project style',
    'All sections complete'
  ]
};

/**
 * Builds verification prompt for codereview expert.
 */
function buildVerificationPrompt(context: WorkflowContext): string {
  const { intent, originalRequest, lastImplementationOutput, verificationAttempts } = context;
  const criteria = VERIFICATION_CRITERIA[intent!] || VERIFICATION_CRITERIA.implementation;

  let prompt = `## Verification Request (Sisyphus Mode)

**CRITICAL**: Do NOT trust the implementation output at face value. VERIFY EACH CLAIM.

### Original Task
${originalRequest}

### Implementation Output to Verify
${lastImplementationOutput?.substring(0, 3000) || 'No implementation output available'}

### Verification Criteria
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

### Instructions
1. Check EACH criterion above
2. For code changes: Verify syntax, logic, and completeness
3. For explanations: Verify accuracy and relevance
4. Report ANY issues found

### Required Output Format
\`\`\`
VERIFICATION_RESULT: [PASS/FAIL]

CRITERIA_CHECK:
${criteria.map((c, i) => `- [ ] Criterion ${i + 1}: ${c}`).join('\n')}

ISSUES_FOUND:
[List specific issues, or "None" if all passed]

CONFIDENCE: [HIGH/MEDIUM/LOW]
[Reason for confidence level]
\`\`\`
`;

  if (verificationAttempts > 0) {
    prompt += `\n\n**Note**: This is verification attempt ${verificationAttempts + 1}. Previous verification found issues.`;
    if (context.verificationFailures && context.verificationFailures.length > 0) {
      prompt += `\n\nPrevious failures:\n${context.verificationFailures.slice(-3).map(f => `- ${f}`).join('\n')}`;
    }
  }

  return prompt;
}

/**
 * Parses verification result from expert response.
 */
function parseVerificationResult(response: string): {
  passed: boolean;
  issues: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
} {
  const result = {
    passed: false,
    issues: [] as string[],
    confidence: 'LOW' as 'HIGH' | 'MEDIUM' | 'LOW'
  };

  // Check for PASS/FAIL
  const resultMatch = response.match(/VERIFICATION_RESULT:\s*(PASS|FAIL)/i);
  if (resultMatch) {
    result.passed = resultMatch[1].toUpperCase() === 'PASS';
  }

  // Extract issues
  const issuesMatch = response.match(/ISSUES_FOUND:\s*([\s\S]*?)(?:CONFIDENCE:|$)/i);
  if (issuesMatch) {
    const issuesText = issuesMatch[1].trim();
    if (issuesText.toLowerCase() !== 'none') {
      const issues = issuesText.split('\n')
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(line => line.length > 0);
      result.issues = issues;
    }
  }

  // Extract confidence
  const confidenceMatch = response.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i);
  if (confidenceMatch) {
    result.confidence = confidenceMatch[1].toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW';
  }

  // If issues found but marked as PASS, override to FAIL
  if (result.issues.length > 0 && result.passed) {
    logger.warn('Verification marked PASS but issues found, overriding to FAIL');
    result.passed = false;
  }

  // If no explicit result, infer from content
  if (!resultMatch) {
    const lowerResponse = response.toLowerCase();
    result.passed = !lowerResponse.includes('fail') &&
                   !lowerResponse.includes('error') &&
                   !lowerResponse.includes('issue') &&
                   !lowerResponse.includes('problem');
  }

  return result;
}

/**
 * Phase 2D handler: Verification (Sisyphus Mode)
 */
export const phase2dVerification: PhaseHandler = {
  phaseId: 'verification',

  async execute(context: WorkflowContext): Promise<PhaseResult> {
    const { lastImplementationOutput, implementationAttempts, maxAttempts } = context;

    // Initialize verification attempts if needed
    if (context.verificationAttempts === undefined) {
      context.verificationAttempts = 0;
    }
    if (!context.verificationFailures) {
      context.verificationFailures = [];
    }

    // Check if we have something to verify
    if (!lastImplementationOutput) {
      logger.warn('No implementation output to verify, skipping verification');
      return {
        phaseId: 'verification',
        success: true,
        output: 'Verification skipped: No implementation output available',
        nextPhase: 'completion'
      };
    }

    try {
      // Build verification prompt
      const verificationPrompt = buildVerificationPrompt(context);

      // Use codereview expert for verification
      const response = await callExpertWithFallback(
        'codereview',
        verificationPrompt,
        context.codebaseContext,
        true,  // skipCache
        undefined,  // imagePath
        true  // applyPreamble - orchestrate 모드에서 Worker 제약 적용
      );

      // Parse result
      const verificationResult = parseVerificationResult(response.response);
      context.verificationAttempts += 1;

      logger.info({
        passed: verificationResult.passed,
        issues: verificationResult.issues.length,
        confidence: verificationResult.confidence,
        attempt: context.verificationAttempts
      }, 'Verification completed');

      if (verificationResult.passed && verificationResult.confidence !== 'LOW') {
        // Verification passed
        return {
          phaseId: 'verification',
          success: true,
          output: buildVerificationOutput(response.response, true, verificationResult),
          nextPhase: 'completion',
          metadata: {
            verificationAttempts: context.verificationAttempts,
            confidence: verificationResult.confidence
          }
        };
      } else {
        // Verification failed
        context.verificationFailures.push(
          verificationResult.issues.length > 0
            ? verificationResult.issues.join('; ')
            : 'Verification did not pass confidence threshold'
        );
        context.lastError = `Verification failed: ${verificationResult.issues.join(', ')}`;

        // Check if we've exceeded max attempts (3-strike rule)
        if (implementationAttempts >= maxAttempts) {
          logger.warn({
            attempts: implementationAttempts,
            maxAttempts
          }, '3-strike limit reached, escalating');

          context.escalationRequired = true;
          return {
            phaseId: 'verification',
            success: false,
            output: buildEscalationReport(context, verificationResult),
            nextPhase: 'completion',
            metadata: {
              escalated: true,
              reason: '3-strike limit reached'
            }
          };
        }

        // Route to recovery for retry
        return {
          phaseId: 'verification',
          success: false,
          output: buildVerificationOutput(response.response, false, verificationResult),
          nextPhase: 'recovery',
          metadata: {
            verificationAttempts: context.verificationAttempts,
            issues: verificationResult.issues
          }
        };
      }
    } catch (error) {
      logger.error({ error }, 'Verification phase failed');
      context.lastError = error instanceof Error ? error.message : 'Unknown verification error';

      // On verification error, go to recovery
      return {
        phaseId: 'verification',
        success: false,
        output: `Verification failed: ${context.lastError}`,
        nextPhase: 'recovery'
      };
    }
  }
};

/**
 * Builds verification output summary.
 */
function buildVerificationOutput(
  response: string,
  passed: boolean,
  result: { issues: string[]; confidence: string }
): string {
  return `## Phase 2D: Verification ${passed ? 'PASSED' : 'FAILED'}

**Result**: ${passed ? 'PASS' : 'FAIL'}
**Confidence**: ${result.confidence}
${result.issues.length > 0 ? `**Issues Found**: ${result.issues.length}` : ''}

### Verification Details
${response.substring(0, 2000)}

${!passed ? '\n**Next**: Routing to recovery phase for retry' : '\n**Next**: Proceeding to completion'}`;
}

/**
 * Builds escalation report when 3-strike limit is reached.
 * Based on oh-my-opencode's "STOP → REVERT → CONSULT Oracle" pattern.
 */
function buildEscalationReport(
  context: WorkflowContext,
  lastResult: { issues: string[]; confidence: string }
): string {
  return `## ESCALATION REPORT (3-Strike Limit Reached)

**Original Request**: ${context.originalRequest}

**Attempts Made**: ${context.implementationAttempts}
**Verification Attempts**: ${context.verificationAttempts}

### Failure History
${context.verificationFailures?.map((f, i) => `${i + 1}. ${f}`).join('\n') || 'No failure history recorded'}

### Last Verification Result
**Confidence**: ${lastResult.confidence}
**Issues**:
${lastResult.issues.map(i => `- ${i}`).join('\n') || '- No specific issues recorded'}

### Recommended Actions
1. **STOP**: Further automated attempts have been halted
2. **REVIEW**: Manual review of the implementation is required
3. **CLARIFY**: The original request may need clarification
4. **SIMPLIFY**: Consider breaking the task into smaller pieces

### Context for Manual Resolution
- **Intent**: ${context.intent}
- **Complexity**: ${context.complexity}
- **Last Expert Used**: ${context.lastExpertUsed}
- **Relevant Files**: ${context.relevantFiles?.slice(0, 5).join(', ') || 'None identified'}

**This task requires human intervention to proceed.**`;
}

export default phase2dVerification;
