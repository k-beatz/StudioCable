import { describe, expect, it } from 'vitest';
import { buildTemplate, GENERIC_PRESETS } from './generic';
import { addCable, addDevice, createProject, parseProject, removeDevice, serializeProject } from './project';

const preset = (key: string) => buildTemplate(GENERIC_PRESETS.find((p) => p.key === key)!.spec);

describe('project operations', () => {
  it('assigns sequential cable labels that are not reused', () => {
    let p = createProject();
    const mic = addDevice(p, preset('dynamicMic'), 'Mic', { x: 0, y: 0 });
    const pre = addDevice(mic.project, preset('preamp2'), 'Pre', { x: 0, y: 0 });
    p = pre.project;
    const micPort = p.templates[mic.device.templateId].ports[0].id;
    const prePorts = p.templates[pre.device.templateId].ports;

    const c1 = addCable(p, { deviceId: mic.device.id, portId: micPort }, { deviceId: pre.device.id, portId: prePorts[0].id });
    const c2 = addCable(c1.project, { deviceId: mic.device.id, portId: micPort }, { deviceId: pre.device.id, portId: prePorts[1].id });
    expect(c1.cable.label).toBe('C-001');
    expect(c2.cable.label).toBe('C-002');

    // Deleting a device removes its cables; numbering continues.
    p = removeDevice(c2.project, mic.device.id);
    expect(p.cables).toHaveLength(0);
    expect(p.templates[mic.device.templateId]).toBeUndefined();
    expect(p.nextCableNumber).toBe(3);
  });

  it('builds numbered ports and internal routing from presets', () => {
    const t = preset('preamp2');
    expect(t.ports.map((p) => p.label)).toEqual(['Mic In 1', 'Mic In 2', 'Out 1', 'Out 2']);
    expect(t.routing).toHaveLength(2);
    expect(t.routing![0]).toEqual({ from: t.ports[0].id, to: t.ports[2].id });
  });

  it('round-trips through the file format', () => {
    const p = addDevice(createProject('Studio A'), preset('activeMonitor'), 'Monitor L', { x: 1, y: 2 }).project;
    expect(parseProject(serializeProject(p))).toEqual(p);
  });

  it('rejects files that are not projects or too new', () => {
    expect(() => parseProject('nope')).toThrow('notJson');
    expect(() => parseProject('{"a":1}')).toThrow('notProject');
    expect(() => parseProject('{"format":"studiocable-project","schemaVersion":999}')).toThrow('tooNew');
  });
});
