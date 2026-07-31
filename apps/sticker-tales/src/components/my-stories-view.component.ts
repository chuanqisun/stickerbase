import { html } from "lit";
import { map } from "rxjs";
import { deleteSubmission, submissions$ } from "../state";
import { component, observe } from "../ui-kit";
import "./my-stories-view.component.css";

export const MyStoriesViewComponent = component(() => {
  const submissionsObs = submissions$;

  const handleDelete = async (id: string, title: string) => {
    if (confirm(`Are you sure you want to delete "${title}"?`)) {
      await deleteSubmission(id);
    }
  };

  return html`
    <div class="my-stories-container">
      <div>
        <h2>📝 My Stories</h2>
        <p>Manage and edit your submitted laptop sticker stories.</p>
      </div>

      ${observe(
        submissionsObs.pipe(
          map((subs) => {
            if (subs.length === 0) {
              return html`
                <div class="empty-state">
                  <h3>You haven't submitted any laptop stories yet.</h3>
                  <p>Upload a photo of your laptop cover and record your first sticker story!</p>
                </div>
              `;
            }

            return html`
              <div class="submission-list">
                ${subs.map((sub) => {
                  const storyCount = Object.keys(sub.stories).length;
                  const formattedDate = new Date(sub.createdAt).toLocaleDateString();

                  return html`
                    <div class="submission-card">
                      <img class="submission-thumb" src=${sub.laptopImageDataUrl} alt=${sub.title} />

                      <div class="submission-info">
                        <strong>💻 ${sub.title}</strong>
                        <small style="color: var(--color-text-muted)">
                          Submitted on ${formattedDate} • ${sub.stickers.length} stickers • 🎙️ ${storyCount} audio stories
                        </small>
                      </div>

                      <div class="submission-actions">
                        <button class="danger" @click=${() => handleDelete(sub.id, sub.title)}>🗑️ Delete</button>
                      </div>
                    </div>
                  `;
                })}
              </div>
            `;
          }),
        ),
      )}
    </div>
  `;
});
