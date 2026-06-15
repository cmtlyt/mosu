import { Link, useLocation } from '@tanstack/react-router';

export function Header() {
  const { pathname } = useLocation();

  return (
    <header>
      <nav>
        <Link to="/" class={pathname === '/' ? 'active' : ''}>
          Home
        </Link>
      </nav>
    </header>
  );
}
