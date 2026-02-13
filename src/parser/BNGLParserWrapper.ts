/**
 * ANTLR4-based BNGL Parser Wrapper
 * 
 * Parses BNGL files using the ANTLR4 grammar and converts to ParsedBNGL type.
 * Provides BNG2.pl-compatible parsing for maximum parity.
 */
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { BNGLexer } from './generated/BNGLexer.ts';
import { BNGParser } from './generated/BNGParser.ts';
import { BNGLVisitor } from './BNGLVisitor.ts';
import type { BNGLModel } from '../../types';

export interface ParseError {
  line: number;
  column: number;
  message: string;
}

export interface ParseResult {
  success: boolean;
  model?: BNGLModel;
  errors: ParseError[];
}

/**
 * Parse a BNGL file using ANTLR4 grammar
 */
export function parseBNGLWithANTLR(input: string): ParseResult {
  const errors: ParseError[] = [];

  try {
    // Create lexer and parser
    // Some published BNGL files can start with a UTF-8 BOM (U+FEFF). BNG2.pl
    // accepts this; our lexer should too.
    let sanitizedInput = input.replace(/^\uFEFF/, '');

    // Normalize legacy 'begin molecules' / 'end molecules' blocks to
    // the preferred 'begin molecule types' / 'end molecule types' form.
    // We do this as a pre-parse normalization to preserve repository files
    // but remain compatible with BNG2.pl. We skip lines that are comments.
    function normalizeLegacyBlocks(src: string): { normalized: string; warned: boolean } {
      const lines = src.split(/\r\n|\n/);
      let warned = false;
      const out = lines.map(line => {
        const trimmedStart = line.replace(/^\s*/, '');
        // Skip commented lines
        if (/^#/.test(trimmedStart)) return line;
        if (/^\s*begin\s+molecules\b/i.test(line)) {
          warned = true;
          return line.replace(/begin\s+molecules\b/i, 'begin molecule types');
        }
        if (/^\s*end\s+molecules\b/i.test(line)) {
          warned = true;
          return line.replace(/end\s+molecules\b/i, 'end molecule types');
        }
        return line;
      });
      return { normalized: out.join('\n'), warned };
    }

    const { normalized, warned } = normalizeLegacyBlocks(sanitizedInput);
    sanitizedInput = normalized;
    if (warned) console.warn('[BNGL parser] Rewrote legacy "begin molecules"/"end molecules" to "begin molecule types" for parsing. Consider updating the model file.');

    const inputStream = CharStreams.fromString(sanitizedInput);
    const lexer = new BNGLexer(inputStream);

    // Collect lexer errors
    lexer.removeErrorListeners();
    lexer.addErrorListener({
      syntaxError: (_recognizer, _offendingSymbol, line, charPositionInLine, msg) => {
        errors.push({ line, column: charPositionInLine, message: msg });
      }
    });

    const tokenStream = new CommonTokenStream(lexer);
    const parser = new BNGParser(tokenStream);

    // Collect parser errors
    parser.removeErrorListeners();
    parser.addErrorListener({
      syntaxError: (_recognizer, _offendingSymbol, line, charPositionInLine, msg) => {
        errors.push({ line, column: charPositionInLine, message: msg });
      }
    });

    // Parse the input
    // Parse the input
    const tree = parser.prog();

    // Visit the parse tree and build BNGLModel even if there are errors (best effort)
    let model: BNGLModel | undefined;
    try {
      const visitor = new BNGLVisitor();
      model = visitor.visit(tree);
    } catch (visitorError: any) {
      console.error('Visitor exception:', visitorError);
      errors.push({
        line: 0,
        column: 0,
        message: `Visitor error: ${visitorError.message}`
      });
    }

    return {
      success: errors.length === 0,
      model,
      errors
    };
  } catch (e: any) {
    console.error('Parser exception:', e);
    return {
      success: false,
      errors: [{ line: 0, column: 0, message: e.message || 'Unknown parser error' }]
    };
  }
}

/**
 * Parse BNGL and throw on error (for compatibility with existing code)
 */
export function parseBNGLStrict(input: string): BNGLModel {
  const result = parseBNGLWithANTLR(input);

  if (!result.success || !result.model) {
    const errorMsg = result.errors.map(e => `Line ${e.line}:${e.column}: ${e.message}`).join('\n');
    throw new Error(`BNGL parse error:\n${errorMsg}`);
  }

  return result.model;
}
