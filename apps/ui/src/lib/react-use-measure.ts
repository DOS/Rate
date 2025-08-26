import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"

export type RectReadOnly = Readonly<{
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  x: number
  y: number
}>

type UseMeasureReturn<T extends Element = HTMLElement> = [
  (node: T | null) => void,
  RectReadOnly,
]

// Lightweight shim for react-use-measure to unblock build
export default function useMeasure<T extends Element = HTMLElement>(): UseMeasureReturn<T> {
  const nodeRef = useRef<T | null>(null)
  const [rect, setRect] = useState<RectReadOnly>({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
  })

  const cleanupRef: MutableRefObject<(() => void) | null> = useRef(null)

  const measure = useCallback(() => {
    const el = nodeRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
      x: r.x ?? r.left,
      y: r.y ?? r.top,
    })
  }, [])

  const refCallback = useCallback((node: T | null) => {
    nodeRef.current = node
    measure()
  }, [measure])

  useEffect(() => {
    const el = nodeRef.current
    if (!el) return

    // Prefer ResizeObserver if available for better accuracy
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => measure())
      ro.observe(el)
      cleanupRef.current = () => ro.disconnect()
      measure()
      return () => cleanupRef.current?.()
    }

    // Fallback to window listeners
    const onResize = () => measure()
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onResize, true)
    measure()
    cleanupRef.current = () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onResize, true)
    }
    return () => cleanupRef.current?.()
  }, [measure])

  return [refCallback, rect]
}




