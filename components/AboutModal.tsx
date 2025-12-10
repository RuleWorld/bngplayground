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
                    <pre className="text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded overflow-x-auto">
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

    // Visualization Conventions
    if (focus === 'viz') {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Visualization Conventions">
                <div className="prose dark:prose-invert max-w-none">
                    <h4>Rule Cartoons</h4>
                    <ul>
                        <li><strong>Molecules</strong> — Colored rectangles with rounded corners; color derived from name</li>
                        <li><strong>Components</strong> — Small circles inside molecules representing binding sites</li>
                        <li><strong>States</strong> — Shown as text (e.g., <code>~P</code>, <code>~U</code>) next to components</li>
                        <li><strong>Bonds</strong> — Lines connecting components with matching bond labels (<code>!1</code>)</li>
                    </ul>
                    <h4>Contact Map</h4>
                    <ul>
                        <li><strong>Molecule nodes</strong> — Large colored boxes containing their components</li>
                        <li><strong>Component nodes</strong> — Gray rounded rectangles inside molecules</li>
                        <li><strong>State nodes</strong> — Yellow rounded rectangles showing possible states</li>
                        <li><strong>Binding edges</strong> — Solid lines showing possible bonds between components</li>
                        <li><strong>Unbinding edges</strong> — <span className="text-red-500">Red dotted lines</span> showing bond-breaking reactions</li>
                    </ul>
                    <h4>Color Assignment</h4>
                    <p>Each molecule's color is <em>deterministically derived from its name</em> for consistency across all visualizations.</p>
                </div>
            </Modal>
        );
    }

    // Default: About
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="About BioNetGen Playground">
            <div className="prose dark:prose-invert max-w-none">
                <p>
                    An <strong>interactive web-based playground</strong> for the <em>BioNetGen Language (BNGL)</em> — write, parse, simulate, and visualize rule-based models of biochemical systems.
                </p>
                <h4>Features</h4>
                <ul>
                    <li><strong>BNGL Editor</strong> — Syntax highlighting with example gallery</li>
                    <li><strong>Network Generation</strong> — Automatic expansion of rules into species and reactions</li>
                    <li><strong>ODE/SSA Simulation</strong> — Multiple solvers including <em>CVODE</em>, <em>Rosenbrock23</em>, <em>RK45</em></li>
                    <li><strong>Visualizations</strong> — Time-course plots, contact maps, rule cartoons, regulatory graphs</li>
                    <li><strong>Steady-State Finder</strong> — Automatic detection when concentrations converge</li>
                    <li><strong>FIM Analysis</strong> — Fisher Information Matrix for parameter identifiability</li>
                    <li><strong>SBML Export</strong> — Export models to SBML Level 3 format</li>
                </ul>
                <h4>Technology</h4>
                <p className="text-sm">
                    Built with <strong>React</strong>, <strong>TypeScript</strong>, and <strong>WebAssembly</strong> (CVODE solver). All computation runs in your browser — no server required.
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
                    <em>This is an educational tool. For production modeling, use the official <a href="https://bionetgen.org" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">BioNetGen software</a>.</em>
                </p>
            </div>
        </Modal>
    );
};
