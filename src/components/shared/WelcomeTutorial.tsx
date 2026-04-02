import { useState } from 'react';

interface WelcomeTutorialProps {
  show: boolean;
  onComplete: () => void;
}

export function WelcomeTutorial({ show, onComplete }: WelcomeTutorialProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Jargon",
      content: (
        <div className="space-y-4">
          <p className="text-j-text text-lg">
            Buzzword bingo you play during real meetings.
          </p>
          <p className="text-j-secondary">
            Open the app before your next meeting. You'll get a card of corporate buzzwords.
            When someone in the meeting says one — tap it. Complete a line and you win.
          </p>
          <div className="bg-j-raised rounded-lg p-4 text-sm text-j-secondary space-y-2">
            <p>Pair with a colleague using a 4-character code. Race to complete your secret line first.</p>
          </div>
        </div>
      )
    },
    {
      title: "How to Play",
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            {[
              { num: '1', text: 'Create a game or join with a code' },
              { num: '2', text: 'Open the app when your meeting starts' },
              { num: '3', text: 'Tap buzzwords as you hear them in the meeting' },
              { num: '4', text: 'Complete a full line (row, column, or diagonal) to win' }
            ].map(({ num, text }) => (
              <div key={num} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-j-accent/20 flex items-center justify-center text-j-accent font-bold text-sm font-mono flex-shrink-0">
                  {num}
                </div>
                <p className="text-j-secondary text-sm pt-1">{text}</p>
              </div>
            ))}
          </div>
          <div className="bg-j-raised rounded-lg p-4 text-sm">
            <p className="text-j-tertiary font-mono text-xs">
              Everyone gets the same card each day. New card at UTC midnight.
            </p>
          </div>
        </div>
      )
    },
    {
      title: "Duo Mode",
      content: (
        <div className="space-y-4">
          <p className="text-j-secondary">
            You and a partner get the same card. Each of you secretly picks a line
            to complete. Your opponent scores when they mark squares in YOUR line.
            First to 5 wins.
          </p>
          <div className="bg-j-raised rounded-lg p-4 text-sm text-j-secondary space-y-2">
            <p>Create a room and share the 4-character code</p>
            <p>Or join with a code from your partner</p>
            <p>Both pick your lines, then start tapping</p>
          </div>
          <div className="flex gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-j-me/40 ring-1 ring-j-me/60"></div>
              <span className="text-j-me">Your line</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-j-partner/40 ring-1 ring-j-partner/60"></div>
              <span className="text-j-partner">Partner's</span>
            </div>
          </div>
        </div>
      )
    }
  ];

  if (!show) return null;

  const isLast = step === steps.length - 1;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm z-[1100]" />
      <div className="fixed inset-0 flex items-center justify-center z-[1101] p-4">
        <div className="bg-j-surface border border-white/[0.06] rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
          <div className="border-b border-white/[0.06] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-j-text">{steps[step].title}</h2>
              <button onClick={onComplete} className="text-j-secondary hover:text-j-text text-sm">
                Skip
              </button>
            </div>
            <div className="flex gap-1.5 mt-3">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i === step ? 'bg-j-accent' : i < step ? 'bg-j-accent/40' : 'bg-white/[0.06]'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {steps[step].content}
          </div>

          <div className="border-t border-white/[0.06] p-5 flex items-center justify-between">
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className={`px-4 py-2 rounded-lg text-sm ${
                step === 0 ? 'text-j-muted cursor-not-allowed' : 'text-j-text hover:bg-j-hover'
              }`}
            >
              Back
            </button>
            <button
              onClick={isLast ? onComplete : () => setStep(s => s + 1)}
              className="px-5 py-2 bg-j-accent hover:bg-j-accent-hover text-j-bg rounded-lg text-sm font-semibold transition-colors"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
