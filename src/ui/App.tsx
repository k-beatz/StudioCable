import { ReactFlowProvider, useReactFlow, type Node, type XYPosition } from '@xyflow/react';
import { useEffect, useState } from 'react';
import type { DeviceTemplate } from '../core/model';
import { addDevice, createProject, FILE_EXTENSION, parseProject, ProjectParseError, serializeProject } from '../core/project';
import { t, type MessageKey } from '../i18n';
import { openTextFile, saveTextFile } from '../platform/files';
import { useAnalysis } from '../store/analysis';
import { useProjectStore } from '../store/projectStore';
import { AddDeviceDialog } from './AddDeviceDialog';
import { CableTable } from './CableTable';
import { ChecksList } from './ChecksList';
import { GraphView } from './GraphView';
import { Inspector } from './Inspector';

type View = 'graph' | 'cables' | 'checks';

export function App() {
  return (
    <ReactFlowProvider>
      <Shell />
    </ReactFlowProvider>
  );
}

function Shell() {
  const [view, setView] = useState<View>('graph');
  const [adding, setAdding] = useState(false);
  const project = useProjectStore((s) => s.project);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const { apply, undo, redo, select, replaceProject } = useProjectStore.getState();
  const { issues } = useAnalysis();
  const flow = useReactFlow();

  useUndoShortcuts();

  const addTemplate = (template: DeviceTemplate) => {
    const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const sameModel = project.devices.filter(
      (d) => project.templates[d.templateId]?.model === template.model,
    ).length;
    const name = template.model + (sameModel ? ` ${sameModel + 1}` : '');
    let createdId = '';
    apply((p) => {
      const r = addDevice(p, template, name, findFreeSpot(flow.getNodes(), center));
      createdId = r.device.id;
      return r.project;
    });
    setAdding(false);
    setView('graph');
    select({ kind: 'device', id: createdId });
  };

  const openFile = async () => {
    const text = await openTextFile(`${FILE_EXTENSION},.json,application/json`);
    if (text === null) return;
    try {
      replaceProject(parseProject(text));
      setTimeout(() => flow.fitView(), 50);
    } catch (e) {
      const key = e instanceof ProjectParseError ? e.message : 'notJson';
      alert(t(`file.error.${key}` as MessageKey));
    }
  };

  const fileName = (project.name || 'project').replace(/[^\w\- ]+/g, '_') + FILE_EXTENSION;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar__title">
          {t('app.title')} <span className="tag">{t('app.prototype')}</span>
        </div>
        <div className="toolbar__group">
          <button className="primary" onClick={() => setAdding(true)}>
            + {t('toolbar.addDevice')}
          </button>
          <button onClick={undo} disabled={!canUndo} aria-label={t('toolbar.undo')} title={t('toolbar.undo')}>
            ↶
          </button>
          <button onClick={redo} disabled={!canRedo} aria-label={t('toolbar.redo')} title={t('toolbar.redo')}>
            ↷
          </button>
        </div>
        <div className="toolbar__group">
          <button
            onClick={() => {
              if (confirm(t('toolbar.confirmNew'))) replaceProject(createProject());
            }}
          >
            {t('toolbar.new')}
          </button>
          <button onClick={openFile}>{t('toolbar.open')}</button>
          <button onClick={() => saveTextFile(fileName, serializeProject(project))}>{t('toolbar.save')}</button>
        </div>
      </header>

      <nav className="segmented view-switch">
        {(['graph', 'cables', 'checks'] as const).map((v) => (
          <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {t(`view.${v}`, { count: issues.length })}
          </button>
        ))}
      </nav>

      <main className="workspace">
        <div className="workspace__main">
          {view === 'graph' && (
            <>
              <GraphView />
              {project.devices.length === 0 && (
                <div className="empty-state">
                  <h2>{t('empty.title')}</h2>
                  <p>{t('empty.text')}</p>
                  <button className="primary" onClick={() => setAdding(true)}>
                    + {t('toolbar.addDevice')}
                  </button>
                </div>
              )}
            </>
          )}
          {view === 'cables' && <CableTable />}
          {view === 'checks' && <ChecksList />}
        </div>
        <Inspector />
      </main>

      {adding && <AddDeviceDialog onAdd={addTemplate} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Finds a spot near `near` that doesn't overlap existing nodes (new device ~260x220). */
function findFreeSpot(nodes: Node[], near: XYPosition): XYPosition {
  const w = 260;
  const h = 220;
  const overlaps = (x: number, y: number) =>
    nodes.some((n) => {
      const nw = n.measured?.width ?? w;
      const nh = n.measured?.height ?? h;
      return x < n.position.x + nw + 20 && x + w + 20 > n.position.x && y < n.position.y + nh + 20 && y + h + 20 > n.position.y;
    });
  const start = { x: Math.round(near.x - w / 2), y: Math.round(near.y - h / 2) };
  // Walk outwards in rings around the start position.
  for (let ring = 0; ring < 12; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = start.x + dx * (w + 40);
        const y = start.y + dy * (h / 2);
        if (!overlaps(x, y)) return { x, y };
      }
    }
  }
  return start;
}

function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useProjectStore.getState().undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        useProjectStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
