'use client'

import React from 'react'
import { useTheme } from 'next-themes'
import { Button } from './button'

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      onClick={() => setTheme(nextTheme)}
      className="text-sm font-medium hover:bg-white/20 dark:hover:bg-white/10"
    >
      Toggle Theme
    </Button>
  )
}

