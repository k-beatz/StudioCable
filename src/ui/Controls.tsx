import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { controlValue, formatSetting } from '../core/controls';
import { KNOB_MAX, type Control, type DeviceInstance, type DeviceTemplate } from '../core/model';
import { t } from '../i18n';
import { useControlPreview } from '../store/controlPreview';
import { setControl } from './actions';

/**
 * The knobs and switches of a device, drawn like a small front panel. Knobs
 * turn by dragging up/down (mouse or finger) or with the arrow keys; a
 * switch moves to its next position on tap. Every change is one undo step.
 */
export function ControlPanel(props: { device: DeviceInstance; template: DeviceTemplate; large?: boolean }) {
  const controls = props.template.controls ?? [];
  if (!controls.length) return null;
  return (
    <div className={'control-panel nodrag nopan' + (props.large ? ' control-panel--large' : '')}>
      {controls.map((c) =>
        c.kind === 'knob' ? (
          <Knob key={c.id} deviceName={props.device.name} control={c} value={Number(controlValue(c, props.device))} onChange={(v) => setControl(props.device.id, c.id, v)} />
        ) : (
          <Switch key={c.id} deviceName={props.device.name} control={c} value={String(controlValue(c, props.device))} onChange={(v) => setControl(props.device.id, c.id, v)} />
        ),
      )}
    </div>
  );
}

/** Pixels of vertical drag per knob step. */
const DRAG_STEP = 10;
/** The pointer sweeps from -135° (0) to +135° (max). */
const SWEEP = 270;

/** Shows the control enlarged at the top while a finger (or pen) covers it. */
const isFinger = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen';
let hideTimer: ReturnType<typeof setTimeout> | undefined;
function flashPreview(deviceName: string, control: Control, value: string | number) {
  clearTimeout(hideTimer);
  useControlPreview.getState().show({ deviceName, control, value });
  hideTimer = setTimeout(() => useControlPreview.getState().show(null), 1200);
}

function Knob({ deviceName, control, value, onChange }: { deviceName: string; control: Control; value: number; onChange: (v: number) => void }) {
  // While dragging, the knob shows a local value; the project changes once on release.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const drag = useRef<{ y: number; start: number; finger: boolean } | null>(null);
  const shown = dragValue ?? value;
  const clamp = (v: number) => Math.max(0, Math.min(KNOB_MAX, Math.round(v)));

  const down = (e: PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, start: value, finger: isFinger(e) };
    setDragValue(value);
    if (drag.current.finger) {
      clearTimeout(hideTimer);
      useControlPreview.getState().show({ deviceName, control, value });
    }
  };
  const move = (e: PointerEvent) => {
    if (!drag.current) return;
    const v = clamp(drag.current.start + (drag.current.y - e.clientY) / DRAG_STEP);
    setDragValue(v);
    if (drag.current.finger) useControlPreview.getState().show({ deviceName, control, value: v });
  };
  const up = () => {
    if (drag.current && dragValue !== null && dragValue !== value) onChange(dragValue);
    // Keep the enlarged view a moment, so the final value can be read.
    if (drag.current?.finger) flashPreview(deviceName, control, dragValue ?? value);
    drag.current = null;
    setDragValue(null);
  };
  const key = (e: KeyboardEvent) => {
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    e.stopPropagation();
    onChange(e.key === 'Home' ? 0 : e.key === 'End' ? KNOB_MAX : clamp(value + (step ?? 0)));
  };

  const text = formatSetting(control, shown);
  return (
    <div className={'control control--knob' + (shown <= 0 ? ' control--off' : '')}>
      <div
        className="knob"
        role="slider"
        tabIndex={0}
        aria-label={control.label}
        aria-valuemin={0}
        aria-valuemax={KNOB_MAX}
        aria-valuenow={shown}
        aria-valuetext={text}
        title={`${control.label}: ${text} · ${t('device.knobHint')}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        onClick={(e) => e.stopPropagation()}
      >
        <KnobFace value={shown} />
      </div>
      <span className="control__label">{control.label}</span>
      <span className="control__value">{text}</span>
    </div>
  );
}

export function KnobFace({ value }: { value: number }) {
  const angle = (value / KNOB_MAX) * SWEEP - SWEEP / 2;
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle className="knob__scale" cx="20" cy="20" r="18" pathLength={SWEEP + 90} strokeDasharray={`${SWEEP} 90`} transform="rotate(135 20 20)" />
      <circle
        className="knob__level"
        cx="20"
        cy="20"
        r="18"
        pathLength={SWEEP + 90}
        strokeDasharray={`${(value / KNOB_MAX) * SWEEP} ${SWEEP + 90}`}
        transform="rotate(135 20 20)"
      />
      <circle className="knob__cap" cx="20" cy="20" r="13" />
      <line className="knob__pointer" x1="20" y1="20" x2="20" y2="9" transform={`rotate(${angle} 20 20)`} />
    </svg>
  );
}

function Switch({ deviceName, control, value, onChange }: { deviceName: string; control: Control; value: string; onChange: (v: string) => void }) {
  const finger = useRef(false);
  const positions = control.positions ?? [];
  const next = positions[(positions.indexOf(value) + 1) % positions.length];
  const on = value === 'ON';
  if (positions.length > 3) {
    // Selectors with many positions (e.g. an input selector) get a list.
    return (
      <div className="control control--switch control--select">
        <select
          className="switch"
          aria-label={control.label}
          value={value}
          onPointerDown={(e) => (finger.current = isFinger(e))}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            onChange(e.target.value);
            if (finger.current) flashPreview(deviceName, control, e.target.value);
          }}
        >
          {positions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="control__label">{control.label}</span>
      </div>
    );
  }
  return (
    <div className="control control--switch">
      <button
        className={'switch' + (on ? ' switch--on' : '')}
        aria-label={`${control.label}: ${value}`}
        title={`${control.label}: ${value} → ${next}`}
        onPointerDown={(e) => (finger.current = isFinger(e))}
        onClick={(e) => {
          e.stopPropagation();
          onChange(next);
          if (finger.current) flashPreview(deviceName, control, next);
        }}
      >
        {positions.length === 2 && positions.includes('ON') ? <span className="switch__led" /> : null}
        {value}
      </button>
      <span className="control__label">{control.label}</span>
    </div>
  );
}

/** The enlarged control at the top of the diagram while a finger is on it. */
export function ControlLoupe() {
  const preview = useControlPreview((s) => s.preview);
  if (!preview) return null;
  const { control, value, deviceName } = preview;
  const positions = control.positions ?? [];
  return (
    <div className="control-loupe" role="status" aria-live="polite">
      {control.kind === 'knob' ? (
        <div className="control-loupe__knob">
          <KnobFace value={Number(value)} />
        </div>
      ) : (
        <div className="control-loupe__positions">
          {positions.map((p) => (
            <span key={p} className={p === value ? 'active' : ''}>
              {p}
            </span>
          ))}
        </div>
      )}
      <div className="control-loupe__text">
        <span className="control-loupe__device">{deviceName}</span>
        <strong>{control.label}</strong>
        <span className="control-loupe__value">{formatSetting(control, value)}</span>
        {control.kind === 'knob' && (control.minLabel || control.maxLabel) && (
          <span className="control-loupe__range">
            {control.minLabel ?? 0} ← → {control.maxLabel ?? KNOB_MAX}
          </span>
        )}
      </div>
    </div>
  );
}
