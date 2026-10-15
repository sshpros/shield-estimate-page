// "Learn more" links from a proposal section to our site (Kyle 2026-10-15).
// Duplicated in shield-app (web-shield-admin-web/src/pages/design/sectionLinks.ts)
// and shield-estimate-page (app/proposal/[token]/sectionLinks.ts) — keep them identical.
//
// A section's own `links` (set in the proposal editor) wins; an empty list
// means "no links". Otherwise the first rule whose pattern matches the title
// supplies the defaults, so every proposal gets links without extra work.
export type SectionLink = { label: string; url: string };

const SITE = "https://shieldlowvoltage.com";
const l = (label: string, path: string): SectionLink => ({ label, url: `${SITE}${path}?src=proposal` });

const RULES: [RegExp, SectionLink[]][] = [
  [/conduit|trench|enclosure/i, []],
  [/televisions|samsung/i, []],
  [/josh/i, [l("Josh.ai at Shield", "/josh-ai/"), l("What Josh.ai actually does", "/what-josh-ai-does-luxury-voice-control/")]],
  [/gate/i, [l("UniFi gate access & intercom guide", "/unifi-gate-access-intercom-guide/")]],
  [/engineering|project management/i, [l("Our whole-home system design", "/our-standard-whole-home-system-design/")]],
  [/head-?end|structured wiring/i, [l("Pre-wire for custom builds", "/pre-wire-for-custom-builds/"), l("What to run before drywall", "/pre-wire-what-to-run-before-drywall/")]],
  [/network|wi-?fi/i, [l("Whole-home networking", "/whole-home-network/"), l("UniFi vs mesh WiFi for a big house", "/unifi-vs-mesh-wifi-large-home/")]],
  [/(camera|doorbell).*alarm\.com/i, [l("Alarm.com security", "/alarm-com/"), l("UniFi vs Alarm.com cameras", "/unifi-protect-vs-alarm-com-cameras/")]],
  [/jobsite|floodlight|surveillance|camera/i, [l("UniFi cameras", "/cameras/"), l("Why we install UniFi cameras", "/lorex-reolink-vs-unifi-cameras/")]],
  [/security|alarm|life safety/i, [l("Alarm.com security", "/alarm-com/"), l("Monitored alarms", "/monitored-alarms/")]],
  [/audio|speaker|sonos/i, [l("Sonos whole-home audio", "/sonos/"), l("Sonos Amp Multi", "/sonos-amp-multi/")]],
  [/theat|tv |tv$|tvs|video|mounting/i, [l("Home theater & AV", "/home-theatre-audio-visual-solutions/")]],
  [/shade|window covering/i, [l("Motorized shades", "/lighting-and-shades/")]],
  [/cas[eé]ta/i, [l("Lutron Caséta", "/lutron-caseta/")]],
  [/radiora|ra ?3/i, [l("Lutron RadioRA 3", "/lutron-radiora3/"), l("Josh.ai + Lutron", "/josh-ai-lutron-voice-lighting/")]],
  [/homeworks/i, [l("Lutron HomeWorks", "/lutron-homeworks/")]],
  [/smart home/i, [l("Home automation", "/home-automation/")]],
  [/lighting/i, [l("Lighting & shades", "/lighting-and-shades/")]],
  [/climate|thermostat/i, [l("Smart climate control", "/smart-climate-control/")]],
  [/\blocks?\b|access control/i, [l("Smart locks", "/smart-locks/")]],
];

export function sectionLinks(title: string, own?: SectionLink[] | null): SectionLink[] {
  if (own) return own.filter((x) => x.url?.trim());
  return RULES.find(([re]) => re.test(title))?.[1] ?? [];
}
