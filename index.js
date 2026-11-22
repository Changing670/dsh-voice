/**
 * Host half of the dsh-voice bundle.
 *
 * Recording and transcription both run in the browser half: the Client module
 * records audio, then calls the existing `speech` Remote, which reaches
 * `ctx.speechToText` in the Host. No Host-side service is registered here.
 */
export function apply() {}
