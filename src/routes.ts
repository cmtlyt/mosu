const pageModules = import.meta.glob<{ default: any }>('./pages/**/*.tsx');

const routes: Record<string, () => Promise<{ default: any }>> = {};

for (const [path, load] of Object.entries(pageModules)) {
  const matched = path.match(/\.\/pages(\/[^/]+)(?:\/index)?\.tsx$/u);
  if (matched) {
    const key = matched[1].replace('_404', '404');
    routes[key] = load!;
  }
}

console.debug('routes:', routes);

export default routes;
