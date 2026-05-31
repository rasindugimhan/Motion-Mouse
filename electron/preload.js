const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    toggleControl: () => ipcRenderer.send('toggle-control'),
    moveMouse: (x, y) => ipcRenderer.send('move-mouse', x, y),
    mouseClick: (isDown, button = 'left') => ipcRenderer.send('mouse-click', isDown, button),
    mouseScroll: (direction) => ipcRenderer.send('mouse-scroll', direction),
    quitApp: () => ipcRenderer.send('quit-app')
});
