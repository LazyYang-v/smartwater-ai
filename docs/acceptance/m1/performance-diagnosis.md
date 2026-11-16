# M1 性能诊断

这些记录不替代任何基准测量，也不证明问题已修复。

{
  "kind": "Diagnostic, not replacement for benchmarks",
  "build_id": "6b9d43cf1d05489dc64954ab53c5841dd5a1768b4104e7d85ea1ef726bb52d78",
  "data_paused": true,
  "css_canvas": {
    "width": 1218,
    "height": 427
  },
  "drawing_buffer": {
    "width": 1218,
    "height": 427
  },
  "renderer_dpr": 1,
  "sample_average_fps": 17.87948460503949,
  "sample_p95_frame_ms": 181.20000000000073,
  "sample_long_frames_over50": 444,
  "visibility_and_focus_events": [
    {
      "event": "start",
      "at": 10326.399999976158,
      "focused": true,
      "visible": "visible"
    }
  ],
  "long_tasks_observed": 397,
  "observed_metric_deltas": {
    "Timestamp": 75.68785400001798,
    "TaskDuration": 64.159739,
    "ScriptDuration": 42.565238,
    "ThreadTime": 3.2350380000000003,
    "ProcessTime": 6.045289000000025,
    "LayoutDuration": 1.097423,
    "RecalcStyleDuration": 0.049471,
    "Nodes": -105,
    "JSHeapUsedSize": -599848
  },
  "verified_exclusions": [
    "No model reload within the measured scene",
    "One scene/render loop, two charts, stable 50 draw calls",
    "Data paused; chart snapshot refresh is not a necessary condition of the slowdown",
    "No observed DOM focus-loss/visibility event during diagnostic",
    "Node count and JS heap did not grow during this diagnostic interval"
  ],
  "inference": "Samples include Three.js rendering and native WebGL submission calls; large task wall-time versus CPU thread time is consistent with blocking or scheduling waits. This narrows investigation but does not isolate GPU, driver, OS scheduling or external contention.",
  "root_cause": "NOT_CONFIRMED",
  "limitations": [
    "Profiler overhead makes this a diagnostic rather than a scoring replacement",
    "CDP ThreadTime/TaskDuration have different accounting; do not equate their difference to measured GPU time",
    "OS occlusion, host CPU/GPU contention and power state not measured; no system settings changed"
  ]
}

原始诊断见 performance-diagnostic.json，CPU 采样见 diagnostic-cpu-profile.json。
