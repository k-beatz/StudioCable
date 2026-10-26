import { CLIP_LEVEL, type TestListener, type TestStop } from '../core/testSignal';
import type { DeviceTemplate } from '../core/model';
import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';
import { TEST_SOUNDS, useTestResult, useTestSignal } from '../store/testSignal';
import './testAudio';

const AUDIO_SIGNALS = new Set(['mic', 'line-bal', 'line-unbal', 'instrument', 'phono', 'speaker', 'headphone', 'digital-audio', 'data']);

/** Devices that can send a test signal: anything with an audio (or USB audio) output. */
export const canSendTest = (template: DeviceTemplate | undefined) =>
  !!template?.ports.some((p) => p.direction !== 'in' && AUDIO_SIGNALS.has(p.signal));

/** Start/stop button for the device inspector. */
export function TestSignalButton({ deviceId }: { deviceId: string }) {
  const running = useTestSignal((s) => s.sourceId === deviceId);
  const { start, stop } = useTestSignal.getState();
  return (
    <button className={'test-signal-button' + (running ? ' active' : '')} onClick={() => (running ? stop() : start(deviceId))}>
      {running ? `■ ${t('test.stop')}` : `▶ ${t('test.start')}`}
    </button>
  );
}

const KIND_ICONS: Record<TestListener['kind'], string> = { speaker: '🔈', headphones: '🎧', recorder: '⏺' };

/** While a test signal plays: what it is, who hears it, how it sounds, and where it dies. */
export function TestSignalPanel() {
  const result = useTestResult();
  const sound = useTestSignal((s) => s.sound);
  const project = useProjectStore((s) => s.project);
  if (!result) return null;
  const { stop, setSound } = useTestSignal.getState();
  const name = (id: string) => project.devices.find((d) => d.id === id)?.name ?? '?';
  const heard = result.listeners.filter((l) => l.kind !== 'recorder');
  const recorded = result.listeners.filter((l) => l.kind === 'recorder');

  return (
    <div className="test-panel" role="status" aria-live="polite">
      <div className="test-panel__head">
        <span className="test-panel__wave" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <strong>{t('test.title', { name: name(result.sourceId) })}</strong>
        <button className="test-panel__stop" onClick={stop} aria-label={t('test.stop')}>
          ■
        </button>
      </div>
      <div className="segmented test-panel__sounds" role="group" aria-label={t('test.sound')}>
        {TEST_SOUNDS.map((s) => (
          <button key={s} className={s === sound ? 'active' : ''} aria-pressed={s === sound} onClick={() => setSound(s)}>
            {t(`test.sound.${s}`)}
          </button>
        ))}
      </div>
      <ul className="test-panel__list">
        {[...heard, ...recorded].map((l) => (
          <li key={l.deviceId}>
            <span aria-hidden="true">{KIND_ICONS[l.kind]}</span>
            <span className="test-panel__name">{name(l.deviceId)}</span>
            {l.kind !== 'headphones' && l.kind !== 'recorder' && <span className="test-panel__side">{l.pan < 0 ? 'L' : l.pan > 0 ? 'R' : 'L+R'}</span>}
            <span className={'test-meter' + (l.level >= CLIP_LEVEL ? ' test-meter--clip' : '')} title={l.level.toFixed(2)}>
              <span style={{ width: `${Math.min(100, (l.level / CLIP_LEVEL) * 100)}%` }} />
            </span>
            <small>{l.kind === 'recorder' ? t('test.recorded') : l.effects.length ? l.effects.map((e) => t(`test.effect.${e}`)).join(', ') : t('test.clean')}</small>
          </li>
        ))}
      </ul>
      {heard.length === 0 && <p className="test-panel__silent">{t('test.silent')}</p>}
      {result.stops.map((s) => (
        <p key={`${s.cableId}/${s.reason}`} className="test-panel__stop-reason">
          ⛔ {t('test.stopsAt', { name: name(s.deviceId), reason: stopReason(s) })}
        </p>
      ))}
    </div>
  );
}

function stopReason(s: TestStop): string {
  if (s.reason === 'switchedOff') return t('test.reason.switchedOff');
  if (s.reason === 'phantomOff') return t('test.reason.phantomOff');
  return t('test.reason.mismatch');
}
