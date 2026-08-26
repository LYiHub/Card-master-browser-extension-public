import type {
  InstalledUserscript,
  ScriptMatchContext,
  UserscriptRuntimeState,
} from '../domain/types';

export type UserscriptRuntimeListener = (
  scriptId: string,
  state: UserscriptRuntimeState,
) => void;

export interface UserscriptRuntime {
  subscribe(listener: UserscriptRuntimeListener): () => void;
  synchronizeState(
    script: InstalledUserscript,
    context: ScriptMatchContext,
  ): UserscriptRuntimeState;
  stop(scriptId: string): void;
  dispose(): void;
  invoke(scriptId: string, commandId: string): Promise<unknown>;
}
