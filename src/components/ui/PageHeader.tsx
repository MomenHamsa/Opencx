/**
 * One header shape for every screen.
 *
 * Before this each page invented its own: the trace page had none, compare had two
 * competing ones. A consistent title and one-line purpose means you can land on any
 * screen from a link and know what it is for without reading the body.
 */
export function PageHeader({
  title,
  children,
  aside,
}: {
  title: string;
  /** One sentence on what this screen is for. */
  children?: React.ReactNode;
  /** Optional right-aligned content — counts, actions, context. */
  aside?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {children !== undefined && (
          <p className="mt-1 max-w-3xl text-muted">{children}</p>
        )}
      </div>
      {aside !== undefined && <div className="shrink-0">{aside}</div>}
    </header>
  );
}
