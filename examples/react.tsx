import { nox, type StateName } from 'noxy-bots';
import { NoxyBot } from 'noxy-bots/react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [state, setState] = useState<StateName>('idle');
  const [theme, setTheme] = useState('classic');
  return (
    <>
      <NoxyBot state={state} look={{ theme }} label={`Nox, ${state}`} style={{ width: 200 }} />
      <div>
        {(['idle', 'listening', 'thinking', 'happy', 'success'] as const).map((s) => (
          <button key={s} onClick={() => setState(s)}>
            {s}
          </button>
        ))}
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          {nox.themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

createRoot(document.getElementById('react')!).render(<App />);
