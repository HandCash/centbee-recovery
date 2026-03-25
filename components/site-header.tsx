
import Link from "next/link"
import { Github } from "lucide-react"

import { siteConfig } from "@/config/site"
import { Icons } from "@/components/icons"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

export function SiteHeader() {
  return (
    <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-40 w-full border-b">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {Icons.logo}
          <span className="font-bold text-sm tracking-tight">{siteConfig.name}</span>
          <span className="hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            BSV
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild>
            <Link
              href="https://x.com/Centbee"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Centbee on X"
            >
              <Icons.x className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <Link
              href={siteConfig.links.github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
            >
              <Github className="h-4 w-4" />
            </Link>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
