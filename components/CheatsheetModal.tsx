import React from 'react';
import { Button } from './ui/Button';

interface CheatsheetModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CheatsheetModal: React.FC<CheatsheetModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">BioNetGen Cheatsheet</h2>
                    <button onClick={onClose} aria-label="Close cheatsheet" className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">

                    <section>
                        <h3 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mb-2 flex items-center gap-2">
                            <span>✨</span> Natural Language Designer
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Write in structured English. The parser accepts many synonyms (e.g., "binds" / "interacts with" / "associates with").
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-blue-600 dark:text-blue-400">📦 Definitions</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Define Lck
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Define TCR with sites itam, b
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    Create protein Receptor with sites a~active~inactive
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-green-600 dark:text-green-400">🔗 Binding</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Lck binds TCR
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    A interacts with B
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    Receptor recruits Kinase
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    A forms a complex with B
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-orange-600 dark:text-orange-400">⚡ Phosphorylation</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Lck phosphorylates TCR
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    SHP1 dephosphorylates Target
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    Kinase adds phosphate to Substrate at Y
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-purple-600 dark:text-purple-400">🧬 Other Modifications</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    E3 ubiquitinates Target
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    HAT acetylates Histone
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    Methyltransferase methylates H3 at K4
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-red-600 dark:text-red-400">🔄 Synthesis & Degradation</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Ribosome synthesizes Protein
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Proteasome degrades Target
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    OldProtein is degraded
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-cyan-600 dark:text-cyan-400">🔀 Dimerization</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Receptor dimerizes
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    A dimerizes with B
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    EGFR forms dimer
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-teal-600 dark:text-teal-400">🚚 Translocation</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Protein translocates to nucleus
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    Factor moves to membrane
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    Interleukin is secreted from cell
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-yellow-600 dark:text-yellow-400">⚙️ Activation & Inhibition</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Ligand activates Receptor
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Inhibitor blocks Enzyme
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    Drug suppresses Pathway
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-pink-600 dark:text-pink-400">✂️ Cleavage</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Caspase cleaves Substrate
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    Protease cuts ProProtein
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-slate-600 dark:text-slate-400">🔢 Initialization</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Start with 100 of Lck
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    Initialize 1000 Receptor molecules
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-slate-600 dark:text-slate-400">▶️ Simulation</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded mb-1">
                                    Simulate for 100s
                                </code>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    Run 50 seconds with 500 steps
                                </code>
                            </div>

                            <div className="border border-slate-200 dark:border-slate-700 rounded p-3">
                                <h4 className="font-semibold text-sm mb-2 text-slate-600 dark:text-slate-400">💬 Comments</h4>
                                <code className="block text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                    # This is a comment
                                </code>
                            </div>
                        </div>

                        <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-md">
                            <h4 className="font-semibold text-sm mb-2 text-indigo-700 dark:text-indigo-300">💡 Pro Tip: Flexible Synonyms</h4>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                                The parser accepts many natural phrasings. For example, these all mean the same thing:
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                                <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">binds</span>
                                <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">interacts with</span>
                                <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">associates with</span>
                                <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">recruits</span>
                                <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">docks to</span>
                            </div>
                        </div>
                    </section>

                    <div className="border-t border-slate-200 dark:border-slate-800" />

                    <section>
                        <h3 className="text-lg font-bold text-teal-600 dark:text-teal-400 mb-2">
                            Standard BNGL Syntax
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            For manual editing in the "Code Editor" mode.
                        </p>

                        <div className="space-y-4">
                            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 p-3 rounded-md">
                                <h4 className="font-semibold text-sm mb-2">Parameters</h4>
                                <pre className="text-xs font-mono overflow-x-auto text-slate-700 dark:text-slate-300">
                                    {`begin parameters
  k_on  0.1
  k_cat 1.0
end parameters`}
                                </pre>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 p-3 rounded-md">
                                <h4 className="font-semibold text-sm mb-2">Molecule Types</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Format: Name(site~state1~state2, site2)</p>
                                <pre className="text-xs font-mono overflow-x-auto text-slate-700 dark:text-slate-300">
                                    {`begin molecule types
  Lck(SH2, Y~u~p)    # Molecule Lck with sites SH2 and Y (states u, p)
  TCR(itam~u~p, b)   # Molecule TCR with sites itam and b
end molecule types`}
                                </pre>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 p-3 rounded-md">
                                <h4 className="font-semibold text-sm mb-2">Reaction Rules</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Format: Reactants -&#62; Products Rate</p>
                                <pre className="text-xs font-mono overflow-x-auto text-slate-700 dark:text-slate-300">
                                    {`begin reaction rules
  # Binding (Bidirectional)
  Lck(SH2) + TCR(itam~p) <-> Lck(SH2!1).TCR(itam~p!1) k_on, k_off

  # Catalysis (Unidirectional)
  Lck(Y~p).Sub(Y~u) -> Lck(Y~p) + Sub(Y~p) k_cat
end reaction rules`}
                                </pre>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 p-3 rounded-md">
                                <h4 className="font-semibold text-sm mb-2">Observables</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Format: Type Name Pattern</p>
                                <pre className="text-xs font-mono overflow-x-auto text-slate-700 dark:text-slate-300">
                                    {`begin observables
  Molecules  Lck_Total    Lck()
  Species    Active_Complex  Lck().TCR()
end observables`}
                                </pre>
                            </div>
                        </div>
                    </section>

                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                    <Button variant="primary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </div>
    );
};
