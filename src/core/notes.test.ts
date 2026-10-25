import { describe, expect, it } from 'vitest';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import { addNote, notesFor, removeNote, updateNote } from './notes';
import { addCable, addDevice, createProject, parseProject, removeCable, removeDevice, serializeProject } from './project';

const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);

function setup() {
  let p = createProject();
  const mic = addDevice(p, preset('dynamicMic'), 'Mic', { x: 0, y: 0 });
  p = mic.project;
  const iface = addDevice(p, preset('interface2x2'), 'Interface', { x: 300, y: 0 });
  p = iface.project;
  const t = (id: string) => p.templates[p.devices.find((d) => d.id === id)!.templateId];
  const c = addCable(p, { deviceId: mic.device.id, portId: t(mic.device.id).ports[0].id }, { deviceId: iface.device.id, portId: t(iface.device.id).ports[0].id });
  return { p: c.project, mic: mic.device.id, iface: iface.device.id, cable: c.cable.id };
}

describe('sticky notes', () => {
  it('add, edit and remove a note', () => {
    const s = setup();
    let { project, note } = addNote(s.p, { kind: 'device', id: s.iface }, 'Gain at 2 o\'clock');
    expect(notesFor(project, 'device', s.iface).map((n) => n.text)).toEqual(["Gain at 2 o'clock"]);
    project = updateNote(project, note.id, { text: 'Gain at 3', color: '#91d5ff' });
    expect(notesFor(project, 'device', s.iface)[0]).toMatchObject({ text: 'Gain at 3', color: '#91d5ff' });
    expect(notesFor(removeNote(project, note.id), 'device', s.iface)).toEqual([]);
  });

  it('notes go away with their device or cable, and survive save/open', () => {
    const s = setup();
    let p = addNote(s.p, { kind: 'cable', id: s.cable }, 'Red XLR, 5 m').project;
    p = addNote(p, { kind: 'device', id: s.mic }, 'Spare in the case').project;
    expect(parseProject(serializeProject(p)).notes).toHaveLength(2);
    expect(removeCable(p, s.cable).notes?.map((n) => n.text)).toEqual(['Spare in the case']);
    // Removing the mic also removes its cable, and both notes.
    expect(removeDevice(p, s.mic).notes).toEqual([]);
  });
});
