import { useEffect, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: T }

/** Runs an async function whenever `key` changes; ignores stale results. */
export function useAsync<T>(fn: () => Promise<T>, key: string): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    fn().then(
      (data) => active && setState({ status: 'success', data }),
      (error: unknown) =>
        active && setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }),
    )
    return () => {
      active = false
    }
    // fn is recreated each render; `key` captures its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  return { ...state, reload: () => setNonce((n) => n + 1) }
}
