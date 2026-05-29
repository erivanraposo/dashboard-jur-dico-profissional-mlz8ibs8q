import React, { useRef, useEffect } from 'react'
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  Heading1,
  Heading2,
  Quote,
} from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function RichTextEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: string
  onChange: (val: string) => void
  readOnly?: boolean
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isUpdatingRef = useRef(false)

  useEffect(() => {
    if (editorRef.current && !isUpdatingRef.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value
      }
    }
  }, [value])

  const execCommand = (command: string, arg?: string) => {
    document.execCommand(command, false, arg)
    editorRef.current?.focus()
    handleChange()
  }

  const handleChange = () => {
    if (editorRef.current) {
      isUpdatingRef.current = true
      onChange(editorRef.current.innerHTML)
      setTimeout(() => {
        isUpdatingRef.current = false
      }, 0)
    }
  }

  return (
    <div className="border rounded-md flex flex-col w-full h-full bg-background shadow-sm overflow-hidden">
      <div
        className={cn(
          'flex flex-wrap items-center gap-1 p-1.5 border-b bg-slate-50/50 transition-opacity',
          readOnly && 'opacity-50 pointer-events-none',
        )}
      >
        <Toggle size="sm" onClick={() => execCommand('bold')} title="Negrito">
          <Bold className="h-4 w-4" />
        </Toggle>
        <Toggle size="sm" onClick={() => execCommand('italic')} title="Itálico">
          <Italic className="h-4 w-4" />
        </Toggle>
        <Toggle size="sm" onClick={() => execCommand('underline')} title="Sublinhado">
          <Underline className="h-4 w-4" />
        </Toggle>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Toggle size="sm" onClick={() => execCommand('justifyLeft')} title="Alinhar à esquerda">
          <AlignLeft className="h-4 w-4" />
        </Toggle>
        <Toggle size="sm" onClick={() => execCommand('justifyCenter')} title="Centralizar">
          <AlignCenter className="h-4 w-4" />
        </Toggle>
        <Toggle size="sm" onClick={() => execCommand('justifyRight')} title="Alinhar à direita">
          <AlignRight className="h-4 w-4" />
        </Toggle>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Toggle size="sm" onClick={() => execCommand('insertUnorderedList')} title="Lista">
          <List className="h-4 w-4" />
        </Toggle>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Toggle size="sm" onClick={() => execCommand('formatBlock', 'H1')} title="Título 1">
          <Heading1 className="h-4 w-4" />
        </Toggle>
        <Toggle size="sm" onClick={() => execCommand('formatBlock', 'H2')} title="Título 2">
          <Heading2 className="h-4 w-4" />
        </Toggle>
        <Toggle size="sm" onClick={() => execCommand('formatBlock', 'BLOCKQUOTE')} title="Citação">
          <Quote className="h-4 w-4" />
        </Toggle>
      </div>
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        onInput={handleChange}
        onBlur={handleChange}
        className={cn(
          'flex-1 p-8 outline-none bg-white overflow-y-auto cursor-text',
          'prose prose-slate max-w-none font-serif leading-relaxed',
          'prose-headings:font-bold prose-headings:text-slate-800',
          'prose-p:text-justify prose-blockquote:border-l-4 prose-blockquote:border-slate-300 prose-blockquote:pl-4 prose-blockquote:italic',
        )}
        style={{ minHeight: '400px' }}
      />
    </div>
  )
}
