import sys
import json
import pyautogui

# Disable failsafe to prevent crashes if mouse hits the corner
pyautogui.FAILSAFE = False

def process_commands():
    try:
        while True:
            line = sys.stdin.readline()
            if not line:
                break
            try:
                cmd = json.loads(line)
                if cmd['type'] == 'quit':
                    break
                elif cmd['type'] == 'move':
                    # Multiply normalized coordinates by the actual physical screen dimensions
                    screen_width, screen_height = pyautogui.size()
                    # Clamp coordinates to ensure they are strictly on-screen (0 to size-1)
                    target_x = min(max(int(cmd['x'] * screen_width), 0), screen_width - 1)
                    target_y = min(max(int(cmd['y'] * screen_height), 0), screen_height - 1)
                    pyautogui.moveTo(target_x, target_y, duration=0.0, _pause=False)
                elif cmd['type'] == 'click':
                    button = cmd.get('button', 'left')
                    if cmd['down']:
                        pyautogui.mouseDown(button=button, _pause=False)
                    else:
                        pyautogui.mouseUp(button=button, _pause=False)
                elif cmd['type'] == 'scroll':
                    pyautogui.scroll(cmd['amount'], _pause=False)
            except Exception as e:
                # Ignore malformed JSON or errors to keep process alive
                pass
    finally:
        # If the parent process crashes or terminates, stdin closes, loop ends, and we ensure mouse buttons are released.
        try:
            pyautogui.mouseUp(button='left', _pause=False)
            pyautogui.mouseUp(button='right', _pause=False)
            pyautogui.mouseUp(button='middle', _pause=False)
        except Exception:
            pass

if __name__ == "__main__":
    process_commands()
