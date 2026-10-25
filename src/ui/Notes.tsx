import { Panel } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { addNote, removeNote, updateNote } from '../core/notes';
import { NOTE_COLORS, type Note } from '../core/model';
import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';

/**
 * Sticky notes ("post-its"). A pad sits in the corner of the diagram; drag a
 * note off it and drop it onto a device or a cable. The note sticks to that
 * element, moves with it and goes away with it.
 */

type Target = Note['target'];

/** The device or cable under a screen point (looks through the dragged note). */
function targetAt(x: number, y: number): Target | null {
  const { project } = useProjectStore.getState();
  const node = document
    .elementsFromPoint(x, y)
    .map((el) => el.closest('.react-flow__node')?.getAttribute('data-id'))
    .find((id) => id && project.devices.some((d) => d.id === id));
  if (node) return { kind: 'device', id: node };
  // Cables are thin: also look a little around the point, as the cable cutter does.
  const r = 12;
  for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const cable = document
      .elementsFromPoint(x + dx, y + dy)
      .map((el) => el.closest('.react-flow__edge')?.getAttribute('data-id'))
      .find((id) => id && project.cables.some((c) => c.id === id));
    if (cable) return { kind: 'cable', id: cable };
  }
  return null;
}

/** Notes of one device or cable (selects the stable notes array, filters outside the store). */
function useNotes(kind: Target['kind'], id: string): Note[] {
  const all = useProjectStore((s) => s.project.notes);
  return useMemo(() => (all ?? []).filter((n) => n.target.kind === kind && n.target.id === id), [all, kind, id]);
}

/** Marks the device or cable a dragged note is over (straight on the DOM: it changes on every move). */
let marked: Element | null = null;
function markTarget(target: Target | null) {
  const el = target
    ? document.querySelector(`.react-flow__${target.kind === 'device' ? 'node' : 'edge'}[data-id="${CSS.escape(target.id)}"]`)
    : null;
  if (el === marked) return;
  marked?.classList.remove('note-target');
  el?.classList.add('note-target');
  marked = el;
}

/** The pad in the bottom-right corner of the diagram. */
export function NotePad() {
  const [drag, setDrag] = useState<{ x: number; y: number; over: Target | null } | null>(null);
  const moved = useRef(false);

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    moved.current = false;
    setDrag({ x: e.clientX, y: e.clientY, over: null });
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    moved.current = true;
    const over = targetAt(e.clientX, e.clientY);
    markTarget(over);
    setDrag({ x: e.clientX, y: e.clientY, over });
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const target = moved.current ? targetAt(e.clientX, e.clientY) : null;
    markTarget(null);
    setDrag(null);
    const { apply, setEditingNote, setNotice } = useProjectStore.getState();
    if (!target) {
      setNotice(t('notes.dropHint'));
      return;
    }
    let id = '';
    apply((p) => {
      const r = addNote(p, target);
      id = r.note.id;
      return r.project;
    });
    setEditingNote(id);
  };

  return (
    <Panel position="bottom-right" className="note-pad-panel">
      <button
        className={'note-pad' + (drag ? ' note-pad--dragging' : '')}
        aria-label={t('notes.pad')}
        title={t('notes.dropHint')}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          markTarget(null);
          setDrag(null);
        }}
      >
        <span className="note-pad__sheet" />
        <span className="note-pad__sheet" />
        <span className="note-pad__sheet note-pad__top">{t('notes.padLabel')}</span>
      </button>
      {drag &&
        moved.current &&
        createPortal(
          <div className={'note-ghost' + (drag.over ? ' note-ghost--over' : '')} style={{ left: drag.x, top: drag.y }} aria-hidden="true" />,
          document.body,
        )}
    </Panel>
  );
}

/** Notes stuck to a device: small sheets on the top-right corner of its block. */
export function DeviceNotes({ deviceId }: { deviceId: string }) {
  const notes = useNotes('device', deviceId);
  const show = useProjectStore((s) => s.showNotes);
  const edit = useProjectStore((s) => s.setEditingNote);
  if (!show || notes.length === 0) return null;
  return (
    <div className="device-notes nodrag nopan">
      {notes.map((n) => (
        <button
          key={n.id}
          className="sticky-note"
          style={{ background: n.color }}
          onClick={(e) => {
            e.stopPropagation();
            edit(n.id);
          }}
        >
          {n.text || t('notes.empty')}
        </button>
      ))}
    </div>
  );
}

/** Notes on a cable, drawn in SVG next to its label point. */
export function CableNoteMarks({ cableId, x, y }: { cableId: string; x: number; y: number }) {
  const notes = useNotes('cable', cableId);
  const show = useProjectStore((s) => s.showNotes);
  const edit = useProjectStore((s) => s.setEditingNote);
  if (!show || notes.length === 0) return null;
  return (
    <g className="cable-notes" transform={`translate(${x} ${y})`}>
      {notes.map((n, i) => {
        const text = n.text || t('notes.empty');
        const short = text.length > 22 ? text.slice(0, 21) + '…' : text;
        const w = Math.max(44, short.length * 6.2 + 16);
        return (
          <g
            key={n.id}
            className="cable-note"
            transform={`translate(14 ${-34 - i * 30}) rotate(-3)`}
            onClick={(e) => {
              e.stopPropagation();
              edit(n.id);
            }}
          >
            <title>{text}</title>
            <rect width={w} height={24} rx={2} fill={n.color} />
            <text x={8} y={16}>
              {short}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Small dialog to write, recolour or remove a note. Typing happens only here. */
export function NoteEditor() {
  const id = useProjectStore((s) => s.editingNoteId);
  const note = useProjectStore((s) => s.project.notes?.find((n) => n.id === id));
  const close = () => useProjectStore.getState().setEditingNote(null);
  const [text, setText] = useState('');
  useEffect(() => setText(note?.text ?? ''), [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!note) return null;

  const apply = useProjectStore.getState().apply;
  const commit = () => {
    if (text !== note.text) apply((p) => updateNote(p, note.id, { text }));
  };
  const done = () => {
    commit();
    close();
  };

  return (
    <div className="modal-backdrop note-editor-backdrop" onClick={done}>
      <div className="note-editor" role="dialog" aria-label={t('notes.edit')} style={{ background: note.color }} onClick={(e) => e.stopPropagation()}>
        <textarea
          value={text}
          autoFocus
          placeholder={t('notes.placeholder')}
          aria-label={t('notes.edit')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') done();
          }}
        />
        <div className="note-editor__row">
          <div className="note-editor__colors" role="group" aria-label={t('notes.color')}>
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                className={'note-swatch' + (c === note.color ? ' active' : '')}
                style={{ background: c }}
                aria-label={c}
                aria-pressed={c === note.color}
                onClick={() => apply((p) => updateNote(p, note.id, { color: c }))}
              />
            ))}
          </div>
          <button
            className="note-editor__delete"
            onClick={() => {
              apply((p) => removeNote(p, note.id));
              close();
            }}
          >
            {t('notes.delete')}
          </button>
          <button className="note-editor__done" onClick={done}>
            {t('notes.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
