import type {
  AiSpeechRecognitionController,
  AiSpeechRecognitionState,
} from '../../ai/domain/types';
import { microphonePermissionErrorMessage } from '../../ai/infrastructure/microphone-permission';
import type { SpeechAudioCaptureSession } from '../../ai/infrastructure/speech-audio-capture';
import type {
  EditableTextComposition,
  EditableTextTarget,
} from './editable-text';

const MAX_BUFFERED_AUDIO_FRAMES = 192;
const FINAL_RESULT_TIMEOUT_MS = 10_000;
const COMPLETE_VISIBLE_MS = 1_000;
const ERROR_VISIBLE_MS = 2_800;

type SpeechController = AiSpeechRecognitionController & {
  dispose(): void;
};

export type GamepadPushToTalkViewState = {
  status:
    | 'idle'
    | 'connecting'
    | 'listening'
    | 'stopping'
    | 'complete'
    | 'error';
  text: string;
  error?: string;
  target: EditableTextTarget | null;
};

type ActiveRun = {
  id: number;
  target: EditableTextTarget;
  composition: EditableTextComposition;
  speech: SpeechController;
  unsubscribe: () => void;
  capture: SpeechAudioCaptureSession | null;
  captureFinish: Promise<void> | null;
  bufferedAudio: string[];
  speechReady: boolean;
  finishRequested: boolean;
  stopSent: boolean;
  finalizing: boolean;
  cancelled: boolean;
  latestSpeechState: AiSpeechRecognitionState;
  resolveFinal: (text: string) => void;
  rejectFinal: (error: Error) => void;
  finalResult: Promise<string>;
};

export type GamepadPushToTalkDependencies = {
  resolveTarget(): EditableTextTarget | null;
  createCapture(): Promise<SpeechAudioCaptureSession>;
  createSpeech(): SpeechController;
  createComposition(target: EditableTextTarget): EditableTextComposition;
  publish(state: GamepadPushToTalkViewState): void;
  pulse?(): void;
};

function deferredText() {
  let resolve: (text: string) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<string>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

export class GamepadPushToTalkController {
  private run: ActiveRun | null = null;
  private operationId = 0;
  private terminalTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly dependencies: GamepadPushToTalkDependencies) {}

  get active() {
    return this.run !== null;
  }

  get recording() {
    return Boolean(this.run && !this.run.finishRequested);
  }

  start() {
    if (this.disposed || this.run) return false;
    const target = this.dependencies.resolveTarget();
    if (!target) {
      this.publishTerminal({
        status: 'error',
        text: '',
        error: '先选择网页中的输入框，再按住说话。',
        target: null,
      });
      return false;
    }
    this.clearTerminalTimer();
    const speech = this.dependencies.createSpeech();
    const final = deferredText();
    const run: ActiveRun = {
      id: ++this.operationId,
      target,
      composition: this.dependencies.createComposition(target),
      speech,
      unsubscribe: () => undefined,
      capture: null,
      captureFinish: null,
      bufferedAudio: [],
      speechReady: false,
      finishRequested: false,
      stopSent: false,
      finalizing: false,
      cancelled: false,
      latestSpeechState: { status: 'idle', text: '' },
      resolveFinal: final.resolve,
      rejectFinal: final.reject,
      finalResult: final.promise,
    };
    this.run = run;
    run.unsubscribe = speech.subscribeSpeech((state) =>
      this.handleSpeechState(run, state),
    );
    this.publish(run, 'connecting');
    void this.begin(run);
    return true;
  }

  finish() {
    const run = this.run;
    if (!run || run.cancelled || run.finishRequested) return false;
    run.finishRequested = true;
    this.publish(run, 'stopping');
    if (run.capture) this.requestCaptureFinish(run);
    if (run.speechReady) void this.finalize(run);
    return true;
  }

  cancel() {
    const run = this.run;
    if (!run) return false;
    this.run = null;
    run.cancelled = true;
    try {
      run.composition.cancel();
    } catch {
      // Speech teardown must not be blocked by a page-owned editor.
    }
    void this.teardownCancelledRun(run);
    this.dependencies.publish({
      status: 'idle',
      text: '',
      target: null,
    });
    return true;
  }

  reconcileTarget() {
    const run = this.run;
    if (run && !run.target.isConnected) this.cancel();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTerminalTimer();
    this.cancel();
  }

  private async begin(run: ActiveRun) {
    try {
      const capture = await this.dependencies.createCapture();
      if (!this.current(run) || run.cancelled) {
        await capture.close();
        return;
      }
      run.capture = capture;
      if (run.finishRequested) {
        await capture.close();
        this.cancel();
        return;
      }
      capture.start(
        (pcmBase64) => this.handleAudio(run, pcmBase64),
        (error) => this.fail(run, error),
      );
      await run.speech.startSpeechRecognition();
      if (!this.current(run) || run.cancelled) return;
      run.speechReady = true;
      await this.flushBufferedAudio(run);
      if (!this.current(run) || run.cancelled) return;
      if (!run.finishRequested) this.dependencies.pulse?.();
      this.publish(run, run.finishRequested ? 'stopping' : 'listening');
      if (run.finishRequested) void this.finalize(run);
    } catch (error) {
      await this.fail(run, error);
    }
  }

  private async handleAudio(run: ActiveRun, pcmBase64: string) {
    if (!this.current(run) || run.cancelled) return;
    if (!run.speechReady) {
      if (run.bufferedAudio.length >= MAX_BUFFERED_AUDIO_FRAMES) {
        throw new Error('语音识别连接过慢，音频缓冲已满。');
      }
      run.bufferedAudio.push(pcmBase64);
      return;
    }
    await run.speech.sendSpeechAudio(pcmBase64);
  }

  private async flushBufferedAudio(run: ActiveRun) {
    while (run.bufferedAudio.length > 0) {
      if (!this.current(run) || run.cancelled) return;
      const pcmBase64 = run.bufferedAudio.shift();
      if (pcmBase64) await run.speech.sendSpeechAudio(pcmBase64);
    }
  }

  private requestCaptureFinish(run: ActiveRun) {
    if (run.captureFinish) return run.captureFinish;
    run.captureFinish = run.capture?.finish() ?? Promise.resolve();
    return run.captureFinish;
  }

  private async finalize(run: ActiveRun) {
    if (!this.current(run) || run.cancelled || run.finalizing) return;
    run.finalizing = true;
    try {
      await this.requestCaptureFinish(run);
      await this.flushBufferedAudio(run);
      if (!this.current(run) || run.cancelled) return;
      run.stopSent = true;
      await run.speech.stopSpeechRecognition();
      if (run.latestSpeechState.status === 'idle') {
        run.resolveFinal(run.latestSpeechState.text);
      }
      const text = await this.waitForFinalResult(run);
      if (!this.current(run) || run.cancelled) return;
      const normalized = text.trim();
      if (run.target.isConnected) run.composition.commit(normalized);
      else run.composition.cancel();
      this.complete(run, normalized);
    } catch (error) {
      await this.fail(run, error);
    }
  }

  private waitForFinalResult(run: ActiveRun) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return Promise.race([
      run.finalResult,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('语音识别未能及时返回最终结果。')),
          FINAL_RESULT_TIMEOUT_MS,
        );
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
  }

  private handleSpeechState(run: ActiveRun, state: AiSpeechRecognitionState) {
    if (!this.current(run) || run.cancelled) return;
    run.latestSpeechState = state;
    if (state.status === 'error') {
      void this.fail(run, state.error || '语音识别失败。');
      return;
    }
    try {
      run.composition.update(state.text);
    } catch (error) {
      void this.fail(run, error);
      return;
    }
    if (state.status === 'idle') {
      if (run.stopSent) run.resolveFinal(state.text);
      return;
    }
    this.dependencies.publish({
      status: state.status,
      text: state.text,
      target: run.target,
    });
  }

  private complete(run: ActiveRun, text: string) {
    if (!this.current(run)) return;
    this.releaseRun(run);
    this.publishTerminal({
      status: 'complete',
      text,
      target: run.target,
    });
  }

  private async fail(run: ActiveRun, error: unknown) {
    if (!this.current(run)) return;
    const failure = error instanceof Error ? error : new Error(String(error));
    if (run.finalizing) run.rejectFinal(failure);
    this.run = null;
    run.cancelled = true;
    try {
      run.composition.cancel();
    } catch {
      // Preserve speech cleanup even if the target editor rejected rollback.
    }
    await this.teardownCancelledRun(run);
    this.publishTerminal({
      status: 'error',
      text: run.latestSpeechState.text,
      error: microphonePermissionErrorMessage(failure),
      target: run.target,
    });
  }

  private releaseRun(run: ActiveRun) {
    this.run = null;
    try {
      run.unsubscribe();
    } catch {
      // The speech subscription may already belong to an invalid context.
    }
    try {
      run.speech.dispose();
    } catch {
      // Completion must survive extension reload teardown.
    }
  }

  private async teardownCancelledRun(run: ActiveRun) {
    try {
      run.unsubscribe();
    } catch {
      // Continue releasing capture and speech resources.
    }
    await Promise.all([
      Promise.resolve()
        .then(() => run.capture?.close())
        .catch(() => undefined),
      Promise.resolve()
        .then(() => run.speech.cancelSpeechRecognition())
        .catch(() => undefined),
    ]);
    try {
      run.speech.dispose();
    } catch {
      // The extension context may already be invalid during reload teardown.
    }
  }

  private publish(
    run: ActiveRun,
    status: GamepadPushToTalkViewState['status'],
  ) {
    if (!this.current(run)) return;
    this.dependencies.publish({
      status,
      text: run.latestSpeechState.text,
      target: run.target,
    });
  }

  private publishTerminal(state: GamepadPushToTalkViewState) {
    this.clearTerminalTimer();
    this.dependencies.publish(state);
    this.terminalTimer = setTimeout(
      () => {
        this.terminalTimer = null;
        if (this.run || this.disposed) return;
        this.dependencies.publish({
          status: 'idle',
          text: '',
          target: null,
        });
      },
      state.status === 'error' ? ERROR_VISIBLE_MS : COMPLETE_VISIBLE_MS,
    );
  }

  private clearTerminalTimer() {
    if (!this.terminalTimer) return;
    clearTimeout(this.terminalTimer);
    this.terminalTimer = null;
  }

  private current(run: ActiveRun) {
    return this.run === run && this.operationId === run.id;
  }
}
