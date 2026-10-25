import { Panel, useConnection } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { getPort } from '../core/project';
import { checkCable, worstSeverity } from '../core/validation';
import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';
import { isTouchDevice } from './device';
import { parseHandleId } from './DeviceNode';
import { issueText, SEVERITY_ICONS } from './labels';

/** Window size and magnification of the loupe. */
const W = 260;
const H = 104;
const ZOOM = 1.8;

/**
 * While a cable is dragged with a finger, the finger hides the port it is
 * about to land on. This loupe shows that spot enlarged at the top of the
 * diagram, with the port's name and whether the connection fits.
 */
export function ConnectLoupe() {
  const connection = useConnection();
  const view = useRef<HTMLDivElement>(null);
  const project = useProjectStore((s) => s.project);
  const active = connection.inProgress && isTouchDevice();

  const to = active && connection.toHandle?.id ? parseHandleId(connection.toHandle.nodeId, connection.toHandle.id) : null;
  const from = active && connection.fromHandle?.id ? parseHandleId(connection.fromHandle.nodeId, connection.fromHandle.id) : null;
  const pointer = active ? connection.pointer : null;

  // Copy what is under the finger into the loupe (a snapshot of the device, moved and scaled).
  useEffect(() => {
    const box = view.current;
    if (!box || !pointer) return;
    const pane = document.querySelector('.react-flow');
    const origin = pane?.getBoundingClientRect();
    if (!origin) return;
    const x = origin.left + pointer.x;
    const y = origin.top + pointer.y;
    const handle =
      connection.inProgress && connection.toHandle
        ? document.querySelector(
            `.react-flow__node[data-id="${CSS.escape(connection.toHandle.nodeId)}"] .react-flow__handle[data-handleid="${CSS.escape(connection.toHandle.id ?? '')}"]`,
          )
        : null;
    const nodeEl =
      handle?.closest('.react-flow__node') ??
      document
        .elementsFromPoint(x, y)
        .map((el) => el.closest('.react-flow__node'))
        .find((el): el is Element => !!el);
    const device = nodeEl?.querySelector('.device-node') as HTMLElement | null;
    if (!device) {
      box.replaceChildren();
      return;
    }
    const rect = device.getBoundingClientRect();
    const scale = rect.width / device.offsetWidth; // the diagram's current zoom
    const target = handle?.getBoundingClientRect();
    const cx = ((target ? target.left + target.width / 2 : x) - rect.left) / scale;
    const cy = ((target ? target.top + target.height / 2 : y) - rect.top) / scale;

    const copy = device.cloneNode(true) as HTMLElement;
    copy.style.width = `${device.offsetWidth}px`;
    copy.style.position = 'absolute';
    copy.style.left = '0';
    copy.style.top = '0';
    copy.style.transformOrigin = '0 0';
    copy.style.transform = `translate(${W / 2 - cx * ZOOM}px, ${H / 2 - cy * ZOOM}px) scale(${ZOOM})`;
    if (handle) {
      const id = handle.getAttribute('data-handleid');
      copy.querySelector(`.react-flow__handle[data-handleid="${CSS.escape(id ?? '')}"]`)?.closest('.port-row')?.classList.add('loupe-target');
    }
    box.replaceChildren(copy);
    // Redo only when the spot changes noticeably, not on every pixel.
  }, [Math.round((pointer?.x ?? 0) / 6), Math.round((pointer?.y ?? 0) / 6), to?.deviceId, to?.portId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;

  const toPort = to && getPort(project, to);
  const toDevice = to && project.devices.find((d) => d.id === to.deviceId);
  const issues =
    from && to ? checkCable(project, { id: 'probe', label: '', ends: [from, to] }) : [];
  const worst = worstSeverity(issues);

  return (
    <Panel position="top-center" className="connect-loupe-panel">
      <div className={'connect-loupe' + (to ? (worst ? ` connect-loupe--${worst}` : ' connect-loupe--ok') : '')} aria-live="polite">
        <div className="connect-loupe__view" ref={view} style={{ width: W, height: H }} />
        <div className="connect-loupe__text">
          {toPort && toDevice ? (
            <>
              <strong>
                {toDevice.name} · {toPort.label}
              </strong>
              <span>{worst ? `${SEVERITY_ICONS[worst]} ${issueText(issues[0])}` : `✓ ${t('loupe.fits')}`}</span>
            </>
          ) : (
            <span>{t('loupe.dropOnPort')}</span>
          )}
        </div>
      </div>
    </Panel>
  );
}
