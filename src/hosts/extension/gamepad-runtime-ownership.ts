export const GAMEPAD_CONTROL_HOST_ID = 'card-master-gamepad-control-host';
export const GAMEPAD_CONTROL_FOCUS_STYLE_ID =
  'card-master-gamepad-control-focus-style';

type RuntimeArtifactRoot = {
  querySelectorAll(selector: string): Iterable<{ remove(): void }>;
};

type RuntimeHostRoot = {
  getElementById(id: string): unknown;
};

export function removeStaleGamepadControlArtifacts(root: RuntimeArtifactRoot) {
  for (const artifact of root.querySelectorAll(
    `[id="${GAMEPAD_CONTROL_HOST_ID}"], [id="${GAMEPAD_CONTROL_FOCUS_STYLE_ID}"]`,
  )) {
    artifact.remove();
  }
}

export function isCurrentGamepadControlHost(
  root: RuntimeHostRoot,
  host: { isConnected: boolean },
) {
  return (
    host.isConnected && root.getElementById(GAMEPAD_CONTROL_HOST_ID) === host
  );
}
