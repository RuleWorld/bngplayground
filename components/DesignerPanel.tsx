import React, { useState, useEffect } from 'react';
import { BioParser } from '../services/grammar/parser';
import { BNGLGenerator } from '../services/grammar/generator';
import { BioSentence } from '../services/grammar/types';
import { CheatsheetModal } from './CheatsheetModal';
import { Button } from './ui/Button';

interface DesignerPanelProps {
  text: string;
  onTextChange: (text: string) => void;
  onCodeChange: (code: string) => void;
  onParse: () => Promise<void>;
  onSimulate: () => void;
}

const DEFAULT_TEXT = `# Welcome to Bio-Designer
# Write biology in natural language!

# Define your molecules
Define Lck
Define TCR with sites itam
Define Zap70
Define SHP1

# Describe interactions (many synonyms work!)
Lck binds TCR
Lck phosphorylates TCR at itam

# The parser understands flexible phrasing:
# "binds", "interacts with", "associates with", "recruits" all work!

# Initialize molecules
Start with 100 of Lck
Start with 100 of TCR
Start with 50 of Zap70
Start with 20 of SHP1

# Run simulation
Simulate for 100s with 200 steps
`;

export const DesignerPanel: React.FC<DesignerPanelProps> = ({ text, onTextChange, onCodeChange, onParse, onSimulate }) => {
  // Use DEFAULT_TEXT if no text provided (first time opening designer)
  const displayText = text || DEFAULT_TEXT;
  const [sentences, setSentences] = useState<BioSentence[]>([]);
  const [lastGeneratedCode, setLastGeneratedCode] = useState('');
  const [isCheatsheetOpen, setIsCheatsheetOpen] = useState(false);

  // Initialize text with default if empty
  useEffect(() => {
    if (!text) {
      onTextChange(DEFAULT_TEXT);
    }
  }, []);

  // 1. Parse Text -> Logic (Immediate)
  useEffect(() => {
    const parsed = BioParser.parseDocument(displayText);
    setSentences(parsed);
  }, [displayText]);

  // 2. Logic -> BNGL Code (Debounced)
  useEffect(() => {
    const validSentences = sentences.filter(s => s.isValid);
    if (validSentences.length === 0 && displayText.trim() !== '') return;

    try {
      const bngl = BNGLGenerator.generate(sentences);
      if (bngl !== lastGeneratedCode) {
        setLastGeneratedCode(bngl);
        onCodeChange(bngl);
      }
    } catch (e) {
      console.error("Generation failed", e);
    }
  }, [sentences, onCodeChange, lastGeneratedCode]);

  // Manual Sync function to force visualization update and run simulation
  const handleSync = async () => {
    if (lastGeneratedCode) {
      onCodeChange(lastGeneratedCode); // Ensure parent has latest
      await onParse(); // Trigger parse/refresh in App
      onSimulate(); // Auto-run simulation after parsing
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onTextChange(e.target.value);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold mb-1">Designer Mode</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Describe your biology in structured English.
          </p>
        </div>
        <div className="flex gap-2">
           <Button variant="subtle" onClick={() => setIsCheatsheetOpen(true)} className="text-xs">
             ? Cheatsheet
           </Button>
           <Button variant="primary" onClick={handleSync} className="text-xs">
             ⚡ Sync & Visualize
           </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {/* Main Editor Row */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* NLP Text Editor */}
          <div className="flex-1 flex flex-col min-h-0">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Natural Language Input</h3>
            <textarea
              className="flex-1 p-4 font-mono text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              value={displayText}
              onChange={handleTextChange}
              spellCheck={false}
              placeholder="Type your biological sentences here..."
            />
          </div>
          
          {/* Logic Parser Feedback */}
          <div className="w-1/4 flex flex-col min-h-0">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Logic Parser</h3>
            <div className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md overflow-y-auto p-2">
              <div className="space-y-1">
                {sentences.filter(s => s.type !== 'COMMENT').map((s) => (
                  <div 
                    key={s.id} 
                    className={`p-2 rounded text-xs border-l-4 ${
                      s.type === 'INVALID' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 
                      'border-green-500 bg-green-50 dark:bg-green-900/20'
                    }`}
                  >
                    <div className="font-semibold mb-0.5">{s.type}</div>
                    {s.type === 'INVALID' ? (
                      <div className="text-red-600 dark:text-red-400">{s.error?.message || 'Syntax Error'}</div>
                    ) : (
                      <div className="text-slate-600 dark:text-slate-300 truncate" title={s.text}>{s.text}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* BNGL Preview */}
        <div className="h-48 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Generated BNGL Code</h3>
            <span className="text-xs text-slate-400">
              {lastGeneratedCode ? `${lastGeneratedCode.split('\n').length} lines` : 'No code generated'}
            </span>
          </div>
          <pre className="flex-1 p-3 font-mono text-xs bg-slate-900 text-green-400 border border-slate-700 rounded-md overflow-auto whitespace-pre">
            {lastGeneratedCode || '# BNGL code will appear here as you type...'}
          </pre>
        </div>
      </div>
      
      <CheatsheetModal isOpen={isCheatsheetOpen} onClose={() => setIsCheatsheetOpen(false)} />
    </div>
  );
};
