// src/workflow/phases/phase-1-assessment.ts

/**
 * Phase 1: Assessment
 *
 * Analyzes the codebase context to gather relevant information:
 * - Identifies relevant files based on the request
 * - Gathers structural context (imports, exports, dependencies)
 * - Prepares context for the implementation phase
 *
 * Uses the momus expert for efficient codebase search.
 */

import {
  PhaseHandler,
  PhaseResult,
  WorkflowContext,
  IntentType
} from '../types.js';
import { experts } from '../../experts/index.js';
import { callExpert } from '../../services/cliproxy-client.js';
import { logger } from '../../utils/logger.js';

/**
 * Assessment prompts by intent type.
 */
const ASSESSMENT_PROMPTS: Record<IntentType, string> = {
  conceptual: `Analyze this conceptual question and identify:
1. Key concepts that need explanation
2. Related code patterns in the codebase (if any)
3. Relevant documentation or comments`,

  implementation: `Analyze this implementation request and identify:
1. Files that will likely need modification
2. Existing patterns to follow
3. Dependencies and imports needed
4. Potential impact areas`,

  debugging: `Analyze this debugging request and identify:
1. Files where the bug might exist
2. Error patterns and stack traces
3. Related test files
4. Recent changes that might have caused the issue`,

  refactoring: `Analyze this refactoring request and identify:
1. Files that need restructuring
2. Current code patterns being used
3. Dependencies that might be affected
4. Test coverage for affected areas`,

  research: `Analyze this research request and identify:
1. Relevant files and directories
2. Code patterns matching the query
3. Documentation and comments
4. External dependencies`,

  review: `Analyze this review request and identify:
1. Files to be reviewed
2. Security-sensitive areas
3. Performance-critical sections
4. Test coverage gaps`,

  documentation: `Analyze this documentation request and identify:
1. Code that needs documentation
2. Existing documentation patterns
3. API interfaces to document
4. Usage examples to include`
};

/**
 * Extracts keywords from the request for searching.
 */
function extractKeywords(request: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
    'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all',
    'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
    'until', 'while', 'this', 'that', 'these', 'those', 'i',
    'me', 'my', 'myself', 'we', 'our', 'you', 'your', 'it',
    'please', 'help', 'want', 'like', 'make', 'create', 'add'
  ]);

  const words = request
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Also extract potential file/class/function names (camelCase, PascalCase, snake_case)
  const codePatterns = request.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)*|[a-z]+(?:_[a-z]+)+|[a-z]+(?:[A-Z][a-z]+)+/g) || [];

  return [...new Set([...words, ...codePatterns.map(p => p.toLowerCase())])].slice(0, 10);
}

/**
 * Builds the assessment query for the momus expert.
 */
function buildAssessmentQuery(
  request: string,
  intent: IntentType,
  keywords: string[]
): string {
  const basePrompt = ASSESSMENT_PROMPTS[intent];

  return `${basePrompt}

**User Request**: ${request}

**Keywords to search**: ${keywords.join(', ')}

Please search the codebase and provide:
1. A list of relevant files (paths)
2. Brief context about what each file contains
3. Key code patterns or structures found
4. Recommendations for the next phase

Format your response as:
## Relevant Files
- file1.ts: description
- file2.ts: description

## Context Summary
Brief overview of the codebase structure relevant to this request.

## Recommendations
What should be done in the implementation phase.`;
}

/**
 * Parses file paths from the momus expert's response.
 */
function parseRelevantFiles(response: string): string[] {
  const files: string[] = [];

  // Match file paths (various patterns)
  const patterns = [
    /(?:^|\s)([\w\-./\\]+\.(?:ts|js|tsx|jsx|json|md|yaml|yml))(?:\s|$|:)/gm,
    /`([\w\-./\\]+\.(?:ts|js|tsx|jsx|json|md|yaml|yml))`/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const file = match[1].replace(/\\/g, '/');
      if (!files.includes(file)) {
        files.push(file);
      }
    }
  }

  return files.slice(0, 20);  // Limit to 20 files
}

/**
 * Phase 1 handler: Assessment
 */
export const phase1Assessment: PhaseHandler = {
  phaseId: 'assessment',

  async execute(context: WorkflowContext): Promise<PhaseResult> {
    const { originalRequest, intent } = context;

    if (!intent) {
      return {
        phaseId: 'assessment',
        success: false,
        output: 'Intent not classified. Run Phase 0 first.',
        nextPhase: 'intent'
      };
    }

    try {
      // Extract keywords for searching
      const keywords = extractKeywords(originalRequest);
      logger.debug({ keywords }, 'Extracted keywords for assessment');

      // Build assessment query
      const query = buildAssessmentQuery(originalRequest, intent, keywords);

      // Use momus expert for assessment
      const momus = experts.momus;
      const response = await callExpert(momus, query, {
        skipCache: true  // Always get fresh results for assessment
      });

      // Parse relevant files from response
      const relevantFiles = parseRelevantFiles(response.response);
      context.relevantFiles = relevantFiles;
      context.codebaseContext = response.response;

      // Determine next phase based on intent
      const nextPhase = determineNextPhase(intent, relevantFiles);

      return {
        phaseId: 'assessment',
        success: true,
        output: buildAssessmentOutput(response.response, relevantFiles, intent),
        nextPhase,
        metadata: {
          keywords,
          fileCount: relevantFiles.length,
          momusUsed: response.actualExpert
        }
      };
    } catch (error) {
      logger.error({ error }, 'Assessment phase failed');

      return {
        phaseId: 'assessment',
        success: false,
        output: `Assessment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        nextPhase: 'recovery'
      };
    }
  }
};

/**
 * Determines the next phase based on intent and assessment results.
 */
function determineNextPhase(intent: IntentType, relevantFiles: string[]): 'exploration' | 'implementation' | 'completion' {
  // Conceptual questions can skip to completion after assessment
  if (intent === 'conceptual' && relevantFiles.length === 0) {
    return 'completion';
  }

  // Research tasks need exploration
  if (intent === 'research') {
    return 'exploration';
  }

  // If many files found, do exploration first
  if (relevantFiles.length > 5) {
    return 'exploration';
  }

  // Otherwise, proceed to implementation
  return 'implementation';
}

/**
 * Builds the assessment output summary.
 */
function buildAssessmentOutput(
  explorerResponse: string,
  relevantFiles: string[],
  intent: IntentType
): string {
  return `## Phase 1: Assessment Complete

**Intent**: ${intent}
**Relevant Files Found**: ${relevantFiles.length}

${relevantFiles.length > 0 ? `### Files Identified
${relevantFiles.map(f => `- \`${f}\``).join('\n')}` : '### No specific files identified'}

### Momus Analysis
${explorerResponse.substring(0, 1000)}${explorerResponse.length > 1000 ? '...' : ''}`;
}

export default phase1Assessment;
