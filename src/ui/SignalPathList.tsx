import { Fragment } from 'react';
import type { Project } from '../core/model';
import { getPort } from '../core/project';
import type { SignalPath, Trace } from '../core/signalFlow';
import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';

/** One stop in a path: a device with the ports the signal uses on it. */
interface Stop {
  deviceId: string;
  ports: string[];
}

/** Groups ports joined by internal routes into one stop per device visit. */
function toStops(path: SignalPath): { stops: Stop[]; cables: string[] } {
  const stops: Stop[] = [{ deviceId: path.ports[0].deviceId, ports: [path.ports[0].portId] }];
  const cables: string[] = [];
  path.links.forEach((link, i) => {
    const next = path.ports[i + 1];
    if (link.kind === 'internal') stops[stops.length - 1].ports.push(next.portId);
    else {
      cables.push(link.cableId);
      stops.push({ deviceId: next.deviceId, ports: [next.portId] });
    }
  });
  return { stops, cables };
}

function stopText(project: Project, stop: Stop) {
  const device = project.devices.find((d) => d.id === stop.deviceId);
  const ports = stop.ports.map((portId) => getPort(project, { deviceId: stop.deviceId, portId })?.label ?? '?');
  return { device: device?.name ?? '?', ports: ports.join(' → ') };
}

function PathRow({ project, path }: { project: Project; path: SignalPath }) {
  const select = useProjectStore((s) => s.select);
  const { stops, cables } = toStops(path);
  return (
    <li className="signal-path">
      {stops.map((stop, i) => {
        const text = stopText(project, stop);
        return (
          <Fragment key={i}>
            {i > 0 && (
              <button
                className="signal-path__cable"
                onClick={() => select({ kind: 'cable', id: cables[i - 1] })}
              >
                {project.cables.find((c) => c.id === cables[i - 1])?.label ?? '?'}
              </button>
            )}
            <span className="signal-path__stop">
              <strong>{text.device}</strong>
              <small>{text.ports}</small>
            </span>
          </Fragment>
        );
      })}
    </li>
  );
}

/** Upstream and downstream paths of a trace, each path read in signal direction. */
export function SignalPathList({ trace }: { trace: Trace | undefined }) {
  const project = useProjectStore((s) => s.project);
  if (!trace || (trace.upstream.length === 0 && trace.downstream.length === 0)) {
    return <p className="muted">{t('flow.none')}</p>;
  }
  return (
    <div className="signal-paths">
      {trace.upstream.length > 0 && (
        <>
          <h4>{t('flow.upstream')}</h4>
          <ul>
            {trace.upstream.map((p, i) => (
              <PathRow key={i} project={project} path={p} />
            ))}
          </ul>
        </>
      )}
      {trace.downstream.length > 0 && (
        <>
          <h4>{t('flow.downstream')}</h4>
          <ul>
            {trace.downstream.map((p, i) => (
              <PathRow key={i} project={project} path={p} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
