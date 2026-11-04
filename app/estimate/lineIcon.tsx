// Icon for a line with no product photo (Kyle, 2026-11-04): labor and service
// lines get a service icon, catalog-less parts get their category's icon, so an
// estimate never shows an empty "missing photo" box. Real products should get a
// catalog photo instead; this is only the fallback.

export type LineIconKind =
  | 'install' | 'dispatch' | 'program' | 'drywall'
  | 'camera' | 'network' | 'alarm' | 'access' | 'smarthome' | 'audio' | 'cable' | 'part';

type IconInput = {
  name?: string | null;
  category?: string | null;
  unit_type?: string | null;
  part_number?: string | null;
};

// Service lines carry no part number; products do. A product whose name reads
// like a service ("Takeover Kit") keeps its category icon.
const SERVICE_WORDS = /\b(install|installation|labor|labour|dispatch|trip charge|service call|programming|set ?up|configur\w*|commission\w*|system design|engineering|project management|drywall|patch|removal|swap|troubleshoot\w*|repair|inspection)\b/i;

export function lineIconKind(item: IconInput): LineIconKind {
  const name = (item.name ?? '').toLowerCase();
  const cat = (item.category ?? '').toLowerCase();
  const hasPart = !!(item.part_number ?? '').trim();
  const isService = cat === 'labor' || (item.unit_type ?? '').toLowerCase() === 'hour'
    || /^\s*dispatch\b/.test(name) || (!hasPart && SERVICE_WORDS.test(name));

  if (isService) {
    if (/\b(dispatch|trip|service call)\b/.test(name)) return 'dispatch';
    if (/\b(drywall|patch)\b/.test(name)) return 'drywall';
    if (/\b(program|programming|configur\w*|commission\w*|design|engineering|project management|set ?up)\b/.test(name) && !/\binstall/.test(name)) return 'program';
    return 'install';
  }

  if (/camera|video|nvr|recorder/.test(cat) || /\b(camera|nvr|doorbell|turret|bullet|dome|ptz)\b/.test(name)) return 'camera';
  if (/network|unifi/.test(cat) || /\b(switch \d|access point|router|gateway|ap\b|wi-?fi)/.test(name)) return 'network';
  if (/alarm|sensor|dsc|powerg|qolsys|deep sentinel/.test(cat) || /\b(sensor|glassbreak|smoke|panel|siren|contact)\b/.test(name)) return 'alarm';
  if (/access|entry|lock/.test(cat) || /\b(lock|deadbolt|reader|strike|maglock|badge)\b/.test(name)) return 'access';
  if (/audio/.test(cat) || /\b(speaker|amp|amplifier|soundbar|subwoofer|sonos)\b/.test(name)) return 'audio';
  if (/smart home|control/.test(cat) || /\b(dimmer|keypad|lutron|remote|thermostat|processor)\b/.test(name)) return 'smarthome';
  if (/cable|mount|power|hardware/.test(cat) || /\b(cable|wire|cat ?6|mount|bracket|wallplate|plate|ups|battery|power supply)\b/.test(name)) return 'cable';
  return 'part';
}

const LABEL: Record<LineIconKind, string> = {
  install: 'Installation', dispatch: 'Dispatch', program: 'Programming & setup', drywall: 'Drywall',
  camera: 'Camera', network: 'Networking', alarm: 'Security', access: 'Door access', smarthome: 'Smart home',
  audio: 'Audio', cable: 'Cabling & hardware', part: 'Part',
};

// 24×24 stroke icons, drawn in currentColor.
const PATHS: Record<LineIconKind, JSX.Element> = {
  install: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
  dispatch: (
    <>
      <path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z" />
      <circle cx="6" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  program: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  drywall: (
    <>
      <path d="M3 4h18v16H3zM3 10h18M3 15h18M9 4v6M15 10v5M9 15v5" />
    </>
  ),
  camera: (
    <>
      <path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" />
      <circle cx="9" cy="12" r="2" />
    </>
  ),
  network: (
    <>
      <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19.5" r="1" />
    </>
  ),
  alarm: <path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" />,
  access: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2" />
    </>
  ),
  smarthome: (
    <>
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M12 17v-3M10 12.5a3 3 0 0 1 4 0" />
    </>
  ),
  audio: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <circle cx="12" cy="14" r="3" />
      <circle cx="12" cy="7" r="1" />
    </>
  ),
  cable: (
    <>
      <path d="M9 2v5M15 2v5M7 7h10v4a5 5 0 0 1-10 0zM12 16v6" />
    </>
  ),
  part: (
    <>
      <path d="M12 2l9 5v10l-9 5-9-5V7z" />
      <path d="M3 7l9 5 9-5M12 12v10" />
    </>
  ),
};

export function LineIcon({ item }: { item: IconInput }) {
  const kind = lineIconKind(item);
  return (
    <div className={`equipment-img-placeholder line-icon line-icon-${kind}`} role="img" aria-label={LABEL[kind]}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {PATHS[kind]}
      </svg>
    </div>
  );
}
