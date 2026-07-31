import { noChange } from "lit";
import { AsyncDirective, directive } from "lit/async-directive.js";
import type { Observable } from "rxjs";

class ObserveDirective extends AsyncDirective {
  observable: Observable<unknown> | undefined;
  unsubscribe: (() => void) | undefined;

  render(observable: Observable<unknown>) {
    if (this.observable !== observable) {
      this.unsubscribe?.();
      this.observable = observable;
      if (this.isConnected) {
        this.subscribe(observable);
      }
    }
    return noChange;
  }

  subscribe(observable: Observable<unknown>) {
    const sub = observable.subscribe((v: unknown) => {
      queueMicrotask(() => this.setValue(v));
    });

    this.unsubscribe = () => sub.unsubscribe();
  }

  disconnected() {
    this.unsubscribe?.();
  }

  reconnected() {
    if (this.observable) {
      this.subscribe(this.observable);
    }
  }
}

export const observe = directive(ObserveDirective);
