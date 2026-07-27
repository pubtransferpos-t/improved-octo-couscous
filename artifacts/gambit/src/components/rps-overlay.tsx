import { useState } from 'react';
import { Color } from 'chess.js';

type RpsChoice = 'rock' | 'paper' | 'scissors';

export default function RpsOverlay({ challenger, onResult }: {
  challenger: Color;
  onResult: (winner: Color | null) => void;
}) {
  const [score, setScore] = useState({ w: 0, b: 0 });
  const [round, setRound] = useState(1);
  const [playerChoice, setPlayerChoice] = useState<RpsChoice | null>(null);
  const [botChoice, setBotChoice] = useState<RpsChoice | null>(null);
  const [roundResult, setRoundResult] = useState<string | null>(null);

  const choices: RpsChoice[] = ['rock', 'paper', 'scissors'];
  const emoji: Record<RpsChoice, string> = { rock: '🪨', paper: '📄', scissors: '✂️' };

  const getWinner = (a: RpsChoice, b: RpsChoice): 'a' | 'b' | 'tie' => {
    if (a === b) return 'tie';
    if ((a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock')) return 'a';
    return 'b';
  };

  const pick = (choice: RpsChoice) => {
    if (playerChoice !== null) return;
    const bot = choices[Math.floor(Math.random() * 3)];
    setBotChoice(bot);
    setPlayerChoice(choice);

    const result = getWinner(choice, bot);
    const newScore = { ...score };
    let msg = '';
    if (result === 'a') { newScore[challenger] += 1; msg = `You win this round! ${emoji[choice]} beats ${emoji[bot]}`; }
    else if (result === 'b') { newScore[challenger === 'w' ? 'b' : 'w'] += 1; msg = `Opponent wins this round! ${emoji[bot]} beats ${emoji[choice]}`; }
    else { msg = `Tie! ${emoji[choice]} vs ${emoji[bot]}`; }

    setScore(newScore);
    setRoundResult(msg);

    setTimeout(() => {
      const nextRound = round + 1;
      if (newScore[challenger] >= 2) { onResult(challenger); return; }
      if (newScore[challenger === 'w' ? 'b' : 'w'] >= 2) { onResult(challenger === 'w' ? 'b' : 'w'); return; }
      if (nextRound > 3) {
        if (newScore[challenger] > newScore[challenger === 'w' ? 'b' : 'w']) onResult(challenger);
        else if (newScore[challenger === 'w' ? 'b' : 'w'] > newScore[challenger]) onResult(challenger === 'w' ? 'b' : 'w');
        else onResult(null);
        return;
      }
      setRound(nextRound);
      setPlayerChoice(null);
      setBotChoice(null);
      setRoundResult(null);
    }, 1800);
  };

  const opp = challenger === 'w' ? 'b' : 'w';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(5,2,20,0.97)',
      backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="animate-bounce-in" style={{
        width: '100%', maxWidth: 380, padding: '32px 28px',
        background: 'linear-gradient(145deg, #14102a, #1a1230)',
        border: '2px solid #ff2d78', borderRadius: 24, textAlign: 'center',
        boxShadow: '0 0 60px rgba(255,45,120,0.4)',
      }}>
        <div style={{ fontFamily: '"Permanent Marker", cursive', fontSize: '2rem', color: '#ff2d78', marginBottom: 4 }}>
          ✌️ Rock Paper Scissors
        </div>
        <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '0.45rem', color: 'rgba(200,190,255,0.5)', marginBottom: 16 }}>
          BEST OF 3 — WINNER TAKES THE GAME
        </div>

        {/* Scoreboard */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: '2.5rem', color: challenger === 'w' ? '#ffee00' : '#00f5ff' }}>{score[challenger]}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(200,190,255,0.5)' }}>{challenger === 'w' ? 'White' : 'Black'}</div>
          </div>
          <div style={{ fontFamily: '"VT323", monospace', fontSize: '2.5rem', color: 'rgba(200,190,255,0.3)', alignSelf: 'center' }}>vs</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: '2.5rem', color: opp === 'w' ? '#ffee00' : '#00f5ff' }}>{score[opp]}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(200,190,255,0.5)' }}>{opp === 'w' ? 'White' : 'Black'}</div>
          </div>
        </div>

        <div style={{ fontFamily: '"Boogaloo", sans-serif', fontSize: '0.9rem', color: 'rgba(200,190,255,0.6)', marginBottom: 12 }}>
          Round {round} of 3
        </div>

        {roundResult ? (
          <div style={{
            padding: '12px', borderRadius: 12, marginBottom: 12,
            background: 'rgba(255,255,255,0.05)', fontSize: '1rem',
            fontFamily: '"Boogaloo", sans-serif', color: '#fff',
          }}>{roundResult}</div>
        ) : (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 8 }}>
            {choices.map(c => (
              <button
                key={c}
                onClick={() => pick(c)}
                disabled={playerChoice !== null}
                style={{
                  fontSize: '2.5rem', padding: '12px 16px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.08)',
                  border: '2px solid rgba(255,255,255,0.2)',
                  cursor: playerChoice !== null ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.15s',
                }}
              >{emoji[c]}</button>
            ))}
          </div>
        )}

        <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '0.42rem', color: 'rgba(200,190,255,0.3)' }}>
          {playerChoice ? `You: ${emoji[playerChoice]}  Opp: ${botChoice ? emoji[botChoice] : '?'}` : 'Pick your move!'}
        </div>
      </div>
    </div>
  );
}
