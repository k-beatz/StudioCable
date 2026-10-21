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

Allowed values for `category`, `direction`, connector `type`, `gender` and
`signal` are listed in `src/core/model.ts`.
