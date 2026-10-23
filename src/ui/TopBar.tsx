import { useState } from 'react';
import { t } from '../i18n';
import { useAnalysis } from '../store/analysis';
import { useProjectStore } from '../store/projectStore';
import { deleteSelection } from './actions';
import { useDiagramActions } from './diagramActions';
import { ChainIcon, ChecksIcon, CutterIcon, Menu, MenuItem, SuggestIcon, TidyIcon } from './menus';

export type View = 'graph' | 'rack' | 'cables' | 'checks';

type MenuId = 'file' | 'tools' | 'helper' | 'view' | 'more';

/**
 * The one bar at the top of the screen: menus (File, Tools, Helper, View),
 * the views (Diagram, Rack, Cables), undo/redo/delete and "Add device".
 * On phones the views move to a tab bar at the bottom and File, redo and
 * delete go into the "⋯" menu.
 */
export function TopBar(props: {
  view: View;
  setView: (v: View) => void;
  onAdd: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState<MenuId | null>(null);
  const project = useProjectStore((s) => s.project);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const canDelete = useProjectStore((s) => s.selection?.kind === 'device' || s.selection?.kind === 'cable');
  const tool = useProjectStore((s) => s.tool);
  const setTool = useProjectStore((s) => s.setTool);
  const look = useProjectStore((s) => s.look);
  const setLook = useProjectStore((s) => s.setLook);
  const cableStyle = useProjectStore((s) => s.cableStyle);
  const setCableStyle = useProjectStore((s) => s.setCableStyle);
  const dimUnused = useProjectStore((s) => s.dimUnusedPorts);
  const setDimUnused = useProjectStore((s) => s.setDimUnusedPorts);
  const showControls = useProjectStore((s) => s.showControls);
  const setShowControls = useProjectStore((s) => s.setShowControls);
  const { undo, redo } = useProjectStore.getState();
  const { issues } = useAnalysis();
  const { tidyUp, suggest } = useDiagramActions();
  const hasDevices = project.devices.length > 1;
  const hasCables = project.cables.length > 0;

  /** Tools and helpers work in the diagram, so switch to it first. */
  const inDiagram = (action: () => void) => () => {
    props.setView('graph');
    action();
  };
  const startTool = (which: 'chain' | 'cut') => inDiagram(() => setTool(which));

  const fileItems = (
    <>
      <MenuItem label={t('toolbar.new')} onClick={props.onNew} />
      <MenuItem label={t('toolbar.open')} onClick={props.onOpen} />
      <MenuItem label={t('toolbar.save')} onClick={props.onSave} />
    </>
  );

  return (
    <header className="topbar">
      <div className="topbar__brand wide-only">
        {t('app.title')} <span className="tag">{t('app.prototype')}</span>
      </div>

      <button className="primary topbar__add" onClick={props.onAdd} aria-label={t('toolbar.addDevice')}>
        +<span className="wide-only"> {t('toolbar.addDevice')}</span>
      </button>

      <nav className="topbar__menus">
        <Menu id="file" label={t('menu.file')} open={open} setOpen={setOpen} className="wide-only">
          {fileItems}
        </Menu>

        {tool ? (
          // While a tool is active it shows here; one tap ends it.
          <button className="topbar__active-tool" onClick={() => setTool(null)} title={t('tool.end')}>
            {tool === 'chain' ? <ChainIcon /> : <CutterIcon />}
            <span className="wide-only">{t(tool === 'chain' ? 'tool.chain' : 'tool.cutter')}</span>
            <span aria-hidden="true">✕</span>
            <span className="visually-hidden">{t('tool.end')}</span>
          </button>
        ) : (
          <Menu id="tools" label={t('menu.tools')} open={open} setOpen={setOpen}>
            <MenuItem icon={<ChainIcon />} label={t('tool.chain')} hint={t('tool.chainShort')} disabled={!hasDevices} onClick={startTool('chain')} />
            <MenuItem icon={<CutterIcon />} label={t('tool.cutter')} hint={t('tool.cutterShort')} disabled={!hasCables} onClick={startTool('cut')} />
          </Menu>
        )}

        <Menu id="helper" label={t('menu.helper')} open={open} setOpen={setOpen}>
          <MenuItem icon={<TidyIcon />} label={t('view.tidy')} hint={t('view.tidyShort')} disabled={!hasDevices} onClick={inDiagram(tidyUp)} />
          <MenuItem icon={<SuggestIcon />} label={t('tool.suggest')} hint={t('tool.suggestShort')} disabled={!hasDevices} onClick={inDiagram(suggest)} />
          <MenuItem
            icon={<ChecksIcon />}
            label={t('view.checks', { count: issues.length })}
            hint={t('menu.checksShort')}
            onClick={() => props.setView('checks')}
          />
        </Menu>

        <Menu id="view" label={t('view.options')} open={open} setOpen={setOpen}>
          <div className="segmented segmented--small" role="group" aria-label={t('view.look')}>
            <button className={look === 'modular' ? 'active' : ''} onClick={() => setLook('modular')}>
              {t('view.lookModular')}
            </button>
            <button className={look === 'clean' ? 'active' : ''} onClick={() => setLook('clean')}>
              {t('view.lookClean')}
            </button>
          </div>
          <div className="segmented segmented--small" role="group" aria-label={t('view.cableStyle')}>
            <button className={cableStyle === 'orthogonal' ? 'active' : ''} onClick={() => setCableStyle('orthogonal')}>
              {t('view.cablesOrthogonal')}
            </button>
            <button className={cableStyle === 'curved' ? 'active' : ''} onClick={() => setCableStyle('curved')}>
              {t('view.cablesCurved')}
            </button>
            <button className={cableStyle === 'hanging' ? 'active' : ''} onClick={() => setCableStyle('hanging')}>
              {t('view.cablesHanging')}
            </button>
          </div>
          <button className={'toggle' + (dimUnused ? ' active' : '')} aria-pressed={dimUnused} onClick={() => setDimUnused(!dimUnused)}>
            {t('view.dimUnused')}
          </button>
          <button className={'toggle' + (showControls ? ' active' : '')} aria-pressed={showControls} onClick={() => setShowControls(!showControls)}>
            {t('view.showControls')}
          </button>
        </Menu>
      </nav>

      <div className="segmented topbar__views wide-only" role="tablist" aria-label={t('view.graph')}>
        {(['graph', 'rack', 'cables'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={props.view === v} className={props.view === v ? 'active' : ''} onClick={() => props.setView(v)}>
            {t(`view.${v}`)}
          </button>
        ))}
      </div>

      <div className="topbar__actions">
        <button className="icon-button" onClick={undo} disabled={!canUndo} aria-label={t('toolbar.undo')} title={t('toolbar.undo')}>
          ↶
        </button>
        <button className="icon-button wide-only" onClick={redo} disabled={!canRedo} aria-label={t('toolbar.redo')} title={t('toolbar.redo')}>
          ↷
        </button>
        <button className="icon-button wide-only" onClick={deleteSelection} disabled={!canDelete} aria-label={t('toolbar.delete')} title={t('toolbar.delete')}>
          <TrashIcon />
        </button>
        <Menu id="more" label="⋯" ariaLabel={t('toolbar.more')} open={open} setOpen={setOpen} className="narrow-only">
          {fileItems}
          <MenuItem label={t('toolbar.redo')} disabled={!canRedo} onClick={redo} />
          <MenuItem label={t('toolbar.delete')} disabled={!canDelete} onClick={deleteSelection} />
        </Menu>
      </div>

      {open && <div className="menu-backdrop" onClick={() => setOpen(null)} />}
    </header>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M2 3.5h10M5.5 3.5V2h3v1.5M3.5 3.5l.6 8.5h5.8l.6-8.5M6 6v4M8 6v4" />
    </svg>
  );
}
