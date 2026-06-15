import { createFileRoute } from '@tanstack/react-router';

function Resource(props: { title: string; description: string; href: string }) {
  return (
    <a href={props.href} target="_blank" rel="noreferrer" className="resource">
      <h2>{props.title}</h2>
      <p>{props.description}</p>
    </a>
  );
}

function RouteComponent() {
  return (
    <div className="home">
      <h1>Welcome to Mosu</h1>
      <section>
        <Resource
          title="Learn React"
          description="If you're new to React, try the official tutorial to learn important concepts"
          href="https://react.dev/learn"
        />
        <Resource
          title="Learn Vite"
          description="To learn more about Vite and how you can customize it to fit your needs, take a look at their excellent documentation"
          href="https://vitejs.dev"
        />
      </section>
    </div>
  );
}

export const Route = createFileRoute('/')({
  component: RouteComponent,
});
