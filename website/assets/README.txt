Background video (looping site backdrop)
=====================================

Put your file here using one of these names (first match wins in index.html):

  background.webm   — preferred (smaller, good browsers)
  background.mp4    — H.264, works almost everywhere

You can supply both: the page lists WebM first, then MP4.

Tips:
  - Resolution: use at least 1920×1080 sources so the full-screen background stays sharp on laptops and phones (retina scales the layer). 2560×1440 is a good ceiling before file size hurts mobile.
  - Encoding: H.264 (MP4) ~8–15 Mbps for 1080p loops; WebM/VP9 or AV1 at similar visual quality, smaller files. Short seamless loops (5–15s) keep bandwidth sane.
  - Framing: the page uses CSS object-fit: cover — the video always fills the window but may crop top/bottom OR left/right depending on viewport shape (phone vs ultrawide). To keep an important subject in frame, set in css/styles.css:
      :root { --bg-video-position: center 30%; }
    (use center top, center bottom, or % values as needed). For the entire frame visible with letterboxing instead, you’d change .bg-video to object-fit: contain (not the default full-bleed look).
  - Muted + loop is required for autoplay on mobile (Safari/Chrome).
  - Optional: add poster.jpg here, then in index.html add poster="assets/poster.jpg" on the <video> tag for a still before playback.

If no video file is present, you’ll see a soft neutral fallback behind the scrim.
