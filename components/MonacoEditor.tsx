// @ts-nocheck
import React, { useRef, useEffect } from 'react';
import { EditorMarker } from '../types';

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  theme?: 'light' | 'dark';
  markers?: EditorMarker[];
  selection?: {
    startLineNumber: number;
    endLineNumber: number;
    startColumn?: number;
    endColumn?: number;
  };
  lastResized?: number;
  /** Callback fired when the user presses Ctrl+Enter to run simulation */
  onRun?: () => void;
}

declare const window: any;

let monacoLoadPromise: Promise<any> | null = null;

function loadMonaco() {
  if (monacoLoadPromise) {
    return monacoLoadPromise;
  }

  monacoLoadPromise = new Promise((resolve, reject) => {
    if (window.monaco) {
      resolve(window.monaco);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
    script.async = true;
    script.onload = () => {
      window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
      window.require(['vs/editor/editor.main'], () => {
        resolve(window.monaco);
      });
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return monacoLoadPromise;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  onChange,
  language = 'bngl',
  theme = 'light',
  markers = [],
  selection,
  lastResized,
  onRun,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<any>(null);
  const editorInstanceRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const markersRef = useRef<EditorMarker[]>(markers);
  const valueRef = useRef<string>(value);
  const onRunRef = useRef(onRun);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

// Effect 4: Handle selection/reveal request
useEffect(() => {
  const editor = editorInstanceRef.current;
  if (!editor || !selection) return;

  // Reveal the line in the center
  editor.revealLineInCenter(selection.startLineNumber);

  // Select the range
  editor.setSelection({
    startLineNumber: selection.startLineNumber,
    startColumn: selection.startColumn ?? 1,
    endLineNumber: selection.endLineNumber,
    endColumn: selection.endColumn ?? 1,
  });
}, [selection]);

// Effect 5: Explicit layout call on container resize
useEffect(() => {
  const editor = editorInstanceRef.current;
  if (editor && lastResized) {
    editor.layout();
  }
}, [lastResized]);

// Effect 1: Create editor on mount and dispose on unmount
useEffect(() => {
  let isCancelled = false;
  let editor: any = null;
  let contentListener: any = null;

  loadMonaco()
    .then(monaco => {
      if (isCancelled || !editorRef.current) return;
      monacoRef.current = monaco;

      // Register BNGL language once
      if (!monaco.languages.getLanguages().some(({ id }: { id: string }) => id === 'bngl')) {
        monaco.languages.register({ id: 'bngl' });

        // Enhanced Monarch tokenizer based on BNG VSCode extension TextMate grammar
        monaco.languages.setMonarchTokensProvider('bngl', {
          // Block begin/end keywords
          blockKeywords: ['begin', 'end'],

          // Block type names
          blockNames: [
            'model', 'parameters', 'compartments', 'molecule types', 'molecule', 'types',
            'seed species', 'species', 'observables', 'functions', 'reaction rules',
            'reactions', 'groups', 'population maps', 'energy patterns', 'actions'
          ],

          // Action command names (from TextMate grammar)
          actions: [
            'generate_network', 'generate_hybrid_model', 'simulate', 'simulate_ode',
            'simulate_ssa', 'simulate_pla', 'simulate_nf', 'parameter_scan', 'bifurcate',
            'readFile', 'writeFile', 'writeModel', 'writeNetwork', 'writeXML', 'writeSBML',
            'writeMfile', 'writeMexfile', 'writeMDL', 'visualize', 'setConcentration',
            'addConcentration', 'saveConcentrations', 'resetConcentrations', 'setParameter',
            'saveParameters', 'resetParameters', 'quit', 'setModelName', 'substanceUnits',
            'version', 'setOption'
          ],

          // Observable types
          observableTypes: ['Molecules', 'Species'],

          // Rule modifiers
          ruleModifiers: ['DeleteMolecules', 'MoveConnected', 'TotalRate',
            'exclude_reactants', 'include_reactants', 'exclude_products', 'include_products'],

          // Operators
          operators: ['->', '<->', '=>', '<=>', '!', '.', '+', ',', '~', '@', '%', '$'],

          tokenizer: {
            root: [
              // Comments
              [/#.*$/, 'comment'],

              // Block begin/end with type
              [/(begin|end)(\s+)(model|parameters|compartments|molecule\s+types|seed\s+species|species|observables|functions|reaction\s+rules|reactions|groups|population\s+maps|energy\s+patterns|actions)/,
                ['keyword.control', 'white', 'keyword.type']],

              // Simple begin/end
              [/\b(begin|end)\b/, 'keyword.control'],

              // Actions with parentheses
              [/(generate_network|generate_hybrid_model|simulate|simulate_ode|simulate_ssa|simulate_pla|simulate_nf|parameter_scan|bifurcate|readFile|writeFile|writeModel|writeNetwork|writeXML|writeSBML|writeMfile|writeMexfile|writeMDL|visualize|setConcentration|addConcentration|saveConcentrations|resetConcentrations|setParameter|saveParameters|resetParameters|quit|setModelName|substanceUnits|version|setOption)(\s*)(\()/,
                ['keyword.action', 'white', 'delimiter.parenthesis']],

              // Observable type keywords
              [/\b(Molecules|Species)\b/, 'keyword.observable'],

              // Rule modifiers
              [/\b(DeleteMolecules|MoveConnected|TotalRate|exclude_reactants|include_reactants|exclude_products|include_products)\b/, 'keyword.modifier'],

              // Molecule names (capitalized identifier followed by parentheses)
              [/[A-Z][A-Za-z0-9_]*(?=\()/, 'type.molecule'],

              // Component/state within parentheses
              [/[a-z][A-Za-z0-9_]*(?=[\~\!\,\)])/, 'variable.component'],

              // State values after tilde
              [/\~([A-Za-z0-9_]+)/, 'string.state'],

              // Bond index after exclamation
              [/\!([0-9]+|\?|\+)/, 'constant.bond'],

              // Compartment annotation
              [/@([A-Za-z][A-Za-z0-9_]*)/, 'variable.compartment'],

              // Rule arrows
              [/<->|->/, 'operator.arrow'],

              // Action argument assignment
              [/=>/, 'operator.assign'],

              // Numbers (scientific notation supported)
              [/\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],

              // Quoted strings
              [/"[^"]*"/, 'string'],

              // Parameter/variable names (identifier = value pattern)
              [/([A-Za-z_][A-Za-z0-9_]*)(\s*)(=)/, ['variable.parameter', 'white', 'operator']],

              // Generic identifiers
              [/[A-Za-z_][A-Za-z0-9_]*/, 'identifier'],

              // Delimiters
              [/[(){}[\],.]/, 'delimiter'],

              // Whitespace
              [/\s+/, 'white'],
            ],
          },
        });

        // Define custom theme colors for BNGL
        monaco.editor.defineTheme('bngl-light', {
          base: 'vs',
          inherit: true,
          rules: [
            { token: 'keyword.control', foreground: '0000FF', fontStyle: 'bold' },
            { token: 'keyword.type', foreground: '008080', fontStyle: 'bold' },
            { token: 'keyword.action', foreground: '800080' },
            { token: 'keyword.observable', foreground: '008080' },
            { token: 'keyword.modifier', foreground: 'FF8C00' },
            { token: 'type.molecule', foreground: '2E8B57', fontStyle: 'bold' },
            { token: 'variable.component', foreground: '4169E1' },
            { token: 'string.state', foreground: 'DAA520' },
            { token: 'constant.bond', foreground: 'DC143C' },
            { token: 'variable.compartment', foreground: '9370DB' },
            { token: 'operator.arrow', foreground: 'FF4500', fontStyle: 'bold' },
            { token: 'variable.parameter', foreground: '2F4F4F' },
          ],
          colors: {},
        });

        monaco.editor.defineTheme('bngl-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'keyword.control', foreground: '569CD6', fontStyle: 'bold' },
            { token: 'keyword.type', foreground: '4EC9B0', fontStyle: 'bold' },
            { token: 'keyword.action', foreground: 'C586C0' },
            { token: 'keyword.observable', foreground: '4EC9B0' },
            { token: 'keyword.modifier', foreground: 'DCDCAA' },
            { token: 'type.molecule', foreground: '4FC1FF', fontStyle: 'bold' },
            { token: 'variable.component', foreground: '9CDCFE' },
            { token: 'string.state', foreground: 'CE9178' },
            { token: 'constant.bond', foreground: 'F48771' },
            { token: 'variable.compartment', foreground: 'B5CEA8' },
            { token: 'operator.arrow', foreground: 'FFD700', fontStyle: 'bold' },
            { token: 'variable.parameter', foreground: '9CDCFE' },
          ],
          colors: {},
        });
      }

      editor = monaco.editor.create(editorRef.current, {
        // Important: use the latest value. `value` may have changed while Monaco was loading
        // (e.g., shared-link load on startup), and this effect only runs once.
        value: valueRef.current,
        language,
        theme: theme === 'dark' ? 'bngl-dark' : 'bngl-light',
        automaticLayout: true,
        minimap: { enabled: false },
        wordWrap: 'on',
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
      });

      // Configure BNGL comment style so toggle-comment uses '#'
      monaco.languages.setLanguageConfiguration('bngl', {
        comments: {
          lineComment: '#',
        },
      });

      // Keyboard shortcut: Ctrl+Shift+/ or Shift+Enter → Toggle line comment
      editor.addAction({
        id: 'bngl-toggle-line-comment',
        label: 'Toggle Line Comment',
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Slash,
          monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        ],
        run: (ed: any) => {
          ed.trigger('keyboard', 'editor.action.commentLine', null);
        },
      });

      // Keyboard shortcut: Ctrl+Enter → Run simulation
      editor.addAction({
        id: 'bngl-run-simulation',
        label: 'Run Simulation',
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        ],
        run: () => {
          if (onRunRef.current) onRunRef.current();
        },
      });

      // Register a completion provider for BNGL language (snippets & basic templates)
      if (!monaco.languages.registerCompletionItemProvider.__bngl_registered) {
        monaco.languages.registerCompletionItemProvider('bngl', {
          provideCompletionItems: (model, position) => {
            const suggestions = [
              {
                label: 'begin model',
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: ['begin model', '  begin parameters', '    k1 1.0', '  end parameters', '', '  begin molecule types', '    A(b)', '  end molecule types', '', '  begin reaction rules', '    A() -> A() k1', '  end reaction rules', 'end model'].join('\n'),
                documentation: 'Scaffold a minimal BNGL model with parameters and rules',
              },
              {
                label: 'parameter',
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: 'k${1:rate} ${2:1.0}',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Insert a parameter definition',
              },
              {
                label: 'molecule type',
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: 'X(${1:site})',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Create a molecule type',
              },
              {
                label: 'reaction rule',
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: '${1:Reactants} -> ${2:Products} ${3:k1}',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Insert a rule template',
              },
              {
                label: 'simulate',
                kind: monaco.languages.CompletionItemKind.Snippet,
                insertText: 'simulate_ode({ method => "ode", t_end => ${1:100}, n_steps => ${2:100} })',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: 'Add a simulate snippet (ODE/SSA)',
              },
            ];
            return { suggestions } as any;
          },
        });
        // mark to avoid double registration
        monaco.languages.registerCompletionItemProvider.__bngl_registered = true;
      }
      editorInstanceRef.current = editor;

      contentListener = editor.onDidChangeModelContent(() => {
        onChangeRef.current(editor.getValue());
      });
    })
    .catch(error => {
      if (!isCancelled) {
        console.error('Failed to initialize Monaco Editor:', error);
      }
    });

  return () => {
    isCancelled = true;
    if (contentListener) {
      contentListener.dispose();
    }
    if (editor) {
      try {
        editor.dispose();
      } catch (e) {
        console.warn('Error disposing Monaco editor:', e);
      }
    }
    editorInstanceRef.current = null;
  };
}, []);

// Effect 1b: Update theme dynamically
useEffect(() => {
  const monaco = monacoRef.current;
  const editor = editorInstanceRef.current;
  if (!monaco || !editor) return;
  monaco.editor.setTheme(theme === 'dark' ? 'bngl-dark' : 'bngl-light');
}, [theme]);

// Effect 1c: Update language without recreating the editor
useEffect(() => {
  const monaco = monacoRef.current;
  const editor = editorInstanceRef.current;
  if (!monaco || !editor) return;
  const model = editor.getModel();
  if (model) {
    monaco.editor.setModelLanguage(model, language);
  }
}, [language]);

// Effect 2: Sync external value changes
useEffect(() => {
  const editor = editorInstanceRef.current;
  if (editor && editor.getValue() !== value) {
    const model = editor.getModel();
    if (model) {
      model.setValue(value);
    }
  }
}, [value]);

// Effect 3: Apply validation markers when provided
useEffect(() => {
  const monaco = monacoRef.current;
  const editor = editorInstanceRef.current;
  if (!monaco || !editor) return;

  const model = editor.getModel();
  if (!model) return;

  const severityMap: Record<string, number> = {
    error: monaco.MarkerSeverity.Error,
    warning: monaco.MarkerSeverity.Warning,
    info: monaco.MarkerSeverity.Info,
  };

  const markerData = (markersRef.current ?? []).map((marker) => ({
    startLineNumber: marker.startLineNumber,
    endLineNumber: marker.endLineNumber,
    startColumn: marker.startColumn ?? 1,
    endColumn: marker.endColumn ?? 1,
    message: marker.message,
    severity: severityMap[marker.severity] ?? monaco.MarkerSeverity.Info,
  }));

  monaco.editor.setModelMarkers(model, 'bngl-validation', markerData);
}, [markers]);

return <div ref={editorRef} className="w-full h-full border border-stone-300 dark:border-slate-700 rounded-md" />;
};

export default MonacoEditor;