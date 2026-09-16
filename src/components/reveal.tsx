"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "cn"

function Reveal({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode
  index?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
          }
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        "motion-reduce:translate-y-0! motion-reduce:opacity-100! motion-reduce:transition-none!",
        className
      )}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition:
          "opacity 600ms cubic-bezier(0.16,1,0.3,1), transform 600ms cubic-bezier(0.16,1,0.3,1)",
        transitionDelay: `${index * 80}ms`,
      }}
    >
      {children}
    </div>
  )
}

export { Reveal }
