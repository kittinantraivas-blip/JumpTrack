const width = 1000
const height = 600
const canvas = document.querySelector("canvas")
const scoreDisplay = document.getElementById("score")
const bestScoreDisplay = document.getElementById("best")

canvas.height = height
canvas.width = width

const ctx = canvas.getContext("2d")

// Load images
const playerImg = new Image();
playerImg.src = 'img/Asset 1.png';  // ใส่ path รูป player ของคุณ

const obstacleImg = new Image();
obstacleImg.src = 'img/Asset 2.png';  // ใส่ path รูป obstacle ของคุณ

// Fallback colors if images fail to load
const colors = {
    player: "white",
    obstacle: "white",
}

const gravity = 0.25
const jumpForce = 7
const cornerRadius = 9
const speed = 5

let obstacles = []
let obstacleGapHeight = 280
const obstcleSpacing = 400

let isGameRunning = false
let isGameReady = true
let interval

let score = 0
let bestScore = localStorage.getItem("bestScore") || 0
updateBestScoreDisplay()

const player = {
    width: 100,
    height: 100,
    posY: height / 3,
    posX: 100,
    velocityY: 0,
}

function updateScoreDisplay() {
    scoreDisplay.innerText = score
}

function updateBestScoreDisplay() {
    bestScoreDisplay.innerText = bestScore
}

function drawObstacle(obstacle) {
    // Check if image is loaded
    if (obstacleImg.complete && obstacleImg.naturalWidth !== 0) {
        // Top obstacle
        ctx.save();
        ctx.translate(obstacle.posX, obstacle.spaceTop);
        ctx.scale(1, -1);
        ctx.drawImage(
            obstacleImg,
            0,
            0,
            player.width,
            obstacle.spaceTop
        );
        ctx.restore();
        
        // Bottom obstacle
        ctx.drawImage(
            obstacleImg,
            obstacle.posX,
            obstacle.spaceBottom,
            player.width,
            height - obstacle.spaceBottom
        );
    } else {
        // Fallback to original drawing method
        ctx.fillStyle = colors.obstacle
        ctx.strokeStyle = "transparent"
        
        // top
        ctx.beginPath()
        ctx.roundRect(obstacle.posX, 0, player.width, obstacle.spaceTop, [
            0,
            0,
            cornerRadius,
            cornerRadius,
        ])
        ctx.stroke()
        ctx.fill()

        // bottom
        ctx.beginPath()
        ctx.roundRect(obstacle.posX, obstacle.spaceBottom, player.width, height, [
            cornerRadius,
            cornerRadius,
            0,
            0,
        ])
        ctx.stroke()
        ctx.fill()
    }
}

function spawnObstacle(posX) {
    const spaceTop =
        Math.floor(Math.random() * (height - 100 - obstacleGapHeight)) + 50 // min is 50

    const spaceBottom = spaceTop + obstacleGapHeight

    const newObstacle = {
        posX,
        spaceTop,
        spaceBottom,
        isScored: false,
    }

    obstacles.push(newObstacle)
}

function updateObstacles() {
    for (let obstacle of obstacles) {
        if (obstacle.posX < -50) {
            obstacles.shift()
        } else {
            obstacle.posX -= speed
        }
    }

    if (obstacles && obstacles[obstacles.length - 1].posX <= width) {
        spawnObstacle(obstacles[obstacles.length - 1].posX + obstcleSpacing)
    }
}

function drawObstacles() {
    for (let obstacle of obstacles) {
        drawObstacle(obstacle)
    }
}

function drawPlayer() {
    // Check if image is loaded
    if (playerImg.complete && playerImg.naturalWidth !== 0) {
        ctx.drawImage(
            playerImg, 
            player.posX, 
            player.posY, 
            player.width, 
            player.height
        );
    } else {
        // Fallback to original drawing method
        ctx.fillStyle = colors.player
        ctx.strokeStyle = "transparent"
        ctx.beginPath()
        ctx.roundRect(
            player.posX,
            player.posY,
            player.width,
            player.height,
            cornerRadius
        )
        ctx.stroke()
        ctx.fill()
    }
}

function jump() {
    if (isGameReady) {
        if (!isGameRunning) {
            isGameRunning = true
            updateScoreDisplay()
            interval = setInterval(update, 20)
        }
        player.velocityY = -jumpForce
    }
}

function start() {
    score = 0

    clear()
    player.posY = height / 3
    drawPlayer()

    obstacles = []
    new Array(2, 3).forEach((i) => spawnObstacle(i * obstcleSpacing))
    drawObstacles()

    isGameReady = true

    document.body.onkeyup = function (e) {
        if (e.key == " " || e.code == "Space" || e.keyCode == 32) {
            jump()
        }
    }
}

function clear() {
    ctx.clearRect(0, 0, width, height)
}

function gameOver() {
    isGameReady = false
    isGameRunning = false
    clearInterval(interval)

    if (score > bestScore) {
        bestScore = score
        localStorage.setItem("bestScore", bestScore)
        updateBestScoreDisplay()
    }

    setTimeout(() => {
        start()
    }, 1000)
}

function update() {
    clear()
    updateObstacles()
    drawObstacles()
    updatePlayer()
    drawPlayer()
}

function updatePlayer() {
    player.velocityY += gravity
    if (player.posY + player.height + player.velocityY >= height) {
        player.posY = height - player.height
        gameOver()
    }
    if (player.posY + player.height + player.velocityY <= player.height) {
        player.posY = 0
        gameOver()
    } else {
        player.posY += player.velocityY
    }

    obstacles.forEach((obstacle) => {
        if (Math.abs(player.posX - obstacle.posX) <= player.width) {
            if (
                player.posY <= obstacle.spaceTop ||
                player.posY >= obstacle.spaceBottom - player.height
            ) {
                gameOver()
            }
        }

        if (obstacle.posX < player.posX - player.width && !obstacle.isScored) {
            obstacle.isScored = true
            score++
            updateScoreDisplay()
        }
    })
}

// Wait for images to load before starting the game
let imagesLoaded = 0;
const totalImages = 2;

function checkImagesLoaded() {
    imagesLoaded++;
    if (imagesLoaded === totalImages) {
        console.log("All images loaded, starting game...");
        start();
    }
}

// Set up image load handlers
playerImg.onload = checkImagesLoaded;
obstacleImg.onload = checkImagesLoaded;

// Handle image load errors - start game anyway with fallback colors
playerImg.onerror = () => {
    console.warn("Failed to load player image, using fallback");
    checkImagesLoaded();
};

obstacleImg.onerror = () => {
    console.warn("Failed to load obstacle image, using fallback");
    checkImagesLoaded();
};

// If images are already cached/loaded
if (playerImg.complete && playerImg.naturalWidth !== 0) {
    checkImagesLoaded();
}
if (obstacleImg.complete && obstacleImg.naturalWidth !== 0) {
    checkImagesLoaded();
}
