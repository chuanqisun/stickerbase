import { html } from "lit";
import { AudioRecorderService } from "../services/audio-recorder.service";
import { deleteStickerStory, setStickerStory } from "../state";
import type { StickerMask, StickerStory } from "../types";
import { component } from "../ui-kit";
import "./audio-recorder.component.css";

export interface AudioRecorderProps {
  sticker: StickerMask;
  existingStory?: StickerStory;
}

const recorderService = new AudioRecorderService();

export const AudioRecorderComponent = component((props: AudioRecorderProps) => {
  const { sticker, existingStory } = props;

  let isRecording = false;
  let recordingSeconds = 0;
  let timerInterval: any = null;
  let storyTitle = existingStory?.title || "My Sticker Story";
  let recordedAudioUrl = existingStory?.audioDataUrl || "";
  let recordedDuration = existingStory?.durationSeconds || 0;

  const startRecording = async () => {
    try {
      await recorderService.startRecording();
      isRecording = true;
      recordingSeconds = 0;

      timerInterval = setInterval(() => {
        recordingSeconds++;
      }, 1000);
    } catch (e: unknown) {
      alert("Microphone access failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    clearInterval(timerInterval);
    isRecording = false;

    try {
      const res = await recorderService.stopRecording();
      recordedAudioUrl = res.audioDataUrl;
      recordedDuration = res.durationSeconds;

      saveStory();
    } catch (e: unknown) {
      alert("Error processing audio recording: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const saveStory = () => {
    if (!recordedAudioUrl) return;

    const story: StickerStory = {
      stickerId: sticker.id,
      title: storyTitle || "Sticker Story",
      audioDataUrl: recordedAudioUrl,
      durationSeconds: recordedDuration,
      createdAt: new Date().toISOString(),
    };

    setStickerStory(sticker.id, story);
  };

  const handleDelete = () => {
    recordedAudioUrl = "";
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
              if (recordedAudioUrl) saveStory();
            }}
          />
        </div>
      </div>

      <div class="recorder-controls">
        ${isRecording
          ? html`
              <div class="recording-status">
                <span class="pulse-dot"></span>
                <span>Recording... ${formatTimer(recordingSeconds)}</span>
              </div>
              <button class="danger" @click=${stopRecording}>⏹️ Stop Recording</button>
            `
          : html`
              ${recordedAudioUrl
                ? html`
                    <div class="audio-preview">
                      <audio controls src=${recordedAudioUrl}></audio>
                    </div>
                    <div class="action-row">
                      <button @click=${startRecording}>🎙️ Re-record</button>
                      <button class="danger" @click=${handleDelete}>🗑️ Remove Story</button>
                    </div>
                  `
                : html` <button class="primary" @click=${startRecording}>🎙️ Record Audio Story</button> `}
            `}
      </div>
    </div>
  `;
});
