import { Header } from '@/components/header';
import { Outlet, createRootRoute } from '@tanstack/react-router';

function RootComponent() {
  return (
    <section>
      <Header />
      <Outlet />
    </section>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
