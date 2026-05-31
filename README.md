# Motion-Mouse 🖱️

Motion-Mouse is an innovative desktop application that allows you to control your computer's mouse pointer and clicks using your webcam! It leverages advanced AI models for facial tracking and hand gesture recognition, eliminating the need for a physical mouse.

Built with **Electron**, **Vite**, **MediaPipe**, and **Python**.

## Features

- **Face Tracking (Mouse Movement):** The application tracks your nose using your webcam and translates its position into on-screen mouse movements. It features dynamic smoothing and calibrated baselines so the cursor is responsive but stable.
- **Gesture Recognition (Clicks & Actions):**
  - **Left Click:** Pinch your thumb and index finger.
  - **Right Click:** Pinch your thumb and middle finger.
  - **Scroll Mode:** Fold your ring finger down. Once active, moving your head up and down will scroll the screen.
  - **Mute Tracking:** Form a closed fist to temporarily pause tracking and release clicks. Open your palm to resume.
  - **Quit Application:** Pinch your thumb and ring finger together.
- **Body Measurements:** The app roughly estimates and displays real-time shoulder width, torso length, and hip width based on skeletal points.

## Prerequisites

To run this application, you need the following installed on your system:
- [Node.js](https://nodejs.org/) (which includes npm)
- [Python 3](https://www.python.org/downloads/)
- Python package: `pyautogui` (for OS-level mouse control)

## Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rasindugimhan/Motion-Mouse.git
   cd Motion-Mouse
   ```

2. **Install Python dependencies:**
   ```bash
   pip install pyautogui
   ```

3. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

## Running the Application

### Development Mode
To start the application in development mode with hot-reloading:
```bash
npm run dev
```

### Production Build
To build the application for production:
```bash
npm run build
```

## How It Works

1. **Frontend (`main.js`):** Uses Google's `@mediapipe/tasks-vision` library via a webcam feed to analyze pose, face, and hand gestures in real time directly in the browser/Electron renderer process.
2. **Backend (`electron/main.js`):** Acts as the bridge. It captures IPC messages (like `move-mouse`, `mouse-click`) from the frontend.
3. **OS Controller (`electron/mouse_control.py`):** The Electron main process spawns a Python script in the background. It sends JSON commands to this script via `stdin`. The Python script uses `pyautogui` to execute actual system-level mouse movements and clicks.

## Troubleshooting

- **Webcam not opening:** Make sure no other application (like Zoom or Teams) is actively using the webcam. Electron requires the proper media permissions to access the camera, which this application handles automatically.
- **Mouse getting stuck:** Ensure you are well-lit and your face/hands are clearly visible to the camera. Use the "Closed Fist" gesture to mute the tracking and reset your position.

## License

This project is open-source and available for everyone to use and experiment with.
