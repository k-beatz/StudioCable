import { useState } from 'react';
import { buildTemplate, defaultConnector, GENERIC_PRESETS, type GenericSpec, type PortGroup } from '../core/generic';
import {
  CONNECTOR_TYPES,
  DEVICE_CATEGORIES,
  SIGNAL_TYPES,
  type ConnectorType,
  type DeviceTemplate,
  type Direction,
} from '../core/model';
import { t } from '../i18n';

interface Props {
  onAdd: (template: DeviceTemplate) => void;
  onClose: () => void;
}

/** Modal to add a quick (preset) device or build a custom one from port groups. */
export function AddDeviceDialog({ onAdd, onClose }: Props) {
  const [tab, setTab] = useState<'presets' | 'custom'>('presets');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const presets = GENERIC_PRESETS.filter(
    (p) =>
      !q ||
      t(`preset.${p.key}` as Parameters<typeof t>[0]).toLowerCase().includes(q) ||
      t(`category.${p.spec.category}`).toLowerCase().includes(q),
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('add.title')}>
        <div className="modal__header">
          <div className="segmented">
            <button className={tab === 'presets' ? 'active' : ''} onClick={() => setTab('presets')}>
              {t('add.presets')}
            </button>
            <button className={tab === 'custom' ? 'active' : ''} onClick={() => setTab('custom')}>
              {t('add.custom')}
            </button>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t('add.cancel')}>
            ✕
          </button>
        </div>

        {tab === 'presets' ? (
          <div className="modal__body">
            <input
              type="search"
              className="filter-input"
              placeholder={t('add.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <ul className="preset-list">
              {presets.map((p) => (
                <li key={p.key}>
                  <button onClick={() => onAdd(buildTemplate(p.spec))}>
                    <strong>{t(`preset.${p.key}` as Parameters<typeof t>[0])}</strong>
                    <small>
                      {t(`category.${p.spec.category}`)} ·{' '}
                      {p.spec.groups.map((g) => `${g.count}× ${g.label}`).join(', ')}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <CustomBuilder onAdd={onAdd} />
        )}
      </div>
    </div>
  );
}

function newGroup(direction: Direction, type: ConnectorType, label: string): PortGroup {
  return {
    count: 2,
    label,
    direction,
    connectors: [defaultConnector(type, direction)],
    signal: direction === 'in' ? 'mic' : 'line-bal',
  };
}

function CustomBuilder({ onAdd }: { onAdd: (template: DeviceTemplate) => void }) {
  const [spec, setSpec] = useState<GenericSpec>({
    manufacturer: '',
    model: '',
    category: 'other',
    groups: [newGroup('in', 'xlr', 'Input'), newGroup('out', 'trs-6.3', 'Output')],
  });

  const setGroup = (i: number, patch: Partial<PortGroup>) =>
    setSpec((s) => ({ ...s, groups: s.groups.map((g, n) => (n === i ? { ...g, ...patch } : g)) }));

  const setConnector = (i: number, slot: 0 | 1, type: ConnectorType | '') => {
    const g = spec.groups[i];
    const connectors = [...g.connectors];
    if (type) connectors[slot] = defaultConnector(type, g.direction);
    else connectors.splice(slot, 1);
    setGroup(i, { connectors });
  };

  const canCreate = spec.model.trim() !== '' && spec.groups.some((g) => g.count > 0);

  return (
    <div className="modal__body">
      <div className="form-grid">
        <label className="field">
          <span>{t('add.manufacturer')}</span>
          <input value={spec.manufacturer} onChange={(e) => setSpec({ ...spec, manufacturer: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('add.model')}</span>
          <input value={spec.model} onChange={(e) => setSpec({ ...spec, model: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('add.category')}</span>
          <select
            value={spec.category}
            onChange={(e) => setSpec({ ...spec, category: e.target.value as GenericSpec['category'] })}
          >
            {DEVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3>{t('add.portGroups')}</h3>
      <div className="group-list">
        {spec.groups.map((g, i) => (
          <div className="group-row" key={i}>
            <label className="field field--tiny">
              <span>{t('add.count')}</span>
              <input
                type="number"
                min={0}
                max={128}
                inputMode="numeric"
                value={g.count}
                onChange={(e) => setGroup(i, { count: Math.max(0, Math.min(128, Number(e.target.value) || 0)) })}
              />
            </label>
            <label className="field">
              <span>{t('add.label')}</span>
              <input value={g.label} onChange={(e) => setGroup(i, { label: e.target.value })} />
            </label>
            <label className="field">
              <span>{t('add.direction')}</span>
              <select
                value={g.direction}
                onChange={(e) => {
                  const direction = e.target.value as Direction;
                  setGroup(i, { direction, connectors: g.connectors.map((c) => defaultConnector(c.type, direction)) });
                }}
              >
                {(['in', 'out', 'bidi'] as const).map((d) => (
                  <option key={d} value={d}>
                    {t(`direction.${d}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('add.connector')}</span>
              <select value={g.connectors[0]?.type} onChange={(e) => setConnector(i, 0, e.target.value as ConnectorType)}>
                {CONNECTOR_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {t(`connector.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('add.altConnector')}</span>
              <select
                value={g.connectors[1]?.type ?? ''}
                onChange={(e) => setConnector(i, 1, e.target.value as ConnectorType | '')}
              >
                <option value="">{t('add.none')}</option>
                {CONNECTOR_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {t(`connector.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('add.signal')}</span>
              <select value={g.signal} onChange={(e) => setGroup(i, { signal: e.target.value as PortGroup['signal'] })}>
                {SIGNAL_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {t(`signal.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field--tiny">
              <span>{t('add.channels')}</span>
              <input
                type="number"
                min={1}
                max={64}
                inputMode="numeric"
                value={g.channels ?? 1}
                onChange={(e) => setGroup(i, { channels: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
            <button
              className="icon-button danger"
              onClick={() => setSpec((s) => ({ ...s, groups: s.groups.filter((_, n) => n !== i) }))}
              aria-label={t('add.removeGroup')}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
      <div className="button-row">
        <button onClick={() => setSpec((s) => ({ ...s, groups: [...s.groups, newGroup('in', 'trs-6.3', 'Input')] }))}>
          + {t('add.addGroup')}
        </button>
        <button className="primary" disabled={!canCreate} onClick={() => onAdd(buildTemplate(spec, 'custom'))}>
          {t('add.create')}
        </button>
      </div>
    </div>
  );
}
