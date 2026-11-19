<!-- fr:journal-schema=4 -->
# Journal: stable-reader-dock

<!-- fr:journal kind=root-cause scope=debug id=04a61c239d29 created=2026-11-19T19:55:54+00:00 -->
### 04a61c239d29 · root-cause · Content-driven stage geometry and speech fallback

The browser stage reads layout each chunk and shrinks or wraps on overflow, then rerenders sentence context that changes its height. An exhibit pushes the stage; a speech boundary timeout renders a whole sentence. Overlay follow aims in viewport coordinates without accounting for the visible scrollport and sticky page chrome.
