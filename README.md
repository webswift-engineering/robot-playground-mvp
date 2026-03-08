# Robot Playground MVP

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Online-brightgreen?logo=github)](https://pagexv.github.io/robot-playground-mvp/)
[Open the Robot Playground MVP](https://pagexv.github.io/robot-playground-mvp/)

Interactive browser MVP to explain the robotics loop:

- Perception -> state estimate
- Planning -> path generation
- Control -> velocity / turn commands

## Features

- 2D world with static obstacles and a goal
- Robot truth state vs estimated state visualization
- Perception settings: perfect/noisy sensors and estimator smoothing
- Planning settings: A* grid or greedy repulsive planning
- Control settings: heading PID or pure pursuit, plus actuator lag
- Diagnostics panel with metrics and "what happened this tick" explanation
- Copilot panel: "Why did it collide?" diagnosis + parameter suggestions
- Run/pause, step, reset, and obstacle randomization controls

## Run

No build step required.

1. Open `index.html` in your browser.
2. Or run a local static server from this folder:
   - Python: `python -m http.server 8080`
   - Then open [http://localhost:8080](http://localhost:8080)

## Suggested experiments

- Increase noise and lag, then observe localization error and collisions.
- Compare A* vs Greedy planner under dense obstacles.
- Tune Kp/Kd to reduce oscillation while maintaining path tracking.

## Copilot usage

1. Let the robot run until a collision occurs (or click diagnosis anytime).
2. In **LLM Copilot**, click **Why did it collide?**
3. Optionally switch provider to **OpenAI-compatible API** and fill:
   - Base URL (default: `https://api.openai.com/v1`)
   - Model (example: `gpt-4o-mini`)
   - API key
4. Click **Apply Suggestions** to automatically update control/planning/perception parameters.

If no API key is configured, the app uses a built-in heuristic copilot so the feature still works offline.
