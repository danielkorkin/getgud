"use client"

import { useTheme } from "next-themes"
import { MoonIcon, SunIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="dark:hidden" />
      <MoonIcon className="hidden dark:block" />
    </Button>
  )
}

export { ThemeToggle }
