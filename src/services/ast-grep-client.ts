// src/services/ast-grep-client.ts

/**
 * AST-Grep Client Service
 *
 * Provides AST-based code search and transformation using ast-grep CLI.
 * Supports 25+ programming languages with structural pattern matching.
 *
 * Reference: https://ast-grep.github.io/
 */

import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';

/**
 * Supported languages by ast-grep
 */
export type AstGrepLanguage =
  | 'typescript'
  | 'javascript'
  | 'tsx'
  | 'jsx'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'kotlin'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'ruby'
  | 'lua'
  | 'swift'
  | 'html'
  | 'css'
  | 'json'
  | 'yaml'
  | 'bash'
  | 'php'
  | 'scala'
  | 'elixir'
  | 'haskell'
  | 'dart';

/**
 * Search match result from ast-grep
 */
export interface AstGrepMatch {
  file: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  text: string;
  lines: string;
  replacement?: string;
  metaVariables?: Record<string, {
    text: string;
    range: {
      start: { line: number; column: number };
      end: { line: number; column: number };
    };
  }>;
}

/**
 * Search options for ast-grep
 */
export interface AstGrepSearchOptions {
  pattern: string;
  language?: AstGrepLanguage;
  path?: string;
  /** Include files matching these globs */
  include?: string[];
  /** Exclude files matching these globs */
  exclude?: string[];
  /** Maximum number of results */
  maxResults?: number;
  /** Return only file paths (no match details) */
  filesOnly?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Replace options for ast-grep
 */
export interface AstGrepReplaceOptions extends AstGrepSearchOptions {
  replacement: string;
  /** Dry run - don't actually modify files */
  dryRun?: boolean;
}

/**
 * Search result from ast-grep
 */
export interface AstGrepSearchResult {
  success: boolean;
  matches: AstGrepMatch[];
  totalCount: number;
  searchedFiles: number;
  error?: string;
  executionTimeMs: number;
}

/**
 * Replace result from ast-grep
 */
export interface AstGrepReplaceResult {
  success: boolean;
  modifiedFiles: string[];
  totalReplacements: number;
  error?: string;
  dryRun: boolean;
  executionTimeMs: number;
}

/**
 * Detects if ast-grep CLI is available
 */
async function isAstGrepAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('sg', ['--version'], {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * Infers language from file extension
 */
export function inferLanguage(filePath: string): AstGrepLanguage | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, AstGrepLanguage> = {
    'ts': 'typescript',
    'tsx': 'tsx',
    'js': 'javascript',
    'jsx': 'jsx',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'py': 'python',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
    'kt': 'kotlin',
    'kts': 'kotlin',
    'c': 'c',
    'h': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'hpp': 'cpp',
    'cs': 'csharp',
    'rb': 'ruby',
    'lua': 'lua',
    'swift': 'swift',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'css',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'sh': 'bash',
    'bash': 'bash',
    'php': 'php',
    'scala': 'scala',
    'ex': 'elixir',
    'exs': 'elixir',
    'hs': 'haskell',
    'dart': 'dart'
  };

  return ext ? languageMap[ext] : undefined;
}

/**
 * Builds ast-grep CLI arguments for search
 */
function buildSearchArgs(options: AstGrepSearchOptions): string[] {
  const args: string[] = ['run'];

  // Pattern (required)
  args.push('--pattern', options.pattern);

  // Language
  if (options.language) {
    args.push('--lang', options.language);
  }

  // JSON output for parsing
  args.push('--json');

  // Include patterns (use --globs)
  if (options.include && options.include.length > 0) {
    for (const pattern of options.include) {
      args.push('--globs', pattern);
    }
  }

  // Exclude patterns (use --globs with ! prefix)
  if (options.exclude && options.exclude.length > 0) {
    for (const pattern of options.exclude) {
      // Prepend ! for exclusion pattern
      args.push('--globs', pattern.startsWith('!') ? pattern : `!${pattern}`);
    }
  }

  // Path to search
  if (options.path) {
    args.push(options.path);
  }

  return args;
}

/**
 * Parses ast-grep JSON output
 */
function parseAstGrepOutput(stdout: string): AstGrepMatch[] {
  if (!stdout.trim()) {
    return [];
  }

  try {
    const trimmed = stdout.trim();
    let rawMatches: any[] = [];

    // ast-grep --json outputs a JSON array (not JSON lines)
    // Try parsing as JSON array first
    if (trimmed.startsWith('[')) {
      try {
        rawMatches = JSON.parse(trimmed);
      } catch (e) {
        logger.debug('Failed to parse as JSON array, trying JSON lines');
      }
    }

    // Fallback: try JSON lines format (--json=stream)
    if (rawMatches.length === 0 && !trimmed.startsWith('[')) {
      const lines = trimmed.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          rawMatches.push(JSON.parse(line));
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    }

    const matches: AstGrepMatch[] = [];
    for (const match of rawMatches) {
      matches.push({
        file: match.file || match.path,
        range: {
          start: {
            line: match.range?.start?.line ?? match.start?.line ?? 0,
            column: match.range?.start?.column ?? match.start?.column ?? 0
          },
          end: {
            line: match.range?.end?.line ?? match.end?.line ?? 0,
            column: match.range?.end?.column ?? match.end?.column ?? 0
          }
        },
        text: match.text || match.matched || '',
        lines: match.lines || match.context || match.text || '',
        metaVariables: match.metaVariables || match.meta_variables
      });
    }

    return matches;
  } catch (error) {
    logger.error({ error, stdout }, 'Failed to parse ast-grep output');
    return [];
  }
}

/**
 * Searches code using ast-grep pattern matching
 */
export async function astGrepSearch(
  options: AstGrepSearchOptions
): Promise<AstGrepSearchResult> {
  const startTime = Date.now();

  // Check if ast-grep is available
  const available = await isAstGrepAvailable();
  if (!available) {
    return {
      success: false,
      matches: [],
      totalCount: 0,
      searchedFiles: 0,
      error: 'ast-grep CLI (sg) is not installed. Install with: npm install -g @ast-grep/cli',
      executionTimeMs: Date.now() - startTime
    };
  }

  const args = buildSearchArgs(options);
  const timeoutMs = options.timeoutMs || 30000;

  logger.debug({ pattern: options.pattern, args }, 'Running ast-grep search');

  return new Promise((resolve) => {
    const child = spawn('sg', args, {
      shell: true,
      cwd: options.path || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Timeout
    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        success: false,
        matches: [],
        totalCount: 0,
        searchedFiles: 0,
        error: `Search timed out after ${timeoutMs}ms`,
        executionTimeMs: Date.now() - startTime
      });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0 && code !== 1) {
        // Code 1 means no matches found, which is still success
        resolve({
          success: false,
          matches: [],
          totalCount: 0,
          searchedFiles: 0,
          error: stderr || `ast-grep exited with code ${code}`,
          executionTimeMs: Date.now() - startTime
        });
        return;
      }

      const matches = parseAstGrepOutput(stdout);
      const limitedMatches = options.maxResults
        ? matches.slice(0, options.maxResults)
        : matches;

      // Count unique files
      const uniqueFiles = new Set(matches.map(m => m.file));

      resolve({
        success: true,
        matches: limitedMatches,
        totalCount: matches.length,
        searchedFiles: uniqueFiles.size,
        executionTimeMs: Date.now() - startTime
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        matches: [],
        totalCount: 0,
        searchedFiles: 0,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      });
    });
  });
}

/**
 * Replaces code using ast-grep pattern matching
 */
export async function astGrepReplace(
  options: AstGrepReplaceOptions
): Promise<AstGrepReplaceResult> {
  const startTime = Date.now();

  // Check if ast-grep is available
  const available = await isAstGrepAvailable();
  if (!available) {
    return {
      success: false,
      modifiedFiles: [],
      totalReplacements: 0,
      error: 'ast-grep CLI (sg) is not installed. Install with: npm install -g @ast-grep/cli',
      dryRun: options.dryRun ?? false,
      executionTimeMs: Date.now() - startTime
    };
  }

  const args: string[] = ['run'];

  // Pattern and replacement
  args.push('--pattern', options.pattern);
  args.push('--rewrite', options.replacement);

  // Language
  if (options.language) {
    args.push('--lang', options.language);
  }

  // Dry run or apply
  if (options.dryRun) {
    args.push('--json'); // Show what would change
  } else {
    args.push('--update-all'); // Actually apply changes
  }

  // Include/exclude patterns (use --globs)
  if (options.include && options.include.length > 0) {
    for (const pattern of options.include) {
      args.push('--globs', pattern);
    }
  }
  if (options.exclude && options.exclude.length > 0) {
    for (const pattern of options.exclude) {
      // Prepend ! for exclusion pattern
      args.push('--globs', pattern.startsWith('!') ? pattern : `!${pattern}`);
    }
  }

  // Path
  if (options.path) {
    args.push(options.path);
  }

  const timeoutMs = options.timeoutMs || 60000;

  logger.debug({ pattern: options.pattern, replacement: options.replacement, args }, 'Running ast-grep replace');

  return new Promise((resolve) => {
    const child = spawn('sg', args, {
      shell: true,
      cwd: options.path || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Timeout
    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        success: false,
        modifiedFiles: [],
        totalReplacements: 0,
        error: `Replace timed out after ${timeoutMs}ms`,
        dryRun: options.dryRun ?? false,
        executionTimeMs: Date.now() - startTime
      });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code !== 0 && code !== 1) {
        resolve({
          success: false,
          modifiedFiles: [],
          totalReplacements: 0,
          error: stderr || `ast-grep exited with code ${code}`,
          dryRun: options.dryRun ?? false,
          executionTimeMs: Date.now() - startTime
        });
        return;
      }

      // For dry run, parse JSON output
      if (options.dryRun) {
        const matches = parseAstGrepOutput(stdout);
        const uniqueFiles = [...new Set(matches.map(m => m.file))];

        resolve({
          success: true,
          modifiedFiles: uniqueFiles,
          totalReplacements: matches.length,
          dryRun: true,
          executionTimeMs: Date.now() - startTime
        });
      } else {
        // For actual replacement, parse output for modified files
        const lines = stdout.trim().split('\n').filter(l => l.trim());
        const modifiedFiles = lines.filter(l => l.includes('Modified') || l.includes('modified'));

        resolve({
          success: true,
          modifiedFiles: modifiedFiles,
          totalReplacements: modifiedFiles.length,
          dryRun: false,
          executionTimeMs: Date.now() - startTime
        });
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        modifiedFiles: [],
        totalReplacements: 0,
        error: error.message,
        dryRun: options.dryRun ?? false,
        executionTimeMs: Date.now() - startTime
      });
    });
  });
}

/**
 * Lists supported languages by ast-grep
 */
export function getSupportedLanguages(): AstGrepLanguage[] {
  return [
    'typescript', 'javascript', 'tsx', 'jsx', 'python', 'rust', 'go',
    'java', 'kotlin', 'c', 'cpp', 'csharp', 'ruby', 'lua', 'swift',
    'html', 'css', 'json', 'yaml', 'bash', 'php', 'scala', 'elixir',
    'haskell', 'dart'
  ];
}

/**
 * Checks ast-grep CLI availability
 */
export async function checkAstGrepAvailability(): Promise<{
  available: boolean;
  version?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    const child = spawn('sg', ['--version'], {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          available: true,
          version: stdout.trim()
        });
      } else {
        resolve({
          available: false,
          error: 'ast-grep CLI not found'
        });
      }
    });

    child.on('error', (error) => {
      resolve({
        available: false,
        error: error.message
      });
    });

    // Timeout
    setTimeout(() => {
      child.kill();
      resolve({
        available: false,
        error: 'Timeout checking ast-grep availability'
      });
    }, 5000);
  });
}

export default {
  astGrepSearch,
  astGrepReplace,
  getSupportedLanguages,
  checkAstGrepAvailability,
  inferLanguage
};
