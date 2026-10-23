import type { ReactElement } from 'react';
import type { Connector } from '../core/model';

/**
 * Schematic connector symbol (20 x 20). The ring colour is the signal colour.
 * Sockets (female) show hollow holes, plugs (male) filled pins.
 * Colours for pins and body come from CSS variables so both themes work.
 */
export function ConnectorIcon({ connectors, color, size = 20 }: { connectors: Connector[]; color: string; size?: number }) {
  const types = connectors.map((c) => c.type);
  const first = connectors[0];
  const male = first?.gender === 'male';
  const body = male ? 'var(--icon-plug)' : 'var(--icon-socket)';
  const pin = 'var(--icon-pin)';
  const hole = (cx: number, cy: number, r = 1.4) =>
    male ? <circle cx={cx} cy={cy} r={r} fill={pin} /> : <circle cx={cx} cy={cy} r={r} fill="none" stroke={pin} strokeWidth={1} />;

  let shape: ReactElement;
  const isCombo = types.includes('xlr') && types.some((t) => t.startsWith('trs') || t.startsWith('ts'));
  const type = first?.type;

  if (isCombo) {
    shape = (
      <>
        <circle cx={10} cy={10} r={8.5} fill={body} stroke={color} strokeWidth={2} />
        <circle cx={10} cy={10} r={3.2} fill="none" stroke={pin} strokeWidth={1} />
        <circle cx={10} cy={10} r={1.3} fill={pin} />
        {hole(5.6, 6.6, 1.1)}
        {hole(14.4, 6.6, 1.1)}
        {hole(10, 16.2, 1.1)}
      </>
    );
  } else if (type === 'xlr' || type === 'aes-xlr') {
    shape = (
      <>
        <circle cx={10} cy={10} r={8.5} fill={body} stroke={color} strokeWidth={2} />
        {hole(6.8, 8.4)}
        {hole(13.2, 8.4)}
        {hole(10, 13.4)}
      </>
    );
  } else if ((type === 'trs-6.3' || type === 'ts-6.3' || type === 'trs-3.5' || type === 'trrs-3.5' || type === 'ts-3.5') && male) {
    // Jack plug seen from the side.
    shape = (
      <>
        <path d="M1 10 H8" stroke={pin} strokeWidth={2.4} strokeLinecap="round" />
        <rect x={8} y={5} width={11} height={10} rx={2.5} fill={body} stroke={color} strokeWidth={2} />
      </>
    );
  } else if (type === 'trs-6.3' || type === 'ts-6.3') {
    shape = (
      <>
        <circle cx={10} cy={10} r={8.5} fill={body} stroke={color} strokeWidth={2} />
        {type === 'trs-6.3' && <circle cx={10} cy={10} r={4.8} fill="none" stroke={pin} strokeWidth={1} />}
        <circle cx={10} cy={10} r={2.2} fill={pin} />
      </>
    );
  } else if (type === 'trs-3.5' || type === 'trrs-3.5' || type === 'ts-3.5') {
    shape = (
      <>
        <circle cx={10} cy={10} r={6} fill={body} stroke={color} strokeWidth={2} />
        {type === 'trrs-3.5' && <circle cx={10} cy={10} r={3.6} fill="none" stroke={pin} strokeWidth={0.8} />}
        <circle cx={10} cy={10} r={1.8} fill={pin} />
      </>
    );
  } else if (type === 'rca' || type === 'spdif-coax') {
    shape = (
      <>
        <circle cx={10} cy={10} r={8} fill={body} stroke={color} strokeWidth={2} />
        <circle cx={10} cy={10} r={4.6} fill="none" stroke={pin} strokeWidth={1.2} />
        <circle cx={10} cy={10} r={1.5} fill={pin} />
      </>
    );
  } else if (type === 'speakon') {
    shape = (
      <>
        <circle cx={10} cy={10} r={8.5} fill={body} stroke={color} strokeWidth={2} />
        <circle cx={10} cy={10} r={5} fill="none" stroke={pin} strokeWidth={1.2} />
        <rect x={9} y={2.5} width={2} height={3} fill={pin} />
        <rect x={9} y={14.5} width={2} height={3} fill={pin} />
      </>
    );
  } else if (type === 'midi-din') {
    shape = (
      <>
        <circle cx={10} cy={10} r={8.5} fill={body} stroke={color} strokeWidth={2} />
        {hole(5.4, 11, 1)}
        {hole(6.6, 7, 1)}
        {hole(10, 5.6, 1)}
        {hole(13.4, 7, 1)}
        {hole(14.6, 11, 1)}
      </>
    );
  } else if (type === 'usb-c') {
    shape = (
      <>
        <rect x={2.5} y={6} width={15} height={8} rx={4} fill={body} stroke={color} strokeWidth={2} />
        <rect x={6} y={9} width={8} height={2} rx={1} fill={pin} />
      </>
    );
  } else if (type === 'usb-b') {
    shape = (
      <>
        <path d="M5 6.5 L7.5 3.5 H12.5 L15 6.5 V16.5 H5 Z" fill={body} stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <rect x={7.5} y={8} width={5} height={6} rx={0.5} fill={pin} />
      </>
    );
  } else if (type === 'usb-a') {
    shape = (
      <>
        <rect x={2.5} y={6} width={15} height={8} rx={1} fill={body} stroke={color} strokeWidth={2} />
        <rect x={5} y={8.5} width={10} height={2.5} fill={pin} />
      </>
    );
  } else if (type === 'toslink') {
    shape = (
      <>
        <path d="M4 5 H16 V15 H7 L4 12 Z" fill={body} stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={10.5} cy={10} r={2} fill={pin} />
      </>
    );
  } else if (type === 'bnc') {
    shape = (
      <>
        <circle cx={10} cy={10} r={6} fill={body} stroke={color} strokeWidth={2} />
        <rect x={1} y={9} width={3} height={2} fill={pin} />
        <rect x={16} y={9} width={3} height={2} fill={pin} />
        <circle cx={10} cy={10} r={1.6} fill={pin} />
      </>
    );
  } else if (type === 'rj45') {
    shape = (
      <>
        <path d="M3 4.5 H17 V14 H13 V16.5 H7 V14 H3 Z" fill={body} stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <path d="M6 6.5 v3 M8.7 6.5 v3 M11.3 6.5 v3 M14 6.5 v3" stroke={pin} strokeWidth={1} />
      </>
    );
  } else if (type === 'dsub25') {
    shape = (
      <>
        <path d="M2 6 H18 L16 14 H4 Z" fill={body} stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {[5.5, 8.2, 10.9, 13.6].map((x) => (
          <circle key={x} cx={x + 0.4} cy={8.6} r={0.8} fill={pin} />
        ))}
        {[6.8, 9.5, 12.2].map((x) => (
          <circle key={x} cx={x + 0.4} cy={11.6} r={0.8} fill={pin} />
        ))}
      </>
    );
  } else if (type === 'schuko') {
    // Round socket/plug with two pins and the earth clips at top and bottom.
    shape = (
      <>
        <circle cx={10} cy={10} r={8.5} fill={body} stroke={color} strokeWidth={2} />
        {hole(6.4, 10, 1.5)}
        {hole(13.6, 10, 1.5)}
        <rect x={8.5} y={2.6} width={3} height={1.6} fill={pin} />
        <rect x={8.5} y={15.8} width={3} height={1.6} fill={pin} />
      </>
    );
  } else if (type === 'iec') {
    // Kettle connector: three pins in a shape with bevelled lower corners.
    shape = (
      <>
        <path d="M2.5 4 H17.5 V11.5 L14 16 H6 L2.5 11.5 Z" fill={body} stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {hole(6.6, 8.6, 1.2)}
        {hole(13.4, 8.6, 1.2)}
        {hole(10, 12.4, 1.2)}
      </>
    );
  } else if (type === 'iec-c7') {
    // Figure-8 connector with two pins.
    shape = (
      <>
        <path d="M6.5 4.5 H13.5 A5.5 5.5 0 0 1 13.5 15.5 H6.5 A5.5 5.5 0 0 1 6.5 4.5 Z" fill={body} stroke={color} strokeWidth={2} />
        {hole(6.6, 10, 1.4)}
        {hole(13.4, 10, 1.4)}
      </>
    );
  } else if (type === 'powercon') {
    shape = (
      <>
        <circle cx={10} cy={10} r={8.5} fill={body} stroke={color} strokeWidth={2} />
        <circle cx={10} cy={10} r={4.2} fill="none" stroke={pin} strokeWidth={1.2} />
        <rect x={9} y={2.2} width={2} height={3.4} fill={pin} />
      </>
    );
  } else if (type === 'dc-barrel') {
    // Barrel socket/plug: ring with the centre pin.
    shape = (
      <>
        <circle cx={10} cy={10} r={6.5} fill={body} stroke={color} strokeWidth={2} />
        <circle cx={10} cy={10} r={2.6} fill="none" stroke={pin} strokeWidth={1.2} />
        <circle cx={10} cy={10} r={1} fill={pin} />
      </>
    );
  } else {
    // Banana / binding post and anything unknown: plain terminal.
    shape = (
      <>
        <circle cx={10} cy={10} r={7} fill={body} stroke={color} strokeWidth={2} />
        <circle cx={10} cy={10} r={2.5} fill={pin} />
      </>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="connector-icon">
      {shape}
    </svg>
  );
}
