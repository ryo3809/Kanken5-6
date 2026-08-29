// 設定画面。むずかしい言葉を使わないようにしています。

import type { Kyu, Settings } from '../lib/types';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
  saveError: string | null;
}

export function SettingsScreen({ settings, onChange, onBack, saveError }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="app">
      <h1>せってい</h1>

      {saveError && (
        <div className="notice bad">
          <b>せっていを ほぞんできませんでした</b>
          <br />
          {saveError}
        </div>
      )}

      <div className="card">
        <label className="field">
          れんしゅうする きゅう
          <div className="control">
            {([6, 5] as Kyu[]).map((k) => (
              <button
                key={k}
                aria-pressed={settings.kyu === k}
                onClick={() => set('kyu', k)}
              >
                {k}級
              </button>
            ))}
          </div>
          <span className="muted">
            6級＝小学5年生まで の 835字 ／ 5級＝小学6年生まで の 1026字
          </span>
        </label>

        <label className="field">
          1かいの もんだいすう
          <div className="control">
            {([10, 15, 20] as const).map((n) => (
              <button
                key={n}
                aria-pressed={settings.sessionSize === n}
                onClick={() => set('sessionSize', n)}
              >
                {n}もん
              </button>
            ))}
          </div>
          <span className="muted">10もんで だいたい 5ふん くらいです</span>
        </label>

        <label className="field" style={{ marginBottom: 0 }}>
          こたえかた
          <div className="control">
            <button
              aria-pressed={settings.answerMode === 'choice'}
              onClick={() => set('answerMode', 'choice')}
            >
              4つから えらぶ
            </button>
            <button
              aria-pressed={settings.answerMode === 'input'}
              onClick={() => set('answerMode', 'input')}
            >
              ひらがなで かく
            </button>
          </div>
          <span className="muted">
            本番の 検定は「ひらがなで かく」だよ。なれてきたら きりかえてみてね。
          </span>
        </label>
      </div>

      <button className="primary" onClick={onBack}>
        ホームに もどる
      </button>
    </div>
  );
}
