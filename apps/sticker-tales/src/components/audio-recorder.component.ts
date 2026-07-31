import { html } from "lit";
import { BehaviorSubject, map } from "rxjs";
import { AudioRecorderService } from "../services/audio-recorder.service";
import { deleteStickerStory, setStickerStory } from "../state";
import type { StickerMask, StickerStory } from "../types";
import { component, observe } from "../ui-kit";
import "./audio-recorder.component.css";

export interface AudioRecorderProps {
  sticker: StickerMask;
  existingStory?: StickerStory;
}

const recorderService = new AudioRecorderService();

interface RecorderState {
  status: "idle" | "starting" | "recording" | "processing";
  recordingSeconds: number;
  audioDataUrl: string;
  durationSeconds: number;
}

export const AudioRecorderComponent = component((props: AudioRecorderProps) => {
  const { sticker, existingStory } = props;

  const recorderState$ = new BehaviorSubject<RecorderState>({
    status: "idle",
    recordingSeconds: 0,
    audioDataUrl: existingStory?.audioDataUrl || "",
    durationSeconds: existingStory?.durationSeconds || 0,
  });
  let timerInterval: ReturnType<typeof setInterval> | undefined;
  let storyTitle = existingStory?.title || "My Sticker Story";

  const startRecording = async () => {
    if (recorderState$.value.status !== "idle") return;
    recorderState$.next({ ...recorderState$.value, status: "starting" });

    try {
      await recorderService.startRecording();
      recorderState$.next({ ...recorderState$.value, status: "recording", recordingSeconds: 0 });

      timerInterval = setInterval(() => {
        recorderState$.next({ ...recorderState$.value, recordingSeconds: recorderState$.value.recordingSeconds + 1 });
      }, 1000);
    } catch (e: unknown) {
      recorderState$.next({ ...recorderState$.value, status: "idle" });
      alert("Microphone access failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const stopRecording = async () => {
    if (recorderState$.value.status !== "recording") return;
    clearInterval(timerInterval);
    timerInterval = undefined;
    recorderState$.next({ ...recorderState$.value, status: "processing" });

    try {
      const result = await recorderService.stopRecording();
      recorderState$.next({
        status: "idle",
        recordingSeconds: 0,
        audioDataUrl: result.audioDataUrl,
        durationSeconds: result.durationSeconds,
      });

      saveStory();
    } catch (e: unknown) {
      recorderState$.next({ ...recorderState$.value, status: "idle" });
      alert("Error processing audio recording: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const saveStory = () => {
    const { audioDataUrl, durationSeconds } = recorderState$.value;
    if (!audioDataUrl) return;

    const story: StickerStory = {
      stickerId: sticker.id,
      title: storyTitle || "Sticker Story",
      audioDataUrl,
      durationSeconds,
      createdAt: new Date().toISOString(),
    };

    setStickerStory(sticker.id, story);
  };

  const handleDelete = () => {
    recorderState$.next({ ...recorderState$.value, audioDataUrl: "", durationSeconds: 0 });
    deleteStickerStory(sticker.id);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return html`
    <div class="audio-recorder-card">
      <div class="recorder-sticker-preview">
        <img class="sticker-crop-img" src=${sticker.cropDataUrl} alt="Selected sticker crop" />
        <div class="recorder-info">
          <strong>Selected Sticker (${sticker.id})</strong>
          <input
            type="text"
            placeholder="Story Title (e.g. Octocat Sticker)"
            .value=${storyTitle}
            @input=${(e: Event) => {
              storyTitle = (e.target as HTMLInputElement).value;
              if (recorderState$.value.audioDataUrl) saveStory();
            }}
          />
        </div>
      </div>

      <div class="recorder-controls">
        ${observe(
          recorderState$.pipe(
            map((state) => {
              if (state.status === "starting") {
                return html`<button class="primary" disabled>Requesting microphone...</button>`;
              }

              if (state.status === "recording") {
                return html`
                  <div class="recording-status">
                    <span class="pulse-dot"></span>
                    <span>Recording... ${formatTimer(state.recordingSeconds)}</span>
                  </div>
                  <button class="danger" @click=${stopRecording}>⏹️ Stop Recording</button>
                `;
              }

              if (state.status === "processing") {
                return html`<button disabled>Processing recording...</button>`;
              }

              if (state.audioDataUrl) {
                return html`
                  <div class="audio-preview">
                    <audio controls src=${state.audioDataUrl}></audio>
                  </div>
                  <div class="action-row">
                    <button @click=${startRecording}>🎙️ Re-record</button>
                    <button class="danger" @click=${handleDelete}>🗑️ Remove Story</button>
                  </div>
                `;
              }

              return html`<button class="primary" @click=${startRecording}>🎙️ Record Audio Story</button>`;
            }),
          ),
        )}
      </div>
    </div>
  `;
});
