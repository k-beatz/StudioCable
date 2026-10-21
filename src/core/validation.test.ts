import { describe, expect, it } from 'vitest';
import { buildTemplate, type GenericSpec } from './generic';
import type { DeviceTemplate, Project } from './model';
import { addCable, addDevice, createProject } from './project';
import { checkProject, worstSeverity } from './validation';

function device(groups: GenericSpec['groups']): DeviceTemplate {
  return buildTemplate({ manufacturer: 'Test', model: 'Test', category: 'other', groups });
}

const micOut = device([{ count: 1, label: 'Out', direction: 'out', connectors: [{ type: 'xlr', gender: 'male' }], signal: 'mic' }]);
const micIn = device([{ count: 1, label: 'In', direction: 'in', connectors: [{ type: 'xlr', gender: 'female' }], signal: 'mic' }]);
const lineIn = device([{ count: 1, label: 'In', direction: 'in', connectors: [{ type: 'xlr', gender: 'female' }], signal: 'line-bal' }]);
const lineOutTrs = device([{ count: 1, label: 'Out', direction: 'out', connectors: [{ type: 'trs-6.3', gender: 'female' }], signal: 'line-bal' }]);
const speakerOut = device([{ count: 1, label: 'Spk', direction: 'out', connectors: [{ type: 'speakon', gender: 'female' }], signal: 'speaker' }]);
const midiIn = device([{ count: 1, label: 'MIDI', direction: 'in', connectors: [{ type: 'midi-din', gender: 'female' }], signal: 'midi' }]);

/** Builds a project with two devices connected by one cable (port 0 to port 0). */
function connect(a: DeviceTemplate, b: DeviceTemplate): Project {
  let p = createProject();
  const ra = addDevice(p, a, 'A', { x: 0, y: 0 });
  const rb = addDevice(ra.project, b, 'B', { x: 0, y: 0 });
  p = addCable(
    rb.project,
    { deviceId: ra.device.id, portId: a.ports[0].id },
    { deviceId: rb.device.id, portId: b.ports[0].id },
  ).project;
  return p;
}

const codes = (p: Project) => checkProject(p).map((i) => i.code);

describe('checkProject', () => {
  it('accepts a matching mic connection without issues', () => {
    expect(checkProject(connect(micOut, micIn))).toEqual([]);
  });

  it('flags output to output', () => {
    expect(codes(connect(micOut, micOut))).toContain('sameDirection');
  });

  it('flags input to input', () => {
    expect(codes(connect(micIn, lineIn))).toContain('sameDirection');
  });

  it('gives only a hint for mic into line input', () => {
    const issues = checkProject(connect(micOut, lineIn));
    expect(issues.map((i) => i.code)).toEqual(['micIntoLine']);
    expect(worstSeverity(issues)).toBe('info');
  });

  it('treats speaker level into a line input as an error', () => {
    const issues = checkProject(connect(speakerOut, lineIn));
    expect(issues.map((i) => i.code)).toContain('speakerIntoNonSpeaker');
    expect(worstSeverity(issues)).toBe('error');
  });

  it('detects the direction regardless of drag order', () => {
    // Cable drawn from the input to the mic: still mic -> line.
    expect(codes(connect(lineIn, micOut))).toEqual(['micIntoLine']);
  });

  it('flags incompatible signal families', () => {
    expect(codes(connect(lineOutTrs, midiIn))).toContain('incompatibleSignal');
  });

  it('suggests an adapter cable when connectors differ', () => {
    const issues = checkProject(connect(lineOutTrs, lineIn));
    expect(issues).toEqual([
      expect.objectContaining({ code: 'connectorMismatch', params: { a: 'trs-6.3', b: 'xlr' } }),
    ]);
  });

  it('accepts a combo jack for either connector', () => {
    const comboIn = device([
      {
        count: 1,
        label: 'In',
        direction: 'in',
        connectors: [
          { type: 'xlr', gender: 'female' },
          { type: 'trs-6.3', gender: 'female' },
        ],
        signal: 'line-bal',
      },
    ]);
    expect(checkProject(connect(lineOutTrs, comboIn))).toEqual([]);
  });

  it('accepts line level into an input that also takes line (combo jack)', () => {
    const comboMicIn = device([
      { count: 1, label: 'In', direction: 'in', connectors: [{ type: 'xlr', gender: 'female' }], signal: 'mic', alsoAccepts: ['line-bal'] },
    ]);
    const lineOutXlr = device([
      { count: 1, label: 'Out', direction: 'out', connectors: [{ type: 'xlr', gender: 'male' }], signal: 'line-bal' },
    ]);
    expect(checkProject(connect(lineOutXlr, comboMicIn))).toEqual([]);
  });

  it('warns when a port has more than one cable', () => {
    let p = connect(micOut, micIn);
    const [a, b] = p.devices;
    p = addCable(
      p,
      { deviceId: a.id, portId: micOut.ports[0].id },
      { deviceId: b.id, portId: micIn.ports[0].id },
    ).project;
    expect(codes(p).filter((c) => c === 'portOccupied').length).toBeGreaterThan(0);
  });
});
