import type { ReactNode } from 'react';

/** Drop-down menus of the top bar (File, Tools, Helper, View) and their icons. */

/** Three bars lining up: the "tidy up" symbol. */
export function TidyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <rect x="1" y="2" width="4" height="4" rx="1" />
      <rect x="1" y="10" width="4" height="4" rx="1" />
      <rect x="11" y="6" width="4" height="4" rx="1" />
      <path d="M5 4h3v8H5M8 8h3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** A line through three dots: the "draw chain" tool. */
export function ChainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2.5 12.5C5 4 8 13 10 7s2.5-3 3.5-4" />
      <circle cx="2.5" cy="12.5" r="1.6" fill="currentColor" />
      <circle cx="8" cy="9.5" r="1.6" fill="currentColor" />
      <circle cx="13.5" cy="3" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** A magic wand: "suggest wiring". */
export function SuggestIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2.5 13.5l8-8M9 4l3 3" />
      <path d="M12.5 1.5v2M11.5 2.5h2M14 9v2M13 10h2M5.5 1.5v2M4.5 2.5h2" />
    </svg>
  );
}

/** A button in the top bar that opens a small menu below it. */
export function Menu<K extends string>(props: {
  id: K;
  label: ReactNode;
  /** Accessible name when the label is only a symbol (e.g. "⋯"). */
  ariaLabel?: string;
  open: K | null;
  setOpen: (id: K | null) => void;
  className?: string;
  children: ReactNode;
}) {
  const isOpen = props.open === props.id;
  return (
    <div className={'topbar-menu' + (props.className ? ` ${props.className}` : '')}>
      <button
        className={'topbar-menu__button' + (isOpen ? ' active' : '')}
        aria-expanded={isOpen}
        aria-label={props.ariaLabel}
        onClick={() => props.setOpen(isOpen ? null : props.id)}
      >
        {props.label}
        {!props.ariaLabel && <span className="topbar-menu__caret" aria-hidden="true">▾</span>}
      </button>
      {isOpen && (
        // Choosing an entry closes the menu.
        <div className="topbar-menu__popover" role="menu" onClick={(e) => (e.target as HTMLElement).closest('.menu-item') && props.setOpen(null)}>
          {props.children}
        </div>
      )}
    </div>
  );
}

export function MenuItem(props: { icon?: ReactNode; label: string; hint?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="menu-item" role="menuitem" disabled={props.disabled} onClick={props.onClick}>
      {props.icon && <span className="menu-item__icon">{props.icon}</span>}
      <span className="menu-item__text">
        <strong>{props.label}</strong>
        {props.hint && <small>{props.hint}</small>}
      </span>
    </button>
  );
}

/** Wire cutters: the "cut cables" tool. */
export function CutterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 9.5L13 3M9.5 9.5L3 3" />
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="11" cy="12" r="2.2" />
    </svg>
  );
}

/** A tick in a box: the connection checks. */
export function ChecksIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <path d="M5 8.2l2 2 4-4.4" />
    </svg>
  );
}
