import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { 
  getErrorHandler, 
  resetErrorHandler, 
  NFsimErrorHandler, 
  NFsimError, 
  NFsimErrorType, 
  RecoveryStrategy 
} from '@bngplayground/engine';

describe('NFsim Error Handling Completeness', () => {
  let errorHandler: NFsimErrorHandler;

  beforeEach(() => {
    resetErrorHandler();
    errorHandler = getErrorHandler();
  });

  afterEach(() => {
    resetErrorHandler();
  });

  // Helper methods to match error handler patterns exactly
  const matchesWasmCorruptionPatterns = (message: string): boolean => {
    const patterns = ['wasm corruption', 'module corruption', 'invalid module state', 'corrupted heap', 'segmentation fault'];
    return patterns.some(pattern => message.includes(pattern));
  };

  const matchesMemoryPatterns = (message: string): boolean => {
    const patterns = ['memory allocation', 'out of memory', 'memory limit exceeded', 'heap exhausted', 'invalid typed array length'];
    return patterns.some(pattern => message.includes(pattern));
  };

  const matchesTimeoutPatterns = (message: string): boolean => {
    const patterns = ['timeout', 'timed out', 'execution timeout', 'operation timeout'];
    return patterns.some(pattern => message.includes(pattern));
  };

  const matchesXmlPatterns = (message: string): boolean => {
    const patterns = ['xml', 'invalid model', 'parsing error', 'malformed', 'schema validation', 'missing component', 'invalid syntax'];
    return patterns.some(pattern => message.includes(pattern));
  };

  const matchesCompatibilityPatterns = (message: string): boolean => {
    const patterns = ['totalrate', 'observable-dependent rate', 'unsupported feature', 'not supported by nfsim', 'incompatible with network-free'];
    return patterns.some(pattern => message.includes(pattern));
  };

  const matchesParameterPatterns = (message: string): boolean => {
    const patterns = ['invalid parameter', 'parameter out of range', 'negative time', 'invalid step count', 'utl', 'gml'];
    return patterns.some(pattern => message.includes(pattern));
  };

  const matchesRuntimePatterns = (message: string): boolean => {
    const patterns = ['nfsim', 'simulation failed', 'runtime error', 'execution failed'];
    return patterns.some(pattern => message.includes(pattern));
  };

  describe('Property 4: Error Handling Completeness', () => {
    it('should comprehensively classify and handle all error types', async () => {
      await fc.assert(
        fc.property(
          fc.oneof(
            // WASM corruption errors
            fc.constantFrom(
              'WASM corruption detected',
              'Module corruption in heap',
              'Invalid module state encountered',
              'Corrupted heap detected',
              'Segmentation fault in WASM'
            ),
            // Memory errors
            fc.constantFrom(
              'Memory allocation failed',
              'Out of memory error',
              'Memory limit exceeded',
              'Heap exhausted',
              'Invalid typed array length'
            ),
            // Timeout errors
            fc.constantFrom(
              'Execution timeout',
              'Operation timed out',
              'NFsim execution timeout',
              'Simulation timed out'
            ),
            // XML/Model errors
            fc.constantFrom(
              'XML parsing error',
              'Invalid model structure',
              'Malformed XML content',
              'Schema validation failed',
              'Missing component in model'
            ),
            // NFsim compatibility errors
            fc.constantFrom(
              'TotalRate modifiers not supported by NFsim',
              'Observable-dependent rates not supported',
              'Unsupported feature detected',
              'Not compatible with network-free simulation'
            ),
            // NFsim parameter errors
            fc.constantFrom(
              'Invalid parameter value',
              'Parameter out of range',
              'Negative time specified',
              'Invalid UTL value',
              'GML parameter error'
            ),
            // NFsim runtime errors
            fc.constantFrom(
              'NFsim simulation failed',
              'Runtime error in NFsim',
              'NFsim execution failed',
              'Simulation runtime error'
            ),
            // Generic/unknown errors
            fc.constantFrom(
              'Unknown error occurred',
              'Unexpected failure',
              'Generic simulation error',
              'Unhandled exception'
            )
          ),
          fc.record({
            executionId: fc.option(fc.string()),
            modelName: fc.option(fc.string()),
            parameters: fc.option(fc.record({
              t_end: fc.float({ min: Math.fround(0.1), max: Math.fround(1000) }),
              n_steps: fc.integer({ min: 1, max: 10000 }),
              utl: fc.option(fc.integer({ min: 1, max: 1000 }))
            })),
            memoryUsage: fc.option(fc.integer({ min: 0, max: 1000000000 }))
          }),
          (errorMessage: string, contextData: any) => {
            // **Property 4: Error Handling Completeness**
            // *For any* error message and context, the error handler should:
            // 1. Always classify the error into a specific type
            // 2. Provide appropriate recovery strategies
            // 3. Generate user-friendly guidance
            // 4. Maintain error history and statistics
            // 5. Be consistent in classification

            const context = {
              timestamp: new Date(),
              ...contextData
            };

            const nfsimError = errorHandler.classifyError(errorMessage, context);

            // 1. Error should always be classified into a specific type
            expect(nfsimError).toBeInstanceOf(NFsimError);
            expect(nfsimError.type).toBeDefined();
            expect(Object.values(NFsimErrorType)).toContain(nfsimError.type);

            // 2. Error should have proper structure
            expect(nfsimError.message).toBe(errorMessage);
            expect(nfsimError.context).toEqual(expect.objectContaining(context));
            expect(nfsimError.userGuidance).toBeDefined();
            expect(typeof nfsimError.userGuidance).toBe('string');
            expect(nfsimError.userGuidance.length).toBeGreaterThan(0);

            // 3. Recovery actions should be appropriate for error type
            expect(Array.isArray(nfsimError.recoveryActions)).toBe(true);
            nfsimError.recoveryActions.forEach(action => {
              expect(action).toHaveProperty('strategy');
              expect(action).toHaveProperty('description');
              expect(action).toHaveProperty('estimatedSuccessRate');
              expect(Object.values(RecoveryStrategy)).toContain(action.strategy);
              expect(typeof action.description).toBe('string');
              expect(action.description.length).toBeGreaterThan(0);
              expect(action.estimatedSuccessRate).toBeGreaterThanOrEqual(0);
              expect(action.estimatedSuccessRate).toBeLessThanOrEqual(1);
            });

            // 4. isRecoverable should match presence of recovery actions
            expect(nfsimError.isRecoverable).toBe(nfsimError.recoveryActions.length > 0);

            // 5. Classification should be consistent for same error message
            const secondClassification = errorHandler.classifyError(errorMessage, context);
            expect(secondClassification.type).toBe(nfsimError.type);
            expect(secondClassification.recoveryActions).toEqual(nfsimError.recoveryActions);

            // 6. Verify specific error type classifications (match actual error handler logic)
            const lowerMessage = errorMessage.toLowerCase();
            
            // WASM corruption patterns (checked first in error handler)
            if (matchesWasmCorruptionPatterns(lowerMessage)) {
              expect(nfsimError.type).toBe(NFsimErrorType.WASM_CORRUPTION);
              expect(nfsimError.recoveryActions.some(a => a.strategy === RecoveryStrategy.RESET_MODULE)).toBe(true);
            }
            // Memory patterns (checked second)
            else if (matchesMemoryPatterns(lowerMessage)) {
              expect(nfsimError.type).toBe(NFsimErrorType.MEMORY_LIMIT_EXCEEDED);
              expect(nfsimError.recoveryActions.some(a => 
                a.strategy === RecoveryStrategy.REDUCE_PARAMETERS || 
                a.strategy === RecoveryStrategy.FALLBACK_METHOD
              )).toBe(true);
            }
            // Timeout patterns
            else if (matchesTimeoutPatterns(lowerMessage)) {
              expect(nfsimError.type).toBe(NFsimErrorType.WASM_EXECUTION_TIMEOUT);
              expect(nfsimError.recoveryActions.some(a => a.strategy === RecoveryStrategy.REDUCE_PARAMETERS)).toBe(true);
            }
            // XML patterns
            else if (matchesXmlPatterns(lowerMessage)) {
              expect(nfsimError.type).toBe(NFsimErrorType.XML_VALIDATION_ERROR);
              expect(nfsimError.recoveryActions.some(a => a.strategy === RecoveryStrategy.USER_INTERVENTION)).toBe(true);
            }
            // Compatibility patterns
            else if (matchesCompatibilityPatterns(lowerMessage)) {
              expect(nfsimError.type).toBe(NFsimErrorType.NFSIM_COMPATIBILITY_ERROR);
              expect(nfsimError.recoveryActions.some(a => a.strategy === RecoveryStrategy.FALLBACK_METHOD)).toBe(true);
            }
            // Parameter patterns
            else if (matchesParameterPatterns(lowerMessage)) {
              expect(nfsimError.type).toBe(NFsimErrorType.NFSIM_PARAMETER_ERROR);
              expect(nfsimError.recoveryActions.some(a => a.strategy === RecoveryStrategy.REDUCE_PARAMETERS)).toBe(true);
            }
            // Runtime patterns
            else if (matchesRuntimePatterns(lowerMessage)) {
              expect(nfsimError.type).toBe(NFsimErrorType.NFSIM_RUNTIME_ERROR);
            }

            // 7. Error should be recorded in history
            const stats = errorHandler.getErrorStatistics();
            expect(stats.totalErrors).toBeGreaterThan(0);
            expect(stats.errorsByType[nfsimError.type]).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    it('should provide consistent error formatting and user guidance', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(NFsimErrorType)),
          fc.string({ minLength: 10, maxLength: 200 }),
          fc.record({
            executionId: fc.option(fc.string()),
            modelName: fc.option(fc.string()),
            memoryUsage: fc.option(fc.integer({ min: 0, max: 1000000000 }))
          }),
          (errorType: NFsimErrorType, errorMessage: string, contextData: any) => {
            // **Property 4: Error Handling Completeness**
            // *For any* error type and message, user formatting should be comprehensive

            const context = {
              timestamp: new Date(),
              ...contextData
            };

            const nfsimError = errorHandler.classifyError(errorMessage, context);
            const userFormat = errorHandler.formatErrorForUser(nfsimError);

            // User format should have all required fields
            expect(userFormat).toHaveProperty('title');
            expect(userFormat).toHaveProperty('message');
            expect(userFormat).toHaveProperty('suggestions');
            expect(userFormat).toHaveProperty('technicalDetails');

            // All fields should be non-empty strings or arrays
            expect(typeof userFormat.title).toBe('string');
            expect(userFormat.title.length).toBeGreaterThan(0);
            expect(typeof userFormat.message).toBe('string');
            expect(userFormat.message.length).toBeGreaterThan(0);
            expect(Array.isArray(userFormat.suggestions)).toBe(true);
            expect(typeof userFormat.technicalDetails).toBe('string');

            // Suggestions should be helpful and limited
            expect(userFormat.suggestions.length).toBeLessThanOrEqual(3);
            userFormat.suggestions.forEach(suggestion => {
              expect(typeof suggestion).toBe('string');
              expect(suggestion.length).toBeGreaterThan(0);
            });

            // Technical details should match original error message
            expect(userFormat.technicalDetails).toBe(errorMessage);

            // Title should be appropriate for error type
            const titleLower = userFormat.title.toLowerCase();
            switch (nfsimError.type) {
              case NFsimErrorType.WASM_CORRUPTION:
                expect(titleLower).toContain('engine');
                break;
              case NFsimErrorType.MEMORY_LIMIT_EXCEEDED:
                expect(titleLower).toContain('memory');
                break;
              case NFsimErrorType.XML_VALIDATION_ERROR:
                expect(titleLower).toContain('validation');
                break;
              case NFsimErrorType.NFSIM_COMPATIBILITY_ERROR:
                expect(titleLower).toContain('compatibility');
                break;
              case NFsimErrorType.NFSIM_PARAMETER_ERROR:
                expect(titleLower).toContain('parameter');
                break;
              case NFsimErrorType.WASM_EXECUTION_TIMEOUT:
                expect(titleLower).toContain('timeout');
                break;
            }
          }
        ),
        { numRuns: 30, timeout: 5000 }
      );
    });

    it('should maintain comprehensive error statistics and history', async () => {
      // Generate a variety of errors to test statistics
      const errorMessages = [
        'WASM corruption detected',
        'Memory allocation failed', 
        'Execution timeout',
        'XML parsing error',
        'TotalRate not supported',
        'Invalid parameter value',
        'NFsim runtime error',
        'Unknown error'
      ];

      const contexts = errorMessages.map((msg, index) => ({
        timestamp: new Date(),
        executionId: `test_${index}`,
        modelName: `model_${index}`
      }));

      // Generate errors
      const errors = errorMessages.map((msg, index) => 
        errorHandler.classifyError(msg, contexts[index])
      );

      // **Property 4: Error Handling Completeness**
      // Error statistics should be comprehensive and accurate

      const stats = errorHandler.getErrorStatistics();

      // Statistics should have proper structure
      expect(stats).toHaveProperty('totalErrors');
      expect(stats).toHaveProperty('errorsByType');
      expect(stats).toHaveProperty('recentErrors');
      expect(stats).toHaveProperty('commonPatterns');

      // Total count should match generated errors
      expect(stats.totalErrors).toBe(errorMessages.length);

      // Error counts by type should be accurate
      Object.values(NFsimErrorType).forEach(type => {
        expect(stats.errorsByType).toHaveProperty(type);
        expect(typeof stats.errorsByType[type]).toBe('number');
        expect(stats.errorsByType[type]).toBeGreaterThanOrEqual(0);
      });

      // Sum of type counts should equal total
      const typeCountSum = Object.values(stats.errorsByType).reduce((sum, count) => sum + count, 0);
      expect(typeCountSum).toBe(stats.totalErrors);

      // Recent errors should be limited and properly structured
      expect(Array.isArray(stats.recentErrors)).toBe(true);
      expect(stats.recentErrors.length).toBeLessThanOrEqual(10);
      stats.recentErrors.forEach(error => {
        expect(error).toBeInstanceOf(NFsimError);
      });

      // Common patterns should be extracted
      expect(Array.isArray(stats.commonPatterns)).toBe(true);
      expect(stats.commonPatterns.length).toBeLessThanOrEqual(5);
      stats.commonPatterns.forEach(pattern => {
        expect(typeof pattern).toBe('string');
        expect(pattern.length).toBeGreaterThan(3);
      });

      // Test history clearing
      errorHandler.clearHistory();
      const clearedStats = errorHandler.getErrorStatistics();
      expect(clearedStats.totalErrors).toBe(0);
      expect(clearedStats.recentErrors).toHaveLength(0);
    });

    it('should parse stderr output comprehensively', () => {
      const testStderr = `
INFO: Starting NFsim simulation
WARNING: High UTL value may cause performance issues
ERROR: Memory allocation failed
WARN: Model complexity is high
Failed to initialize simulation
Exception: Invalid parameter detected
Normal output line
ERROR: Critical failure in WASM module
      `.trim();

      // **Property 4: Error Handling Completeness**
      // stderr parsing should categorize all output types

      const parsed = errorHandler.parseStderr(testStderr);

      expect(parsed).toHaveProperty('errors');
      expect(parsed).toHaveProperty('warnings');
      expect(parsed).toHaveProperty('info');

      // Should identify errors correctly
      expect(parsed.errors.length).toBeGreaterThan(0);
      expect(parsed.errors.some(e => e.includes('Memory allocation failed'))).toBe(true);
      expect(parsed.errors.some(e => e.includes('Critical failure'))).toBe(true);

      // Should identify warnings correctly
      expect(parsed.warnings.length).toBeGreaterThan(0);
      expect(parsed.warnings.some(w => w.includes('High UTL value'))).toBe(true);
      expect(parsed.warnings.some(w => w.includes('Model complexity'))).toBe(true);

      // Should capture info lines
      expect(parsed.info.length).toBeGreaterThan(0);
      expect(parsed.info.some(i => i.includes('Starting NFsim'))).toBe(true);

      // Should handle empty stderr
      const emptyParsed = errorHandler.parseStderr('');
      expect(emptyParsed.errors).toHaveLength(0);
      expect(emptyParsed.warnings).toHaveLength(0);
      expect(emptyParsed.info).toHaveLength(0);
    });

    it('should provide appropriate recovery suggestions', () => {
      const testCases = [
        {
          error: 'WASM corruption detected',
          expectedStrategies: [RecoveryStrategy.RESET_MODULE, RecoveryStrategy.RETRY]
        },
        {
          error: 'Memory limit exceeded',
          expectedStrategies: [RecoveryStrategy.REDUCE_PARAMETERS, RecoveryStrategy.FALLBACK_METHOD]
        },
        {
          error: 'TotalRate not supported by NFsim',
          expectedStrategies: [RecoveryStrategy.FALLBACK_METHOD]
        },
        {
          error: 'Invalid parameter value',
          expectedStrategies: [RecoveryStrategy.REDUCE_PARAMETERS]
        },
        {
          error: 'XML parsing failed',
          expectedStrategies: [RecoveryStrategy.USER_INTERVENTION]
        }
      ];

      testCases.forEach(({ error, expectedStrategies }) => {
        // **Property 4: Error Handling Completeness**
        // Recovery suggestions should be appropriate for each error type

        const nfsimError = errorHandler.classifyError(error, { timestamp: new Date() });
        const suggestedRecovery = errorHandler.getSuggestedRecovery(nfsimError);

        if (expectedStrategies.length > 0) {
          expect(suggestedRecovery).toBeDefined();
          expect(suggestedRecovery).not.toBeNull();
          expect(expectedStrategies).toContain(suggestedRecovery!.strategy);
          expect(suggestedRecovery!.estimatedSuccessRate).toBeGreaterThan(0);
          expect(suggestedRecovery!.estimatedSuccessRate).toBeLessThanOrEqual(1);
        }

        // All recovery actions should have reasonable success rates
        nfsimError.recoveryActions.forEach(action => {
          expect(action.estimatedSuccessRate).toBeGreaterThan(0);
          expect(action.estimatedSuccessRate).toBeLessThanOrEqual(1);
          expect(typeof action.description).toBe('string');
          expect(action.description.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Unit Tests for Error Handling Completeness', () => {
    it('should classify WASM corruption errors correctly', () => {
      const error = errorHandler.classifyError('WASM corruption detected', { timestamp: new Date() });
      
      expect(error.type).toBe(NFsimErrorType.WASM_CORRUPTION);
      expect(error.isRecoverable).toBe(true);
      expect(error.recoveryActions.some(a => a.strategy === RecoveryStrategy.RESET_MODULE)).toBe(true);
      expect(error.userGuidance).toContain('simulation engine');
    });

    it('should classify memory errors correctly', () => {
      const error = errorHandler.classifyError('Out of memory', { timestamp: new Date() });
      
      expect(error.type).toBe(NFsimErrorType.MEMORY_LIMIT_EXCEEDED);
      expect(error.isRecoverable).toBe(true);
      expect(error.recoveryActions.some(a => a.strategy === RecoveryStrategy.REDUCE_PARAMETERS)).toBe(true);
      expect(error.userGuidance).toContain('memory');
    });

    it('should classify compatibility errors correctly', () => {
      const error = errorHandler.classifyError('TotalRate not supported by NFsim', { timestamp: new Date() });
      
      expect(error.type).toBe(NFsimErrorType.NFSIM_COMPATIBILITY_ERROR);
      expect(error.isRecoverable).toBe(true);
      expect(error.recoveryActions.some(a => a.strategy === RecoveryStrategy.FALLBACK_METHOD)).toBe(true);
      expect(error.userGuidance).toContain('not supported');
    });

    it('should handle unknown errors gracefully', () => {
      const error = errorHandler.classifyError('Completely unknown error type', { timestamp: new Date() });
      
      expect(error.type).toBe(NFsimErrorType.UNKNOWN_ERROR);
      expect(error.recoveryActions.length).toBeGreaterThan(0);
      expect(error.userGuidance).toContain('unexpected error');
    });

    it('should maintain error history correctly', () => {
      const initialStats = errorHandler.getErrorStatistics();
      const initialCount = initialStats.totalErrors;

      errorHandler.classifyError('Test error 1', { timestamp: new Date() });
      errorHandler.classifyError('Test error 2', { timestamp: new Date() });

      const newStats = errorHandler.getErrorStatistics();
      expect(newStats.totalErrors).toBe(initialCount + 2);
    });

    it('should format errors for users appropriately', () => {
      const error = errorHandler.classifyError('Memory allocation failed', { 
        timestamp: new Date(),
        executionId: 'test_123'
      });

      const formatted = errorHandler.formatErrorForUser(error);

      expect(formatted.title).toBe('Memory Limit Exceeded');
      expect(formatted.message).toContain('memory');
      expect(formatted.suggestions.length).toBeGreaterThan(0);
      expect(formatted.suggestions.length).toBeLessThanOrEqual(3);
      expect(formatted.technicalDetails).toBe('Memory allocation failed');
    });

    it('should provide JSON serialization', () => {
      const error = errorHandler.classifyError('Test error', { timestamp: new Date() });
      const json = error.toJSON();

      expect(json).toHaveProperty('type');
      expect(json).toHaveProperty('message');
      expect(json).toHaveProperty('context');
      expect(json).toHaveProperty('recoveryActions');
      expect(json).toHaveProperty('userGuidance');
      expect(json).toHaveProperty('isRecoverable');

      // Should be serializable
      expect(() => JSON.stringify(json)).not.toThrow();
    });

    it('should handle error context properly', () => {
      const context = {
        timestamp: new Date(),
        executionId: 'test_456',
        modelName: 'test_model',
        parameters: { t_end: 10, n_steps: 100 },
        memoryUsage: 1024000
      };

      const error = errorHandler.classifyError('Test error with context', context);

      expect(error.context).toEqual(context);
      expect(error.context.executionId).toBe('test_456');
      expect(error.context.modelName).toBe('test_model');
      expect(error.context.memoryUsage).toBe(1024000);
    });

    it('should limit error history size', () => {
      // Clear history first
      errorHandler.clearHistory();

      // Generate more than 100 errors (the max history size)
      for (let i = 0; i < 150; i++) {
        errorHandler.classifyError(`Test error ${i}`, { timestamp: new Date() });
      }

      const stats = errorHandler.getErrorStatistics();
      expect(stats.totalErrors).toBe(100); // Should be capped at max size
    });
  });
});