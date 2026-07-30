import { html, type TemplateResult } from "lit";
import { guard } from "lit/directives/guard.js";

export function component<TProps extends object | undefined = undefined>(factory: (params: TProps) => TemplateResult) {
  return (params?: TProps) => {
    const deps = params ? Object.entries(params).flatMap(([k, v]) => [k, v]) : [];
    return html`${guard(deps, () => factory(params as TProps))}`;
  };
}
