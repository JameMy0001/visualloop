# Authentic native README demo recording

The README embeds [the animated GIF](assets/visualloop-ui-workflow-demo.gif). The walkthrough demonstrates the end-to-end workflow: prompt AI to generate a visual artifact, inspect in floating mini overlay, expand and circle visual issues, attach targeted correction notes, send feedback, and review hot-reloaded revisions.

For an authentic native recording:
1. Start a clean example project on a separate Git branch.
2. Run `pnpm start` to open Tauri. Start `pnpm agent:ai examples/solar-system.svg` with a configured API key in another terminal.
3. Record the **real desktop window**, showing mini preview -> expand -> draw circle -> enter instruction -> submit.
4. Capture the provider's actual completed response, the source change, and the updated revision in the desktop preview. Keep credentials out of frame.
5. Verify the feedback is acknowledged only after successful revision publication.
6. Trim to a legible 12–20 second loop and export:

```bash
ffmpeg -i desktop-capture.mp4 -vf 'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer' -loop 0 docs/assets/visualloop-ui-workflow-demo.gif
```

7. Review the exported GIF frame by frame and ensure the annotation, text instruction and before/after result are legible. Retest its appearance on GitHub.

**Do not claim a scripted revision was produced by a live model.** This is the recording checklist; it does not claim a fresh native recording has already been made.
