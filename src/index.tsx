import { render } from 'preact';
import { Router, Outlet, RouterProvider } from '@tanstack/react-router';
import { Header } from './components/header';
import './style.css';
import { routeTree } from './route-tree.gen';

function Root() {
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
    </>
  );
}

const router = new Router({
  routeTree,
  defaultLayout: Root,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

render(<RouterProvider router={router} />, document.getElementById('app')!);

export { router };
