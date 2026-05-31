import { PoseLandmarker, GestureRecognizer, FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("enableWebcamButton");
const measurementsList = document.getElementById("measurements-list");
const gesturesList = document.getElementById("gestures-list");

let poseLandmarker = undefined;
let gestureRecognizer = undefined;
let faceLandmarker = undefined;
let runningMode = "VIDEO";
let webcamRunning = false;
let lastVideoTime = -1;

// Smoothing variables
let smoothedX = -1;
let smoothedY = -1;
let baselineNoseX = -1;
let baselineNoseY = -1;
const SMOOTHING = 0.4; // 0.0 is completely frozen, 1.0 is no smoothing
const SENSITIVITY = 2.5; // Multiplier for movement. Higher = smaller hand movements needed

// Click state
let lastThumbState = false;
let lastRightClickState = false;
let isTrackingPaused = false;
let areGesturesMuted = false;
let isScrollingMode = false;

// IPC Throttling
let lastScrollTime = 0;
let lastSentX = -1;
let lastSentY = -1;

// Initialize the MediaPipe Models
const createModels = async () => {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );

    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numPoses: 1 // We only focus on sketching the primary body
    });

    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numHands: 2
    });

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
        },
        outputFaceBlendshapes: false,
        runningMode: runningMode,
        numFaces: 1
    });
};
createModels();

// Check if browser supports webcam access
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

if (hasGetUserMedia()) {
    enableWebcamButton.addEventListener("click", enableCam);
} else {
    console.warn("getUserMedia() is not supported by your browser");
    measurementsList.innerHTML = `<li>Webcam not supported</li>`;
}

function enableCam(event) {
    if (!poseLandmarker || !gestureRecognizer || !faceLandmarker) {
        console.log("Wait! models not loaded yet.");
        return;
    }

    webcamRunning = true;
    enableWebcamButton.classList.add("hidden");

    const constraints = {
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: "user"
        }
    };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        video.srcObject = stream;
        video.addEventListener("loadeddata", () => {
            // Match canvas logical size to video resolution for correct coordinates
            canvasElement.width = video.videoWidth;
            canvasElement.height = video.videoHeight;
            predictWebcam();
        });
    }).catch((err) => {
        console.error("Error accessing webcam:", err);
        alert("Error accessing webcam: " + err.message + "\nPlease check permissions or if the camera is in use.");
        webcamRunning = false;
        enableWebcamButton.classList.remove("hidden");
    });
}

function calculateDistance(p1, p2, width, height) {
    if (!p1 || !p2) return 0;
    // Map normalized coordinates [0, 1] to actual pixel dimensions of the feed
    const x1 = p1.x * width;
    const y1 = p1.y * height;
    const x2 = p2.x * width;
    const y2 = p2.y * height;
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

async function predictWebcam() {
    // Ensure the canvas stretches to fill its container but uses original resolution for drawing
    canvasElement.style.width = "100%";
    canvasElement.style.height = "100%";

    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;

        // Detect human poses in the current video frame
        poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
            // Also detect gestures and face
            const gestureResult = gestureRecognizer.recognizeForVideo(video, startTimeMs);
            const faceResult = faceLandmarker.detectForVideo(video, startTimeMs);

            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            const drawingUtils = new DrawingUtils(canvasCtx);

            // Draw Pose
            if (result.landmarks && result.landmarks.length > 0) {
                for (const landmark of result.landmarks) {
                    const handIndices = [17, 18, 19, 20, 21, 22];

                    // Filter connections to remove the lines going to the hands
                    const filteredConnections = PoseLandmarker.POSE_CONNECTIONS.filter(conn =>
                        !handIndices.includes(conn.start) && !handIndices.includes(conn.end)
                    );

                    // Filter landmarks to remove the dots on the hands
                    const filteredLandmarks = landmark.filter((_, index) => !handIndices.includes(index));

                    // Draw skeletal sketch lines without hands
                    drawingUtils.drawConnectors(landmark, filteredConnections, {
                        color: "#00e5ff", // Neon Cyan
                        lineWidth: 4
                    });
                    // Draw joints without hands
                    drawingUtils.drawLandmarks(filteredLandmarks, {
                        radius: 4,
                        color: "#ff007f", // Neon Pink
                        lineWidth: 2
                    });
                }

                const landmarks = result.landmarks[0];

                // Landmark Indices:
                // 11 = Left Shoulder, 12 = Right Shoulder
                const shoulderDist = calculateDistance(landmarks[11], landmarks[12], canvasElement.width, canvasElement.height);

                // 23 = Left Hip, 24 = Right Hip
                const hipDist = calculateDistance(landmarks[23], landmarks[24], canvasElement.width, canvasElement.height);

                // Spine (approximate): midpoint of shoulders to midpoint of hips
                const shoulderMidX = (landmarks[11].x + landmarks[12].x) / 2;
                const shoulderMidY = (landmarks[11].y + landmarks[12].y) / 2;
                const hipMidX = (landmarks[23].x + landmarks[24].x) / 2;
                const hipMidY = (landmarks[23].y + landmarks[24].y) / 2;

                const torsoLength = calculateDistance(
                    { x: shoulderMidX, y: shoulderMidY },
                    { x: hipMidX, y: hipMidY },
                    canvasElement.width, canvasElement.height
                );

                // Approximate pixel to cm conversion factor for webcam (rough estimate)
                const PIXEL_TO_CM = 0.25;

                // Display real-time measurements in cm
                measurementsList.innerHTML = `
            <li><span>Shoulder Width:</span> <span>${(shoulderDist * PIXEL_TO_CM).toFixed(1)} cm</span></li>
            <li><span>Torso Length:</span> <span>${(torsoLength * PIXEL_TO_CM).toFixed(1)} cm</span></li>
            <li><span>Hip Width:</span> <span>${(hipDist * PIXEL_TO_CM).toFixed(1)} cm</span></li>
        `;
            } else {
                measurementsList.innerHTML = `<li>No human detected in frame</li>`;
            }

            // Draw Hands
            if (gestureResult.landmarks && gestureResult.landmarks.length > 0) {
                let gesturesHtml = '';
                for (let i = 0; i < gestureResult.landmarks.length; i++) {
                    const landmarks = gestureResult.landmarks[i];

                    // Note: Hand connections usually live on GestureRecognizer or HandLandmarker
                    // But we can just use the exported HAND_CONNECTIONS, actually it's exported from GestureRecognizer
                    drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
                        color: "#00ff88", // Neon Green
                        lineWidth: 3
                    });
                    drawingUtils.drawLandmarks(landmarks, {
                        color: "#ffaa00", // Neon Orange
                        lineWidth: 1,
                        radius: 3
                    });

                    const categoryName = gestureResult.gestures[i] && gestureResult.gestures[i].length > 0 ? gestureResult.gestures[i][0].categoryName : '';
                    const handedness = gestureResult.handednesses[i] && gestureResult.handednesses[i].length > 0 ? gestureResult.handednesses[i][0].displayName : 'Unknown';

                    gesturesHtml += `<li><span>${handedness} Hand:</span> <span>${categoryName}</span></li>`;

                    // --- OS CONTROL INTEGRATION (CLICKS) ---
                    if (i === 0 && window.electronAPI) {
                        const thumbTip = landmarks[4];
                        const indexFingerTip = landmarks[8];
                        const middleFingerTip = landmarks[12];
                        const ringFingerTip = landmarks[16];
                        const wrist = landmarks[0];

                        // Calculate normalized distances for clicks
                        const thumbToIndexDist = Math.sqrt(
                            Math.pow(thumbTip.x - indexFingerTip.x, 2) +
                            Math.pow(thumbTip.y - indexFingerTip.y, 2)
                        );

                        const thumbToMiddleDist = Math.sqrt(
                            Math.pow(thumbTip.x - middleFingerTip.x, 2) +
                            Math.pow(thumbTip.y - middleFingerTip.y, 2)
                        );

                        const thumbToRingDist = Math.sqrt(
                            Math.pow(thumbTip.x - ringFingerTip.x, 2) +
                            Math.pow(thumbTip.y - ringFingerTip.y, 2)
                        );

                        const isFist = categoryName === 'Closed_Fist';
                        const isOpenPalm = categoryName === 'Open_Palm';

                        // Mute toggle logic
                        if (isFist) {
                            areGesturesMuted = true;
                            isTrackingPaused = true;
                        } else if (isOpenPalm) {
                            areGesturesMuted = false;
                            isTrackingPaused = false;
                        }

                        if (areGesturesMuted) {
                            isScrollingMode = false;
                            // Force release any held clicks if we get muted
                            if (lastThumbState) {
                                window.electronAPI.mouseClick(false, 'left');
                                lastThumbState = false;
                            }
                            if (lastRightClickState) {
                                window.electronAPI.mouseClick(false, 'right');
                                lastRightClickState = false;
                            }
                        } else {
                            // Use Pinch (Thumb-Index) for left click and (Thumb-Middle) for right click.
                            const isLeftClick = thumbToIndexDist < 0.05;
                            const isRightClick = thumbToMiddleDist < 0.05;

                            if (isLeftClick && !lastThumbState) {
                                window.electronAPI.mouseClick(true, 'left');
                            } else if (!isLeftClick && lastThumbState) {
                                window.electronAPI.mouseClick(false, 'left');
                            }

                            if (isRightClick && !lastRightClickState) {
                                window.electronAPI.mouseClick(true, 'right');
                            } else if (!isRightClick && lastRightClickState) {
                                window.electronAPI.mouseClick(false, 'right');
                            }

                            lastThumbState = isLeftClick;
                            lastRightClickState = isRightClick;

                            // Third finger (ring) pinch to quit
                            if (thumbToRingDist < 0.05) {
                                window.electronAPI.quitApp();
                            }

                            // Scrolling logic: Check if ring finger is folded
                            const ringMCP = landmarks[13];

                            const tipToWristDist = Math.sqrt(
                                Math.pow(ringFingerTip.x - wrist.x, 2) +
                                Math.pow(ringFingerTip.y - wrist.y, 2)
                            );
                            const mcpToWristDist = Math.sqrt(
                                Math.pow(ringMCP.x - wrist.x, 2) +
                                Math.pow(ringMCP.y - wrist.y, 2)
                            );

                            // If the tip is closer to the wrist than the knuckle (MCP), the finger is folded down
                            isScrollingMode = tipToWristDist < mcpToWristDist;
                        }
                    }
                }
                if (gesturesList) gesturesList.innerHTML = gesturesHtml;
            } else {
                isScrollingMode = false;
                if (gesturesList) gesturesList.innerHTML = `<li>No hands detected</li>`;
                // Release any dragging or clicking if hands disappear from frame
                if (lastThumbState || lastRightClickState) {
                    if (window.electronAPI) {
                        if (lastThumbState) window.electronAPI.mouseClick(false, 'left');
                        if (lastRightClickState) window.electronAPI.mouseClick(false, 'right');
                    }
                    lastThumbState = false;
                    lastRightClickState = false;
                }
            }

            // --- OS CONTROL INTEGRATION (MOUSE MOVEMENT) ---
            if (faceResult && faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0 && window.electronAPI) {
                const face = faceResult.faceLandmarks[0];

                if (face[1]) {
                    // Nose Tip
                    const noseTip = face[1];

                    if (baselineNoseX === -1 || isTrackingPaused) {
                        baselineNoseX = noseTip.x;
                        baselineNoseY = noseTip.y;
                        smoothedX = -1;
                        smoothedY = -1;
                    }

                    if (!isTrackingPaused) {
                        // Apply sensitivity so the head doesn't have to move too far
                        // Using a calibrated baseline prevents the mouse from getting stuck at the edges.
                        const FACE_SENSITIVITY_X = 8.0;
                        const FACE_SENSITIVITY_Y = 10.0;
                        let targetX = ((noseTip.x - baselineNoseX) * FACE_SENSITIVITY_X) + 0.5;
                        let targetY = ((noseTip.y - baselineNoseY) * FACE_SENSITIVITY_Y) + 0.5;

                        // Invert X because moving head left (towards X=0 on screen) increases noseTip.x in mirrored camera
                        targetX = 1.0 - targetX;

                        targetX = Math.max(0, Math.min(1, targetX));
                        targetY = Math.max(0, Math.min(1, targetY));

                        if (smoothedX === -1) {
                            smoothedX = targetX;
                            smoothedY = targetY;
                        } else {
                            const dx = targetX - smoothedX;
                            const dy = targetY - smoothedY;
                            const dist = Math.sqrt(dx * dx + dy * dy);

                            // Dynamic smoothing: removes vibrations at rest, fast response for intended movements
                            let dynamicSmoothing = 0.02; // Very heavy smoothing for micro-vibrations
                            if (dist > 0.01) {
                                dynamicSmoothing = Math.min(0.4, 0.02 + (dist - 0.01) * 15.0);
                            }

                            smoothedX = (targetX * dynamicSmoothing) + (smoothedX * (1.0 - dynamicSmoothing));
                            smoothedY = (targetY * dynamicSmoothing) + (smoothedY * (1.0 - dynamicSmoothing));
                        }

                        if (isScrollingMode) {
                            // Throttle scroll to max ~10 ticks per second
                            const now = performance.now();
                            if (now - lastScrollTime > 100) {
                                if (targetY < 0.4) {
                                    window.electronAPI.mouseScroll('up');
                                    lastScrollTime = now;
                                } else if (targetY > 0.6) {
                                    window.electronAPI.mouseScroll('down');
                                    lastScrollTime = now;
                                }
                            }
                        } else {
                            // Throttle IPC saturation by only sending if mouse moved >= 0.001 (0.1% of screen, ~2 pixels)
                            if (Math.abs(smoothedX - lastSentX) > 0.001 || Math.abs(smoothedY - lastSentY) > 0.001) {
                                window.electronAPI.moveMouse(smoothedX, smoothedY);
                                lastSentX = smoothedX;
                                lastSentY = smoothedY;
                            }
                        }
                    }

                    // --- UI: DRAW NOSE TRACKER ---
                    const nosePxX = noseTip.x * canvasElement.width;
                    const nosePxY = noseTip.y * canvasElement.height;

                    canvasCtx.save();

                    // Draw crosshairs on the Nose
                    canvasCtx.beginPath();
                    canvasCtx.moveTo(nosePxX - 15, nosePxY);
                    canvasCtx.lineTo(nosePxX + 15, nosePxY);
                    canvasCtx.moveTo(nosePxX, nosePxY - 15);
                    canvasCtx.lineTo(nosePxX, nosePxY + 15);
                    canvasCtx.strokeStyle = isTrackingPaused ? "#aaaaaa" : "#ff007f"; // Gray if paused, Neon pink if active
                    canvasCtx.lineWidth = 2;
                    canvasCtx.stroke();

                    // Draw an inner circle
                    canvasCtx.beginPath();
                    canvasCtx.arc(nosePxX, nosePxY, 6, 0, 2 * Math.PI);
                    canvasCtx.strokeStyle = isTrackingPaused ? "#aaaaaa" : "#00ff88"; // Gray if paused, Neon green if active
                    canvasCtx.lineWidth = 2;
                    canvasCtx.stroke();

                    // Update the measurements list to show face tracking coordinates
                    measurementsList.innerHTML = `
                  <li><span>Face Tracking:</span> <span>Active</span></li>
                  <li><span>Nose Pos X:</span> <span>${(noseTip.x * 100).toFixed(1)}%</span></li>
                  <li><span>Nose Pos Y:</span> <span>${(noseTip.y * 100).toFixed(1)}%</span></li>
              `;

                    canvasCtx.restore();
                }
            } else {
                // Reset baseline when no face is detected
                baselineNoseX = -1;
                baselineNoseY = -1;
            }

            canvasCtx.restore();
        });
    }

    if (webcamRunning === true) {
        window.requestAnimationFrame(predictWebcam);
    }
}
