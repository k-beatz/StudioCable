import { newId } from '../core/ids';
import type { Cable, DeviceInstance, Project } from '../core/model';
import { addDevice, describeEnd, removeCable, removeDevice, updateCable, updateDevice } from '../core/project';
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
  if (!selection) return null;

  const device = selection.kind !== 'cable' ? project.devices.find((d) => d.id === selection.id) : undefined;
  const cable = selection.kind === 'cable' ? project.cables.find((c) => c.id === selection.id) : undefined;
  if (!device && !cable) return null;
  const trace = traceForSelection(project, selection);

  return (
    <aside className="inspector">
      <button className="inspector__close" onClick={() => select(null)} aria-label={t('inspector.close')}>
        ✕
      </button>
      {device && selection.kind === 'device' && <DeviceInspector device={device} project={project} />}
      {device && selection.kind === 'port' && (
        <PortInspector device={device} portId={selection.portId} project={project} />
      )}
      {cable && <CableInspector cable={cable} project={project} />}
      <h3>{t('flow.title')}</h3>
      <SignalPathList trace={trace} />
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
