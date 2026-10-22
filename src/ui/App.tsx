import { ReactFlowProvider, useReactFlow, type Node, type XYPosition } from '@xyflow/react';
import { useEffect, useState } from 'react';
import type { DeviceTemplate } from '../core/model';
import { addSetup, freeAreaBelow, type SetupPreset } from '../core/setups';
import { addDevice, createProject, setContainer, FILE_EXTENSION, parseProject, ProjectParseError, serializeProject } from '../core/project';
import { t, type MessageKey } from '../i18n';
import { openTextFile, saveTextFile } from '../platform/files';
import { useAnalysis } from '../store/analysis';
import { useProjectStore } from '../store/projectStore';
import { AddDeviceDialog } from './AddDeviceDialog';
import { CableTable } from './CableTable';
import { ChecksList } from './ChecksList';
import { GraphView } from './GraphView';
import { Inspector } from './Inspector';
import { deleteSelection } from './actions';

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
  const [confirmingNew, setConfirmingNew] = useState(false);
  const [ownMessage, setMessage] = useState<string | null>(null);
  const notice = useProjectStore((s) => s.notice);
  const look = useProjectStore((s) => s.look);
  const message = ownMessage ?? notice;
  // Short notices from automatic actions disappear by themselves.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => useProjectStore.getState().setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  const [moreOpen, setMoreOpen] = useState(false);
  const project = useProjectStore((s) => s.project);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const canDelete = useProjectStore((s) => s.selection?.kind === 'device' || s.selection?.kind === 'cable');
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
    const boardId = useProjectStore.getState().openBoardId;
    apply((p) => {
      const r = addDevice(p, template, name, findFreeSpot(flow.getNodes(), center));
      createdId = r.device.id;
      // Inside an open board, new devices go onto that board.
      return boardId && template.category !== 'pedalboard' ? setContainer(r.project, r.device.id, boardId) : r.project;
    });
    setAdding(false);
    setView('graph');
    // Adding a power device only makes sense with the power layer visible.
    if (template.category === 'power') useProjectStore.getState().setShowPower(true);
    select({ kind: 'device', id: createdId });
  };

  /** Adds a ready-made rig below the existing devices (always on the main level). */
  const addSetupPreset = (setup: SetupPreset) => {
    const name = t(`setup.${setup.key}` as MessageKey);
    apply((p) => addSetup(p, setup, name, freeAreaBelow(p)).project);
    const { openBoard, setFocusGroup } = useProjectStore.getState();
    openBoard(null);
    setFocusGroup(null);
    setAdding(false);
    setView('graph');
    setTimeout(() => flow.fitView({ padding: 0.15, duration: 400 }), 120);
  };

  const openFile = async () => {
    let text: string | null;
    try {
      text = await openTextFile(`${FILE_EXTENSION},.json,application/json`);
    } catch {
      setMessage(t('file.error.read'));
      return;
    }
    if (text === null) return;
    try {
      replaceProject(parseProject(text));
      setTimeout(() => flow.fitView(), 50);
    } catch (e) {
      const key = e instanceof ProjectParseError ? e.message : 'notJson';
      setMessage(t(`file.error.${key}` as MessageKey));
    }
  };

  const fileName = (project.name || 'project').replace(/[^\w\- ]+/g, '_') + FILE_EXTENSION;
  const saveFile = async () => {
    try {
      if (await saveTextFile(fileName, serializeProject(project))) setMessage(t('file.saved'));
    } catch {
      setMessage(t('file.error.write'));
    }
  };
  /** Closes the "more" menu, then runs the menu entry's action. */
  const fromMenu = (action: () => void) => () => {
    setMoreOpen(false);
    action();
  };

  return (
    <div className="app" data-look={look}>
      <header className="toolbar">
        <div className="toolbar__title">
          {t('app.title')} <span className="tag">{t('app.prototype')}</span>
        </div>
        <div className="toolbar__group">
          <button className="primary" onClick={() => setAdding(true)} aria-label={t('toolbar.addDevice')}>
            +<span className="wide-only"> {t('toolbar.addDevice')}</span>
          </button>
          <button className="icon-button" onClick={undo} disabled={!canUndo} aria-label={t('toolbar.undo')} title={t('toolbar.undo')}>
            ↶
          </button>
          <button className="icon-button" onClick={redo} disabled={!canRedo} aria-label={t('toolbar.redo')} title={t('toolbar.redo')}>
            ↷
          </button>
          <button
            className="icon-button"
            onClick={deleteSelection}
            disabled={!canDelete}
            aria-label={t('toolbar.delete')}
            title={t('toolbar.delete')}
          >
            <svg width="18" height="18" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 3.5h10M5.5 3.5V2h3v1.5M3.5 3.5l.6 8.5h5.8l.6-8.5M6 6v4M8 6v4" />
            </svg>
          </button>
        </div>
        <div className="toolbar__group wide-only">
          <button onClick={() => setConfirmingNew(true)}>{t('toolbar.new')}</button>
          <button onClick={openFile}>{t('toolbar.open')}</button>
          <button onClick={saveFile}>{t('toolbar.save')}</button>
        </div>
        <div className="toolbar__more narrow-only">
          <button className="icon-button" aria-label={t('toolbar.more')} aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
            ⋯
          </button>
          {moreOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMoreOpen(false)} />
              <div className="menu" role="menu">
                <button role="menuitem" onClick={fromMenu(() => setConfirmingNew(true))}>
                  {t('toolbar.new')}
                </button>
                <button role="menuitem" onClick={fromMenu(openFile)}>
                  {t('toolbar.open')}
                </button>
                <button role="menuitem" onClick={fromMenu(saveFile)}>
                  {t('toolbar.save')}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <nav className="segmented view-switch" aria-label={t('view.graph')}>
        {(['graph', 'cables', 'checks'] as const).map((v) => (
          <button key={v} className={view === v ? 'active' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>
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

      {message && (
        <div className="toast" role="alert">
          <span>{message}</span>
          <button
            className="icon-button"
            onClick={() => {
              setMessage(null);
              useProjectStore.getState().setNotice(null);
            }}
            aria-label={t('inspector.close')}
          >
            ✕
          </button>
        </div>
      )}
      {confirmingNew && (
        <ConfirmDialog
          text={t('toolbar.confirmNew')}
          confirmLabel={t('toolbar.new')}
          onConfirm={() => {
            replaceProject(createProject());
            setConfirmingNew(false);
          }}
          onCancel={() => setConfirmingNew(false)}
        />
      )}
      {adding && <AddDeviceDialog onAdd={addTemplate} onAddSetup={addSetupPreset} onClose={() => setAdding(false)} />}
    </div>
  );
}

function ConfirmDialog(props: { text: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-backdrop" onClick={props.onCancel}>
      <div className="modal modal--small" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal__body">
          <p>{props.text}</p>
          <div className="button-row">
            <button onClick={props.onCancel}>{t('add.cancel')}</button>
            <button className="primary" onClick={props.onConfirm}>
              {props.confirmLabel}
            </button>
          </div>
        </div>
      </div>
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
