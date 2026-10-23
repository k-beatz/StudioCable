import { useState } from 'react';
import { buildTemplate, defaultConnector, GENERIC_PRESETS, type GenericSpec, type PortGroup } from '../core/generic';
import {
  CONNECTOR_TYPES,
  DEVICE_CATEGORIES,
  SIGNAL_TYPES,
  type ConnectorType,
  type DeviceCategory,
  type DeviceTemplate,
  type Direction,
} from '../core/model';
import { libraryToTemplate, matchesQuery } from '../core/library';
import { SETUP_PRESETS, type SetupPreset } from '../core/setups';
import { t, type MessageKey } from '../i18n';
import { isTouchDevice } from './device';
import { LIBRARY } from '../library';
import { newId } from '../core/ids';
import { favoriteKey, useFavorites, type Favorite } from '../store/favorites';

interface Props {
  onAdd: (template: DeviceTemplate) => void;
  onAddSetup: (setup: SetupPreset) => void;
  onClose: () => void;
}

type Tab = 'favorites' | 'library' | 'presets' | 'setups' | 'custom';

/** Modal to add a device: from the library, a quick generic device, or a custom one. */
export function AddDeviceDialog({ onAdd, onAddSetup, onClose }: Props) {
  const hasFavorites = useFavorites((s) => s.favorites.length > 0);
  const [tab, setTab] = useState<Tab>(hasFavorites ? 'favorites' : LIBRARY.length > 0 ? 'library' : 'presets');
  const tabs: { key: Tab; label: MessageKey }[] = [
    ...(hasFavorites || tab === 'favorites' ? [{ key: 'favorites' as const, label: 'add.favorites' as const }] : []),
    { key: 'library', label: 'add.library' },
    { key: 'presets', label: 'add.presets' },
    { key: 'setups', label: 'add.setups' },
    { key: 'custom', label: 'add.custom' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('add.title')}>
        <div className="modal__header">
          <div className="segmented">
            {tabs.map((x) => (
              <button key={x.key} className={tab === x.key ? 'active' : ''} onClick={() => setTab(x.key)}>
                {t(x.label)}
              </button>
            ))}
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t('add.cancel')}>
            ✕
          </button>
        </div>
        {tab === 'favorites' && <FavoritesList onAdd={onAdd} onAddSetup={onAddSetup} />}
        {tab === 'library' && <LibraryList onAdd={onAdd} />}
        {tab === 'presets' && <PresetList onAdd={onAdd} />}
        {tab === 'setups' && <SetupList onAdd={onAddSetup} />}
        {tab === 'custom' && <CustomBuilder onAdd={onAdd} />}
      </div>
    </div>
  );
}

/** "12 in · 9 out" style summary of a device's ports. */
function portSummary(groups: PortGroup[]): string {
  const count = (dir: Direction) =>
    groups.filter((g) => g.direction === dir).reduce((n, g) => n + (g.labels?.length ?? g.count), 0);
  const parts = [`${count('in')} ${t('add.inputs')}`, `${count('out')} ${t('add.outputs')}`];
  const bidi = count('bidi');
  if (bidi) parts.push(`${bidi} ${t('add.bidi')}`);
  return parts.join(' · ');
}

/** ☆ / ★ next to an entry in the lists. */
export function StarButton({ fav }: { fav: Favorite }) {
  const on = useFavorites((s) => s.favorites.some((f) => f.key === fav.key));
  const toggle = useFavorites((s) => s.toggle);
  return (
    <button
      className={'star-button' + (on ? ' star-button--on' : '')}
      aria-pressed={on}
      aria-label={t(on ? 'favorite.remove' : 'favorite.add')}
      title={t(on ? 'favorite.remove' : 'favorite.add')}
      onClick={(e) => {
        e.stopPropagation();
        toggle(fav);
      }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

function FavoritesList({ onAdd, onAddSetup }: Pick<Props, 'onAdd' | 'onAddSetup'>) {
  const favorites = useFavorites((s) => s.favorites);
  const rows = favorites.flatMap((f): { f: Favorite; title: string; sub: string; add: () => void }[] => {
    if (f.kind === 'library') {
      const d = LIBRARY.find((x) => x.id === f.id);
      return d ? [{ f, title: `${d.manufacturer} ${d.model}`, sub: `${t(`category.${d.category}`)} · ${portSummary(d.groups)}`, add: () => onAdd(libraryToTemplate(d)) }] : [];
    }
    if (f.kind === 'preset') {
      const p = GENERIC_PRESETS.find((x) => x.key === f.id);
      return p ? [{ f, title: t(`preset.${p.key}` as MessageKey), sub: `${t(`category.${p.spec.category}`)} · ${portSummary(p.spec.groups)}`, add: () => onAdd(buildTemplate(p.spec)) }] : [];
    }
    if (f.kind === 'setup') {
      const s = SETUP_PRESETS.find((x) => x.key === f.id);
      return s ? [{ f, title: t(`setup.${s.key}` as MessageKey), sub: t('add.setups'), add: () => onAddSetup(s) }] : [];
    }
    // Own device: a fresh copy of the stored template each time.
    const copy: DeviceTemplate = { ...JSON.parse(JSON.stringify(f.template)), id: newId('t-') };
    return [{ f, title: f.name, sub: `${t('favorite.own')} · ${t(`category.${f.template.category}`)}`, add: () => onAdd(copy) }];
  });
  return (
    <div className="modal__body">
      {rows.length === 0 && <p className="muted">{t('add.favoritesEmpty')}</p>}
      <ul className="preset-list">
        {rows.map((r) => (
          <li key={r.f.key} className="preset-list__item">
            <button onClick={r.add}>
              <strong>{r.title}</strong>
              <small>{r.sub}</small>
            </button>
            <StarButton fav={r.f} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LibraryList({ onAdd }: { onAdd: (template: DeviceTemplate) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<DeviceCategory | ''>('');
  const [manufacturer, setManufacturer] = useState('');
  const categories = DEVICE_CATEGORIES.filter((c) => LIBRARY.some((d) => d.category === c));
  const manufacturers = [...new Set(LIBRARY.map((d) => d.manufacturer))].sort((a, b) => a.localeCompare(b));
  const results = LIBRARY.filter(
    (d) =>
      (!category || d.category === category) &&
      (!manufacturer || d.manufacturer === manufacturer) &&
      matchesQuery(d, query),
  );

  return (
    <div className="modal__body">
      <div className="search-row">
        <input
          type="search"
          className="filter-input"
          placeholder={t('add.searchLibrary')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={!isTouchDevice()}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value as DeviceCategory | '')}>
          <option value="">{t('add.allCategories')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}`)}
            </option>
          ))}
        </select>
        <select value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}>
          <option value="">{t('add.allManufacturers')}</option>
          {manufacturers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      {LIBRARY.length > 0 && (
        <p className="muted result-count">{t('add.resultCount', { count: results.length, total: LIBRARY.length })}</p>
      )}
      {LIBRARY.length === 0 && <p className="muted">{t('add.libraryEmpty')}</p>}
      {LIBRARY.length > 0 && results.length === 0 && <p className="muted">{t('add.noMatches')}</p>}
      <ul className="preset-list">
        {results.map((d) => (
          <li key={d.id} className="preset-list__item">
            <StarButton fav={{ key: favoriteKey('library', d.id), kind: 'library', id: d.id }} />
            <button onClick={() => onAdd(libraryToTemplate(d))}>
              <span className="preset-list__title">
                <strong>
                  {d.manufacturer} {d.model}
                </strong>
                {d.status === 'unverified' && <span className="badge badge--warning">{t('library.unverified')}</span>}
              </span>
              <small>
                {t(`category.${d.category}`)} · {portSummary(d.groups)}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PresetList({ onAdd }: { onAdd: (template: DeviceTemplate) => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const presets = GENERIC_PRESETS.filter(
    (p) =>
      !q ||
      t(`preset.${p.key}` as MessageKey).toLowerCase().includes(q) ||
      t(`category.${p.spec.category}`).toLowerCase().includes(q),
  );

  return (
    <div className="modal__body">
      <input
        type="search"
        className="filter-input"
        placeholder={t('add.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={!isTouchDevice()}
      />
      <ul className="preset-list">
        {presets.map((p) => (
          <li key={p.key} className="preset-list__item">
            <StarButton fav={{ key: favoriteKey('preset', p.key), kind: 'preset', id: p.key }} />
            <button onClick={() => onAdd(buildTemplate(p.spec))}>
              <strong>{t(`preset.${p.key}` as MessageKey)}</strong>
              <small>
                {t(`category.${p.spec.category}`)} · {portSummary(p.spec.groups)}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Complete example rigs, added wired and marked as a system. */
function SetupList({ onAdd }: { onAdd: (setup: SetupPreset) => void }) {
  return (
    <div className="modal__body">
      <p className="muted">{t('add.setupsHint')}</p>
      <ul className="preset-list">
        {SETUP_PRESETS.map((s) => (
          <li key={s.key} className="preset-list__item">
            <StarButton fav={{ key: favoriteKey('setup', s.key), kind: 'setup', id: s.key }} />
            <button onClick={() => onAdd(s)}>
              <strong>{t(`setup.${s.key}` as MessageKey)}</strong>
              <small>{t(`setup.${s.key}.desc` as MessageKey)}</small>
            </button>
          </li>
        ))}
      </ul>
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

  const startFrom = (key: string) => {
    const preset = GENERIC_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    // Copy so that editing does not change the preset itself.
    const copy: GenericSpec = JSON.parse(JSON.stringify(preset.spec));
    setSpec({ ...copy, manufacturer: '', model: copy.model.replace(/^Generic /, '') });
  };

  return (
    <div className="modal__body">
      <label className="field">
        <span>{t('add.startFrom')}</span>
        <select value="" onChange={(e) => startFrom(e.target.value)}>
          <option value="">{t('add.startBlank')} …</option>
          {GENERIC_PRESETS.filter((p) => p.spec.groups.length > 0).map((p) => (
            <option key={p.key} value={p.key}>
              {t(`preset.${p.key}` as MessageKey)}
            </option>
          ))}
        </select>
        <small className="muted">{t('add.startHint')}</small>
      </label>
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
