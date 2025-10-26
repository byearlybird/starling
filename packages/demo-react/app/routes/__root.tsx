import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TodoProvider } from "../providers/TodoProvider";

const RootLayout = (): JSX.Element => {
  return (
    <TodoProvider>
      <Outlet />
    </TodoProvider>
  );
};

export const Route = createRootRoute({
  component: RootLayout,
  head: () => (
    <>
      <title>Starling Todo Demo</title>
      <meta name="description" content="Minimal TanStack Start demo for Starling" />
    </>
  ),
});
