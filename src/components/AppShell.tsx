// Layout shell: sticky top bar; left rail on desktop, bottom tab bar on
// mobile. MOBILE PARITY RULE: everything in the top bar must be reachable on
// mobile — FreshnessBar renders in the top bar always (it shrinks), theme
// chips live in the rail footer AND the mobile "more" sheet.

import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { FreshnessBar } from './FreshnessBar';
import { THEMES, useTheme } from '@/state/theme';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  soon?: boolean;
}

const NAV_MAIN: NavItem[] = [
  { to: '/', icon: '◎', label: 'Home' },
  { to: '/schedule', icon: '▦', label: 'Schedule' },
  { to: '/ap127', icon: '▰', label: 'AP127 Detail' },
  { to: '/student', icon: '◉', label: 'Student Lens' },
  { to: '/aircraft', icon: '✦', label: 'Aircraft' },
  { to: '/integrity', icon: '⇄', label: 'Data Integrity' },
];

const NAV_SOON: NavItem[] = [
  { to: '/performance', icon: '◷', label: 'School Perf', soon: true },
  { to: '/sim', icon: '◈', label: 'Simulation', soon: true },
  { to: '/slots', icon: '⚡', label: 'Slot Finder', soon: true },
  { to: '/watchdog', icon: '◍', label: 'Watchdog', soon: true },
];

function ThemeChips() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex gap-1">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          onClick={() => setTheme(t.id)}
          className="mono h-6 w-6 cursor-pointer rounded border text-[10px] font-bold"
          style={{
            borderColor: theme === t.id ? 'var(--highlight)' : 'var(--line)',
            color: theme === t.id ? 'var(--highlight)' : 'var(--ink-3)',
            background: theme === t.id ? 'var(--highlight-bg)' : 'transparent',
          }}
        >
          {t.chip}
        </button>
      ))}
    </div>
  );
}

function RailLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      title={item.label}
      className={({ isActive }) =>
        `mono uc flex min-h-[36px] items-center gap-2.5 rounded-md px-2.5 text-[10.5px] font-semibold no-underline transition-colors ${
          isActive
            ? 'bg-[var(--highlight-bg)] text-[var(--highlight)]'
            : item.soon
              ? 'text-ink-3 opacity-45'
              : 'text-ink-2 hover:bg-bg-2 hover:text-ink'
        }`
      }
      onClick={item.soon ? (e) => e.preventDefault() : undefined}
    >
      <span className="w-4 text-center text-[13px]">{item.icon}</span>
      {!collapsed && (
        <span className="truncate">
          {item.label}
          {item.soon && <span className="ml-1.5 text-[7px] opacity-70">SOON</span>}
        </span>
      )}
    </NavLink>
  );
}

const MOBILE_TABS: Array<{ to: string; icon: string; label: string }> = [
  { to: '/', icon: '◎', label: 'Home' },
  { to: '/schedule', icon: '▦', label: 'Sched' },
  { to: '/ap127', icon: '▰', label: 'AP127' },
  { to: '/student', icon: '◉', label: 'SP' },
  { to: '/aircraft', icon: '✦', label: 'A/C' },
  { to: '/integrity', icon: '⇄', label: 'Data' },
];

export function AppShell() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('ap127v3-rail-collapsed') === '1',
  );
  const loc = useLocation();
  const current =
    [...NAV_MAIN, ...NAV_SOON].find(
      (n) => n.to === loc.pathname || (n.to !== '/' && loc.pathname.startsWith(n.to)),
    )?.label ?? '';

  const toggle = () => {
    setCollapsed((v) => {
      localStorage.setItem('ap127v3-rail-collapsed', v ? '0' : '1');
      return !v;
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-bg-2/95 px-2.5 backdrop-blur sm:gap-3 sm:px-3.5">
        <button
          type="button"
          onClick={toggle}
          title="Toggle navigation"
          className="mono hidden h-7 w-7 cursor-pointer rounded border border-line text-[12px] text-ink-2 hover:text-ink md:block"
        >
          ☰
        </button>
        <div className="font-display flex items-baseline gap-1 text-[15px] font-bold tracking-widest whitespace-nowrap">
          <span className="inline-block h-2 w-2 animate-pulse self-center rounded-full bg-[var(--col-done)]" />
          AP<span className="text-highlight">127</span>
          <span className="hidden text-ink-3 sm:inline">CMD</span>
          <span className="text-[10px] text-ink-3">V3</span>
        </div>
        <div className="mono uc hidden text-[9px] text-ink-3 lg:block">{current}</div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <FreshnessBar />
          <div className="hidden md:block">
            <ThemeChips />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desktop rail */}
        <nav
          className="hidden shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-bg-2 p-2 transition-[width] duration-150 md:flex"
          style={{ width: collapsed ? 54 : 200 }}
        >
          {NAV_MAIN.map((i) => (
            <RailLink key={i.to} item={i} collapsed={collapsed} />
          ))}
          <div className="mono uc mt-3 mb-1 px-2.5 text-[8px] text-ink-3">
            {!collapsed && 'Later phases'}
          </div>
          {NAV_SOON.map((i) => (
            <RailLink key={i.to} item={i} collapsed={collapsed} />
          ))}
          <div className="mt-auto pt-3 pl-1.5">{!collapsed && <ThemeChips />}</div>
        </nav>

        {/* Content */}
        <main className="min-w-0 flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tabs (theme chips live on Home for mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg-2/95 backdrop-blur md:hidden">
        {MOBILE_TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `mono flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[8px] no-underline ${
                isActive ? 'text-[var(--highlight)]' : 'text-ink-3'
              }`
            }
          >
            <span className="text-[15px] leading-none">{t.icon}</span>
            <span className="uc">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
