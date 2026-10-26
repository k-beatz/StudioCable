# Device library

Real devices that users can pick from a list. One JSON file per device:
`library/devices/<manufacturer>/<model>.json` (lowercase, dashes).

The files are bundled into the app at build time. `npm test` checks every file,
so a typo (unknown connector, duplicate port label, routing to a port that
doesn't exist) fails the tests.

## Rules

- **Only facts from a real source.** Every entry names at least one source,
  preferably the manufacturer's manual or spec sheet. Never guess a spec. If
  something is unclear, leave it out and say so in `notes`.
- **Don't copy texts or images**, only the technical facts (which jacks exist).
- New entries are always `"status": "unverified"`. An entry becomes
  `"verified"` only after someone has checked it against the real device or
  the manual.
- Port labels follow the print on the device where possible.

## Format

```json
{
  "format": "studiocable-device",
  "schemaVersion": 1,
  "id": "manufacturer-model",
  "manufacturer": "Manufacturer",
  "model": "Model",
  "category": "mixer",
  "status": "unverified",
  "sources": [{ "title": "Quick Start Guide", "url": "https://..." }],
  "notes": "Optional remarks, e.g. what could not be confirmed.",
  "groups": [
    {
      "count": 4,
      "label": "Mic In",
      "direction": "in",
      "connectors": [{ "type": "xlr", "gender": "female" }],
      "signal": "mic"
    },
    {
      "count": 0,
      "label": "",
      "labels": ["Main Out L", "Main Out R"],
      "direction": "out",
      "connectors": [{ "type": "trs-6.3", "gender": "female" }],
      "signal": "line-bal"
    }
  ],
  "routing": [{ "from": "Mic In 1", "to": "Main Out L" }]
}
```

- A group with `count` and `label` creates numbered ports ("Mic In 1" …
  "Mic In 4"). With `labels`, each port gets exactly that label.
- `connectors` with two entries = combo jack (e.g. XLR/TRS).
- `alsoAccepts` lists other levels an input takes (e.g. a combo input:
  `"signal": "mic", "alsoAccepts": ["line-bal", "instrument"]`).
- `channels`: 2 for stereo on one jack (headphones, TRS stereo), 8 for ADAT.
- `routing` is optional. It is used for signal flow tracing. Mixers usually
  leave it out, because their internal routing depends on knobs and buttons.

### Knobs and switches (optional)

Controls that change where the signal goes inside the device. The user can
turn and flip them in the app, and troubleshooting takes them into account.

```json
"controls": [
  { "id": "monitoring", "label": "MONITORING", "kind": "knob", "default": 5, "minLabel": "DIRECT", "maxLabel": "DAW" },
  { "id": "main", "label": "MAIN OUTPUT", "kind": "knob", "default": 5, "levelOf": ["Main Out L", "Main Out R"] },
  { "id": "mode", "label": "MONO / STEREO", "kind": "switch", "positions": ["STEREO", "MONO"], "default": "STEREO" },
  { "id": "phan", "label": "+48V", "kind": "switch", "positions": ["OFF", "ON"], "default": "OFF", "phantomFor": ["Mic In 1"] }
],
"routing": [
  { "from": "Mic In 1", "to": "Main Out L", "when": [{ "control": "monitoring", "max": 9 }] },
  { "from": "Mic In 1", "to": "Main Out R", "when": [{ "control": "mode", "is": ["MONO"] }] }
]
```

- Per channel: `"count": 8` repeats a control (or a route) for channels 1–8;
  `{n}` in `id`, `label`, `section`, port labels and control IDs becomes the
  channel number, e.g.
  `{ "id": "level{n}", "label": "LEVEL", "kind": "knob", "default": 5, "count": 8, "section": "CH {n}", "levelOf": ["MIC {n}"] }`.
- `section` groups controls on screen like on the panel ("CH 1", "MAIN").
- Knobs go from 0 to 10. `levelOf`: the knob sets the level of these ports;
  at 0 nothing passes them. `gainOf`: an input gain (trim) knob for these
  ports; it makes them louder or quieter but never silences them.
- `when` on a route: the path only exists while every condition holds
  (`is` = switch positions, `min` / `max` = knob range, inclusive).
- `phantomFor`: a phantom power switch for these inputs; the position `"ON"`
  powers them. A mic output with `"needsPhantom": true` (condenser mic) on such
  an input gives no signal while it is off.
- `onFor`: an on/off switch for these ports (e.g. a mic's own switch); they
  carry signal only in the position `"ON"`.
- What a control does must come from the source. Where the manual leaves it
  open (e.g. whether "MIN" is fully silent), say so in `notes`. Default
  positions are app defaults, not factory settings.

Allowed values for `category`, `direction`, connector `type`, `gender` and
`signal` are listed in `src/core/model.ts`.
