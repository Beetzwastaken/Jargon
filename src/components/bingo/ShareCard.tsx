// ShareCard - Generates emoji grid for sharing duo results
import { useState } from 'react';
import { useDuoStore } from '../../stores/duoStore';

interface ShareCardProps {
  onClose: () => void;
}

export function ShareCard({ onClose }: ShareCardProps) {
  const { mySquares, partnerSquares, myHits, partnerHits, marks, odId, winner, dailySeed, odName, partnerName } = useDuoStore();
  const [copied, setCopied] = useState(false);

  const mySet = new Set(mySquares ?? []);
  const partnerSet = new Set(partnerSquares ?? []);
  // Indices where I marked an opponent's hidden square
  const myHitSet = new Set(
    marks
      .filter(m => m.markedBy === odId && partnerSet.has(m.index))
      .map(m => m.index)
  );

  const buildGrid = (): string => {
    const rows: string[] = [];
    for (let row = 0; row < 5; row++) {
      let line = '';
      for (let col = 0; col < 5; col++) {
        const idx = row * 5 + col;
        const inMine = mySet.has(idx);
        const inPartner = partnerSet.has(idx);
        const isHit = myHitSet.has(idx);
        if (isHit) line += '💥';
        else if (inMine && inPartner) line += '🟪';
        else if (inMine) line += '🟦';
        else if (inPartner) line += '🟧';
        else line += '⬜';
      }
      rows.push(line);
    }
    return rows.join('\n');
  };

  const getWinnerText = () => {
    if (winner === 'tie') return 'Draw!';
    if (winner === 'me') return `${odName || 'Me'} wins`;
    return `${partnerName || 'Partner'} wins`;
  };

  const shareText = [
    `Jargon Duo - ${dailySeed}`,
    '',
    `${odName || 'Me'}: ${myHits}/5 hits | ${partnerName || 'Partner'}: ${partnerHits}/5 hits`,
    getWinnerText(),
    '',
    buildGrid(),
    '',
    '🟦 mine  🟧 theirs  💥 hit  🟪 overlap',
    'playjargon.com',
  ].join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-[1000]" onClick={onClose} />

      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1001] w-full max-w-sm px-4">
        <div className="bg-j-surface border border-white/[0.06] rounded-2xl shadow-2xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-j-text text-center">Share Result</h3>

          <div className="bg-j-raised rounded-xl p-4 font-mono text-sm text-j-secondary whitespace-pre-wrap leading-relaxed">
            {shareText}
          </div>

          <button
            onClick={handleCopy}
            className={`w-full px-4 py-3 rounded-xl font-semibold transition-all ${
              copied ? 'bg-j-success text-white' : 'bg-j-accent hover:bg-j-accent-hover text-j-bg'
            }`}
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>

          <button onClick={onClose} className="w-full px-4 py-2 text-j-secondary hover:text-j-text transition-colors text-sm">
            Close
          </button>
        </div>
      </div>
    </>
  );
}

export default ShareCard;
