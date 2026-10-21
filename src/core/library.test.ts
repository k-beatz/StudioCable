import { describe, expect, it } from 'vitest';
import { LIBRARY } from '../library';
import { libraryToTemplate, matchesQuery, validateLibraryDevice, type LibraryDevice } from './library';

const sample: LibraryDevice = {
  format: 'studiocable-device',
  schemaVersion: 1,
  id: 'test-mixer',
  manufacturer: 'Test',
  model: 'Mixer 4',
  category: 'mixer',
  status: 'unverified',
  sources: [{ title: 'Manual', url: 'https://example.com/manual.pdf' }],
  groups: [
    { count: 2, label: 'Mic In', direction: 'in', connectors: [{ type: 'xlr', gender: 'female' }], signal: 'mic' },
    {
      count: 0,
      label: '',
      labels: ['Main Out L', 'Main Out R'],
      direction: 'out',
      connectors: [{ type: 'trs-6.3', gender: 'female' }],
      signal: 'line-bal',
    },
  ],
};

describe('library format', () => {
  it('accepts a valid entry and builds a template with sources', () => {
    expect(validateLibraryDevice(sample)).toEqual([]);
    const t = libraryToTemplate(sample);
    expect(t.ports.map((p) => p.label)).toEqual(['Mic In 1', 'Mic In 2', 'Main Out L', 'Main Out R']);
    expect(t.origin).toBe('library');
    expect(t.libraryId).toBe('test-mixer');
    expect(t.verified).toBe(false);
    expect(t.sources?.[0].url).toBe('https://example.com/manual.pdf');
  });

  it('expands list routes to every input/output pair', () => {
    const t = libraryToTemplate({ ...sample, routing: [{ from: ['Mic In 1', 'Mic In 2'], to: ['Main Out L', 'Main Out R'] }] });
    const label = (id: string) => t.ports.find((p) => p.id === id)!.label;
    expect(t.routing!.map((r) => `${label(r.from)}>${label(r.to)}`)).toEqual([
      'Mic In 1>Main Out L',
      'Mic In 1>Main Out R',
      'Mic In 2>Main Out L',
      'Mic In 2>Main Out R',
    ]);
  });

  it('reports mistakes', () => {
    const bad = {
      ...sample,
      sources: [],
      groups: [{ ...sample.groups[0], signal: 'loud' }, sample.groups[1], sample.groups[1]],
      routing: [{ from: 'Mic In 1', to: 'Nope' }],
    };
    const errors = validateLibraryDevice(bad);
    expect(errors).toContain('at least one source with an https URL is required');
    expect(errors).toContain('groups[0]: unknown signal "loud"');
    expect(errors).toContain('duplicate port label "Main Out L"');
    expect(errors).toContain('routing refers to unknown port "Nope"');
  });

  it('matches search words in any order', () => {
    expect(matchesQuery(sample, 'mixer test')).toBe(true);
    expect(matchesQuery(sample, '4 test')).toBe(true);
    expect(matchesQuery(sample, 'interface')).toBe(false);
  });
});

describe('library files', () => {
  it.each(LIBRARY.map((d) => [d.id, d] as const))('%s is valid', (_, device) => {
    expect(validateLibraryDevice(device)).toEqual([]);
  });

  it('has unique IDs', () => {
    const ids = LIBRARY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
