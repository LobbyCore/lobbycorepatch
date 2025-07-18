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
// ==/UserScript==

(function() {
    'use strict';

    // Configuration with persistence
    let config = {
        enabled: false,
        connected: false,
        controllerType: 'xbox360',
        sensitivity: 0.6,
        blockKeyboardInputs: true, // Block mapped keys from normal keyboard processing
        keyMappings: {
            // Left stick (WASD)
            87: 'ANALOG_LEFT_UP',      // W
            83: 'ANALOG_LEFT_DOWN',    // S
            65: 'ANALOG_LEFT_LEFT',    // A
            68: 'ANALOG_LEFT_RIGHT',   // D

            // Right stick (IJKL)
            73: 'ANALOG_RIGHT_UP',     // I
            75: 'ANALOG_RIGHT_DOWN',   // K
            74: 'ANALOG_RIGHT_LEFT',   // J
            76: 'ANALOG_RIGHT_RIGHT',  // L

            // Face buttons
            32: 'A',                   // Space = A button
            17: 'B',                   // Ctrl = B button
            27: 'B',                   // Esc = B button
            67: 'B',                   // C = B button
            82: 'X',                   // R = X button
            70: 'X',                   // F = X button
            49: 'Y',                   // 1 = Y button

            // Shoulder buttons
            69: 'RT',                  // E = RT
            81: 'LT',                  // Q = LT
            90: 'LB',                  // Z = LB
            88: 'RB',                  // X = RB

            // Stick buttons
            16: 'L3',                  // Shift = L3
            86: 'R3',                  // V = R3

            // Menu buttons
            13: 'START',               // Enter = START
            9:  'SELECT',              // Tab = SELECT

            // D-pad (Arrow keys)
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
        const keyCode = event.keyCode;
        const mappedButton = config.keyMappings[keyCode];

        // Always block mapped keys if blocking is enabled, regardless of gamepad state
        if (mappedButton && config.blockKeyboardInputs) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }

        // Only process gamepad inputs if enabled and connected
        if (!config.enabled || !config.connected || !mappedButton) return;

        if (!controllerButtons[mappedButton]) return;

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
        const keyCode = event.keyCode;
        const mappedButton = config.keyMappings[keyCode];

        // Always block mapped keys if blocking is enabled, regardless of gamepad state
        if (mappedButton && config.blockKeyboardInputs) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }

        // Only process gamepad inputs if enabled and connected
        if (!config.enabled || !config.connected || !mappedButton) return;

        if (!controllerButtons[mappedButton]) return;

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

        // Use capture phase and highest priority to intercept keys before other handlers
        window.addEventListener("keydown", keydownListener, { capture: true, passive: false });
        window.addEventListener("keyup", keyupListener, { capture: true, passive: false });

        // Also add to document to catch events that might bypass window
        document.addEventListener("keydown", keydownListener, { capture: true, passive: false });
        document.addEventListener("keyup", keyupListener, { capture: true, passive: false });

        console.log('[FakeGamepad] Event listeners added');
    }

    function removeEventListeners() {
        if (keydownListener) {
            window.removeEventListener("keydown", keydownListener, { capture: true });
            window.removeEventListener("keyup", keyupListener, { capture: true });
            document.removeEventListener("keydown", keydownListener, { capture: true });
            document.removeEventListener("keyup", keyupListener, { capture: true });
            keydownListener = null;
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

                // Always add event listeners when connecting (for key blocking)
                if (!keydownListener) {
                    addEventListeners();
                }

                connectGamepad();
                saveConfig();
                notifyIPC('connected', { success: true });
                console.log('[FakeGamepad] Connected - Event listeners active for key blocking');
                return { success: true, message: "Fake gamepad connected" };
            },

            disconnect: function() {
                config.connected = false;

                // Only remove listeners if blocking is also disabled
                if (!config.blockKeyboardInputs) {
                    removeEventListeners();
                }

                disconnectGamepad();
                saveConfig();
                notifyIPC('disconnected', { success: true });
                console.log('[FakeGamepad] Disconnected');
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
                // Reset to your custom default mappings
                config.keyMappings = {
                    // Left stick (WASD)
                    87: 'ANALOG_LEFT_UP', 83: 'ANALOG_LEFT_DOWN',
                    65: 'ANALOG_LEFT_LEFT', 68: 'ANALOG_LEFT_RIGHT',

                    // Right stick (IJKL)
                    73: 'ANALOG_RIGHT_UP', 75: 'ANALOG_RIGHT_DOWN',
                    74: 'ANALOG_RIGHT_LEFT', 76: 'ANALOG_RIGHT_RIGHT',

                    // Face buttons
                    32: 'A',    // Space = A
                    17: 'B',    // Ctrl = B
                    27: 'B',    // Esc = B
                    67: 'B',    // C = B
                    82: 'X',    // R = X
                    70: 'X',    // F = X
                    49: 'Y',    // 1 = Y

                    // Shoulder buttons
                    69: 'RT',   // E = RT
                    81: 'LT',   // Q = LT
                    90: 'LB',   // Z = LB
                    88: 'RB',   // X = RB

                    // Stick buttons
                    16: 'L3',   // Shift = L3
                    86: 'R3',   // V = R3

                    // Menu buttons
                    13: 'START',  // Enter = START
                    9: 'SELECT',  // Tab = SELECT

                    // D-pad
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

            // Input blocking control
            setBlockKeyboardInputs: function(block) {
                const wasBlocking = config.blockKeyboardInputs;
                config.blockKeyboardInputs = block;
                saveConfig();

                console.log(`[FakeGamepad] Keyboard blocking ${block ? 'enabled' : 'disabled'}`);

                if (block && !wasBlocking) {
                    // Need to add listeners for blocking
                    if (!keydownListener) {
                        addEventListeners();
                        console.log('[FakeGamepad] Added event listeners for blocking');
                    }
                } else if (!block && wasBlocking) {
                    // Check if we should remove listeners
                    if (!config.connected && !config.enabled) {
                        removeEventListeners();
                        console.log('[FakeGamepad] Removed event listeners - no blocking needed');
                    }
                }

                notifyIPC('blockingChanged', { blocking: block });
                return { success: true, message: `Keyboard input blocking ${block ? 'enabled' : 'disabled'}` };
            },

            isBlockingKeyboardInputs: function() {
                return config.blockKeyboardInputs !== false; // Default to true for security
            },

            // Get which keys are currently mapped (for UI feedback)
            getMappedKeys: function() {
                return Object.keys(config.keyMappings).map(Number);
            },

            // Check if a specific key is mapped
            isKeyMapped: function(keyCode) {
                return keyCode in config.keyMappings;
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

        // Add event listeners if we need them for blocking or if connected
        if (config.blockKeyboardInputs || config.connected) {
            addEventListeners();
        }

        if (config.connected) {
            connectGamepad();
        }
        if (config.enabled) {
            // Enable is just a flag, doesn't need special setup
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
