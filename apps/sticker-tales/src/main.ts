import { html, render } from "lit";
import { map } from "rxjs";
import { AllStoriesViewComponent } from "./components/all-stories-view.component";
import { ApiKeysModalComponent } from "./components/api-keys-modal.component";
import { ConnectionsViewComponent } from "./components/connections-view.component";
import { HeaderComponent } from "./components/header.component";
import { MyStoriesViewComponent } from "./components/my-stories-view.component";
import { UploadViewComponent } from "./components/upload-view.component";
import { currentView$, initAppState } from "./state";
import "./style.css";
import { component, observe } from "./ui-kit";

const MainApp = component(() => {
  const currentViewObs = currentView$;

  return html`
    ${HeaderComponent()}
    <main style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
      ${observe(
        currentViewObs.pipe(
          map((viewMode) => {
            switch (viewMode) {
              case "upload":
                return UploadViewComponent();
              case "connections":
                return ConnectionsViewComponent();
              case "all-stories":
                return AllStoriesViewComponent();
              case "my-stories":
                return MyStoriesViewComponent();
              default:
                return UploadViewComponent();
            }
          }),
        ),
      )}
    </main>
    ${ApiKeysModalComponent()}
  `;
});

// Initialize state & mount app
initAppState().then(() => {
  const container = document.getElementById("app");
  if (container) {
    render(MainApp(), container);
  }
});
