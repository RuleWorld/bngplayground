import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { BNGLModel } from '../../types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { CheckCircleIcon } from '../icons/CheckCircleIcon';
import { ExclamationCircleIcon } from '../icons/ExclamationCircleIcon';
import { InfoIcon } from '../icons/InfoIcon';
import { TUTORIALS, type Tutorial, type TutorialProgressState } from '../../src/data/tutorials';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTutorialId: string | null;
  onSelectTutorial: (tutorialId: string) => void;
  progressMap: Record<string, TutorialProgressState>;
  onSetStep: (tutorialId: string, stepIndex: number) => void;
  onCompleteStep: (tutorialId: string, stepNumber: number) => void;
  onResetTutorial: (tutorialId: string) => void;
  model: BNGLModel | null;
  onCodeChange: (code: string) => void;
  onParse: () => void;
}

type CheckStatus = {
  type: 'success' | 'error' | 'info';
  message: string;
  hint?: string;
};

const DEFAULT_PROGRESS: TutorialProgressState = {
  currentStepIndex: 0,
  completedSteps: [],
};

const difficultyColors: Record<Tutorial['difficulty'], string> = {
  beginner: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  intermediate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  advanced: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isOpen,
  onClose,
  activeTutorialId,
  onSelectTutorial,
  progressMap,
  onSetStep,
  onCompleteStep,
  onResetTutorial,
  model,
  onCodeChange,
  onParse,
}) => {
  const [checkStatus, setCheckStatus] = useState<CheckStatus | null>(null);
  const [isHintVisible, setIsHintVisible] = useState(false);

  useEffect(() => {
    if (isOpen && !activeTutorialId && TUTORIALS.length > 0) {
      onSelectTutorial(TUTORIALS[0].id);
    }
  }, [isOpen, activeTutorialId, onSelectTutorial]);

  const selectedTutorial = useMemo(() => {
    if (!activeTutorialId) {
      return TUTORIALS[0] ?? null;
    }
    return TUTORIALS.find((tutorial) => tutorial.id === activeTutorialId) ?? TUTORIALS[0] ?? null;
  }, [activeTutorialId]);

  const progress = selectedTutorial
    ? progressMap[selectedTutorial.id] ?? DEFAULT_PROGRESS
    : DEFAULT_PROGRESS;

  const currentStepIndex = useMemo(() => {
    if (!selectedTutorial) return 0;
    if (progress.currentStepIndex >= selectedTutorial.steps.length) {
      return selectedTutorial.steps.length - 1;
    }
    if (progress.currentStepIndex < 0) {
      return 0;
    }
    return progress.currentStepIndex;
  }, [progress.currentStepIndex, selectedTutorial]);

  const currentStep = selectedTutorial ? selectedTutorial.steps[currentStepIndex] : null;
  const completedSet = useMemo(() => new Set(progress.completedSteps), [progress.completedSteps]);
  const isCurrentStepComplete = currentStep ? completedSet.has(currentStep.stepNumber) : false;

  useEffect(() => {
    setCheckStatus(null);
    setIsHintVisible(false);
  }, [selectedTutorial?.id, currentStep?.stepNumber]);

  const handleApplyStarter = () => {
    if (!currentStep?.starterCode) return;
    const shouldReplace = window.confirm('This will replace the editor contents with the starter code for this step. Continue?');
    if (!shouldReplace) return;
    onCodeChange(currentStep.starterCode);
    setCheckStatus({
      type: 'info',
      message: 'Starter code applied. Parse the model to continue.',
    });
  };

  const handleCheckStep = () => {
    if (!selectedTutorial || !currentStep) return;
    if (!model) {
      setCheckStatus({
        type: 'error',
        message: 'Parse the model before checking your progress.',
        hint: 'Click "Parse Model" to update the current BNGL model.',
      });
      return;
    }

    try {
      const succeeded = currentStep.check.validate(model);
      if (succeeded) {
        onCompleteStep(selectedTutorial.id, currentStep.stepNumber);
        setCheckStatus({
          type: 'success',
          message: 'Great work! This step is complete.',
          hint: currentStep.check.explanation,
        });
      } else {
        setCheckStatus({
          type: 'error',
          message: 'Not quite there yet. Review the objective and try again.',
          hint: currentStep.check.hint,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Step validation failed unexpectedly.';
      setCheckStatus({
        type: 'error',
        message,
      });
    }
  };

  const handleNextStep = () => {
    if (!selectedTutorial) return;
    const nextIndex = Math.min(currentStepIndex + 1, selectedTutorial.steps.length - 1);
    onSetStep(selectedTutorial.id, nextIndex);
  };

  const handlePrevStep = () => {
    if (!selectedTutorial) return;
    const prevIndex = Math.max(currentStepIndex - 1, 0);
    onSetStep(selectedTutorial.id, prevIndex);
  };

  const handleSkipStep = () => {
    if (!selectedTutorial) return;
    const nextIndex = Math.min(currentStepIndex + 1, selectedTutorial.steps.length - 1);
    onSetStep(selectedTutorial.id, nextIndex);
    setCheckStatus({
      type: 'info',
      message: 'Step skipped. You can return to it anytime.',
    });
  };

  const handleReset = () => {
    if (!selectedTutorial) return;
    const confirmReset = window.confirm('Reset progress for this tutorial? Completed steps will be cleared.');
    if (!confirmReset) return;
    onResetTutorial(selectedTutorial.id);
    setCheckStatus({
      type: 'info',
      message: 'Progress reset. Start from step 1 when you are ready.',
    });
  };

  const totalSteps = selectedTutorial?.steps.length ?? 0;
  const completedCount = completedSet.size;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Guided Tutorials" size="3xl">
      {!selectedTutorial ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Tutorials will appear here when available.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <aside className="lg:col-span-1 space-y-4">
              <div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Tutorials</h3>
                <div className="mt-3 flex flex-col gap-2">
                  {TUTORIALS.map((tutorial) => {
                    const tutorialProgress = progressMap[tutorial.id] ?? DEFAULT_PROGRESS;
                    const tutorialCompleted = tutorialProgress.completedSteps.length;
                    const isActive = tutorial.id === selectedTutorial.id;
                    return (
                      <button
                        key={tutorial.id}
                        onClick={() => onSelectTutorial(tutorial.id)}
                        className={`rounded-md border px-3 py-2 text-left transition-colors ${
                          isActive
                            ? 'border-primary-500 bg-primary-50 text-primary-900 dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-100'
                            : 'border-stone-200 bg-white text-slate-700 hover:border-primary-400 hover:bg-primary-50/50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-primary-400 dark:hover:bg-primary-900/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{tutorial.title}</span>
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${difficultyColors[tutorial.difficulty]}`}>
                            {tutorial.difficulty}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                          {tutorial.description}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>{tutorialCompleted}/{tutorial.steps.length} steps</span>
                          <span>{tutorial.estimatedMinutes} min</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            <section className="lg:col-span-2 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{selectedTutorial.title}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{selectedTutorial.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      {completedCount} / {totalSteps} complete
                    </span>
                    <Button variant="subtle" onClick={handleReset}>
                      Reset progress
                    </Button>
                  </div>
                </div>
                {selectedTutorial.learningOutcomes && selectedTutorial.learningOutcomes.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">You will practice:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {selectedTutorial.learningOutcomes.map((outcome) => (
                        <li key={outcome}>{outcome}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 overflow-x-auto">
                {selectedTutorial.steps.map((step, index) => {
                  const isActive = index === currentStepIndex;
                  const completed = completedSet.has(step.stepNumber);
                  return (
                    <button
                      key={step.stepNumber}
                      onClick={() => onSetStep(selectedTutorial.id, index)}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'border-primary-500 bg-primary-50 font-semibold text-primary-900 dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-100'
                          : 'border-stone-200 bg-white text-slate-700 hover:border-primary-400 hover:bg-primary-50/50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-primary-400 dark:hover:bg-primary-900/30'
                      }`}
                    >
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                        {step.stepNumber}
                      </span>
                      <span className="line-clamp-1 max-w-[12rem] text-left">{step.objective}</span>
                      {completed && <CheckCircleIcon className="h-4 w-4 text-green-500" />}
                    </button>
                  );
                })}
              </div>

              {currentStep && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Objective</h4>
                    <p className="mt-2 text-base text-slate-700 dark:text-slate-200">{currentStep.objective}</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ inline, className, children, ...props }: any) {
                          if (inline) {
                            return (
                              <code
                                className={`rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800 ${className ?? ''}`}
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          }
                          return (
                            <pre className="overflow-x-auto rounded-md bg-slate-100 p-3 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                              <code {...props}>{children}</code>
                            </pre>
                          );
                        },
                        h3({ children }: any) {
                          return <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{children}</h3>;
                        },
                        ul({ children }: any) {
                          return <ul className="ml-5 list-disc space-y-1">{children}</ul>;
                        },
                        ol({ children }: any) {
                          return <ol className="ml-5 list-decimal space-y-1">{children}</ol>;
                        },
                        p({ children }: any) {
                          return <p className="mb-3 last:mb-0">{children}</p>;
                        },
                      }}
                    >
                      {currentStep.instruction}
                    </ReactMarkdown>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {currentStep.starterCode && (
                      <Button variant="secondary" onClick={handleApplyStarter}>
                        Apply starter code
                      </Button>
                    )}
                    <Button variant="ghost" onClick={onParse}>
                      Parse model
                    </Button>
                    <Button onClick={handleCheckStep}>
                      Check step
                    </Button>
                    <div className="ml-auto flex items-center gap-2">
                      <Button variant="ghost" onClick={handlePrevStep} disabled={currentStepIndex === 0}>
                        Previous
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={handleNextStep}
                        disabled={currentStepIndex === totalSteps - 1 || (!isCurrentStepComplete && !currentStep.canSkip)}
                      >
                        Next
                      </Button>
                      {currentStep.canSkip && !isCurrentStepComplete && (
                        <Button variant="subtle" onClick={handleSkipStep}>
                          Skip step
                        </Button>
                      )}
                    </div>
                  </div>

                  {checkStatus && (
                    <div
                      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                        checkStatus.type === 'success'
                          ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200'
                          : checkStatus.type === 'error'
                            ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200'
                            : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200'
                      }`}
                    >
                      {checkStatus.type === 'success' ? (
                        <CheckCircleIcon className="mt-0.5 h-5 w-5" />
                      ) : checkStatus.type === 'error' ? (
                        <ExclamationCircleIcon className="mt-0.5 h-5 w-5" />
                      ) : (
                        <InfoIcon className="mt-0.5 h-5 w-5" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{checkStatus.message}</p>
                        {checkStatus.hint && (
                          <p className="mt-1 text-xs leading-snug opacity-90">{checkStatus.hint}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {currentStep.check.hint && !isHintVisible && (
                    <button
                      onClick={() => setIsHintVisible(true)}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Need a nudge? Show hint.
                    </button>
                  )}

                  {isHintVisible && currentStep.check.hint && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                      <strong>Hint:</strong> {currentStep.check.hint}
                    </div>
                  )}

                  {isCurrentStepComplete && currentStep.check.explanation && (
                    <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200">
                      <strong>Why it works:</strong> {currentStep.check.explanation}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
};
