import { newId } from './ids';
import { NOTE_COLORS, type Note, type Project } from './model';

/** Sticky notes ("post-its") on devices and cables. Pure functions. */

export function addNote(project: Project, target: Note['target'], text = '', color: string = NOTE_COLORS[0]): { project: Project; note: Note } {
  const note: Note = { id: newId('n-'), text, color, target };
  return { note, project: { ...project, notes: [...(project.notes ?? []), note] } };
}

export function updateNote(project: Project, id: string, patch: Partial<Pick<Note, 'text' | 'color'>>): Project {
  return { ...project, notes: (project.notes ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

export function removeNote(project: Project, id: string): Project {
  return { ...project, notes: (project.notes ?? []).filter((n) => n.id !== id) };
}

export function notesFor(project: Project, kind: Note['target']['kind'], id: string): Note[] {
  return (project.notes ?? []).filter((n) => n.target.kind === kind && n.target.id === id);
}
