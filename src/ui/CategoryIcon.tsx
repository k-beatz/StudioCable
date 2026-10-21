import type { DeviceCategory } from '../core/model';

/** Small line icon per device category (18 x 18, inherits the text colour). */
export function CategoryIcon({ category }: { category: DeviceCategory }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let path;
  switch (category) {
    case 'microphone':
      path = (
        <>
          <rect x="7" y="2" width="4" height="8" rx="2" {...common} />
          <path d="M4.5 8.5a4.5 4.5 0 0 0 9 0M9 13v3" {...common} />
        </>
      );
      break;
    case 'interface':
      path = (
        <>
          <rect x="2" y="5.5" width="14" height="7" rx="1.5" {...common} />
          <circle cx="6" cy="9" r="1.4" {...common} />
          <circle cx="12" cy="9" r="1.4" {...common} />
        </>
      );
      break;
    case 'mixer':
      path = <path d="M4 3v12M9 3v12M14 3v12M2.5 6h3M7.5 11h3M12.5 8h3" {...common} />;
      break;
    case 'preamp':
    case 'outboard':
      path = <path d="M2.5 13l4-7 3.5 5 4.5-6.5" {...common} />;
      break;
    case 'patchbay':
      path = (
        <>
          <rect x="2" y="5" width="14" height="8" rx="1" {...common} />
          <path d="M5 8v.01M9 8v.01M13 8v.01M5 10.5v.01M9 10.5v.01M13 10.5v.01" {...common} strokeWidth={2.2} />
        </>
      );
      break;
    case 'monitor':
      path = (
        <>
          <rect x="5" y="2" width="8" height="14" rx="1.5" {...common} />
          <circle cx="9" cy="11" r="2.5" {...common} />
          <circle cx="9" cy="5.5" r="1" {...common} />
        </>
      );
      break;
    case 'headphones':
      path = <path d="M3 13v-3a6 6 0 0 1 12 0v3M3 12h2.5v4H3zM12.5 12H15v4h-2.5z" {...common} />;
      break;
    case 'instrument':
      path = (
        <>
          <path d="M7 14l7-10M12 3l3 2" {...common} />
          <circle cx="6" cy="13" r="2.5" {...common} />
        </>
      );
      break;
    case 'di-box':
      path = (
        <>
          <rect x="3" y="5" width="12" height="8" rx="1.5" {...common} />
          <path d="M6 9h6" {...common} />
        </>
      );
      break;
    case 'amp':
      path = (
        <>
          <rect x="2.5" y="3" width="13" height="12" rx="1.5" {...common} />
          <path d="M2.5 7h13" {...common} />
          <circle cx="9" cy="11" r="2.2" {...common} />
        </>
      );
      break;
    case 'pedal':
      path = (
        <>
          <rect x="4" y="2.5" width="10" height="13" rx="2" {...common} />
          <circle cx="9" cy="6.5" r="1.6" {...common} />
          <rect x="6.5" y="10.5" width="5" height="3" rx="1" {...common} />
        </>
      );
      break;
    case 'pedalboard':
      path = (
        <>
          <path d="M2 13l1.5-6h11L16 13z" {...common} />
          <rect x="5" y="8.5" width="3" height="3" rx="0.6" {...common} />
          <rect x="10" y="8.5" width="3" height="3" rx="0.6" {...common} />
        </>
      );
      break;
    case 'computer':
      path = <path d="M3 4h12v8H3zM1.5 14.5h15" {...common} />;
      break;
    default:
      path = <rect x="3" y="4" width="12" height="10" rx="2" {...common} />;
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {path}
    </svg>
  );
}
