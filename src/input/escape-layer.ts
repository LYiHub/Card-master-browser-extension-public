import {
  type EscapeLayerRegistration,
  EscapeLayerStack,
  inputCoordinatorFor,
} from './coordinator';

export type { EscapeLayerRegistration };
export { EscapeLayerStack };

export function registerEscapeLayer(
  document: Document,
  registration: EscapeLayerRegistration,
) {
  return inputCoordinatorFor(document).registerEscapeLayer(registration);
}
