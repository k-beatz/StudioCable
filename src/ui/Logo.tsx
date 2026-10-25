import logoDark from '../assets/logo-dark.png';
import logoLight from '../assets/logo-light.png';
import { t } from '../i18n';

/** The CableBrain logo; light ink on dark themes, dark ink on light ones (switched in CSS). */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={'logo ' + className} role="img" aria-label={t('app.title')}>
      <img className="logo__dark" src={logoDark} alt="" draggable={false} />
      <img className="logo__light" src={logoLight} alt="" draggable={false} />
    </span>
  );
}
