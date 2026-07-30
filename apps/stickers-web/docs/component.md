# Quick Reference

A utility to create reactive components using RxJS observables and lit-html templates.

## Basic Usage

### Minimum example (static template)

```typescript
const Hello = component(() => html`<div>Hello World</div>`);

// Usage
html`${Hello()}`;
```

### Component with props

```typescript
const Greeting = component((props: { name: string }) => html`<div>Hello ${props.name}</div>`);

// Usage
html`${Greeting({ name: "Alice" })}`;
```

### Component with dynamic template

```typescript
const Clock = component(() => {
  const duration = interval();
  return html`${observe(duration)} ms has elapsed`;
});
```

## Reactive Component Pattern

Components should follow this structure:

```typescript
export const Counter = component((props: { initial: number }) => {
  // 1. Internal state
  const count$ = new BehaviorSubject<number>(props.initial);

  // 2. Actions (user interactions)
  const increment$ = new Subject<void>();

  // 3. Effects (state changes)
  const incrementEffect$ = increment$.pipe(tap(() => count$.next(count$.value + 1)));

  // 4. Combine state and template
  const template = html` <div>
    <span>${observe(count$)}</span>
    <button @click=${() => increment$.next()}>+</button>
  </div>`;

  return withEffect(template, incrementEffect$);
});
```

## Nesting Components

Components can be nested by calling them within templates:

```typescript
const Main = component(() => {
  const template = html`
    <section>
      <h1>My App</h1>
      ${Counter({ initial: 0 })} ${Counter({ initial: 5 })}
    </section>
  `;
  return template;
});
```

## Granular Interactivity

Keep each interaction and reactive binding in the smallest component that owns the affected UI:

- A component that renders an interactive control should define its action stream and effect, or receive a focused callback when the state is owned elsewhere.
- Observe a source next to the text, attribute, or child component that it changes.
- Prefer several focused `observe()` bindings over one combined stream that recreates a large template.
- Do not combine unrelated state only to render an entire component or application subtree.

Use `combineLatest` when one derived value genuinely depends on multiple sources. Keep that derived stream scoped to the smallest affected binding or child component.

```typescript
const Toolbar = component((props: { activeTool$: Observable<Tool>; onSelectTool: (tool: Tool) => void }) => {
  return html`
    <button
      class=${observe(props.activeTool$.pipe(map((activeTool) => (activeTool === "select" ? "is-active" : ""))))}
      @click=${() => props.onSelectTool("select")}
    >
      Select
    </button>
  `;
});
```

Avoid observing one stream of complete templates:

```typescript
// Avoid: every state change recreates the whole component subtree.
const view$ = combineLatest([activeTool$, document$, selection$]).pipe(
  map(
    ([activeTool, document, selection]) => html`
      <main>
        <header>Active tool: ${activeTool}</header>
        <section>${document.title}</section>
        <aside>${selection.size} selected</aside>
      </main>
    `,
  ),
);

return html`${observe(view$)}`;
```

## Prefer Reactive Props

When a child component displays reactive state, pass the observable to the child. The child should observe the value at the binding it owns. Do not have a parent observe the value, rebuild the child, and pass a snapshot prop.

```typescript
// Preferred: the child owns the reactive binding.
const Status = component((props: { status$: Observable<string> }) => {
  return html`<span>${observe(props.status$)}</span>`;
});

const App = component((props: { status$: Observable<string> }) => {
  return html`${Status({ status$: props.status$ })}`;
});
```

```typescript
// Avoid: the parent observes state only to pass a snapshot to the child.
const SnapshotStatus = component((props: { status: string }) => {
  return html`<span>${props.status}</span>`;
});

const App = component((props: { status$: Observable<string> }) => {
  const statusView$ = props.status$.pipe(map((status) => SnapshotStatus({ status })));
  return html`${observe(statusView$)}`;
});
```

Snapshot props are still appropriate for immutable data that is not expected to change during the component instance's lifetime. Event callbacks are appropriate when the parent owns the state transition; passing reactive state does not require moving that ownership into the child.

## External State Hoisting Pattern

To share state between components without coupling, create state in the parent component and pass it to child components:

```typescript
// Child component receives external state
const Counter = component((props: { count$: Observable<number>; onIncrement: () => void }) => {
  return html`
    <div>
      <span>Count: ${observe(props.count$)}</span>
      <button @click=${props.onIncrement}>+</button>
    </div>
  `;
});

// Parent component creates and manages state
const App = component(() => {
  // 1. Create state in parent
  const count$ = new BehaviorSubject<number>(0);
  const increment$ = new Subject<void>();

  // 2. Handle effects
  const incrementEffect$ = increment$.pipe(tap(() => count$.next(count$.value + 1)));

  // 3. Pass state to child components
  const template = html`
    <section>
      <h1>App (Count: ${observe(count$)})</h1>
      ${Counter({
        count$,
        onIncrement: () => increment$.next(),
      })}
    </section>
  `;

  return withEffect(template, incrementEffect$);
});
```

## Key Concepts

- **Factory function**: Receives props and returns a TemplateResult
- **Static or reactive**: Return a template directly for static content, or an Observable for reactive content
- **Props are optional**: Use `component(() => ...)` for no props
- **Reactive**: Use RxJS observables for state management when needed
- **Memoized**: Components are automatically memoized based on prop changes
- **Side effects**: Use the `withEffect(template, effect$)` wrapper
- **Granular interactivity**: Keep actions, effects, and reactive bindings in the smallest component that owns the affected UI
- **Granular reactivity**: Observe each source near the binding it changes instead of observing one complex stream of complete templates
- **Reactive props**: Pass observables to children that render reactive state instead of observing in the parent and passing snapshots
