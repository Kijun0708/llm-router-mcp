// src/services/lsp-client.ts

/**
 * LSP Client Service
 *
 * Provides Language Server Protocol client functionality for code intelligence.
 * Communicates with TypeScript Language Server or other language servers.
 *
 * Note: This is a simplified LSP client that uses TypeScript Compiler API
 * for basic functionality without requiring a full language server connection.
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import { join, dirname, resolve as pathResolve, extname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { logger } from '../utils/logger.js';

/**
 * Gets grep configuration for the current OS
 */
function getGrepConfig(): { grepPath: string; bashPath: string | null } {
  if (process.platform !== 'win32') {
    return { grepPath: 'grep', bashPath: null };
  }

  // Git for Windows paths
  const gitGrepPath = 'C:\\Program Files\\Git\\usr\\bin\\grep.exe';
  const gitBashPath = 'C:\\Program Files\\Git\\bin\\bash.exe';

  if (existsSync(gitGrepPath) && existsSync(gitBashPath)) {
    return { grepPath: gitGrepPath, bashPath: gitBashPath };
  }

  // Fallback
  return { grepPath: 'grep', bashPath: null };
}

/**
 * Executes grep command and returns stdout
 */
function executeGrep(args: string[], cwd: string, timeoutMs: number = 30000): Promise<string> {
  const { grepPath, bashPath } = getGrepConfig();

  // Build command string with proper quoting for bash
  const argsStr = args.map((arg, index) => {
    // The -E pattern (6th arg after -rn --include x4 -E) needs single quotes in bash
    // to preserve backslashes like \b
    if (arg.includes('\\') || arg.includes('$') || arg.includes('|') || arg.includes(' ')) {
      // Use single quotes for patterns with backslashes
      return `'${arg}'`;
    }
    return arg;
  }).join(' ');

  const fullCommand = bashPath
    ? `"${grepPath}" ${argsStr}`
    : `grep ${argsStr}`;

  return new Promise((resolve, reject) => {
    const child = spawn(fullCommand, [], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: bashPath || true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Search timed out'));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && code !== 1) {
        reject(new Error(stderr || 'grep failed'));
      } else {
        resolve(stdout);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Position in a document
 */
export interface Position {
  line: number;    // 0-indexed
  character: number; // 0-indexed
}

/**
 * Range in a document
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * Location result
 */
export interface Location {
  uri: string;
  range: Range;
}

/**
 * Hover information
 */
export interface HoverInfo {
  contents: string;
  range?: Range;
}

/**
 * Definition result
 */
export interface DefinitionResult {
  success: boolean;
  locations: Location[];
  error?: string;
}

/**
 * References result
 */
export interface ReferencesResult {
  success: boolean;
  locations: Location[];
  error?: string;
}

/**
 * Hover result
 */
export interface HoverResult {
  success: boolean;
  hover?: HoverInfo;
  error?: string;
}

/**
 * Symbol information
 */
export interface SymbolInfo {
  name: string;
  kind: string;
  location: Location;
  containerName?: string;
}

/**
 * Workspace symbols result
 */
export interface WorkspaceSymbolsResult {
  success: boolean;
  symbols: SymbolInfo[];
  error?: string;
}

/**
 * Rename result
 */
export interface RenameResult {
  success: boolean;
  changes: Map<string, { range: Range; newText: string }[]>;
  error?: string;
}

/**
 * Simple TypeScript-based code intelligence using grep and AST patterns.
 * This is a fallback when a full LSP server is not available.
 */

/**
 * Extracts identifier at position from file content
 */
function getIdentifierAtPosition(content: string, line: number, character: number): string | null {
  const lines = content.split('\n');
  if (line < 0 || line >= lines.length) return null;

  const lineText = lines[line];
  if (character < 0 || character >= lineText.length) return null;

  // Find word boundaries
  let start = character;
  let end = character;

  // Move backward to find start of identifier
  while (start > 0 && /[a-zA-Z0-9_$]/.test(lineText[start - 1])) {
    start--;
  }

  // Move forward to find end of identifier
  while (end < lineText.length && /[a-zA-Z0-9_$]/.test(lineText[end])) {
    end++;
  }

  if (start === end) return null;

  return lineText.substring(start, end);
}

/**
 * Finds definition using simple pattern matching
 * Works for TypeScript/JavaScript functions, classes, variables
 */
export async function findDefinition(
  filePath: string,
  position: Position
): Promise<DefinitionResult> {
  try {
    if (!existsSync(filePath)) {
      return { success: false, locations: [], error: `File not found: ${filePath}` };
    }

    const content = readFileSync(filePath, 'utf-8');
    const identifier = getIdentifierAtPosition(content, position.line, position.character);

    if (!identifier) {
      return { success: false, locations: [], error: 'No identifier at position' };
    }

    // Search for definition patterns
    const definitionPatterns = [
      // Function declarations
      new RegExp(`function\\s+${identifier}\\s*\\(`),
      // Arrow functions and const declarations
      new RegExp(`(?:const|let|var)\\s+${identifier}\\s*=`),
      // Class declarations
      new RegExp(`class\\s+${identifier}\\s*(?:extends|implements|\\{)`),
      // Interface declarations
      new RegExp(`interface\\s+${identifier}\\s*(?:extends|\\{)`),
      // Type declarations
      new RegExp(`type\\s+${identifier}\\s*=`),
      // Export declarations
      new RegExp(`export\\s+(?:const|let|var|function|class|interface|type)\\s+${identifier}`),
      // Method definitions
      new RegExp(`(?:public|private|protected|static|async)?\\s*${identifier}\\s*\\([^)]*\\)\\s*(?::|\\{)`),
      // Property definitions
      new RegExp(`${identifier}\\s*:\\s*[^;]+;`),
    ];

    const lines = content.split('\n');
    const locations: Location[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of definitionPatterns) {
        const match = line.match(pattern);
        if (match) {
          const col = line.indexOf(identifier);
          locations.push({
            uri: `file://${filePath.replace(/\\/g, '/')}`,
            range: {
              start: { line: i, character: col >= 0 ? col : 0 },
              end: { line: i, character: col >= 0 ? col + identifier.length : line.length }
            }
          });
          break;
        }
      }
    }

    // If not found in current file, we could search imports
    // For now, return what we found
    return {
      success: true,
      locations
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, locations: [], error: errorMessage };
  }
}

/**
 * Finds references using simple pattern matching
 */
export async function findReferences(
  filePath: string,
  position: Position,
  searchPath?: string
): Promise<ReferencesResult> {
  try {
    if (!existsSync(filePath)) {
      return { success: false, locations: [], error: `File not found: ${filePath}` };
    }

    const content = readFileSync(filePath, 'utf-8');
    const identifier = getIdentifierAtPosition(content, position.line, position.character);

    if (!identifier) {
      return { success: false, locations: [], error: 'No identifier at position' };
    }

    // Use grep to find all references
    const cwd = searchPath || dirname(filePath);

    const args = [
      '-rn',
      '--include=*.ts',
      '--include=*.tsx',
      '--include=*.js',
      '--include=*.jsx',
      '-E',
      `\\b${identifier}\\b`,
      '.'
    ];

    try {
      const stdout = await executeGrep(args, cwd);
      const locations: Location[] = [];
      const lines = stdout.trim().split('\n').filter(l => l);

      for (const line of lines) {
        // Format: filepath:linenum:content
        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (match) {
          const [, file, lineNum, content] = match;
          const lineIndex = parseInt(lineNum, 10) - 1;
          const col = content.indexOf(identifier);

          locations.push({
            uri: `file://${pathResolve(cwd, file).replace(/\\/g, '/')}`,
            range: {
              start: { line: lineIndex, character: col >= 0 ? col : 0 },
              end: { line: lineIndex, character: col >= 0 ? col + identifier.length : content.length }
            }
          });
        }
      }

      return { success: true, locations };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, locations: [], error: errorMessage };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, locations: [], error: errorMessage };
  }
}

/**
 * Gets hover information (type info) using simple heuristics
 */
export async function getHoverInfo(
  filePath: string,
  position: Position
): Promise<HoverResult> {
  try {
    if (!existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = readFileSync(filePath, 'utf-8');
    const identifier = getIdentifierAtPosition(content, position.line, position.character);

    if (!identifier) {
      return { success: false, error: 'No identifier at position' };
    }

    const lines = content.split('\n');
    const currentLine = lines[position.line];

    // Try to extract type information from the current line
    // Patterns: const x: Type = ..., function f(arg: Type): ReturnType, etc.

    let typeInfo = '';

    // Check for variable declaration with type annotation
    const varTypeMatch = currentLine.match(
      new RegExp(`(?:const|let|var)\\s+${identifier}\\s*:\\s*([^=;]+)`)
    );
    if (varTypeMatch) {
      typeInfo = `const ${identifier}: ${varTypeMatch[1].trim()}`;
    }

    // Check for function parameter
    const paramMatch = currentLine.match(
      new RegExp(`${identifier}\\s*:\\s*([^,)]+)`)
    );
    if (!typeInfo && paramMatch) {
      typeInfo = `(parameter) ${identifier}: ${paramMatch[1].trim()}`;
    }

    // Check for function declaration
    const funcMatch = currentLine.match(
      new RegExp(`function\\s+${identifier}\\s*(<[^>]*>)?\\s*\\(([^)]*)\\)\\s*(?::\\s*([^{]+))?`)
    );
    if (!typeInfo && funcMatch) {
      const [, generics, params, returnType] = funcMatch;
      typeInfo = `function ${identifier}${generics || ''}(${params})${returnType ? `: ${returnType.trim()}` : ''}`;
    }

    // Check for class
    const classMatch = currentLine.match(
      new RegExp(`class\\s+${identifier}\\s*(?:<[^>]*>)?(?:\\s+extends\\s+([^{]+))?`)
    );
    if (!typeInfo && classMatch) {
      const [, extendsClause] = classMatch;
      typeInfo = `class ${identifier}${extendsClause ? ` extends ${extendsClause.trim()}` : ''}`;
    }

    // Check for interface
    const interfaceMatch = currentLine.match(
      new RegExp(`interface\\s+${identifier}\\s*(?:<[^>]*>)?(?:\\s+extends\\s+([^{]+))?`)
    );
    if (!typeInfo && interfaceMatch) {
      const [, extendsClause] = interfaceMatch;
      typeInfo = `interface ${identifier}${extendsClause ? ` extends ${extendsClause.trim()}` : ''}`;
    }

    // Check for type alias
    const typeMatch = currentLine.match(
      new RegExp(`type\\s+${identifier}\\s*(?:<[^>]*>)?\\s*=\\s*(.+)`)
    );
    if (!typeInfo && typeMatch) {
      typeInfo = `type ${identifier} = ${typeMatch[1].trim()}`;
    }

    if (typeInfo) {
      return {
        success: true,
        hover: {
          contents: `\`\`\`typescript\n${typeInfo}\n\`\`\``,
          range: {
            start: position,
            end: { line: position.line, character: position.character + identifier.length }
          }
        }
      };
    }

    // Fallback: just return the identifier
    return {
      success: true,
      hover: {
        contents: `\`${identifier}\``,
        range: {
          start: position,
          end: { line: position.line, character: position.character + identifier.length }
        }
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Finds workspace symbols matching a query
 */
export async function findWorkspaceSymbols(
  query: string,
  searchPath: string
): Promise<WorkspaceSymbolsResult> {
  try {
    // Use grep to find symbol definitions
    // Search for function, class, interface, type, const definitions
    const pattern = `(function|class|interface|type|const|let|var)\\s+[a-zA-Z_$][a-zA-Z0-9_$]*`;

    const args = [
      '-rn',
      '--include=*.ts',
      '--include=*.tsx',
      '--include=*.js',
      '--include=*.jsx',
      '-E',
      pattern,
      '.'
    ];

    const stdout = await executeGrep(args, searchPath);
    const symbols: SymbolInfo[] = [];
    const lines = stdout.trim().split('\n').filter(l => l);

    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (match) {
        const [, file, lineNum, content] = match;

        // Extract symbol name
        const symbolMatch = content.match(
          /(function|class|interface|type|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/
        );

        if (symbolMatch) {
          const [, kind, name] = symbolMatch;

          // Filter by query
          if (query && !name.toLowerCase().includes(query.toLowerCase())) {
            continue;
          }

          const lineIndex = parseInt(lineNum, 10) - 1;
          const col = content.indexOf(name);

          symbols.push({
            name,
            kind: kind === 'const' || kind === 'let' || kind === 'var' ? 'Variable' :
                  kind === 'function' ? 'Function' :
                  kind === 'class' ? 'Class' :
                  kind === 'interface' ? 'Interface' : 'Type',
            location: {
              uri: `file://${pathResolve(searchPath, file).replace(/\\/g, '/')}`,
              range: {
                start: { line: lineIndex, character: col >= 0 ? col : 0 },
                end: { line: lineIndex, character: col >= 0 ? col + name.length : content.length }
              }
            }
          });
        }
      }
    }

    // Limit results
    return { success: true, symbols: symbols.slice(0, 100) };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, symbols: [], error: errorMessage };
  }
}

/**
 * Checks if a language server is available
 */
export async function checkLanguageServerAvailability(language: string): Promise<{
  available: boolean;
  serverName?: string;
  error?: string;
}> {
  // Check for common language servers
  const languageServers: Record<string, string[]> = {
    typescript: ['typescript-language-server', 'tsserver'],
    javascript: ['typescript-language-server', 'tsserver'],
    python: ['pylsp', 'pyright-langserver'],
    rust: ['rust-analyzer'],
    go: ['gopls'],
  };

  const servers = languageServers[language.toLowerCase()];
  if (!servers) {
    return { available: false, error: `No known language server for ${language}` };
  }

  // Use 'where' on Windows, 'which' on Unix
  const isWindows = process.platform === 'win32';
  const checkCommand = isWindows ? 'where' : 'which';

  for (const server of servers) {
    try {
      const child = spawn(checkCommand, [server], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

      const available = await new Promise<boolean>((resolve) => {
        child.on('close', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
        setTimeout(() => {
          child.kill();
          resolve(false);
        }, 5000);
      });

      if (available) {
        return { available: true, serverName: server };
      }
    } catch {
      continue;
    }
  }

  return { available: false, error: 'No language server found' };
}

/**
 * Prepare rename result
 */
export interface PrepareRenameResult {
  success: boolean;
  range?: Range;
  placeholder?: string;
  error?: string;
}

/**
 * Text edit for rename
 */
export interface TextEdit {
  range: Range;
  newText: string;
}

/**
 * Workspace edit result
 */
export interface WorkspaceEditResult {
  success: boolean;
  changes: { [uri: string]: TextEdit[] };
  error?: string;
}

/**
 * Prepares a rename operation by validating the position
 */
export async function prepareRename(
  filePath: string,
  position: Position
): Promise<PrepareRenameResult> {
  try {
    if (!existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = readFileSync(filePath, 'utf-8');
    const identifier = getIdentifierAtPosition(content, position.line, position.character);

    if (!identifier) {
      return { success: false, error: 'No renameable symbol at position' };
    }

    // Check if it's a valid identifier for rename
    // Keywords cannot be renamed
    const keywords = [
      'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
      'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof',
      'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var',
      'void', 'while', 'with', 'class', 'const', 'enum', 'export', 'extends',
      'import', 'super', 'implements', 'interface', 'let', 'package', 'private',
      'protected', 'public', 'static', 'yield', 'async', 'await', 'of',
      'true', 'false', 'null', 'undefined'
    ];

    if (keywords.includes(identifier)) {
      return { success: false, error: `Cannot rename keyword: ${identifier}` };
    }

    const lines = content.split('\n');
    const lineText = lines[position.line];

    // Find the exact range of the identifier
    let start = position.character;
    let end = position.character;

    while (start > 0 && /[a-zA-Z0-9_$]/.test(lineText[start - 1])) {
      start--;
    }
    while (end < lineText.length && /[a-zA-Z0-9_$]/.test(lineText[end])) {
      end++;
    }

    return {
      success: true,
      range: {
        start: { line: position.line, character: start },
        end: { line: position.line, character: end }
      },
      placeholder: identifier
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Performs a rename operation across the workspace
 */
export async function performRename(
  filePath: string,
  position: Position,
  newName: string,
  searchPath?: string
): Promise<WorkspaceEditResult> {
  try {
    if (!existsSync(filePath)) {
      return { success: false, changes: {}, error: `File not found: ${filePath}` };
    }

    // Validate new name
    if (!newName || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(newName)) {
      return { success: false, changes: {}, error: `Invalid identifier: ${newName}` };
    }

    const content = readFileSync(filePath, 'utf-8');
    const oldName = getIdentifierAtPosition(content, position.line, position.character);

    if (!oldName) {
      return { success: false, changes: {}, error: 'No identifier at position' };
    }

    if (oldName === newName) {
      return { success: false, changes: {}, error: 'New name is same as old name' };
    }

    const cwd = searchPath || dirname(filePath);
    const changes: { [uri: string]: TextEdit[] } = {};

    // Find all references using grep
    const args = [
      '-rn',
      '--include=*.ts',
      '--include=*.tsx',
      '--include=*.js',
      '--include=*.jsx',
      '-E',
      `\\b${oldName}\\b`,
      '.'
    ];

    const stdout = await executeGrep(args, cwd);
    const lines = stdout.trim().split('\n').filter(l => l);

    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (match) {
        const [, file, lineNum, lineContent] = match;
        const lineIndex = parseInt(lineNum, 10) - 1;
        const fullPath = pathResolve(cwd, file);
        const uri = `file://${fullPath.replace(/\\/g, '/')}`;

        if (!changes[uri]) {
          changes[uri] = [];
        }

        // Find all occurrences of the identifier in the line
        const regex = new RegExp(`\\b${oldName}\\b`, 'g');
        let m;
        while ((m = regex.exec(lineContent)) !== null) {
          changes[uri].push({
            range: {
              start: { line: lineIndex, character: m.index },
              end: { line: lineIndex, character: m.index + oldName.length }
            },
            newText: newName
          });
        }
      }
    }

    return { success: true, changes };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, changes: {}, error: errorMessage };
  }
}

export default {
  findDefinition,
  findReferences,
  getHoverInfo,
  findWorkspaceSymbols,
  checkLanguageServerAvailability,
  prepareRename,
  performRename
};
