
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor.js';
import { BNGLexer } from './generated/BNGLexer.ts';
import { BNGParser, Arg_nameContext, Observable_refContext, Function_callContext } from './generated/BNGParser.ts';
import type { BNGParserVisitor } from './generated/BNGParserVisitor.ts';

export class DependencyVisitor extends AbstractParseTreeVisitor<void> implements BNGParserVisitor<void> {
    public dependencies = new Set<string>();

    protected defaultResult(): void {}

    visitArg_name(ctx: Arg_nameContext): void {
        // Simple identifiers like 'k', 'A'
        if (ctx.STRING()) {
            this.dependencies.add(ctx.STRING()!.text);
        } else {
            // It might be a keyword used as arg_name (e.g. t_end), treat as dependency if it's in expression
            // Actually, existing parser treats 't_end' token as arg_name. 
            // In expression, valid deps are strings. 
            // If the grammar allows keywords as identifiers, we should capture them.
            // Check ctx.text
            if (ctx.text) this.dependencies.add(ctx.text);
        }
    }

    visitObservable_ref(ctx: Observable_refContext): void {
        // e.g. f(A, B) -> f is dependency
        // e.g. Obs(S) -> Obs is dependency
        const name = ctx.STRING().text;
        this.dependencies.add(name);
        
        // Visit children to process arguments (A, B)
        this.visitChildren(ctx); 
    }

    visitFunction_call(ctx: Function_callContext): void {
        // Built-in functions (sin, exp) are NOT dependencies.
        // Just visit children arguments.
        this.visitChildren(ctx);
    }
}

/**
 * Extracts all identifiers (observables, functions, parameters) from an expression string using ANTLR parser.
 * This ensures robust parsing of nested function calls and avoids regex pitfalls.
 */
export function getExpressionDependencies(expression: string): Set<string> {
    // Return empty for empty strings
    if (!expression || !expression.trim()) return new Set();

    try {
        const inputStream = CharStreams.fromString(expression);
        const lexer = new BNGLexer(inputStream);
        const tokenStream = new CommonTokenStream(lexer);
        const parser = new BNGParser(tokenStream);

        // Turn off default error logging to avoid console spam on invalid fragments (if any)
        parser.removeErrorListeners(); 
        
        const tree = parser.expression();
        const visitor = new DependencyVisitor();
        visitor.visit(tree);

        return visitor.dependencies;
    } catch (e) {
        // Fallback or explicit warning
        console.warn(`[getExpressionDependencies] Failed to parse '${expression}':`, e);
        return new Set();
    }
}
