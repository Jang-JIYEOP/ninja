import { Canvas, useFrame } from '@react-three/fiber'
import { AdditiveBlending } from 'three'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const MODE_TECH = 'tech'
const MODE_GHOST = 'ghost'

const JOINTS = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const dist2 = (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0))

const toScreen = (lm) => ({
  x: clamp(lm.x, 0, 1),
  y: clamp(lm.y, 0, 1),
})

const mapToCoverViewport = (point, videoElement) => {
  if (!videoElement?.videoWidth || !videoElement?.videoHeight) return point
  const containerW = window.innerWidth || 1
  const containerH = window.innerHeight || 1
  const videoAspect = videoElement.videoWidth / videoElement.videoHeight
  const containerAspect = containerW / containerH

  let renderW
  let renderH
  let offsetX = 0
  let offsetY = 0

  if (containerAspect > videoAspect) {
    renderW = containerW
    renderH = containerW / videoAspect
    offsetY = (renderH - containerH) * 0.5
  } else {
    renderH = containerH
    renderW = containerH * videoAspect
    offsetX = (renderW - containerW) * 0.5
  }

  const px = point.x * renderW - offsetX
  const py = point.y * renderH - offsetY

  return {
    x: clamp(px / containerW, 0, 1),
    y: clamp(py / containerH, 0, 1),
  }
}

function classifyHand(hand) {
  const wrist = hand[JOINTS.WRIST]
  const tips = [JOINTS.INDEX_TIP, JOINTS.MIDDLE_TIP, JOINTS.RING_TIP, JOINTS.PINKY_TIP]
  const folded = tips.filter((id) => hand[id].y > hand[id - 2].y).length
  const fist = folded >= 3
  const palmFacing = hand[JOINTS.MIDDLE_MCP].z < hand[JOINTS.WRIST].z - 0.01
  const xSpread = Math.abs(hand[JOINTS.INDEX_MCP].x - hand[JOINTS.PINKY_TIP].x)
  const ySpread = Math.abs(hand[JOINTS.MIDDLE_TIP].y - hand[JOINTS.WRIST].y)
  const sidePose = xSpread < ySpread * 0.55
  return { fist, palmFacing, sidePose }
}

function Effects3D({ fxState }) {
  const rasenganCoreRef = useRef(null)
  const rasenganShellRef = useRef(null)
  const rasenganRingRef = useRef(null)
  const sparkRef = useRef(null)
  const sparkPositions = useMemo(() => new Float32Array(450), [])

  useFrame((_, delta) => {
    if (rasenganCoreRef.current && rasenganShellRef.current && rasenganRingRef.current) {
      const spin = 2 + fxState.rasenganPower * 9
      rasenganCoreRef.current.rotation.y += delta * spin
      rasenganCoreRef.current.rotation.x += delta * 1.8
      rasenganShellRef.current.rotation.z -= delta * (spin * 0.8)
      rasenganRingRef.current.rotation.y += delta * (spin * 1.2)
      const s = 0.22 + fxState.rasenganPower * 0.4
      rasenganCoreRef.current.scale.setScalar(s)
      rasenganShellRef.current.scale.setScalar(s * 1.28)
      rasenganRingRef.current.scale.setScalar(s * 1.72)
      rasenganCoreRef.current.visible = fxState.rasenganActive
      rasenganShellRef.current.visible = fxState.rasenganActive
      rasenganRingRef.current.visible = fxState.rasenganActive
      rasenganCoreRef.current.position.set(fxState.rasenganPos.x, fxState.rasenganPos.y, 0.2)
      rasenganShellRef.current.position.set(fxState.rasenganPos.x, fxState.rasenganPos.y, 0.2)
      rasenganRingRef.current.position.set(fxState.rasenganPos.x, fxState.rasenganPos.y, 0.2)
    }
    if (sparkRef.current) {
      for (let i = 0; i < sparkPositions.length; i += 3) {
        const angle = Math.random() * Math.PI * 2
        const speed = 0.08 + Math.random() * 0.25 * fxState.rasenganPower
        sparkPositions[i] = fxState.rasenganPos.x + Math.cos(angle) * speed
        sparkPositions[i + 1] = fxState.rasenganPos.y + Math.sin(angle) * speed
        sparkPositions[i + 2] = Math.random() * 0.8 - 0.2
      }
      sparkRef.current.geometry.attributes.position.needsUpdate = true
      sparkRef.current.visible = fxState.rasenganActive
    }
  })

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight color="#90d6ff" position={[0, 0, 2]} intensity={3} />
      <mesh ref={rasenganCoreRef}>
        <icosahedronGeometry args={[0.46, 3]} />
        <meshStandardMaterial color="#93ecff" emissive="#bbf7ff" emissiveIntensity={2.7} transparent opacity={0.96} />
      </mesh>
      <mesh ref={rasenganShellRef}>
        <sphereGeometry args={[0.62, 26, 26]} />
        <meshBasicMaterial color="#90f0ff" transparent opacity={0.23} blending={AdditiveBlending} />
      </mesh>
      <mesh ref={rasenganRingRef}>
        <torusGeometry args={[0.58, 0.06, 24, 72]} />
        <meshBasicMaterial color="#c8fbff" transparent opacity={0.58} blending={AdditiveBlending} />
      </mesh>
      <points ref={sparkRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={150} array={sparkPositions} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#9de9ff" size={0.045} transparent opacity={0.9} blending={AdditiveBlending} />
      </points>
    </>
  )
}

function App() {
  const videoRef = useRef(null)
  const handsRef = useRef(null)
  const rafRef = useRef(null)
  const prevFrameRef = useRef({ allFists: false, rasenganActive: false, voidActive: false })
  const [mode, setMode] = useState(MODE_TECH)
  const [toast, setToast] = useState('🔥 기술 모드')
  const [error, setError] = useState('')
  const [landmarks, setLandmarks] = useState([])
  const [shake, setShake] = useState(0)
  const [voidFlash, setVoidFlash] = useState(0)
  const [invertVoid, setInvertVoid] = useState(0)
  const [nebula, setNebula] = useState(0)
  const [fxState, setFxState] = useState({
    rasenganActive: false,
    rasenganPower: 0,
    rasenganPos: { x: 0, y: 0 },
    rasenganUi: { x: 50, y: 50 },
  })
  const [ghost, setGhost] = useState({ visible: false, x: 0.5, y: 0.45, vx: 0.003, vy: -0.002, angle: 0 })
  const [blood, setBlood] = useState({ visible: false, x: 0.5, y: 0.5, ttl: 0 })

  const vibrate = useCallback((ms = 30) => {
    if (navigator.vibrate) navigator.vibrate(ms)
  }, [])

  const playVoidBoom = useCallback(() => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(58, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(34, ctx.currentTime + 0.3)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.31)
    window.setTimeout(() => ctx.close(), 400)
  }, [])

  const fireToast = useCallback((text) => {
    setToast(text)
    window.clearTimeout(fireToast.timer)
    fireToast.timer = window.setTimeout(() => setToast(''), 1100)
  }, [])
  fireToast.timer = fireToast.timer || 0

  const onResults = useCallback((results) => {
    const allHands = results.multiHandLandmarks || []
    const mappedHands = allHands.map((hand) => hand.map((lm) => mapToCoverViewport(toScreen(lm), videoRef.current)))
    setLandmarks(mappedHands)
    const analyzed = allHands.map((h) => classifyHand(h))
    const palms = mappedHands.map((h) => h[JOINTS.MIDDLE_MCP])
    if (!palms.length) {
      setFxState((prev) => ({ ...prev, rasenganActive: false, rasenganPower: prev.rasenganPower * 0.9 }))
      setInvertVoid((v) => v * 0.9)
      setNebula((v) => v * 0.9)
      prevFrameRef.current.voidActive = false
      prevFrameRef.current.rasenganActive = false
      return
    }

    if (mode === MODE_TECH) {
      const oneFist = analyzed.some((h) => h.fist)
      const bothHands = analyzed.length >= 2
      const allFists = bothHands && analyzed[0].fist && analyzed[1].fist
      const mudra = bothHands && !analyzed[0].fist && !analyzed[1].fist && dist2(palms[0], palms[1]) < 0.16
      const focusPalm = palms[0]

      setFxState((prev) => {
        const rasenganPower = oneFist ? clamp(prev.rasenganPower + 0.05, 0, 1) : clamp(prev.rasenganPower - 0.05, 0, 1)
        return {
          rasenganActive: oneFist,
          rasenganPower,
          rasenganPos: { x: (focusPalm.x - 0.5) * 2, y: -(focusPalm.y - 0.5) * 2 },
          rasenganUi: { x: focusPalm.x * 100, y: focusPalm.y * 100 },
        }
      })

      if (oneFist && !prevFrameRef.current.rasenganActive) {
        fireToast('🔵 나선환')
        vibrate(35)
      }
      if (oneFist) {
        setShake((v) => clamp(v + 0.14, 0, 1))
      }
      if (mudra && !prevFrameRef.current.voidActive) {
        fireToast('🟣 무량공처')
        setVoidFlash(1)
        playVoidBoom()
      }
      if (mudra) {
        setInvertVoid(1)
        setNebula(1)
        setShake(0.9)
        vibrate(60)
      } else {
        setInvertVoid((v) => v * 0.94)
        setNebula((v) => v * 0.95)
      }
      prevFrameRef.current.rasenganActive = oneFist
      prevFrameRef.current.voidActive = mudra
      prevFrameRef.current.allFists = allFists
      return
    }

    const sidePose = analyzed.some((h) => h.sidePose)
    const fists = analyzed.length >= 2 && analyzed[0].fist && analyzed[1].fist
    const openHands = analyzed.length >= 2 && !analyzed[0].fist && !analyzed[1].fist
    const fingertips = mappedHands.flatMap((h) => [h[JOINTS.THUMB_TIP], h[JOINTS.INDEX_TIP], h[JOINTS.MIDDLE_TIP], h[JOINTS.RING_TIP], h[JOINTS.PINKY_TIP]])

    setGhost((prev) => ({ ...prev, visible: sidePose || prev.visible }))
    setGhost((prev) => {
      let x = prev.x + prev.vx
      let y = prev.y + prev.vy + Math.sin(performance.now() * 0.002) * 0.0012
      let vx = prev.vx
      let vy = prev.vy
      if (x < 0.05 || x > 0.95) vx *= -1
      if (y < 0.06 || y > 0.88) vy *= -1
      x = clamp(x, 0.05, 0.95)
      y = clamp(y, 0.06, 0.9)

      fingertips.forEach((tip) => {
        if (dist2({ x, y }, tip) < 0.085) {
          vx += (x - tip.x) * 0.035
          vy += (y - tip.y) * 0.035
        }
      })
      if (blood.visible) {
        vx += (blood.x - x) * 0.004
        vy += (blood.y - y) * 0.004
      }
      return { ...prev, x, y, vx: clamp(vx, -0.025, 0.025), vy: clamp(vy, -0.025, 0.025), angle: prev.angle + 1.8 }
    })

    if (prevFrameRef.current.allFists && openHands) {
      const center = palms.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
      setBlood({ visible: true, x: center.x / palms.length, y: center.y / palms.length, ttl: 320 })
      fireToast('🩸 피의 미끼 생성')
      vibrate(40)
    }
    prevFrameRef.current.allFists = fists
  }, [blood.visible, mode, vibrate, fireToast, playVoidBoom])

  useEffect(() => {
    let hand
    let cancelled = false
    const cdnSources = [
      { script: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js', base: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands' },
      { script: 'https://unpkg.com/@mediapipe/hands/hands.js', base: 'https://unpkg.com/@mediapipe/hands' },
    ]
    let selectedBase = cdnSources[0].base

    const getHandsCtor = () => window.Hands || globalThis.Hands

    const injectHandsScript = (src) =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = src
        script.async = true
        script.defer = true
        script.crossOrigin = 'anonymous'
        script.dataset.mediapipeHands = 'true'
        script.onload = () => resolve()
        script.onerror = () => reject(new Error(`hands.js 로드 실패: ${src}`))
        document.head.appendChild(script)
      })

    const loadHandsScript = async () => {
      if (getHandsCtor()) return
      const existing = document.querySelector('script[data-mediapipe-hands="true"]')
      if (existing) existing.remove()
      let lastErr
      for (const source of cdnSources) {
        try {
          selectedBase = source.base
          await injectHandsScript(source.script)
          if (getHandsCtor()) return
          lastErr = new Error(`스크립트 로드 후 Hands 생성자 없음: ${source.script}`)
        } catch (e) {
          lastErr = e
        }
      }
      throw lastErr || new Error('hands.js 로드 실패')
    }

    const setup = async () => {
      await loadHandsScript()
      const HandsCtor = getHandsCtor()
      if (cancelled) {
        return
      }
      if (!HandsCtor) {
        setError('MediaPipe Hands 로드에 실패했습니다.')
        return
      }
      hand = new HandsCtor({
        locateFile: (file) => `${selectedBase}/${file}`,
      })
      hand.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.5,
        selfieMode: true,
      })
      hand.onResults(onResults)
      handsRef.current = hand
      setError('')
    }

    setup().catch((e) => setError(`MediaPipe 초기화 실패: ${e.message || '알 수 없는 오류'}`))

    return () => {
      cancelled = true
      hand?.close()
    }
  }, [onResults])

  useEffect(() => {
    let stream
    const start = async () => {
      try {
        if (!window.isSecureContext && location.hostname !== 'localhost') {
          setError('카메라 권한은 HTTPS 환경에서만 동작합니다. Vercel 배포 또는 HTTPS 도메인을 사용하세요.')
          return
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (!videoRef.current) return
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream
        }
        videoRef.current.play().catch(() => {
          // Mobile browsers can interrupt play() during reload/rebind; safe to ignore.
        })
      } catch (e) {
        setError(`카메라 접근 실패: ${e.message || '알 수 없는 오류'}`)
      }
    }
    start()
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])

  useEffect(() => {
    const loop = async () => {
      if (videoRef.current?.readyState >= 2 && handsRef.current) {
        await handsRef.current.send({ image: videoRef.current })
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setShake((v) => v * 0.83)
      setVoidFlash((v) => v * 0.82)
      setBlood((b) => (b.visible ? { ...b, ttl: b.ttl - 1, visible: b.ttl > 0 } : b))
    }, 16)
    return () => window.clearInterval(timer)
  }, [])

  const handPoints = useMemo(
    () =>
      landmarks.flatMap((hand) =>
        [JOINTS.THUMB_TIP, JOINTS.INDEX_TIP, JOINTS.MIDDLE_TIP, JOINTS.RING_TIP, JOINTS.PINKY_TIP].map((id) => hand[id]),
      ),
    [landmarks],
  )

  const shakeStyle =
    mode === MODE_TECH && shake > 0.01
      ? {
          transform: `translate(${(Math.random() - 0.5) * 18 * shake}px, ${(Math.random() - 0.5) * 18 * shake}px) scale(${1 + shake * 0.01})`,
        }
      : undefined

  const setModeAndToast = (next) => {
    setMode(next)
    setShake(0)
    if (next === MODE_TECH) fireToast('🔥 기술 모드')
    if (next === MODE_GHOST) fireToast('👻 유령 모드')
  }

  return (
    <main className={`app mode-${mode}`} style={shakeStyle}>
      <video ref={videoRef} className="camera" playsInline muted autoPlay />
      <Canvas className="vfx-layer" camera={{ position: [0, 0, 2.4], fov: 54 }}>
        <Effects3D fxState={fxState} />
      </Canvas>

      {error ? <div className="error-box">{error}</div> : null}
      {toast ? <div className="toast">{toast}</div> : null}

      <div className="overlay-lines">
        {handPoints.map((p, idx) => (
          <span key={`${p.x}-${p.y}-${idx}`} className="tip" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
        ))}
      </div>

      {mode === MODE_GHOST && ghost.visible ? (
        <img
          src="/ghost.png"
          alt="ghost"
          className="ghost"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
          style={{ left: `${ghost.x * 100}%`, top: `${ghost.y * 100}%`, transform: `translate(-50%, -50%) rotate(${ghost.angle}deg)` }}
        />
      ) : null}
      {mode === MODE_GHOST && blood.visible ? (
        <img
          src="/blood.png"
          alt="blood"
          className="blood"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
          style={{ left: `${blood.x * 100}%`, top: `${blood.y * 100}%` }}
        />
      ) : null}

      {mode === MODE_TECH ? (
        <>
          <div
            className="rasengan-aura"
            style={{
              opacity: fxState.rasenganActive ? 0.35 + fxState.rasenganPower * 0.45 : 0,
              left: `${fxState.rasenganUi.x}%`,
              top: `${fxState.rasenganUi.y}%`,
              transform: `translate(-50%, -50%) scale(${0.7 + fxState.rasenganPower * 0.9})`,
            }}
          />
          <div className="void-realm" style={{ opacity: invertVoid * 0.86 }} />
          <div className="void-black-flash" style={{ opacity: voidFlash }} />
          <div className="void-filter" style={{ opacity: invertVoid }} />
          <div className="nebula" style={{ opacity: nebula }} />
          <div className="void-streaks" style={{ opacity: nebula }} />
          <div className="void-stars" style={{ opacity: nebula * 0.75 }} />
          <div className="void-vignette" style={{ opacity: invertVoid * 0.95 }} />
        </>
      ) : null}

      <section className="bottom-controls">
        <button type="button" className={mode === MODE_TECH ? 'active' : ''} onClick={() => setModeAndToast(MODE_TECH)}>
          🔥 기술 모드
        </button>
        <button type="button" className={mode === MODE_GHOST ? 'active' : ''} onClick={() => setModeAndToast(MODE_GHOST)}>
          👻 유령 모드
        </button>
      </section>
    </main>
  )
}

export default App
