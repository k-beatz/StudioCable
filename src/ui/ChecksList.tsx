import { describeEnd } from '../core/project';
import type { Severity } from '../core/validation';
import { t } from '../i18n';
import { useAnalysis } from '../store/analysis';
import { useProjectStore } from '../store/projectStore';
import { issueText, SEVERITY_ICONS } from './labels';
import { Troubleshoot } from './Troubleshoot';

const ORDER: Severity[] = ['error', 'warning', 'info'];

/** Project-wide overview of all connection issues, worst first. */
export function ChecksList() {
  const project = useProjectStore((s) => s.project);

  return (
    <div className="checks-view">
      {project.devices.length > 1 && <Troubleshoot />}
      <h3>{t('checks.title')}</h3>
      <IssueList />
    </div>
  );
}

function IssueList() {
  const project = useProjectStore((s) => s.project);
  const select = useProjectStore((s) => s.select);
  const { issues } = useAnalysis();

  if (project.cables.length === 0) return <p className="empty-hint">{t('checks.empty')}</p>;
  if (issues.length === 0) return <p className="empty-hint">✅ {t('checks.none')}</p>;

  const sorted = [...issues].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  return (
    <ul className="checks-list">
      {sorted.map((issue, n) => {
        const cable = project.cables.find((c) => c.id === issue.cableId);
        if (!cable) return null;
        return (
          <li key={n} className={`issue issue--${issue.severity}`}>
            <button className="link-button" onClick={() => select({ kind: 'cable', id: cable.id })}>
              {SEVERITY_ICONS[issue.severity]} {cable.label}
            </button>
            <span className="checks-list__route">
              {describeEnd(project, cable.ends[0])} → {describeEnd(project, cable.ends[1])}
            </span>
            <span>{issueText(issue)}</span>
          </li>
        );
      })}
    </ul>
  );
}
