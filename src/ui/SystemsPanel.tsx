import { addGroup } from '../core/project';
import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';

/** Chips for all systems: tap to highlight (and edit in the side panel), + to add one. */
export function SystemsPanel() {
  const groups = useProjectStore((s) => s.project.groups);
  const focusGroupId = useProjectStore((s) => s.focusGroupId);
  const setFocusGroup = useProjectStore((s) => s.setFocusGroup);
  const select = useProjectStore((s) => s.select);
  const apply = useProjectStore((s) => s.apply);

  const create = () => {
    let id = '';
    apply((p) => {
      const r = addGroup(p, t('systems.defaultName', { n: p.groups.length + 1 }));
      id = r.group.id;
      return r.project;
    });
    setFocusGroup(id);
    select({ kind: 'group', id });
  };

  return (
    <div className="systems-panel" aria-label={t('systems.title')}>
      <span className="systems-panel__title">{t('systems.title')}</span>
      {groups.map((g) => {
        const active = g.id === focusGroupId;
        return (
          <button
            key={g.id}
            className={'system-chip' + (active ? ' active' : '')}
            style={{ borderColor: g.color }}
            aria-pressed={active}
            onClick={() => {
              setFocusGroup(active ? null : g.id);
              select(active ? null : { kind: 'group', id: g.id });
            }}
          >
            <span className="system-chip__dot" style={{ background: g.color }} />
            {g.name}
          </button>
        );
      })}
      <button className="system-chip system-chip--add" onClick={create} aria-label={t('systems.add')} title={t('systems.emptyHint')}>
        +
      </button>
    </div>
  );
}
