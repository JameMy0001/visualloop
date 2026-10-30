import { ArtifactPublication, Viewport } from "@visualloop/protocol";

export interface PreviewRenderer {
  render(artifact: ArtifactPublication, viewport: Viewport): Promise<string>;
}
