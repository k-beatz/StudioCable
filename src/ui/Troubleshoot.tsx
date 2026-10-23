import { useMemo, useState } from 'react';
import { applySettings, diagnose } from '../core/diagnose';
import { formatSetting } from '../core/controls';
import { isPowerDevice } from '../core/power';
import { describeEnd } from '../core/project';
import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';
import { issueText, SEVERITY_ICONS } from './labels';

/**
 * "The signal does not arrive": pick a source and a destination, see the way
 * the signal takes step by step, where it stops, and a one-tap fix.
 */
export function Troubleshoot() {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const select = useProjectStore((s) => s.select);
  const selection = useProjectStore((s) => s.selection);
  const devices = useMemo(
    () => project.devices.filter((d) => !isPowerDevice(project, d)).sort((a, b) => a.name.localeCompare(b.name)),
    [project],
  );
  const [from, setFrom] = useState(selection?.kind === 'device' ? selection.id : '');
  const [to, setTo] = useState('');
  const result = useMemo(() => {
    const valid = (id: string) => devices.some((d) => d.id === id);
    return valid(from) && valid(to) && from !== to ? diagnose(project, from, to) : null;
  }, [project, devices, from, to]);
  const name = (id: string | undefined) => project.devices.find((d) => d.id === id)?.name ?? '?';

  const picker = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="troubleshoot">
      <h3>{t('trouble.title')}</h3>
      <p className="muted">{t('trouble.hint')}</p>
      <div className="troubleshoot__pickers">
        {picker(from, setFrom, t('trouble.from'))}
        {picker(to, setTo, t('trouble.to'))}
      </div>
      {result && (
        <div className={'troubleshoot__result' + (result.arrives ? ' ok' : ' broken')}>
          <ol className="troubleshoot__steps">
            {result.steps.map((s) => {
              const cable = project.cables.find((c) => c.id === s.cableId);
              return (
                <li key={s.cableId} className={s.issues.length ? 'warn' : 'ok'}>
                  <button className="link-button" onClick={() => select({ kind: 'cable', id: s.cableId })}>
                    {s.issues.length ? '⚠️' : '✓'} {cable?.label}
                  </button>
                  <span>
                    {describeEnd(project, s.from)} → {describeEnd(project, s.to)}
                  </span>
                  {s.issues.map((i, k) => (
                    <small key={k}>
                      {SEVERITY_ICONS[i.severity]} {issueText(i)}
                    </small>
                  ))}
                </li>
              );
            })}
          </ol>
          {result.arrives ? (
            <p className="troubleshoot__verdict">✅ {t('trouble.arrives', { to: name(to) })}</p>
          ) : (
            <>
              <p className="troubleshoot__verdict">
                ✗ {t(`trouble.problem.${result.problem ?? 'stops'}`, { from: name(from), to: name(to), at: name(result.stuckAt) })}
              </p>
              {result.settings ? (
                <div className="troubleshoot__fix">
                  <span>{t('trouble.settingHint')}</span>
                  <ul>
                    {result.settings.map((c) => {
                      const d = project.devices.find((x) => x.id === c.deviceId);
                      const control = d && project.templates[d.templateId]?.controls?.find((x) => x.id === c.controlId);
                      const fmt = (v: string | number) => (control ? formatSetting(control, v) : String(v));
                      return (
                        <li key={c.deviceId + c.controlId}>
                          {t('trouble.settingChange', { label: c.label, device: d?.name ?? '?', from: fmt(c.from), to: fmt(c.to) })}
                        </li>
                      );
                    })}
                  </ul>
                  <button className="primary" onClick={() => apply((p) => applySettings(p, result.settings!))}>
                    {t('trouble.applySetting')}
                  </button>
                </div>
              ) : result.fix ? (
                <div className="troubleshoot__fix">
                  <span>{t('trouble.fixHint')}</span>
                  <ul>
                    {result.fix.added.map((id) => {
                      const c = result.fix!.project.cables.find((x) => x.id === id)!;
                      return (
                        <li key={id}>
                          {describeEnd(result.fix!.project, c.ends[0])} → {describeEnd(result.fix!.project, c.ends[1])}
                        </li>
                      );
                    })}
                  </ul>
                  <button className="primary" onClick={() => apply(() => result.fix!.project)}>
                    {t('trouble.fix')}
                  </button>
                </div>
              ) : (
                <p className="muted">{t('trouble.noFix')}</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
