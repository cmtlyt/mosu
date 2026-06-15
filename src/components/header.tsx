import { Link, useLocation } from '@tanstack/react-router';

export function Header() {
  const { pathname } = useLocation();

  return (
    <header>
      <nav>
        <Link to="/" className={pathname === '/' ? 'active' : ''}>
          Home
        </Link>
      </nav>
    </header>
  );
}
