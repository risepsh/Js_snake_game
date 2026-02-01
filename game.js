// ============================================
// Jay's 지렁이게임 - Main Game Logic
// ============================================

// ============================================
// Configuration & Constants
// ============================================
const CONFIG = {
    CELL_SIZE: 20,
    BOARD_SIZES: {
        small: { cols: 20, rows: 15 },
        medium: { cols: 25, rows: 20 },
        large: { cols: 30, rows: 25 }
    },
    INITIAL_SPEED: 140, // ms per tick
    DIFFICULTY_CURVES: {
        gentle: 4,
        normal: 6,
        steep: 8
    },
    MIN_SPEED: 60,
    COMBO_DURATION: 2500, // ms
    ITEM_DURATION: 5000, // ms
    ITEM_SPAWN_CHANCE: 0.15, // 15% chance per food eaten
    OBSTACLE_SPAWN_LEVEL: 3,
    FOODS_PER_LEVEL: 5,
    COLORS: {
        SNAKE_HEAD: '#4ade80',
        SNAKE_BODY: '#22c55e',
        FOOD: '#ef4444',
        OBSTACLE: '#64748b',
        OBSTACLE_WARNING: 'rgba(100, 116, 139, 0.3)',
        ITEM_SLOW: '#3b82f6',
        ITEM_GHOST: '#a78bfa',
        ITEM_MULTIPLIER: '#fbbf24',
        GRID: '#374151',
        BACKGROUND: '#1a1a2e'
    }
};

// ============================================
// Utility Functions
// ============================================
const Utils = {
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    },

    coordToString(x, y) {
        return `${x},${y}`;
    },

    coordsEqual(a, b) {
        return a.x === b.x && a.y === b.y;
    }
};

// ============================================
// Storage Manager
// ============================================
const Storage = {
    getBestScore() {
        return parseInt(localStorage.getItem('snake.best') || '0');
    },

    setBestScore(score) {
        localStorage.setItem('snake.best', score.toString());
    },

    getSettings() {
        const defaults = {
            boardSize: 'medium',
            wallMode: 'solid',
            difficultyCurve: 'normal'
        };
        try {
            const saved = localStorage.getItem('snake.settings');
            return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
        } catch {
            return defaults;
        }
    },

    saveSettings(settings) {
        localStorage.setItem('snake.settings', JSON.stringify(settings));
    }
};

// ============================================
// Game State
// ============================================
class GameState {
    constructor(settings) {
        this.settings = settings;
        const boardSize = CONFIG.BOARD_SIZES[settings.boardSize];
        this.cols = boardSize.cols;
        this.rows = boardSize.rows;

        this.status = 'menu'; // 'menu', 'playing', 'paused', 'gameover'
        this.snake = [];
        this.dir = { x: 1, y: 0 };
        this.dirQueue = [];
        this.food = null;
        this.items = [];
        this.obstacles = new Set();
        this.warningObstacles = [];

        this.score = 0;
        this.best = Storage.getBestScore();
        this.level = 1;
        this.foodsEaten = 0;

        this.combo = {
            streak: 0,
            expiresAt: 0
        };

        this.effects = {
            slowUntil: 0,
            ghostUntil: 0,
            multUntil: 0
        };

        this.tickInterval = CONFIG.INITIAL_SPEED;
        this.lastTickTime = 0;
        this.accumulator = 0;
    }

    reset() {
        this.snake = [
            { x: Math.floor(this.cols / 2), y: Math.floor(this.rows / 2) }
        ];
        this.dir = { x: 1, y: 0 };
        this.dirQueue = [];
        this.food = null;
        this.items = [];
        this.obstacles.clear();
        this.warningObstacles = [];

        this.score = 0;
        this.level = 1;
        this.foodsEaten = 0;

        this.combo = { streak: 0, expiresAt: 0 };
        this.effects = { slowUntil: 0, ghostUntil: 0, multUntil: 0 };

        this.tickInterval = CONFIG.INITIAL_SPEED;
        this.lastTickTime = 0;
        this.accumulator = 0;

        this.spawnFood();
    }

    getOccupiedPositions() {
        const occupied = new Set();

        // Snake
        this.snake.forEach(seg => {
            occupied.add(Utils.coordToString(seg.x, seg.y));
        });

        // Food
        if (this.food) {
            occupied.add(Utils.coordToString(this.food.x, this.food.y));
        }

        // Items
        this.items.forEach(item => {
            occupied.add(Utils.coordToString(item.pos.x, item.pos.y));
        });

        // Obstacles
        this.obstacles.forEach(obstacleStr => {
            occupied.add(obstacleStr);
        });

        // Warning obstacles
        this.warningObstacles.forEach(warn => {
            occupied.add(Utils.coordToString(warn.pos.x, warn.pos.y));
        });

        return occupied;
    }

    findEmptyPosition() {
        const occupied = this.getOccupiedPositions();
        const maxAttempts = 100;

        for (let i = 0; i < maxAttempts; i++) {
            const x = Utils.randomInt(0, this.cols - 1);
            const y = Utils.randomInt(0, this.rows - 1);
            const key = Utils.coordToString(x, y);

            if (!occupied.has(key)) {
                return { x, y };
            }
        }

        // Fallback: find all empty positions
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const key = Utils.coordToString(x, y);
                if (!occupied.has(key)) {
                    return { x, y };
                }
            }
        }

        return null;
    }

    spawnFood() {
        const pos = this.findEmptyPosition();
        if (pos) {
            this.food = pos;
        }
    }

    spawnItem() {
        if (Math.random() > CONFIG.ITEM_SPAWN_CHANCE) return;

        const pos = this.findEmptyPosition();
        if (!pos) return;

        const types = ['slow', 'ghost', 'multiplier'];
        const type = Utils.randomChoice(types);

        this.items.push({
            type,
            pos,
            spawnedAt: Date.now()
        });
    }

    spawnObstacle() {
        if (this.level < CONFIG.OBSTACLE_SPAWN_LEVEL) return;

        const pos = this.findEmptyPosition();
        if (!pos) return;

        // Add as warning first
        this.warningObstacles.push({
            pos,
            activatesAt: Date.now() + 1500
        });
    }

    updateWarningObstacles() {
        const now = Date.now();
        const toActivate = [];

        this.warningObstacles = this.warningObstacles.filter(warn => {
            if (now >= warn.activatesAt) {
                toActivate.push(warn.pos);
                return false;
            }
            return true;
        });

        toActivate.forEach(pos => {
            this.obstacles.add(Utils.coordToString(pos.x, pos.y));
        });
    }

    updateLevel() {
        const newLevel = Math.floor(this.foodsEaten / CONFIG.FOODS_PER_LEVEL) + 1;
        if (newLevel > this.level) {
            this.level = newLevel;
            this.updateSpeed();

            // Spawn obstacle on level up
            if (this.level >= CONFIG.OBSTACLE_SPAWN_LEVEL) {
                this.spawnObstacle();
            }
        }
    }

    updateSpeed() {
        const curve = CONFIG.DIFFICULTY_CURVES[this.settings.difficultyCurve];
        const decrease = (this.level - 1) * curve;
        this.tickInterval = Math.max(CONFIG.MIN_SPEED, CONFIG.INITIAL_SPEED - decrease);
    }

    getCurrentSpeed() {
        return this.effects.slowUntil > Date.now()
            ? this.tickInterval * 1.5
            : this.tickInterval;
    }

    updateCombo() {
        const now = Date.now();
        if (now > this.combo.expiresAt && this.combo.streak > 0) {
            this.combo.streak = 0;
        }
    }

    addScore(basePoints) {
        const comboBonus = this.combo.streak * 2;
        let total = basePoints + comboBonus;

        if (this.effects.multUntil > Date.now()) {
            total *= 2;
        }

        this.score += total;

        if (this.score > this.best) {
            this.best = this.score;
            Storage.setBestScore(this.best);
        }
    }

    addCombo() {
        this.combo.streak++;
        this.combo.expiresAt = Date.now() + CONFIG.COMBO_DURATION;
    }
}

// ============================================
// Input Manager
// ============================================
class InputManager {
    constructor(game) {
        this.game = game;
        this.dirMap = {
            'ArrowUp': { x: 0, y: -1 },
            'ArrowDown': { x: 0, y: 1 },
            'ArrowLeft': { x: -1, y: 0 },
            'ArrowRight': { x: 1, y: 0 }
        };

        this.setupListeners();
    }

    setupListeners() {
        document.addEventListener('keydown', (e) => {
            if (this.game.state.status !== 'playing') return;

            // Direction input
            if (this.dirMap[e.key]) {
                e.preventDefault();
                this.queueDirection(this.dirMap[e.key]);
            }

            // Pause
            if (e.key === 'Escape') {
                e.preventDefault();
                this.game.pause();
            }

            // Restart
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                this.game.restart();
            }
        });
    }

    queueDirection(newDir) {
        const state = this.game.state;

        // Get the last direction in queue or current direction
        const lastDir = state.dirQueue.length > 0
            ? state.dirQueue[state.dirQueue.length - 1]
            : state.dir;

        // Prevent opposite direction
        if (newDir.x === -lastDir.x && newDir.y === -lastDir.y) {
            return;
        }

        // Prevent duplicate
        if (newDir.x === lastDir.x && newDir.y === lastDir.y) {
            return;
        }

        // Add to queue (max 2)
        if (state.dirQueue.length < 2) {
            state.dirQueue.push(newDir);
        }
    }
}

// ============================================
// Collision Manager
// ============================================
class CollisionManager {
    constructor(state) {
        this.state = state;
    }

    checkWallCollision(pos) {
        if (this.state.settings.wallMode === 'wrap') {
            return false;
        }
        return pos.x < 0 || pos.x >= this.state.cols ||
               pos.y < 0 || pos.y >= this.state.rows;
    }

    checkBodyCollision(pos) {
        // Skip head (index 0)
        for (let i = 1; i < this.state.snake.length; i++) {
            if (Utils.coordsEqual(pos, this.state.snake[i])) {
                return true;
            }
        }
        return false;
    }

    checkObstacleCollision(pos) {
        const key = Utils.coordToString(pos.x, pos.y);
        return this.state.obstacles.has(key);
    }

    checkCollision(pos) {
        // Wall collision
        if (this.checkWallCollision(pos)) {
            return true;
        }

        // Body collision (unless ghost active)
        if (this.state.effects.ghostUntil < Date.now()) {
            if (this.checkBodyCollision(pos)) {
                return true;
            }
        }

        // Obstacle collision
        if (this.checkObstacleCollision(pos)) {
            return true;
        }

        return false;
    }

    wrapPosition(pos) {
        return {
            x: (pos.x + this.state.cols) % this.state.cols,
            y: (pos.y + this.state.rows) % this.state.rows
        };
    }
}

// ============================================
// Renderer
// ============================================
class Renderer {
    constructor(canvas, state) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = state;
        this.resizeCanvas();
    }

    resizeCanvas() {
        this.canvas.width = this.state.cols * CONFIG.CELL_SIZE;
        this.canvas.height = this.state.rows * CONFIG.CELL_SIZE;
    }

    clear() {
        this.ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawGrid() {
        this.ctx.strokeStyle = CONFIG.COLORS.GRID;
        this.ctx.lineWidth = 0.5;

        for (let x = 0; x <= this.state.cols; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * CONFIG.CELL_SIZE, 0);
            this.ctx.lineTo(x * CONFIG.CELL_SIZE, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y <= this.state.rows; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * CONFIG.CELL_SIZE);
            this.ctx.lineTo(this.canvas.width, y * CONFIG.CELL_SIZE);
            this.ctx.stroke();
        }
    }

    drawCell(x, y, color, isCircle = false) {
        const px = x * CONFIG.CELL_SIZE;
        const py = y * CONFIG.CELL_SIZE;

        this.ctx.fillStyle = color;

        if (isCircle) {
            this.ctx.beginPath();
            this.ctx.arc(
                px + CONFIG.CELL_SIZE / 2,
                py + CONFIG.CELL_SIZE / 2,
                CONFIG.CELL_SIZE / 2 - 2,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
        } else {
            this.ctx.fillRect(
                px + 1,
                py + 1,
                CONFIG.CELL_SIZE - 2,
                CONFIG.CELL_SIZE - 2
            );
        }
    }

    drawObstacles() {
        this.state.obstacles.forEach(obstacleStr => {
            const [x, y] = obstacleStr.split(',').map(Number);
            this.drawCell(x, y, CONFIG.COLORS.OBSTACLE);
        });

        this.state.warningObstacles.forEach(warn => {
            this.drawCell(warn.pos.x, warn.pos.y, CONFIG.COLORS.OBSTACLE_WARNING);
        });
    }

    drawFood() {
        if (this.state.food) {
            this.drawCell(this.state.food.x, this.state.food.y, CONFIG.COLORS.FOOD, true);
        }
    }

    drawItems() {
        const now = Date.now();
        this.state.items.forEach(item => {
            let color;
            switch (item.type) {
                case 'slow': color = CONFIG.COLORS.ITEM_SLOW; break;
                case 'ghost': color = CONFIG.COLORS.ITEM_GHOST; break;
                case 'multiplier': color = CONFIG.COLORS.ITEM_MULTIPLIER; break;
            }

            // Blink when about to expire
            const timeLeft = CONFIG.ITEM_DURATION - (now - item.spawnedAt);
            if (timeLeft < 1000 && Math.floor(now / 200) % 2 === 0) {
                return;
            }

            this.drawCell(item.pos.x, item.pos.y, color, true);
        });
    }

    drawSnake() {
        const isGhost = this.state.effects.ghostUntil > Date.now();

        // Draw body
        for (let i = 1; i < this.state.snake.length; i++) {
            const seg = this.state.snake[i];
            this.ctx.fillStyle = CONFIG.COLORS.SNAKE_BODY;
            if (isGhost) {
                this.ctx.globalAlpha = 0.5;
            }
            this.drawCell(seg.x, seg.y, CONFIG.COLORS.SNAKE_BODY);
            this.ctx.globalAlpha = 1;
        }

        // Draw head
        if (this.state.snake.length > 0) {
            const head = this.state.snake[0];
            this.drawCell(head.x, head.y, CONFIG.COLORS.SNAKE_HEAD);

            // Draw eyes
            this.ctx.fillStyle = '#000';
            const px = head.x * CONFIG.CELL_SIZE;
            const py = head.y * CONFIG.CELL_SIZE;
            const eyeSize = 3;

            if (this.state.dir.x === 1) { // Right
                this.ctx.fillRect(px + 12, py + 6, eyeSize, eyeSize);
                this.ctx.fillRect(px + 12, py + 12, eyeSize, eyeSize);
            } else if (this.state.dir.x === -1) { // Left
                this.ctx.fillRect(px + 5, py + 6, eyeSize, eyeSize);
                this.ctx.fillRect(px + 5, py + 12, eyeSize, eyeSize);
            } else if (this.state.dir.y === -1) { // Up
                this.ctx.fillRect(px + 6, py + 5, eyeSize, eyeSize);
                this.ctx.fillRect(px + 12, py + 5, eyeSize, eyeSize);
            } else { // Down
                this.ctx.fillRect(px + 6, py + 12, eyeSize, eyeSize);
                this.ctx.fillRect(px + 12, py + 12, eyeSize, eyeSize);
            }
        }
    }

    render() {
        this.clear();
        this.drawGrid();
        this.drawObstacles();
        this.drawFood();
        this.drawItems();
        this.drawSnake();
    }
}

// ============================================
// HUD Manager
// ============================================
class HUDManager {
    constructor(state) {
        this.state = state;
        this.elements = {
            score: document.getElementById('scoreDisplay'),
            best: document.getElementById('bestDisplay'),
            level: document.getElementById('levelDisplay'),
            speed: document.getElementById('speedDisplay'),
            combo: document.getElementById('comboDisplay'),
            comboBarFill: document.getElementById('comboBarFill'),
            effects: document.getElementById('effectsDisplay')
        };
    }

    update() {
        this.elements.score.textContent = this.state.score;
        this.elements.best.textContent = this.state.best;
        this.elements.level.textContent = this.state.level;

        const speedMultiplier = CONFIG.INITIAL_SPEED / this.state.getCurrentSpeed();
        this.elements.speed.textContent = speedMultiplier.toFixed(1) + 'x';

        this.elements.combo.textContent = this.state.combo.streak;

        // Combo bar
        const now = Date.now();
        if (this.state.combo.streak > 0 && this.state.combo.expiresAt > now) {
            const remaining = this.state.combo.expiresAt - now;
            const percent = (remaining / CONFIG.COMBO_DURATION) * 100;
            this.elements.comboBarFill.style.width = percent + '%';
        } else {
            this.elements.comboBarFill.style.width = '0%';
        }

        // Effects
        this.updateEffects();
    }

    updateEffects() {
        const now = Date.now();
        const effects = [];

        if (this.state.effects.slowUntil > now) {
            const remaining = Math.ceil((this.state.effects.slowUntil - now) / 1000);
            effects.push({ type: 'slow', label: `🐌 느림 ${remaining}s` });
        }

        if (this.state.effects.ghostUntil > now) {
            const remaining = Math.ceil((this.state.effects.ghostUntil - now) / 1000);
            effects.push({ type: 'ghost', label: `👻 유령 ${remaining}s` });
        }

        if (this.state.effects.multUntil > now) {
            const remaining = Math.ceil((this.state.effects.multUntil - now) / 1000);
            effects.push({ type: 'multiplier', label: `✨ x2 ${remaining}s` });
        }

        this.elements.effects.innerHTML = effects.map(effect =>
            `<div class="effect-badge effect-${effect.type}">${effect.label}</div>`
        ).join('');
    }
}

// ============================================
// Main Game Class
// ============================================
class Game {
    constructor() {
        this.settings = Storage.getSettings();
        this.state = new GameState(this.settings);
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas, this.state);
        this.collision = new CollisionManager(this.state);
        this.input = new InputManager(this);
        this.hud = new HUDManager(this.state);

        this.setupUI();
        this.loadSettings();
        this.hud.update();

        this.animationId = null;
        this.lastFrameTime = 0;
    }

    setupUI() {
        // Start button
        document.getElementById('startBtn').addEventListener('click', () => {
            this.start();
        });

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettings();
        });

        // Save settings
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
        });

        // Resume
        document.getElementById('resumeBtn').addEventListener('click', () => {
            this.resume();
        });

        // Restart buttons
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.restart();
        });
        document.getElementById('restartFromPauseBtn').addEventListener('click', () => {
            this.restart();
        });

        // Menu buttons
        document.getElementById('menuBtn').addEventListener('click', () => {
            this.showMenu();
        });
        document.getElementById('menuFromPauseBtn').addEventListener('click', () => {
            this.showMenu();
        });
    }

    loadSettings() {
        document.getElementById('boardSize').value = this.settings.boardSize;
        document.getElementById('wallMode').value = this.settings.wallMode;
        document.getElementById('difficultyCurve').value = this.settings.difficultyCurve;
    }

    saveSettings() {
        this.settings = {
            boardSize: document.getElementById('boardSize').value,
            wallMode: document.getElementById('wallMode').value,
            difficultyCurve: document.getElementById('difficultyCurve').value
        };
        Storage.saveSettings(this.settings);

        // Restart game with new settings
        this.state = new GameState(this.settings);
        this.renderer = new Renderer(this.canvas, this.state);
        this.collision = new CollisionManager(this.state);
        this.hud = new HUDManager(this.state);

        this.showMenu();
    }

    showScreen(screenId) {
        ['menuScreen', 'pauseScreen', 'gameOverScreen', 'settingsScreen'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
        if (screenId) {
            document.getElementById(screenId).classList.remove('hidden');
        }
    }

    showMenu() {
        this.state.status = 'menu';
        this.showScreen('menuScreen');
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }

    showSettings() {
        this.showScreen('settingsScreen');
    }

    start() {
        this.state.reset();
        this.state.status = 'playing';
        this.showScreen(null);
        this.hud.update();
        this.lastFrameTime = performance.now();
        this.gameLoop(this.lastFrameTime);
    }

    pause() {
        if (this.state.status === 'playing') {
            this.state.status = 'paused';
            this.showScreen('pauseScreen');
        }
    }

    resume() {
        if (this.state.status === 'paused') {
            this.state.status = 'playing';
            this.showScreen(null);
            this.lastFrameTime = performance.now();
            this.gameLoop(this.lastFrameTime);
        }
    }

    restart() {
        this.start();
    }

    gameOver() {
        this.state.status = 'gameover';

        document.getElementById('finalScore').textContent = this.state.score;

        const newRecord = document.getElementById('newRecord');
        if (this.state.score === this.state.best && this.state.score > 0) {
            newRecord.classList.remove('hidden');
        } else {
            newRecord.classList.add('hidden');
        }

        this.showScreen('gameOverScreen');
    }

    tick() {
        // Process input queue
        if (this.state.dirQueue.length > 0) {
            this.state.dir = this.state.dirQueue.shift();
        }

        // Calculate next head position
        const head = this.state.snake[0];
        let nextHead = {
            x: head.x + this.state.dir.x,
            y: head.y + this.state.dir.y
        };

        // Wrap position if needed
        if (this.state.settings.wallMode === 'wrap') {
            nextHead = this.collision.wrapPosition(nextHead);
        }

        // Check collision
        if (this.collision.checkCollision(nextHead)) {
            this.gameOver();
            return;
        }

        // Check food
        let ateFood = false;
        if (this.state.food && Utils.coordsEqual(nextHead, this.state.food)) {
            ateFood = true;
            this.state.foodsEaten++;

            const basePoints = 10 + this.state.level;
            this.state.addScore(basePoints);
            this.state.addCombo();

            this.state.spawnFood();
            this.state.spawnItem();
            this.state.updateLevel();
        }

        // Check items
        const now = Date.now();
        this.state.items = this.state.items.filter(item => {
            if (Utils.coordsEqual(nextHead, item.pos)) {
                // Activate item
                switch (item.type) {
                    case 'slow':
                        this.state.effects.slowUntil = now + CONFIG.ITEM_DURATION;
                        break;
                    case 'ghost':
                        this.state.effects.ghostUntil = now + CONFIG.ITEM_DURATION;
                        break;
                    case 'multiplier':
                        this.state.effects.multUntil = now + CONFIG.ITEM_DURATION;
                        break;
                }
                this.state.addScore(5);
                return false;
            }

            // Remove expired items
            if (now - item.spawnedAt > CONFIG.ITEM_DURATION) {
                return false;
            }

            return true;
        });

        // Move snake
        this.state.snake.unshift(nextHead);
        if (!ateFood) {
            this.state.snake.pop();
        }

        // Update combo
        this.state.updateCombo();

        // Update warning obstacles
        this.state.updateWarningObstacles();
    }

    gameLoop(currentTime) {
        if (this.state.status !== 'playing') {
            return;
        }

        this.animationId = requestAnimationFrame((time) => this.gameLoop(time));

        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;

        // Update logic
        this.state.accumulator += deltaTime;
        const tickInterval = this.state.getCurrentSpeed();

        while (this.state.accumulator >= tickInterval) {
            this.tick();
            this.state.accumulator -= tickInterval;

            if (this.state.status !== 'playing') {
                break;
            }
        }

        // Render
        this.renderer.render();
        this.hud.update();
    }
}

// ============================================
// Initialize Game
// ============================================
let game;
window.addEventListener('DOMContentLoaded', () => {
    game = new Game();
});
