import React, { createContext, useContext, useState, ReactNode } from 'react'

export interface Jurisprudence {
  id: string
  tribunal: string
  ano: string
  ramo: 'Penal' | 'Cível'
  relator: string
  ementa: string
  inteiroTeor: string
}

interface LegalStoreState {
  clippedCases: Jurisprudence[]
  clipCase: (c: Jurisprudence) => void
  removeCase: (id: string) => void
}

const LegalContext = createContext<LegalStoreState | undefined>(undefined)

export function LegalStoreProvider({ children }: { children: ReactNode }) {
  const [clippedCases, setClippedCases] = useState<Jurisprudence[]>([])

  const clipCase = (c: Jurisprudence) => {
    setClippedCases((prev) => {
      if (prev.find((item) => item.id === c.id)) return prev
      return [...prev, c]
    })
  }

  const removeCase = (id: string) => {
    setClippedCases((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <LegalContext.Provider value={{ clippedCases, clipCase, removeCase }}>
      {children}
    </LegalContext.Provider>
  )
}

export default function useLegalStore() {
  const context = useContext(LegalContext)
  if (!context) {
    throw new Error('useLegalStore must be used within a LegalStoreProvider')
  }
  return context
}
