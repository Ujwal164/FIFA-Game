import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBox } from './components/ui';
import { Match } from './pages/Match';
import { Player } from './pages/Player';
import { Recap } from './pages/Recap';
import { Team } from './pages/Team';
import './index.css';

// Every page has its own URL, so you can bookmark or share a player's page.
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Recap /> },
      { path: '/teams/:code', element: <Team /> },
      { path: '/matches/:id', element: <Match /> },
      { path: '/players/:id', element: <Player /> },
      { path: '*', element: <ErrorBox message="That page doesn’t exist." /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
