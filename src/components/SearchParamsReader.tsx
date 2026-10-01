'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

function Reader({ onParams }: { onParams: (p: URLSearchParams) => void }) {
  const params = useSearchParams()
  useEffect(() => {
    onParams(new URLSearchParams(params.toString()))
  }, [params, onParams])
  return null
}

/**
 * Reports the URL's search params (and each change) to the page without making
 * the whole page suspend: `useSearchParams` lives behind its own Suspense boundary.
 */
export function SearchParamsReader({ onParams }: { onParams: (p: URLSearchParams) => void }) {
  return (
    <Suspense fallback={null}>
      <Reader onParams={onParams} />
    </Suspense>
  )
}
