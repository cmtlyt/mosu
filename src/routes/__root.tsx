import { Outlet, createRootRoute } from '@tanstack/react-router';
import { MessageToast } from '@/components/editor/message-toast';

function RootComponent() {
  return (
    <>
      <Outlet />
      <MessageToast />
    </>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
