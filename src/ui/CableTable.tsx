import { useMemo, useState } from 'react';
import type { Cable } from '../core/model';
import { describeEnd, updateCable } from '../core/project';
import { worstSeverity } from '../core/validation';
import { t, type MessageKey } from '../i18n';
import { useAnalysis } from '../store/analysis';
import { useProjectStore } from '../store/projectStore';
import { CommitInput } from './CommitInput';
import { issueText, SEVERITY_ICONS } from './labels';

type SortKey = 'label' | 'from' | 'to' | 'cableType' | 'lengthM' | 'note';

const COLUMNS: { key: SortKey; title: MessageKey }[] = [
  { key: 'label', title: 'cable.id' },
  { key: 'from', title: 'cable.from' },
  { key: 'to', title: 'cable.to' },
  { key: 'cableType', title: 'cable.type' },
  { key: 'lengthM', title: 'cable.length' },
  { key: 'note', title: 'cable.note' },
];

/** Cable list: sortable, filterable, editable in place. */
export function CableTable() {
  const project = useProjectStore((s) => s.project);
  const selection = useProjectStore((s) => s.selection);
  const apply = useProjectStore((s) => s.apply);
  const select = useProjectStore((s) => s.select);
  const { byCable } = useAnalysis();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'label', desc: false });

  const rows = useMemo(() => {
    const text = (c: Cable, key: SortKey): string => {
      if (key === 'from') return describeEnd(project, c.ends[0]);
      if (key === 'to') return describeEnd(project, c.ends[1]);
      if (key === 'lengthM') return c.lengthM?.toString() ?? '';
      return c[key] ?? '';
    };
    const q = filter.trim().toLowerCase();
    const list = project.cables
      .map((c) => ({ cable: c, from: text(c, 'from'), to: text(c, 'to') }))
      .filter(
        (r) => !q || COLUMNS.some((col) => text(r.cable, col.key).toLowerCase().includes(q)),
      );
    list.sort((a, b) => {
      const cmp =
        sort.key === 'lengthM'
          ? (a.cable.lengthM ?? -1) - (b.cable.lengthM ?? -1)
          : text(a.cable, sort.key).localeCompare(text(b.cable, sort.key), undefined, { numeric: true });
      return sort.desc ? -cmp : cmp;
    });
    return list;
  }, [project, filter, sort]);

  const update = (id: string, patch: Partial<Cable>) => apply((p) => updateCable(p, id, patch));

  if (project.cables.length === 0) return <p className="empty-hint">{t('cable.none')}</p>;

  return (
    <div className="table-view">
      <input
        className="filter-input"
        type="search"
        placeholder={t('cable.filter')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th />
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => setSort((s) => ({ key: col.key, desc: s.key === col.key ? !s.desc : false }))}
                >
                  {t(col.title)} {sort.key === col.key ? (sort.desc ? '▼' : '▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cable, from, to }) => {
              const issues = byCable.get(cable.id) ?? [];
              const severity = worstSeverity(issues);
              const selected = selection?.kind === 'cable' && selection.id === cable.id;
              return (
                <tr key={cable.id} className={selected ? 'selected' : undefined}>
                  <td title={issues.map(issueText).join('\n')}>{severity ? SEVERITY_ICONS[severity] : ''}</td>
                  <td>
                    <button className="link-button" onClick={() => select({ kind: 'cable', id: cable.id })}>
                      {cable.label}
                    </button>
                  </td>
                  <td>{from}</td>
                  <td>{to}</td>
                  <td>
                    <CommitInput
                      value={cable.cableType ?? ''}
                      onCommit={(v) => update(cable.id, { cableType: v || undefined })}
                    />
                  </td>
                  <td>
                    <CommitInput
                      className="narrow"
                      inputMode="decimal"
                      value={cable.lengthM?.toString() ?? ''}
                      onCommit={(v) => {
                        const n = parseFloat(v.replace(',', '.'));
                        update(cable.id, { lengthM: Number.isFinite(n) ? n : undefined });
                      }}
                    />
                  </td>
                  <td>
                    <CommitInput value={cable.note ?? ''} onCommit={(v) => update(cable.id, { note: v || undefined })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
