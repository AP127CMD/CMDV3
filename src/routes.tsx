import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/AppShell';
import { LoadingBlock } from './components/atoms';

const HomeView = lazy(() => import('./views/home'));
const ScheduleView = lazy(() => import('./views/schedule'));
const Ap127View = lazy(() => import('./views/ap127'));
const StudentView = lazy(() => import('./views/student'));
const CurriculumProgView = lazy(() => import('./views/curriculum'));
const IntegrityView = lazy(() => import('./views/integrity'));
const AircraftView = lazy(() => import('./views/aircraft'));
const SchoolPerformanceView = lazy(() => import('./views/performance'));
const SimulationView = lazy(() => import('./views/simulation'));
const SlotFinderView = lazy(() => import('./views/slots'));
const WatchdogView = lazy(() => import('./views/watchdog'));
const HelpView = lazy(() => import('./views/help'));

const wrap = (el: React.ReactNode) => <Suspense fallback={<LoadingBlock />}>{el}</Suspense>;

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: wrap(<HomeView />) },
      { path: 'schedule/:layout?', element: wrap(<ScheduleView />) },
      { path: 'ap127', element: wrap(<Ap127View />) },
      { path: 'student/:nick?', element: wrap(<StudentView />) },
      { path: 'curriculum', element: wrap(<CurriculumProgView />) },
      { path: 'integrity', element: wrap(<IntegrityView />) },
      { path: 'aircraft', element: wrap(<AircraftView />) },
      { path: 'performance', element: wrap(<SchoolPerformanceView />) },
      { path: 'sim', element: wrap(<SimulationView />) },
      { path: 'slots', element: wrap(<SlotFinderView />) },
      { path: 'watchdog', element: wrap(<WatchdogView />) },
      { path: 'help', element: wrap(<HelpView />) },
      { path: '*', element: wrap(<HomeView />) },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
