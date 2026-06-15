import { render } from 'preact';
import { Router, RouterProvider } from '@tanstack/react-router';
import { routeTree } from './route-tree.gen';
import './global.css';

const router = new Router({
  basepath: import.meta.env.BASE_URL,
  routeTree,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

render(<RouterProvider router={router} />, document.getElementById('app')!);

export { router };
