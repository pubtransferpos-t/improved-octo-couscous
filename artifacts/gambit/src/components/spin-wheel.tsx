import { useState } from 'react';
import { Color } from 'chess.js';
import { EFFECTS, EffectType } from '@/hooks/gambit-engine';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface SpinWheelProps {
  spinningFor: Color;
  enabledEffects: EffectType[];
  onEffect: (effect: EffectType) => void;
}

export default function SpinWheel({ spinningFor, enabledEffects, onEffect }: SpinWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [chosen, setChosen] = useState<EffectType | null>(null);
  const [displayIdx, setDisplayIdx] = useState(0);

  const playerLabel = spinningFor === 'w' ? 'White' : 'Black';
  const displayEffect = chosen ?? enabledEffects[displayIdx] ?? null;
  const effectDef = displayEffect ? EFFECTS[displayEffect] : null;

  const spin = () => {
    if (spinning || chosen) return;
    setSpinning(true);

    const totalFrames = 28 + Math.floor(Math.random() * 16);
    let frame = 0;
    const finalEffect = enabledEffects[Math.floor(Math.random() * enabledEffects.length)];

    const iv = setInterval(() => {
      setDisplayIdx(i => (i + 1) % enabledEffects.length);
      frame++;
      if (frame >= totalFrames) {
        clearInterval(iv);
        const idx = enabledEffects.indexOf(finalEffect);
        setDisplayIdx(idx >= 0 ? idx : 0);
        setChosen(finalEffect);
        setSpinning(false);
      }
    }, 70);
  };

  return (
    <Dialog open>
      <DialogContent
        className="bg-gray-900 border-gray-700 text-white max-w-sm"
        // Prevent close without applying
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-amber-400 text-lg">
            🎰 {playerLabel}'s Spin!
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 py-2">
          {/* Effect display box */}
          <div
            className={`w-full rounded-xl p-5 text-center border-2 transition-all duration-200 ${
              chosen
                ? effectDef?.category === 'buff'
                  ? 'border-green-500 bg-green-950'
                  : 'border-red-500 bg-red-950'
                : spinning
                  ? 'border-amber-400 bg-gray-800 animate-pulse'
                  : 'border-gray-600 bg-gray-800'
            }`}
          >
            {effectDef ? (
              <>
                <div
                  className={`text-2xl font-bold ${
                    effectDef.category === 'buff' ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {effectDef.label}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {effectDef.category === 'buff' ? '⬆ BUFF' : '⬇ NERF'}
                </div>
                {chosen && (
                  <div className="text-sm text-gray-300 mt-2">{effectDef.description}</div>
                )}
              </>
            ) : (
              <div className="text-gray-500">Ready to spin…</div>
            )}
          </div>

          {!chosen ? (
            <Button
              onClick={spin}
              disabled={spinning}
              className="w-full h-12 bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold text-lg"
            >
              {spinning ? 'Spinning…' : 'SPIN!'}
            </Button>
          ) : (
            <Button
              onClick={() => onEffect(chosen)}
              className={`w-full h-12 font-bold text-base ${
                effectDef?.category === 'buff'
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
            >
              Apply: {effectDef?.label}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
