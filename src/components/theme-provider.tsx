"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import { IconContext } from "@phosphor-icons/react"
import type { ComponentProps } from "react"

function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <IconContext.Provider value={{ weight: "bold" }}>
        {children}
      </IconContext.Provider>
    </NextThemesProvider>
  )
}

export { ThemeProvider }
