// Syntax highlighting for the code fences inside a note.
//
// Not rehype-highlight: that package imports lowlight's `common` set at
// module scope — around forty grammars, a fifth of a megabyte — and no
// option turns it off, because the import happens before any option is
// read. Naming the grammars here and doing the (small) tree walk by hand
// keeps the rest out of the bundle.
//
// This board is a home-infrastructure notebook, so the list is what its
// fences actually contain: shells, configs, a little python and
// typescript. A fence tagged with anything else still renders — it just
// renders as plain code.

import { createLowlight } from 'lowlight'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import nginx from 'highlight.js/lib/languages/nginx'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const lowlight = createLowlight({
  bash,
  css,
  diff,
  go,
  ini,
  javascript,
  json,
  markdown,
  nginx,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
})

// Aliases people actually type in a fence.
const ALIAS: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  yml: 'yaml',
  html: 'xml',
  svg: 'xml',
  conf: 'ini',
  toml: 'ini',
  md: 'markdown',
  rs: 'rust',
}

interface HastNode {
  type: string
  tagName?: string
  properties?: { className?: unknown }
  children?: HastNode[]
}

function classNames(node: HastNode): string[] {
  const c = node.properties?.className
  if (Array.isArray(c)) return c.map(String)
  if (typeof c === 'string') return c.split(/\s+/)
  return []
}

// A rehype plugin: find <pre><code class="language-x">, highlight it, and
// swap in the coloured spans. Mermaid fences are skipped — they are turned
// into diagrams by the renderer and highlighting them first would replace
// their text with markup the diagram parser can't read.
export function rehypeNoteHighlight() {
  return (tree: HastNode) => {
    const visit = (node: HastNode, parent: HastNode | null) => {
      if (node.tagName === 'code' && parent?.tagName === 'pre') {
        const lang = classNames(node)
          .find((c) => c.startsWith('language-'))
          ?.slice('language-'.length)
        const name = lang ? (ALIAS[lang] ?? lang) : null
        if (name && name !== 'mermaid' && lowlight.registered(name)) {
          const text = textOf(node)
          try {
            const result = lowlight.highlight(name, text)
            node.children = result.children as unknown as HastNode[]
            node.properties = { ...node.properties, className: [...classNames(node), 'hljs'] }
          } catch {
            // A grammar that throws on odd input must not take the note
            // down with it; plain code is a fine outcome.
          }
        }
        return
      }
      for (const child of node.children ?? []) visit(child, node)
    }
    visit(tree, null)
  }
}

function textOf(node: HastNode): string {
  if (node.type === 'text') return (node as unknown as { value: string }).value
  return (node.children ?? []).map(textOf).join('')
}
