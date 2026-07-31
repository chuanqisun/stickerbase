import { type TemplateResult } from "lit";
import { ignoreElements, mergeWith, of, type Observable } from "rxjs";
import { observe } from "./observe";

export function withEffect(template: TemplateResult, effect$: Observable<any>): TemplateResult {
  return observe(of(template).pipe(mergeWith(effect$.pipe(ignoreElements())))) as TemplateResult;
}
