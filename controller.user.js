// ==UserScript==
// @name         Enhanced Fake Gamepad Controller for Browser Manager
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Advanced fake gamepad controller with IPC integration and persistent settings
// @author       You
// @match        https://www.xbox.com/*
// @match        https://xbox.com/*
// @grant        none
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // Configuration with persistence
    let config = {
        enabled: false,
        connected: false,
        controllerType: 'xbox360',
        sensitivity: 0.6,
        keyMappings: {
            // Default WASD + Gaming layout
            87: 'ANALOG_LEFT_UP',      // W
            83: 'ANALOG_LEFT_DOWN',    // S
            65: 'ANALOG_LEFT_LEFT',    // A
            68: 'ANALOG_LEFT_RIGHT',   // D
            73: 'ANALOG_RIGHT_UP',     // I
            75: 'ANALOG_RIGHT_DOWN',   // K
            74: 'ANALOG_RIGHT_LEFT',   // J
            76: 'ANALOG_RIGHT_RIGHT',  // L
            32: 'A',                   // Space
            16: 'B',                   // Shift
            17: 'X',                   // Ctrl
            18: 'Y',                   // Alt
            81: 'LB',                  // Q
            69: 'RB',                  // E
            82: 'LT',                  // R
            84: 'RT',                  // T
            9:  'SELECT',              // Tab
            13: 'START',               // Enter
            70: 'L3',                  // F
            71: 'R3',                  // G
            38: 'STICK_UP',            // Arrow Up
            40: 'STICK_DOWN',          // Arrow Down
            37: 'STICK_LEFT',          // Arrow Left
            39: 'STICK_RIGHT'          // Arrow Right
        }
    };

    // Load saved configuration
    function loadConfig() {
        try {
            const saved = localStorage.getItem('FakeGamepadConfig');
            if (saved) {
                const parsed = JSON.parse(saved);
                config = { ...config, ...parsed };
                console.log('[FakeGamepad] Loaded saved configuration');
            }
        } catch (error) {
            console.warn('[FakeGamepad] Failed to load saved config:', error);
        }
    }

    // Save configuration
    function saveConfig() {
        try {
            localStorage.setItem('FakeGamepadConfig', JSON.stringify(config));
            console.log('[FakeGamepad] Configuration saved');
        } catch (error) {
            console.warn('[FakeGamepad] Failed to save config:', error);
        }
    }

    // Load config on startup
    loadConfig();

    // Store real gamepads
    const real_gamepads = navigator.getGamepads();
    let originalGetGamepads = navigator.getGamepads.bind(navigator);

    // Controller state tracking
    const controllerButtons = {
        ANALOG_LEFT_RIGHT: {pressed: false},
        ANALOG_LEFT_LEFT: {pressed: false},
        ANALOG_LEFT_UP: {pressed: false},
        ANALOG_LEFT_DOWN: {pressed: false},
        ANALOG_RIGHT_RIGHT: {pressed: false},
        ANALOG_RIGHT_LEFT: {pressed: false},
        ANALOG_RIGHT_UP: {pressed: false},
        ANALOG_RIGHT_DOWN: {pressed: false},
        STICK_RIGHT: {pressed: false},
        STICK_LEFT: {pressed: false},
        STICK_UP: {pressed: false},
        STICK_DOWN: {pressed: false},
        A: {pressed: false},
        B: {pressed: false},
        X: {pressed: false},
        Y: {pressed: false},
        START: {pressed: false},
        SELECT: {pressed: false},
        LT: {pressed: false},
        LB: {pressed: false},
        RT: {pressed: false},
        R3: {pressed: false},
        L3: {pressed: false},
        RB: {pressed: false}
    };

    // Controller types
    const controllerTypes = {
        'xbox360': 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
        'xboxone': 'Xbox One Controller (STANDARD GAMEPAD Vendor: 045e Product: 02ea)',
        'ps4': 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
        'ps5': 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'
    };

    // Fake controller object
    const fakeController = {
        axes: [0, 0, 0, 0],
        buttons: Array(17).fill().map(() => ({
            pressed: false,
            touched: false,
            value: 0,
        })),
        connected: false,
        id: controllerTypes[config.controllerType],
        index: 0,
        mapping: 'standard',
        timestamp: performance.now(),
        hapticActuators: [],
    };

    // Update controller ID when type changes
    function updateControllerType() {
        fakeController.id = controllerTypes[config.controllerType];
        fakeController.timestamp = performance.now();
    }

    // Event listeners
    let keydownListener, keyupListener;
    let gamepadOverrideActive = false;

    function simulateButtonPress(buttonIndex) {
        if (buttonIndex >= 0 && buttonIndex < fakeController.buttons.length) {
            fakeController.buttons[buttonIndex].pressed = true;
            fakeController.buttons[buttonIndex].touched = true;
            fakeController.buttons[buttonIndex].value = 1;
            fakeController.timestamp = performance.now();
        }
    }

    function simulateButtonUnpress(buttonIndex) {
        if (buttonIndex >= 0 && buttonIndex < fakeController.buttons.length) {
            fakeController.buttons[buttonIndex].touched = false;
            fakeController.buttons[buttonIndex].pressed = false;
            fakeController.buttons[buttonIndex].value = 0;
            fakeController.timestamp = performance.now();
        }
    }

    // Button mapping
    const buttonMap = {
        'A': 0, 'B': 1, 'X': 2, 'Y': 3,
        'LB': 4, 'RB': 5, 'LT': 6, 'RT': 7,
        'SELECT': 8, 'START': 9, 'L3': 10, 'R3': 11,
        'STICK_UP': 12, 'STICK_DOWN': 13, 'STICK_LEFT': 14, 'STICK_RIGHT': 15
    };

    // Analog stick functions
    function setAnalogStick(stick, x, y) {
        const leftStick = stick === 'left';
        const xIndex = leftStick ? 0 : 2;
        const yIndex = leftStick ? 1 : 3;

        fakeController.axes[xIndex] = Math.max(-1, Math.min(1, x * config.sensitivity));
        fakeController.axes[yIndex] = Math.max(-1, Math.min(1, y * config.sensitivity));
        fakeController.timestamp = performance.now();
    }

    function resetAnalogFromOppositePosition(current_position) {
        const opposites = {
            'ANALOG_LEFT_RIGHT': 'ANALOG_LEFT_LEFT',
            'ANALOG_LEFT_LEFT': 'ANALOG_LEFT_RIGHT',
            'ANALOG_LEFT_UP': 'ANALOG_LEFT_DOWN',
            'ANALOG_LEFT_DOWN': 'ANALOG_LEFT_UP',
            'ANALOG_RIGHT_RIGHT': 'ANALOG_RIGHT_LEFT',
            'ANALOG_RIGHT_LEFT': 'ANALOG_RIGHT_RIGHT',
            'ANALOG_RIGHT_UP': 'ANALOG_RIGHT_DOWN',
            'ANALOG_RIGHT_DOWN': 'ANALOG_RIGHT_UP'
        };

        const opposite = opposites[current_position];
        if (opposite && controllerButtons[opposite]) {
            controllerButtons[opposite].pressed = false;
        }
    }

    function updateAnalogSticks() {
        // Left stick
        let leftX = 0, leftY = 0;
        if (controllerButtons.ANALOG_LEFT_LEFT.pressed) leftX = -1;
        if (controllerButtons.ANALOG_LEFT_RIGHT.pressed) leftX = 1;
        if (controllerButtons.ANALOG_LEFT_UP.pressed) leftY = -1;
        if (controllerButtons.ANALOG_LEFT_DOWN.pressed) leftY = 1;

        // Right stick
        let rightX = 0, rightY = 0;
        if (controllerButtons.ANALOG_RIGHT_LEFT.pressed) rightX = -1;
        if (controllerButtons.ANALOG_RIGHT_RIGHT.pressed) rightX = 1;
        if (controllerButtons.ANALOG_RIGHT_UP.pressed) rightY = -1;
        if (controllerButtons.ANALOG_RIGHT_DOWN.pressed) rightY = 1;

        setAnalogStick('left', leftX, leftY);
        setAnalogStick('right', rightX, rightY);
    }

    function handleKeyUp(event) {
        if (!config.enabled || !config.connected) return;

        const keyCode = event.keyCode;
        const mappedButton = config.keyMappings[keyCode];
        if (!mappedButton || !controllerButtons[mappedButton]) return;

        controllerButtons[mappedButton].pressed = false;

        // Handle button releases
        if (buttonMap[mappedButton] !== undefined) {
            simulateButtonUnpress(buttonMap[mappedButton]);
        }

        // Update analog sticks
        if (mappedButton.startsWith('ANALOG_')) {
            updateAnalogSticks();
        }

        // Notify IPC if available
        notifyIPC('keyUp', { keyCode, button: mappedButton });
    }

    function handleKeyDown(event) {
        if (!config.enabled || !config.connected) return;

        const keyCode = event.keyCode;
        const mappedButton = config.keyMappings[keyCode];
        if (!mappedButton || !controllerButtons[mappedButton]) return;

        // Prevent default for mapped keys
        event.preventDefault();

        // Reset opposite analog directions
        if (mappedButton.startsWith('ANALOG_')) {
            resetAnalogFromOppositePosition(mappedButton);
        }

        controllerButtons[mappedButton].pressed = true;

        // Handle button presses
        if (buttonMap[mappedButton] !== undefined) {
            simulateButtonPress(buttonMap[mappedButton]);
        }

        // Update analog sticks
        if (mappedButton.startsWith('ANALOG_')) {
            updateAnalogSticks();
        }

        // Notify IPC if available
        notifyIPC('keyDown', { keyCode, button: mappedButton });
    }

    function connectGamepad() {
        if (!config.connected) return;

        const event = new Event('gamepadconnected');
        fakeController.connected = true;
        fakeController.timestamp = performance.now();
        event.gamepad = fakeController;

        if (!gamepadOverrideActive) {
            navigator.getGamepads = function getGamepads() {
                return config.enabled ? [{ ...fakeController }] : originalGetGamepads();
            };
            gamepadOverrideActive = true;
        }

        window.dispatchEvent(event);
        console.log('[FakeGamepad] Gamepad connected');
    }

    function disconnectGamepad() {
        const event = new Event('gamepaddisconnected');
        fakeController.connected = false;
        fakeController.timestamp = performance.now();
        event.gamepad = fakeController;

        if (gamepadOverrideActive) {
            navigator.getGamepads = originalGetGamepads;
            gamepadOverrideActive = false;
        }

        window.dispatchEvent(event);
        console.log('[FakeGamepad] Gamepad disconnected');
    }

    function addEventListeners() {
        if (keydownListener || keyupListener) return;

        keydownListener = handleKeyDown;
        keyupListener = handleKeyUp;
        window.addEventListener("keydown", keydownListener, true);
        window.addEventListener("keyup", keyupListener, true);
        console.log('[FakeGamepad] Event listeners added');
    }

    function removeEventListeners() {
        if (keydownListener) {
            window.removeEventListener("keydown", keydownListener, true);
            keydownListener = null;
        }
        if (keyupListener) {
            window.removeEventListener("keyup", keyupListener, true);
            keyupListener = null;
        }
        console.log('[FakeGamepad] Event listeners removed');
    }

    // IPC Communication helpers
    function notifyIPC(event, data) {
        if (window.electronAPI && window.electronAPI.gamepadEvent) {
            window.electronAPI.gamepadEvent(event, data);
        }
    }

    function setupIPCListeners() {
        // Listen for IPC commands from main process
        if (window.electronAPI && window.electronAPI.onGamepadCommand) {
            window.electronAPI.onGamepadCommand((command, data) => {
                console.log('[FakeGamepad] Received IPC command:', command, data);

                switch (command) {
                    case 'connect':
                        window.FakeGamepadAPI.connect();
                        break;
                    case 'disconnect':
                        window.FakeGamepadAPI.disconnect();
                        break;
                    case 'setKeyMapping':
                        window.FakeGamepadAPI.setKeyMapping(data.keyCode, data.button);
                        break;
                    case 'setControllerType':
                        window.FakeGamepadAPI.setControllerType(data.type);
                        break;
                    case 'getStatus':
                        const status = window.FakeGamepadAPI.getStatus();
                        notifyIPC('status', status);
                        break;
                }
            });
        }
    }

    // Create the global API
    function createAPI() {
        window.FakeGamepadAPI = {
            // Connection control
            connect: function() {
                config.connected = true;
                addEventListeners();
                connectGamepad();
                saveConfig();
                notifyIPC('connected', { success: true });
                return { success: true, message: "Fake gamepad connected" };
            },

            disconnect: function() {
                config.connected = false;
                removeEventListeners();
                disconnectGamepad();
                saveConfig();
                notifyIPC('disconnected', { success: true });
                return { success: true, message: "Fake gamepad disconnected" };
            },

            // Enable/disable (different from connect - this controls input processing)
            enable: function() {
                config.enabled = true;
                saveConfig();
                return { success: true, message: "Input processing enabled" };
            },

            disable: function() {
                config.enabled = false;
                saveConfig();
                return { success: true, message: "Input processing disabled" };
            },

            // Status and configuration
            getStatus: function() {
                return {
                    enabled: config.enabled,
                    connected: config.connected,
                    controllerType: config.controllerType,
                    controllerId: fakeController.id,
                    sensitivity: config.sensitivity,
                    axes: [...fakeController.axes],
                    pressedButtons: Object.keys(controllerButtons).filter(key => controllerButtons[key].pressed),
                    keyMappings: { ...config.keyMappings }
                };
            },

            // Key mapping functions
            setKeyMapping: function(keyCode, button) {
                if (typeof keyCode === 'number' && typeof button === 'string') {
                    config.keyMappings[keyCode] = button;
                    saveConfig();
                    notifyIPC('keyMappingChanged', { keyCode, button });
                    return { success: true, message: `Key ${keyCode} mapped to ${button}` };
                }
                return { success: false, message: "Invalid parameters" };
            },

            removeKeyMapping: function(keyCode) {
                if (config.keyMappings[keyCode]) {
                    delete config.keyMappings[keyCode];
                    saveConfig();
                    notifyIPC('keyMappingRemoved', { keyCode });
                    return { success: true, message: `Key mapping removed for ${keyCode}` };
                }
                return { success: false, message: "Key mapping not found" };
            },

            getKeyMapping: function(keyCode) {
                if (keyCode !== undefined) {
                    return config.keyMappings[keyCode] || null;
                }
                return { ...config.keyMappings };
            },

            setKeyMappings: function(mappings) {
                if (typeof mappings === 'object' && mappings !== null) {
                    config.keyMappings = { ...mappings };
                    saveConfig();
                    notifyIPC('keyMappingsChanged', { mappings: config.keyMappings });
                    return { success: true, message: "Key mappings updated" };
                }
                return { success: false, message: "Invalid mappings object" };
            },

            resetKeyMappings: function() {
                // Reset to default mappings
                config.keyMappings = {
                    87: 'ANALOG_LEFT_UP', 83: 'ANALOG_LEFT_DOWN',
                    65: 'ANALOG_LEFT_LEFT', 68: 'ANALOG_LEFT_RIGHT',
                    73: 'ANALOG_RIGHT_UP', 75: 'ANALOG_RIGHT_DOWN',
                    74: 'ANALOG_RIGHT_LEFT', 76: 'ANALOG_RIGHT_RIGHT',
                    32: 'A', 16: 'B', 17: 'X', 18: 'Y',
                    81: 'LB', 69: 'RB', 82: 'LT', 84: 'RT',
                    9: 'SELECT', 13: 'START', 70: 'L3', 71: 'R3',
                    38: 'STICK_UP', 40: 'STICK_DOWN',
                    37: 'STICK_LEFT', 39: 'STICK_RIGHT'
                };
                saveConfig();
                return { success: true, message: "Key mappings reset to defaults" };
            },

            // Controller type
            setControllerType: function(type) {
                if (controllerTypes[type]) {
                    config.controllerType = type;
                    updateControllerType();
                    saveConfig();
                    notifyIPC('controllerTypeChanged', { type });
                    return { success: true, message: `Controller type set to ${type}` };
                }
                return { success: false, message: "Invalid controller type. Use: xbox360, xboxone, ps4, ps5" };
            },

            getControllerType: function() {
                return config.controllerType;
            },

            // Direct button control
            pressButton: function(buttonIndex) {
                simulateButtonPress(buttonIndex);
                return { success: true, message: `Button ${buttonIndex} pressed` };
            },

            releaseButton: function(buttonIndex) {
                simulateButtonUnpress(buttonIndex);
                return { success: true, message: `Button ${buttonIndex} released` };
            },

            // Analog stick control
            setAnalogStick: function(stick, x, y) {
                setAnalogStick(stick, x, y);
                return { success: true, message: `${stick} stick set to (${x}, ${y})` };
            },

            // Configuration
            setSensitivity: function(value) {
                config.sensitivity = Math.max(0.1, Math.min(2.0, value));
                saveConfig();
                return { success: true, message: `Sensitivity set to ${config.sensitivity}` };
            },

            getSensitivity: function() {
                return config.sensitivity;
            },

            // Configuration management
            exportConfig: function() {
                return JSON.stringify(config, null, 2);
            },

            importConfig: function(configJson) {
                try {
                    const importedConfig = JSON.parse(configJson);
                    config = { ...config, ...importedConfig };
                    updateControllerType();
                    saveConfig();
                    return { success: true, message: "Configuration imported successfully" };
                } catch (error) {
                    return { success: false, message: "Invalid configuration format" };
                }
            },

            // Utility functions
            getAvailableButtons: function() {
                return Object.keys(controllerButtons);
            },

            getControllerTypes: function() {
                return Object.keys(controllerTypes);
            },

            // Event system for external listeners
            addEventListener: function(event, callback) {
                window.addEventListener(`fakeGamepad${event}`, callback);
            },

            removeEventListener: function(event, callback) {
                window.removeEventListener(`fakeGamepad${event}`, callback);
            }
        };

        // Make it available globally
        window.fakeGamepadAPI = window.FakeGamepadAPI;

        // Setup IPC communication
        setupIPCListeners();

        // Apply saved configuration
        updateControllerType();
        if (config.connected) {
            window.FakeGamepadAPI.connect();
        }
        if (config.enabled) {
            window.FakeGamepadAPI.enable();
        }

        console.log("✅ Enhanced Fake Gamepad API loaded successfully!");
        console.log("Controller Type:", config.controllerType);
        console.log("Connected:", config.connected);
        console.log("Enabled:", config.enabled);
        console.log("Available methods:", Object.keys(window.FakeGamepadAPI));

        // Notify main process that API is ready
        notifyIPC('apiReady', window.FakeGamepadAPI.getStatus());
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createAPI);
    } else {
        createAPI();
    }

})();
