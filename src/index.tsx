import { createRoot } from 'react-dom/client';
import { Router, RouterProvider, createHashHistory } from '@tanstack/react-router';
import { routeTree } from './route-tree.gen';
import './global.css';

const router = new Router({
  routeTree,
  history: createHashHistory(),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />);

export { router };
