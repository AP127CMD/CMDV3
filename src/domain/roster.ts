import { ccKeyFromFull } from './names';

// The canonical AP-127 roster (28 students). Each row pairs a full name with
// its call-sign / instructor / aircraft. Lookups are keyed by NAME (never by
// array position) so a student missing or reordered upstream can NEVER shift
// everyone else's call-sign — the V2 roster-integrity fix, preserved.
// [fullName, callsign, FI, aircraft]
export const AP127_ROSTER: ReadonlyArray<readonly [string, string, string, string]> = [
  ['Akaravit Khwanngam', 'A-VIT', 'W-CHAI', 'DA40-TDI'],
  ['Anusorn Tanmetha', 'A-SORN', 'P-YUTH', 'DA40-CS'],
  ['Awirut Sakcharoen', 'A-RUT', 'P-YA', 'DA40-CS'],
  ['Bulaset Chainontharat', 'B-SET', 'S-TI', 'DA40-CS'],
  ['Jirayu Amornsatitpan', 'J-YU', 'N-TORN', 'DA40-TDI'],
  ['Khobpong Werawong', 'K-PONG', 'I-POL', 'DA40-TDI'],
  ['Kitthanya Thiaphairat', 'K-YA', 'SN-TI', 'DA40-CS'],
  ['Korn Suwannaraks', 'K-KORN', 'S-TI', 'DA40-CS'],
  ['Kraisee Luecha', 'K-SEE', 'A-WAT', 'DA40-TDI'],
  ['Krit Laohamethanee', 'KRIT', 'W-NU', 'DA40-TDI'],
  ['Maethaphan Ruengprapaikijseree', 'M-PHAN', 'K-POL', 'DA40-CS'],
  ['Napon Sawaengpak', 'N-PON', 'C-CHAI', 'DA40-CS'],
  ['Natpakalp Kongvanichsakul', 'N-KALP', 'P-YUTH', 'DA40-CS'],
  ['Nuttaphat Kianmatee', 'N-PHAT', 'SN-TI', 'DA40-CS'],
  ['Panithan Veeratanaporn', 'P-THAN', 'E-PHOB', 'DA40-TDI'],
  ['Pichakorn Jirapinyo', 'P-KORN', 'K-POL', 'DA40-CS'],
  ['Pornskul Dulya', 'P-KUL', 'S-WAN', 'DA40-CS'],
  ['Puwadet Hempattawee', 'P-DET', 'N-TORN', 'DA40-TDI'],
  ['Setasit Pittayathikhun', 'S-SIT', 'E-PHOB', 'DA40-TDI'],
  ['Siwakorn Pholphukrat', 'S-KORN', 'I-POL', 'DA40-TDI'],
  ['Sornsorawitch Chanpradubfa', 'S-WITCH', 'K-CHAI', 'DA40-CS'],
  ['Supawan Adchariyapluk', 'S-WAN', 'K-CHAI', 'DA40-CS'],
  ['Takorn Chuntanapap', 'T-KORN', 'P-YA', 'DA40-CS'],
  ['Teerawaj Chitwicheankul', 'T-WAJ', 'S-WAN', 'DA40-CS'],
  ['Vasaphon Sinsab', 'V-PHON', 'C-CHAI', 'DA40-CS'],
  ['Watcharaphol Vongnoi', 'W-PHOL', 'W-NU', 'DA40-TDI'],
  ['Watcharapol Auttakit', 'W-POL', 'W-CHAI', 'DA40-TDI'],
  ['Watcharapong Chuaidu', 'W-PONG', 'A-WAT', 'DA40-TDI'],
] as const;

/** FI short code → full name as it appears in the operations feed. */
export const AP127_FI_FULL: Readonly<Record<string, string>> = {
  'W-CHAI': 'WUTTHICHAI L.',
  'P-YUTH': 'PHAHOLYUTH P.',
  'P-YA': 'PARINYA B.',
  'S-TI': 'SANTI SUK.',
  'N-TORN': 'NAPATTORN S.',
  'I-POL': 'ITTIPOL P.',
  'SN-TI': 'SANTI PO.',
  'A-WAT': 'THAWATANAN P.',
  'W-NU': 'WISANU T.',
  'K-POL': 'KOONPHOL U.',
  'C-CHAI': 'CHAROENCHAI U.',
  'E-PHOB': 'EKKAPHOP R.',
  'S-WAN': 'SOWAN C.',
  'K-CHAI': 'KITTICHAI C.',
};

export interface RosterEntry {
  name: string;
  nick: string;
  fi: string;
  fiFull: string;
  se: string;
}

/** "AKARAVIT K." → roster entry. */
export const ROSTER_BY_KEY: Readonly<Record<string, RosterEntry>> = Object.fromEntries(
  AP127_ROSTER.map(([name, nick, fi, se]) => [
    ccKeyFromFull(name),
    { name, nick, fi, fiFull: AP127_FI_FULL[fi] ?? fi, se },
  ]),
);

/** Call-sign → roster entry (nicks are unique). */
export const ROSTER_BY_NICK: Readonly<Record<string, RosterEntry>> = Object.fromEntries(
  Object.values(ROSTER_BY_KEY).map((r) => [r.nick.toUpperCase(), r]),
);

export function rosterLookup(name: string | null | undefined): RosterEntry | null {
  return ROSTER_BY_KEY[ccKeyFromFull(name ?? '')] ?? null;
}
