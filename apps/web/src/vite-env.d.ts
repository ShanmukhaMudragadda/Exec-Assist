/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

// SpeechRecognition — available in modern browsers but not always in TS DOM lib
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

declare class SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

interface Window {
  SpeechRecognition: typeof SpeechRecognition
  webkitSpeechRecognition: typeof SpeechRecognition
}

// Workbox inject-manifest type — injected by vite-plugin-pwa at build time
declare const __WB_MANIFEST: Array<{ url: string; revision: string | null }>

// pushsubscriptionchange event type (not always in TS DOM lib)
interface PushSubscriptionChangeEvent extends ExtendableEvent {
  readonly newSubscription: PushSubscription | null
  readonly oldSubscription: PushSubscription | null
}
