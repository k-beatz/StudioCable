import { useState } from 'react';
import { newId } from '../core/ids';
import type { Cable, DeviceInstance, Group, Project } from '../core/model';
import type { Trace } from '../core/signalFlow';
import {
  addDevice,
  addGroup,
  childrenOf,
  describeEnd,
  GROUP_COLORS,
  removeCable,
  removeDevice,
  removeGroup,
  setContainer,
  toggleInGroup,
  updateCable,
  updateDevice,
  updateGroup,
} from '../core/project';
import { t } from '../i18n';
import { useAnalysis } from '../store/analysis';
import { useProjectStore } from '../store/projectStore';
import { traceForSelection } from '../store/trace';
import { CommitInput } from './CommitInput';
import { SignalPathList } from './SignalPathList';
import { CABLE_COLORS, connectorsText, issueText, SEVERITY_ICONS, SIGNAL_COLORS } from './labels';

/** Edit panel for the selected device or cable. */
export function Inspector() {
  const selection = useProjectStore((s) => s.selection);
  const project = useProjectStore((s) => s.project);
  const select = useProjectStore((s) => s.select);
  const [expanded, setExpanded] = useState(false);
  if (!selection) return null;

  const device =
    selection.kind === 'device' || selection.kind === 'port'
      ? project.devices.find((d) => d.id === selection.id)
      : undefined;
  const cable = selection.kind === 'cable' ? project.cables.find((c) => c.id === selection.id) : undefined;
  const group = selection.kind === 'group' ? project.groups.find((g) => g.id === selection.id) : undefined;
  if (!device && !cable && !group) return null;
  const trace = traceForSelection(project, selection);

  return (
    <aside className={'inspector' + (expanded ? ' inspector--expanded' : '')}>
      <button
        className="inspector__grabber narrow-only"
        aria-label={expanded ? t('inspector.collapse') : t('inspector.expand')}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span />
      </button>
      <button className="inspector__close" onClick={() => select(null)} aria-label={t('inspector.close')}>
        ✕
      </button>
      {device && selection.kind === 'device' && <DeviceInspector device={device} project={project} />}
      {device && selection.kind === 'port' && (
        <PortInspector device={device} portId={selection.portId} project={project} />
      )}
      {cable && <CableInspector cable={cable} project={project} />}
      {group && <GroupInspector group={group} project={project} />}
      {!group && (
        <>
          <h3>{t('flow.title')}</h3>
          <SignalPathList trace={trace} />
          {trace && trace.cableIds.size > 0 && <SaveTraceAsSystem trace={trace} project={project} />}
        </>
      )}
    </aside>
  );
}

function DeviceInspector({ device, project }: { device: DeviceInstance; project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const select = useProjectStore((s) => s.select);
  const template = project.templates[device.templateId];

  const duplicate = () => {
    // Copy the template too, so the copy can later be edited independently.
    const copy = { ...template, id: newId('t-') };
    let createdId = '';
    apply((p) => {
      const r = addDevice(p, copy, device.name + ' 2', { x: device.position.x + 40, y: device.position.y + 40 });
      createdId = r.device.id;
      return r.project;
    });
    select({ kind: 'device', id: createdId });
  };

  return (
    <>
      <h2>{device.name}</h2>
      <label className="field">
        <span>{t('device.name')}</span>
        <CommitInput value={device.name} onCommit={(name) => apply((p) => updateDevice(p, device.id, { name }))} />
      </label>
      <label className="field">
        <span>{t('device.location')}</span>
        <CommitInput
          value={device.location ?? ''}
          onCommit={(location) => apply((p) => updateDevice(p, device.id, { location: location || undefined }))}
        />
      </label>
      <div className="field">
        <span>{t('device.model')}</span>
        <div>
          {template?.manufacturer} {template?.model}
        </div>
      </div>
      {template?.origin === 'library' && (
        <div className={'library-note' + (template.verified ? '' : ' library-note--unverified')}>
          {template.verified ? `✓ ${t('library.verified')}` : `⚠️ ${t('library.unverifiedHint')}`}
        </div>
      )}
      {template?.sources && template.sources.length > 0 && (
        <div className="field">
          <span>{t('library.sources')}</span>
          <ul className="source-list">
            {template.sources.map((src) => (
              <li key={src.url}>
                <a href={src.url} target="_blank" rel="noopener noreferrer">
                  {src.title ?? src.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <BoardField device={device} project={project} />
      <SystemsField kind="device" id={device.id} project={project} />
      <h3>{t('device.ports')}</h3>
      <ul className="port-list">
        {template?.ports.map((p) => (
          <li key={p.id} className="clickable" onClick={() => select({ kind: 'port', id: device.id, portId: p.id })}>
            <span className="port-badge" style={{ background: SIGNAL_COLORS[p.signal] }}>
              {t(`signalShort.${p.signal}`)}
            </span>
            <strong>{p.label}</strong>
            <small>
              {t(`direction.${p.direction}`)} · {connectorsText(p.connectors)}
            </small>
          </li>
        ))}
      </ul>
      <div className="button-row">
        <button onClick={duplicate}>{t('device.duplicate')}</button>
        <button
          className="danger"
          onClick={() => {
            apply((p) => removeDevice(p, device.id));
            select(null);
          }}
        >
          {t('device.delete')}
        </button>
      </div>
    </>
  );
}

function PortInspector({ device, portId, project }: { device: DeviceInstance; portId: string; project: Project }) {
  const select = useProjectStore((s) => s.select);
  const port = project.templates[device.templateId]?.ports.find((p) => p.id === portId);
  if (!port) return null;
  const cables = project.cables.filter((c) => c.ends.some((e) => e.deviceId === device.id && e.portId === portId));

  return (
    <>
      <h2>{port.label}</h2>
      <div className="field">
        <span>{t('port.device')}</span>
        <button className="link-button align-left" onClick={() => select({ kind: 'device', id: device.id })}>
          {device.name}
        </button>
      </div>
      <div className="field">
        <span>{t('port.signal')}</span>
        <div>
          <span className="port-badge" style={{ background: SIGNAL_COLORS[port.signal] }}>
            {t(`signalShort.${port.signal}`)}
          </span>{' '}
          {t(`signal.${port.signal}`)} · {t(`direction.${port.direction}`)}
          {port.channels && port.channels > 1 ? ` · ${port.channels} ch` : ''}
        </div>
      </div>
      {port.alsoAccepts && port.alsoAccepts.length > 0 && (
        <div className="field">
          <span>{t('port.alsoAccepts')}</span>
          <div>{port.alsoAccepts.map((sig) => t(`signal.${sig}`)).join(', ')}</div>
        </div>
      )}
      <div className="field">
        <span>{t('port.connector')}</span>
        <div>{connectorsText(port.connectors)}</div>
      </div>
      <div className="field">
        <span>{t('port.cables')}</span>
        <div>
          {cables.length === 0
            ? '—'
            : cables.map((c) => (
                <button key={c.id} className="link-button" onClick={() => select({ kind: 'cable', id: c.id })}>
                  {c.label}
                </button>
              ))}
        </div>
      </div>
      <div className="button-row">
        <button
          className="primary"
          onClick={() => {
            select(null);
            useProjectStore.getState().startConnection({ deviceId: device.id, portId });
          }}
        >
          {t('connect.fromHere')}
        </button>
      </div>
    </>
  );
}

function CableInspector({ cable, project }: { cable: Cable; project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const select = useProjectStore((s) => s.select);
  const issues = useAnalysis().byCable.get(cable.id) ?? [];
  const update = (patch: Partial<Cable>) => apply((p) => updateCable(p, cable.id, patch));

  return (
    <>
      <h2>{cable.label}</h2>
      <div className="field">
        <span>{t('cable.from')}</span>
        <div>{describeEnd(project, cable.ends[0])}</div>
      </div>
      <div className="field">
        <span>{t('cable.to')}</span>
        <div>{describeEnd(project, cable.ends[1])}</div>
      </div>
      {issues.length > 0 && (
        <ul className="issue-list">
          {issues.map((i, n) => (
            <li key={n} className={`issue issue--${i.severity}`}>
              {SEVERITY_ICONS[i.severity]} {issueText(i)}
            </li>
          ))}
        </ul>
      )}
      <label className="field">
        <span>{t('cable.type')}</span>
        <CommitInput value={cable.cableType ?? ''} onCommit={(v) => update({ cableType: v || undefined })} />
      </label>
      <label className="field">
        <span>{t('cable.length')}</span>
        <CommitInput
          inputMode="decimal"
          value={cable.lengthM?.toString() ?? ''}
          onCommit={(v) => {
            const n = parseFloat(v.replace(',', '.'));
            update({ lengthM: Number.isFinite(n) ? n : undefined });
          }}
        />
      </label>
      <label className="field">
        <span>{t('cable.color')}</span>
        <select value={cable.color ?? ''} onChange={(e) => update({ color: e.target.value || undefined })}>
          {CABLE_COLORS.map((c) => (
            <option key={c} value={c}>
              {c || '—'}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t('cable.note')}</span>
        <CommitInput value={cable.note ?? ''} onCommit={(v) => update({ note: v || undefined })} />
      </label>
      <SystemsField kind="cable" id={cable.id} project={project} />
      <div className="button-row">
        <button onClick={() => update({ ends: [cable.ends[1], cable.ends[0]] })}>{t('cable.swap')}</button>
        <button
          className="danger"
          onClick={() => {
            apply((p) => removeCable(p, cable.id));
            select(null);
          }}
        >
          {t('cable.delete')}
        </button>
      </div>
    </>
  );
}

// ---------- Systems and boards ----------

/** Chips for the systems a device or cable belongs to, plus "add to system". */
function SystemsField({ kind, id, project }: { kind: 'device' | 'cable'; id: string; project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const member = (g: Group) => (kind === 'device' ? g.deviceIds : g.cableIds).includes(id);
  const inGroups = project.groups.filter(member);
  const others = project.groups.filter((g) => !member(g));
  return (
    <div className="field">
      <span>{t('systems.title')}</span>
      <div className="chip-row">
        {inGroups.map((g) => (
          <span key={g.id} className="system-tag" style={{ borderColor: g.color }}>
            <span className="system-chip__dot" style={{ background: g.color }} />
            {g.name}
            <button
              className="system-tag__remove"
              aria-label={t('systems.removeFrom', { name: g.name })}
              onClick={() => apply((p) => toggleInGroup(p, g.id, kind, id))}
            >
              ✕
            </button>
          </span>
        ))}
        <select
          className="compact-select"
          value=""
          aria-label={t('systems.addTo')}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__new') {
              apply((p) => addGroup(p, t('systems.defaultName', { n: p.groups.length + 1 }), kind === 'device' ? { deviceIds: [id] } : { cableIds: [id] }).project);
            } else if (v) {
              apply((p) => toggleInGroup(p, v, kind, id));
            }
          }}
        >
          <option value="">{t('systems.addTo')}</option>
          {others.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value="__new">{t('systems.new')}</option>
        </select>
      </div>
    </div>
  );
}

/** For pedals: which board they sit on. For boards: open it and list what is on it. */
function BoardField({ device, project }: { device: DeviceInstance; project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const openBoard = useProjectStore((s) => s.openBoard);
  const isBoard = project.templates[device.templateId]?.category === 'pedalboard';
  if (isBoard) {
    const children = childrenOf(project, device.id);
    return (
      <div className="field">
        <span>{t('board.contents')}</span>
        <div>{children.length ? children.map((c) => c.name).join(', ') : '—'}</div>
        <button className="primary" onClick={() => openBoard(device.id)}>
          {t('board.openFull')}
        </button>
      </div>
    );
  }
  const boards = project.devices.filter((d) => project.templates[d.templateId]?.category === 'pedalboard');
  if (boards.length === 0) return null;
  return (
    <label className="field">
      <span>{t('board.placeOn')}</span>
      <select
        value={device.containerId ?? ''}
        onChange={(e) => apply((p) => setContainer(p, device.id, e.target.value || null))}
      >
        <option value="">{t('board.mainLevel')}</option>
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Saves the traced signal path as a system. Devices that are only partly on
 * the path (e.g. a mixer with other cables) are marked through their cables only.
 */
function SaveTraceAsSystem({ trace, project }: { trace: Trace; project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const selection = useProjectStore((s) => s.selection);
  const setFocusGroup = useProjectStore((s) => s.setFocusGroup);
  const select = useProjectStore((s) => s.select);
  const save = () => {
    const fullyOnPath = [...trace.deviceIds].filter((deviceId) =>
      project.cables.every((c) =>
        c.ends.every((e) => e.deviceId !== deviceId || trace.portKeys.has(`${e.deviceId}/${e.portId}`)),
      ),
    );
    const startName =
      selection && selection.kind !== 'group' && selection.kind !== 'cable'
        ? project.devices.find((d) => d.id === selection.id)?.name
        : undefined;
    let id = '';
    apply((p) => {
      const r = addGroup(p, startName ?? t('systems.defaultName', { n: p.groups.length + 1 }), {
        deviceIds: fullyOnPath,
        cableIds: [...trace.cableIds],
      });
      id = r.group.id;
      return r.project;
    });
    setFocusGroup(id);
    select({ kind: 'group', id });
  };
  return (
    <div className="button-row">
      <button onClick={save}>{t('systems.saveTrace')}</button>
    </div>
  );
}

function GroupInspector({ group, project }: { group: Group; project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const select = useProjectStore((s) => s.select);
  const setFocusGroup = useProjectStore((s) => s.setFocusGroup);
  const devices = project.devices.filter((d) => group.deviceIds.includes(d.id));
  const cables = project.cables.filter((c) => group.cableIds.includes(c.id));
  return (
    <>
      <h2>{group.name}</h2>
      <label className="field">
        <span>{t('device.name')}</span>
        <CommitInput value={group.name} onCommit={(name) => apply((p) => updateGroup(p, group.id, { name: name || group.name }))} />
      </label>
      <div className="field">
        <span>{t('systems.color')}</span>
        <div className="swatches">
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              className={'swatch' + (c === group.color ? ' active' : '')}
              style={{ background: c }}
              aria-label={c}
              aria-pressed={c === group.color}
              onClick={() => apply((p) => updateGroup(p, group.id, { color: c }))}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <span>{t('systems.devices')}</span>
        <div>{devices.length ? devices.map((d) => d.name).join(', ') : '—'}</div>
      </div>
      <div className="field">
        <span>{t('systems.cables')}</span>
        <div className="chip-row">
          {cables.length
            ? cables.map((c) => (
                <button key={c.id} className="link-button" onClick={() => select({ kind: 'cable', id: c.id })}>
                  {c.label}
                </button>
              ))
            : '—'}
        </div>
      </div>
      <p className="muted">{t('systems.hint')}</p>
      <div className="button-row">
        <button
          className="danger"
          onClick={() => {
            apply((p) => removeGroup(p, group.id));
            setFocusGroup(null);
            select(null);
          }}
        >
          {t('systems.delete')}
        </button>
      </div>
    </>
  );
}
