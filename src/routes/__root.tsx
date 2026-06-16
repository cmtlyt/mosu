import { Outlet, createRootRoute } from '@tanstack/react-router';

function RootComponent() {
  return (
    <section>
      <Outlet />
    </section>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
