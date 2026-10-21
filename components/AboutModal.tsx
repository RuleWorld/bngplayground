import React from 'react';
import { Modal } from './ui/Modal';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
    focus?: string | null;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, focus }) => {
    // What is BNGL
    if (focus === 'bngl') {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="What is BNGL?">
                <div className="prose dark:prose-invert max-w-none">
                    <p>
                        <strong>BNGL (BioNetGen Language)</strong> is a <em>rule-based modeling language</em> for describing biochemical systems.
                    </p>
                    <h4>Key Concepts</h4>
                    <ul>
                        <li><strong>Molecules</strong> — Defined with <em>components</em> (binding sites) and <em>states</em> (e.g., phosphorylation)</li>
                        <li><strong>Rules</strong> — Specify how molecules interact and transform (binding, unbinding, state changes)</li>
                        <li><strong>Observables</strong> — Track specific molecular patterns during simulation</li>
                    </ul>
                    <h4>Example</h4>
                    <pre className="text-xs bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-800 p-2 rounded overflow-x-auto" aria-label="BNGL example code">
                        {`# Define a kinase with a binding site and phosphorylation state
A(b,Y~U~P)

# Rule: A binds to B when A is unphosphorylated
A(b,Y~U) + B(a) <-> A(b!1,Y~U).B(a!1)  kf, kr`}
                    </pre>
                    <p className="text-sm mt-3">
                        <em>New to BNGL?</em> Load the <strong>"Simple Dimerization"</strong> example and click <strong>Parse Model</strong> → <strong>Run Simulation</strong> to get started!
                    </p>
                </div>
            </Modal>
        );
    }

    // Default: About
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="About BioNetGen Playground">
            <div className="prose dark:prose-invert max-w-none">
                <p>
                    BioNetGen Playground is an interactive workspace for learning and exploring rule-based models. Load an example or write BNGL, run simulations, inspect reaction rules and networks, compare model behavior, and explore analysis tools in one place.
                </p>
                <p>
                    The playground includes interactive examples, model editing, deterministic and stochastic simulation, network and rule visualizations, parameter analysis, and export tools. It is designed for learning and exploratory work; results depend on the model and selected methods.
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
                    <em>This is an educational tool. For production modeling, use the official <a href="https://bionetgen.org" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline" aria-label="Visit BioNetGen website">BioNetGen software</a>.</em>
                </p>
            </div>
        </Modal>
    );
};
