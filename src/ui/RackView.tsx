import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { DeviceCategory, DeviceInstance, Project } from '../core/model';
import { isPowerSignal } from '../core/model';
import { addToRack, fits, heightOf, moveInRack, rackUnitsOf, racked, setRackUnits } from '../core/rack';
import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';
import { CategoryIcon } from './CategoryIcon';
import { ConnectorIcon } from './ConnectorIcon';
import { CATEGORY_PANEL_COLORS, SIGNAL_COLORS } from './labels';

/** Pixel height of one rack unit on screen. */
const U = 46;

/** Things that never go into a rack. */
const NOT_RACKABLE: DeviceCategory[] = ['microphone', 'instrument', 'headphones', 'pedal', 'pedalboard', 'monitor'];

/**
 * A 19" rack seen from the front (names) or the rear (connectors and cable
 * numbers). Devices are dragged up and down by their panel; they only land
 * where they fit.
 */
export function RackView() {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const select = useProjectStore((s) => s.select);
  const selection = useProjectStore((s) => s.selection);
  const [side, setSide] = useState<'front' | 'rear'>('front');
  const units = rackUnitsOf(project);
  const inRack = racked(project);
  const shelf = project.devices.filter(
    (d) => d.rackSlot === undefined && !NOT_RACKABLE.includes(project.templates[d.templateId]?.category ?? 'other'),
  );

  return (
    <div className="rack-view">
      <div className="rack-view__bar">
        <div className="segmented segmented--small" role="group" aria-label={t('rack.side')}>
          <button className={side === 'front' ? 'active' : ''} onClick={() => setSide('front')}>
            {t('rack.front')}
          </button>
          <button className={side === 'rear' ? 'active' : ''} onClick={() => setSide('rear')}>
            {t('rack.rear')}
          </button>
        </div>
        <div className="rack-view__size">
          <button className="icon-button" onClick={() => apply((p) => setRackUnits(p, units - 1))} aria-label={t('rack.smaller')}>
            −
          </button>
          <span>{t('rack.units', { count: units })}</span>
          <button className="icon-button" onClick={() => apply((p) => setRackUnits(p, units + 1))} aria-label={t('rack.bigger')}>
            +
          </button>
        </div>
      </div>

      <div className="rack-view__body">
        <div className="rack" style={{ height: units * U } as CSSProperties}>
          {Array.from({ length: units }, (_, i) => (
            <div key={i} className="rack__unit" style={{ top: i * U, height: U }}>
              <span className="rack__number">{i + 1}</span>
              <span className="rack__number rack__number--right">{i + 1}</span>
            </div>
          ))}
          {inRack.map((d) => (
            <RackDevice
              key={d.id}
              project={project}
              device={d}
              side={side}
              selected={selection?.kind === 'device' && selection.id === d.id}
              onSelect={() => select({ kind: 'device', id: d.id })}
              onMove={(slot) => apply((p) => moveInRack(p, d.id, slot))}
            />
          ))}
          {inRack.length === 0 && <p className="rack__empty">{t('rack.empty')}</p>}
        </div>

        <aside className="rack-shelf">
          <h3>{t('rack.notInRack')}</h3>
          {shelf.length === 0 ? (
            <p className="muted">{t('rack.allRacked')}</p>
          ) : (
            <ul>
              {shelf.map((d) => (
                <li key={d.id}>
                  <span className="rack-shelf__name">
                    <CategoryIcon category={project.templates[d.templateId]?.category ?? 'other'} />
                    {d.name}
                  </span>
                  <button onClick={() => apply((p) => addToRack(p, d.id))}>{t('rack.add')}</button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function RackDevice(props: {
  project: Project;
  device: DeviceInstance;
  side: 'front' | 'rear';
  selected: boolean;
  onSelect: () => void;
  onMove: (slot: number) => void;
}) {
  const { project, device, side } = props;
  const template = project.templates[device.templateId];
  const height = heightOf(project, device);
  const slot = device.rackSlot!;
  const drag = useRef<{ startY: number; moved: boolean } | null>(null);
  const [offset, setOffset] = useState(0);

  const target = slot + Math.round(offset / U);
  const ok = target === slot || fits(project, device.id, target, height);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dy) > 4) drag.current.moved = true;
    if (drag.current.moved) setOffset(dy);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    setOffset(0);
    if (!moved) props.onSelect();
    else if (target !== slot && ok) props.onMove(target);
  };

  const cablesByPort = new Map<string, string>();
  for (const c of project.cables) {
    for (const e of c.ends) if (e.deviceId === device.id) cablesByPort.set(e.portId, c.label);
  }

  return (
    <div
      className={
        'rack-device' +
        (side === 'rear' ? ' rack-device--rear' : '') +
        (props.selected ? ' selected' : '') +
        (offset !== 0 ? ' dragging' : '') +
        (offset !== 0 && !ok ? ' blocked' : '')
      }
      style={
        {
          top: (slot - 1) * U + offset,
          height: height * U,
          '--device': CATEGORY_PANEL_COLORS[template?.category ?? 'other'],
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        setOffset(0);
      }}
    >
      <span className="rack-device__ear" aria-hidden="true" />
      {side === 'front' ? (
        <div className="rack-device__front">
          <CategoryIcon category={template?.category ?? 'other'} />
          <div>
            <div className="rack-device__name">{device.name}</div>
            <div className="rack-device__model">
              {template ? `${template.manufacturer} ${template.model}` : ''} · {height}U
            </div>
          </div>
        </div>
      ) : (
        <div className="rack-device__rear">
          <span className="rack-device__rear-name">{device.name}</span>
          <div className="rack-device__ports">
            {(template?.ports ?? []).map((p) => {
              const cable = cablesByPort.get(p.id);
              return (
                <span key={p.id} className={'rack-port' + (cable ? ' connected' : '')} title={p.label}>
                  <ConnectorIcon connectors={p.connectors} color={SIGNAL_COLORS[p.signal]} size={18} />
                  {/* A plugged port shows its cable number; the port name stays in the tooltip. */}
                  {cable ? (
                    <b className="rack-port__cable" style={{ background: SIGNAL_COLORS[p.signal] }}>
                      {cable}
                    </b>
                  ) : (
                    <small>{isPowerSignal(p.signal) ? '⚡' : p.label}</small>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}
      <span className="rack-device__ear" aria-hidden="true" />
    </div>
  );
}
