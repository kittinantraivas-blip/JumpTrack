const socket = io()
const statusDisplay = document.getElementById("connection-status")
const enableMotionContainer = document.getElementById("enable-container")
const enableMotionButton = document.getElementById("enable-btn")
const peerConnection = new RTCPeerConnection({
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:iphone-stun.strato-iphone.de:3478" },
        {
            urls: "stun:stun.relay.metered.ca:80",
        },
        {
            urls: "turn:standard.relay.metered.ca:80",
            username: "22dac8732ecf1750bfb6f5bc",
            credential: "fpk4xBjFO+U3jQfv",
        },
        {
            urls: "turn:standard.relay.metered.ca:80?transport=tcp",
            username: "22dac8732ecf1750bfb6f5bc",
            credential: "fpk4xBjFO+U3jQfv",
        },
        {
            urls: "turn:standard.relay.metered.ca:443",
            username: "22dac8732ecf1750bfb6f5bc",
            credential: "fpk4xBjFO+U3jQfv",
        },
        {
            urls: "turns:standard.relay.metered.ca:443?transport=tcp",
            username: "22dac8732ecf1750bfb6f5bc",
            credential: "fpk4xBjFO+U3jQfv",
        },
    ],
})
// ===== Jump detection (based on SmartJump, ICSI-2020) =====
// แนวคิด: การกระโดดจริงมี 3 เฟส สังเกตได้จากความเร่งแนวตั้ง
//   1) Taking-off  -> peak  (ความเร่งพุ่งขึ้น)
//   2) In-air      -> valley (ตกอิสระ ความเร่งดิ่งต่ำ)
//   3) Landing     -> peak  (กระแทกพื้น)
// เปเปอร์ใช้ pattern peak-valley-peak ผ่าน FSM แล้วค่อยนับ
// แต่เกมต้องตอบสนองทันที จึง trigger jump ตั้งแต่ "peak ออกตัว" (peak แรก)
// และใช้ FSM กันการ trigger ซ้ำจนกว่าจะครบรอบ (ลงพื้นแล้ว)
//
// ต่างจากเปเปอร์: เปเปอร์เอามือถือใส่กระเป๋ากางเกง + แปลงพิกัดเป็น Earth z-axis
// เคสนี้ "ถือมือถือในมือ" ทิศทางเครื่องไม่แน่นอน จึงใช้ magnitude รวม
//   mag = sqrt(x^2 + y^2 + z^2)  (รวมแรงโน้มถ่วง ~9.8 ตอนอยู่นิ่ง)
// ซึ่งทนต่อการเอียง/หมุนเครื่องในมือ

// --- พารามิเตอร์ปรับจูนได้ ---
const GRAVITY = 9.8
const PEAK_THRESHOLD = 14 // mag เกินค่านี้ = ออกตัว/กระแทก (ปกตินิ่ง ~9.8)
const VALLEY_THRESHOLD = 6 // mag ต่ำกว่านี้ = ลอยกลางอากาศ (ตกอิสระ -> เข้าใกล้ 0)
const RESET_MS = 700 // ถ้าไม่เจอ event ภายในเวลานี้ รีเซ็ต FSM (กันค้าง)
const REFRACTORY_MS = 250 // หน่วงหลัง trigger 1 ครั้ง กัน double-jump
const LP_ALPHA = 0.35 // low-pass filter: ยิ่งต่ำยิ่งเรียบ (กรองมือสั่น)

let dataChannel

// สถานะ FSM: "ground" -> "takeoff" -> "air" -> (ลงพื้น) -> "ground"
let jumpState = "ground"
let lastEventTime = 0
let lastTriggerTime = 0
let filteredMag = GRAVITY // ค่าหลังกรอง (เริ่มที่แรงโน้มถ่วง)

socket.on("connect", () => {
    const urlParams = new URLSearchParams(window.location.search)
    const socketId = urlParams.get("socketId")

    if (socketId) {
        urlParams.delete("socketId")
        const newUrl = window.location.origin + window.location.pathname
        window.history.replaceState({}, document.title, newUrl)

        socket.emit("pair", socketId)
    } else {
        statusDisplay.className = "disconnected"
    }
})

socket.on("connected", () => {
    statusDisplay.className = "connected"
    establishWebRTCConnection()
})

socket.on("disconnected", () => {
    statusDisplay.className = "disconnected"
})

// Create a data channel and set up event listeners
function createDataChannel() {
    dataChannel = peerConnection.createDataChannel("channel")
    dataChannel.onopen = () => {
        showEnableButton()
    }
}

// Handle ICE candidate generation
peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
        socket.emit("ice-candidate", event.candidate)
    }
}

// Handle receiving an answer
socket.on("answer", async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
})

// Handle ICE candidates from the peer
socket.on("ice-candidate", (candidate) => {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
})

async function establishWebRTCConnection() {
    createDataChannel()
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    socket.emit("offer", offer)
}

function triggerJump() {
    if (dataChannel && dataChannel.readyState === "open") {
        dataChannel.send("jump")
    }
}

function handleMotionEvent(e) {
    // ใช้ accelerationIncludingGravity เพื่อจับเฟส "ตกอิสระ" (mag เข้าใกล้ 0)
    // ตอนนิ่ง mag จะ ~9.8, ตอนกระโดดออกตัว/ลงพื้นจะพุ่งสูง, ตอนลอยจะดิ่งต่ำ
    const acc = e.accelerationIncludingGravity || e.acceleration
    if (!acc || acc.x == null) return

    const rawMag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z)

    // Low-pass filter (exponential moving average) กรอง noise จากมือสั่น
    filteredMag = LP_ALPHA * rawMag + (1 - LP_ALPHA) * filteredMag
    const mag = filteredMag

    const now = Date.now()

    // reset rule: ถ้าค้างนานเกินไปไม่เจอ event ให้กลับสู่ ground
    if (now - lastEventTime > RESET_MS && jumpState !== "ground") {
        jumpState = "ground"
    }

    switch (jumpState) {
        case "ground":
            // รอ peak ออกตัว -> trigger jump ทันที (real-time)
            if (mag > PEAK_THRESHOLD && now - lastTriggerTime > REFRACTORY_MS) {
                jumpState = "takeoff"
                lastEventTime = now
                lastTriggerTime = now
                triggerJump()
            }
            break

        case "takeoff":
            // หลังออกตัว รอเข้าเฟสลอย (valley: ตกอิสระ mag ต่ำ)
            if (mag < VALLEY_THRESHOLD) {
                jumpState = "air"
                lastEventTime = now
            } else if (mag > PEAK_THRESHOLD) {
                lastEventTime = now // ยังพุ่งอยู่ คง state
            }
            break

        case "air":
            // รอ peak ลงพื้น -> จบ 1 รอบการกระโดด กลับสู่ ground
            if (mag > PEAK_THRESHOLD) {
                jumpState = "ground"
                lastEventTime = now
            }
            break
    }
}

function enableMotionDetection() {
    if (typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission().then((permissionState) => {
            if (permissionState === "granted") {
                hideEnableButton()
                window.addEventListener("devicemotion", handleMotionEvent, true)
            }
        })
    } else {
        hideEnableButton()
        window.addEventListener("devicemotion", handleMotionEvent, true)
    }
}

function showEnableButton() {
    enableMotionContainer.style.display = "block"
}
function hideEnableButton() {
    enableMotionContainer.style.display = "none"
}

enableMotionButton.addEventListener("click", enableMotionDetection)
